// storage.js - 메모리 기반 데이터 관리 + Firestore 동기화
// 원칙: Firestore(DB)가 정본. 메모리 캐시는 즉시 읽기용. localStorage 사용 안 함.
const Storage = {

  // ─── 메모리 캐시 ───
  _data: { players: [], tournaments: [], teams: [] },
  _json: { players: '[]', tournaments: '[]', teams: '[]' },

  // ─── 멤버 모드 ───
  _adminUID: null,
  _isMemberMode: false,

  _getDataUID() {
    if (this._adminUID) return this._adminUID;
    const user = fbAuth.currentUser;
    return user ? user.uid : null;
  },

  resetMemberMode() {
    this._adminUID = null;
    this._isMemberMode = false;
  },

  clearData() {
    this._data = { players: [], tournaments: [], teams: [] };
    this._json = { players: '[]', tournaments: '[]', teams: '[]' };
  },

  // ─── 읽기 (메모리에서 즉시 반환) ───
  getPlayers() { return this._data.players; },
  getTournaments() { return this._data.tournaments; },
  getTeams() { return this._data.teams; },

  getTournamentById(id) {
    return this._data.tournaments.find(t => t.id === id) || null;
  },

  // ─── 쓰기 (메모리 갱신 + Firestore 동기화) ───
  savePlayers(players) {
    if (this._isMemberMode) return false;
    this._setLocal('players', players);
    this._syncToFirestore('players');
    return true;
  },

  saveTeams(teams) {
    if (this._isMemberMode) return false;
    this._setLocal('teams', teams);
    this._syncToFirestore('teams');
    return true;
  },

  saveTournaments(tournaments) {
    this._setLocal('tournaments', tournaments);
    this._syncToFirestore('tournaments');
    return true;
  },

  updateTournament(updatedTournament) {
    updatedTournament.lastModified = Date.now();
    const list = this._data.tournaments;
    const idx = list.findIndex(t => t.id === updatedTournament.id);
    if (idx === -1) return false;
    // 즉시 UI 반영용 낙관적 로컬 갱신
    list[idx] = updatedTournament;
    this._setLocal('tournaments', list);
    // 서버에는 이 대회만 병합 (다른 대회의 동시 변경을 덮어쓰지 않음)
    this._txUpdateDoc('tournaments', (arr) => {
      const i = arr.findIndex(t => t.id === updatedTournament.id);
      if (i === -1) arr.push(updatedTournament);
      else arr[i] = updatedTournament;
      return arr;
    });
    return true;
  },

  deleteTournament(id) {
    if (this._isMemberMode) return;
    const filtered = this._data.tournaments.filter(t => t.id !== id);
    this._setLocal('tournaments', filtered);
    this._syncToFirestore('tournaments');
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // ─── 내부: 메모리 캐시 갱신 ───
  _setLocal(docName, data) {
    this._data[docName] = data;
    this._json[docName] = JSON.stringify(data);
  },

  // ─── Firestore 동기화 ───

  _unsubPlayers: null,
  _unsubTournaments: null,
  _unsubTeams: null,

  // 쓰기 보호: 기록 중인 JSON 값 저장 (null=보호없음, string=확인까지 보호)
  _writing: { players: null, tournaments: null, teams: null },

  // 메모리 → Firestore (실패 시 재시도 + 사용자 알림)
  _syncToFirestore(docName) {
    const uid = this._getDataUID();
    if (!uid) return;
    if (this._isMemberMode && docName !== 'tournaments') return;

    const jsonToWrite = this._json[docName];
    this._checkDocSize(docName, jsonToWrite);
    this._writing[docName] = jsonToWrite;
    const docRef = fbDb.collection('users').doc(uid).collection('data').doc(docName);

    const attempt = (triesLeft) => {
      // 이 저장 이후 더 최신 저장이 발생했으면 이 재시도는 취소 (오래된 값 덮어쓰기 방지)
      if (this._json[docName] !== jsonToWrite) return;
      docRef.set({ json: jsonToWrite })
        .then(() => {
          const wrote = jsonToWrite;
          setTimeout(() => {
            if (this._writing[docName] === wrote) this._writing[docName] = null;
          }, 2000);
        })
        .catch(err => {
          console.error('Firestore sync error (' + docName + '), 남은 재시도 ' + triesLeft, err);
          if (triesLeft > 0) {
            setTimeout(() => attempt(triesLeft - 1), 1000 * (4 - triesLeft)); // 1s, 2s, 3s 백오프
          } else {
            this._writing[docName] = null;
            if (typeof Modal !== 'undefined' && Modal.toast) {
              Modal.toast('저장에 실패했습니다.\n네트워크 연결을 확인한 뒤 화면을 새로고침해 다시 시도해주세요.', 'error');
            }
          }
        });
    };
    attempt(3);
  },

  // ─── 용량 감시: Firestore 1MB 문서 한계 근접 경고 ───
  _sizeWarnedAt: { players: 0, tournaments: 0, teams: 0 },

  _checkDocSize(docName, json) {
    try {
      const bytes = new TextEncoder().encode(json).length;
      const WARN = 800 * 1024; // 1,048,576B(1MB) 한계의 약 78%
      if (bytes > WARN) {
        const now = Date.now();
        if (now - (this._sizeWarnedAt[docName] || 0) > 5 * 60 * 1000) {
          this._sizeWarnedAt[docName] = now;
          const kb = Math.round(bytes / 1024);
          console.warn('[용량경고] ' + docName + ' 문서 ' + kb + 'KB / 1024KB 한계 근접');
          if (typeof Modal !== 'undefined' && Modal.toast) {
            Modal.toast('데이터 용량이 한계(1MB)에 근접했습니다 (' + kb + 'KB).\n오래된 대회를 백업 후 정리하시길 권장합니다.', 'error');
          }
        }
      }
    } catch (e) { /* TextEncoder 미지원 환경은 무시 */ }
  },

  // ─── 원자적 쓰기 (트랜잭션): 서버 최신값 기준으로 수정 → 동시 저장 유실 방지 ───
  // mutateFn(arr)은 수정된 새 배열을 반환. false/null 반환 시 쓰기 중단.
  async _txUpdateDoc(docName, mutateFn) {
    const uid = this._getDataUID();
    if (!uid) return false;
    if (this._isMemberMode && docName !== 'tournaments') return false;
    const docRef = fbDb.collection('users').doc(uid).collection('data').doc(docName);
    try {
      const newJson = await fbDb.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        const arr = snap.exists ? JSON.parse(snap.data().json || '[]') : [];
        const result = mutateFn(arr);
        if (result === false || result == null) return null; // 중단 신호
        const json = JSON.stringify(result);
        tx.set(docRef, { json });
        return json;
      });
      if (newJson === null) return false;
      // 서버에 병합된 최신 결과로 로컬 캐시 동기화 + 에코 억제
      this._checkDocSize(docName, newJson);
      this._json[docName] = newJson;
      this._data[docName] = JSON.parse(newJson);
      this._writing[docName] = newJson;
      const wrote = newJson;
      setTimeout(() => { if (this._writing[docName] === wrote) this._writing[docName] = null; }, 2000);
      return true;
    } catch (err) {
      console.error('Firestore tx error (' + docName + '):', err);
      if (typeof Modal !== 'undefined' && Modal.toast) {
        Modal.toast('저장에 실패했습니다.\n네트워크 연결을 확인한 뒤 다시 시도해주세요.', 'error');
      }
      return false;
    }
  },

  // 대회 하나를 원자적으로 패치. patchFn(t)는 t를 제자리 수정(false 반환 시 중단)
  updateTournamentTx(tournamentId, patchFn) {
    return this._txUpdateDoc('tournaments', (arr) => {
      const idx = arr.findIndex(t => t.id === tournamentId);
      if (idx === -1) return false;
      const res = patchFn(arr[idx]);
      if (res === false) return false;
      arr[idx].lastModified = Date.now();
      return arr;
    });
  },

  // Firestore → 메모리 (로그인 시 초기 로드)
  async loadFromFirestore() {
    const uid = this._getDataUID();
    if (!uid) return;
    try {
      const base = fbDb.collection('users').doc(uid).collection('data');
      const [pDoc, tDoc, teamsDoc] = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get(),
        base.doc('teams').get()
      ]);

      this._loadDoc('players', pDoc);
      this._loadDoc('tournaments', tDoc);
      this._loadDoc('teams', teamsDoc);
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // Firestore → 메모리 (멤버 로그인 시)
  async loadFromFirestoreAsAdmin(adminUID) {
    this._adminUID = adminUID;
    this._isMemberMode = true;
    try {
      const base = fbDb.collection('users').doc(adminUID).collection('data');
      const [pDoc, tDoc, teamsDoc] = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get(),
        base.doc('teams').get()
      ]);

      this._loadDoc('players', pDoc);
      this._loadDoc('tournaments', tDoc);
      this._loadDoc('teams', teamsDoc);
    } catch (err) {
      console.error('Member Firestore load error:', err);
    }
  },

  _loadDoc(docName, doc) {
    if (!doc.exists) return;
    const d = doc.data();
    const json = d.json || '[]';
    this._json[docName] = json;
    this._data[docName] = JSON.parse(json);
  },

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    // 기존 리스너 정리 (중복 방지)
    this.stopRealtimeSync();
    const uid = this._getDataUID();
    if (!uid) return;
    const base = fbDb.collection('users').doc(uid).collection('data');

    const listen = (docName) => {
      return base.doc(docName).onSnapshot((doc) => {
        if (doc.metadata.hasPendingWrites) return;
        if (!doc.exists) return;

        const remoteJson = doc.data().json || '[]';

        // 쓰기 보호 중: 우리가 쓴 데이터인지 확인
        if (this._writing[docName] !== null) {
          if (remoteJson === this._writing[docName]) {
            this._writing[docName] = null;
          }
          return;
        }

        // 동일 데이터면 무시 (에코)
        if (remoteJson === this._json[docName]) return;

        // DB가 정본 → 메모리 갱신
        this._json[docName] = remoteJson;
        this._data[docName] = JSON.parse(remoteJson);
        this._onRemoteChange();
      }, (err) => {
        console.error(docName + ' realtime sync error:', err);
      });
    };

    this._unsubPlayers = listen('players');
    this._unsubTournaments = listen('tournaments');
    this._unsubTeams = listen('teams');
  },

  stopRealtimeSync() {
    ['Players', 'Tournaments', 'Teams'].forEach(name => {
      const key = '_unsub' + name;
      if (this[key]) { this[key](); this[key] = null; }
    });
  },

  // 원격 변경 시 UI 갱신 (300ms 디바운싱)
  _remoteChangeTimer: null,
  _onRemoteChange() {
    if (this._remoteChangeTimer) clearTimeout(this._remoteChangeTimer);
    this._remoteChangeTimer = setTimeout(() => {
      this._remoteChangeTimer = null;
      if (typeof App !== 'undefined' && App.currentTab) {
        App.navigate(App.currentTab, App.currentTournamentId);
      }
    }, 300);
  },
};
