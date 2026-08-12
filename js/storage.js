// storage.js - 메모리 기반 데이터 관리 + Firestore 동기화
// 원칙: Firestore(DB)가 정본. 메모리 캐시는 즉시 읽기용. localStorage 사용 안 함.
//
// [데이터 모델]
//  - players / teams : 단일 문서  users/{uid}/data/{players|teams}  = { json: "[...]" }
//  - tournaments     : 컬렉션      users/{uid}/tournaments/{대회id}   = { json: "{...대회...}" }
//    (대회는 1개당 문서 1개. Firestore 1MB 한계 회피 + 대회별 동시편집 충돌 원천 차단)
//  - 마이그레이션 플래그: users/{uid}/data/_meta = { tsMigrated: true }
const Storage = {

  // ─── 메모리 캐시 ───
  _data: { players: [], tournaments: [], teams: [] },
  _json: { players: '[]', teams: '[]' },        // players/teams 단일 문서용
  _tJson: {},                                   // 대회 id -> 확정 저장된 json (diff/에코 판단용)
  _writingT: {},                                // 대회 id -> 기록 중 json('__deleted__'=삭제 중) 에코 억제

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
    this._json = { players: '[]', teams: '[]' };
    this._tJson = {};
    this._writingT = {};
  },

  // ─── 읽기 (메모리에서 즉시 반환) ───
  getPlayers() { return this._data.players; },
  getTournaments() { return this._data.tournaments; },
  getTeams() { return this._data.teams; },

  getTournamentById(id) {
    return this._data.tournaments.find(t => t.id === id) || null;
  },

  // ─── 쓰기: players / teams (단일 문서) ───
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

  // ─── 쓰기: tournaments (개별 문서 컬렉션) ───

  // 대회 배열 전체 저장 → 이전 상태와 diff 하여 변경/신규 문서만 쓰고, 제거된 문서는 삭제
  // (신규 대회 생성, 이름 일괄변경 전파, 백업 복원 등에서 사용)
  saveTournaments(tournaments) {
    this._data.tournaments = tournaments; // 낙관적 메모리 갱신
    const uid = this._getDataUID();
    if (!uid) return true;
    const col = fbDb.collection('users').doc(uid).collection('tournaments');

    const seen = {};
    tournaments.forEach(t => {
      if (!t || t.id == null) return;
      const id = String(t.id);
      seen[id] = true;
      const json = JSON.stringify(t);
      if (this._tJson[id] === json) return; // 변경 없음
      this._writeTournamentJson(col, id, json);
    });

    // 이전에 있었으나 이번 배열에서 사라진 대회 → 문서 삭제
    Object.keys(this._tJson).forEach(id => {
      if (seen[id]) return;
      this._deleteTournamentDoc(col, id);
    });

    return true;
  },

  // 대회 하나를 통째로 저장(구조 편집 등). 즉시 UI 반영 + 백그라운드 기록(재시도)
  updateTournament(updatedTournament) {
    updatedTournament.lastModified = Date.now();
    const list = this._data.tournaments;
    const idx = list.findIndex(t => t.id === updatedTournament.id);
    if (idx === -1) return false;
    list[idx] = updatedTournament; // 낙관적 로컬 갱신
    const uid = this._getDataUID();
    if (uid) {
      const col = fbDb.collection('users').doc(uid).collection('tournaments');
      this._writeTournamentJson(col, String(updatedTournament.id), JSON.stringify(updatedTournament));
    }
    return true;
  },

  // 대회 하나를 서버 최신값 기준으로 원자적 패치. patchFn(t)는 t를 제자리 수정(false 반환 시 중단)
  // → 같은 대회에 대한 동시 저장(점수 입력 등)의 유실 방지
  async updateTournamentTx(tournamentId, patchFn) {
    const uid = this._getDataUID();
    if (!uid) return false;
    const id = String(tournamentId);
    const docRef = fbDb.collection('users').doc(uid).collection('tournaments').doc(id);
    try {
      const newJson = await fbDb.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return null;
        const t = JSON.parse(snap.data().json || 'null');
        if (!t) return null;
        const res = patchFn(t);
        if (res === false) return null;
        t.lastModified = Date.now();
        const json = JSON.stringify(t);
        tx.set(docRef, { json });
        return json;
      });
      if (newJson === null) return false;
      // 로컬 캐시 동기화 + 에코 억제
      const t = JSON.parse(newJson);
      const i = this._data.tournaments.findIndex(x => String(x.id) === id);
      if (i === -1) this._data.tournaments.push(t);
      else this._data.tournaments[i] = t;
      this._tJson[id] = newJson;
      this._writingT[id] = newJson;
      this._checkTournamentSize(id, newJson);
      setTimeout(() => { if (this._writingT[id] === newJson) delete this._writingT[id]; }, 2000);
      return true;
    } catch (err) {
      console.error('tournament tx error (' + id + '):', err);
      if (typeof Modal !== 'undefined' && Modal.toast) {
        Modal.toast('저장에 실패했습니다.\n네트워크 연결을 확인한 뒤 다시 시도해주세요.', 'error');
      }
      return false;
    }
  },

  deleteTournament(id) {
    if (this._isMemberMode) return;
    const sid = String(id);
    const i = this._data.tournaments.findIndex(t => String(t.id) === sid);
    if (i !== -1) this._data.tournaments.splice(i, 1); // 낙관적 로컬 제거
    const uid = this._getDataUID();
    if (!uid) return;
    const col = fbDb.collection('users').doc(uid).collection('tournaments');
    this._deleteTournamentDoc(col, sid);
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // 대회 문서 1개 쓰기(재시도 3회 + 실패 알림)
  _writeTournamentJson(col, id, json) {
    this._checkTournamentSize(id, json);
    this._writingT[id] = json;
    const docRef = col.doc(id);
    const attempt = (triesLeft) => {
      // 이 기록 이후 더 최신 기록/삭제가 걸렸으면 취소 (오래된 값 덮어쓰기 방지)
      if (this._writingT[id] !== json) return;
      docRef.set({ json })
        .then(() => {
          this._tJson[id] = json;
          setTimeout(() => { if (this._writingT[id] === json) delete this._writingT[id]; }, 2000);
        })
        .catch(err => {
          console.error('tournament write error (' + id + '), 남은 재시도 ' + triesLeft, err);
          if (triesLeft > 0) {
            setTimeout(() => attempt(triesLeft - 1), 1000 * (4 - triesLeft));
          } else {
            if (this._writingT[id] === json) delete this._writingT[id];
            if (typeof Modal !== 'undefined' && Modal.toast) {
              Modal.toast('저장에 실패했습니다.\n네트워크 연결을 확인한 뒤 화면을 새로고침해 다시 시도해주세요.', 'error');
            }
          }
        });
    };
    attempt(3);
  },

  _deleteTournamentDoc(col, id) {
    this._writingT[id] = '__deleted__';
    col.doc(id).delete()
      .then(() => {
        delete this._tJson[id];
        setTimeout(() => { if (this._writingT[id] === '__deleted__') delete this._writingT[id]; }, 2000);
      })
      .catch(err => {
        console.error('tournament delete error (' + id + '):', err);
        if (this._writingT[id] === '__deleted__') delete this._writingT[id];
        if (typeof Modal !== 'undefined' && Modal.toast) {
          Modal.toast('삭제에 실패했습니다.\n네트워크 연결을 확인한 뒤 다시 시도해주세요.', 'error');
        }
      });
  },

  // ─── 내부: players/teams 단일 문서 캐시 갱신 ───
  _setLocal(docName, data) {
    this._data[docName] = data;
    this._json[docName] = JSON.stringify(data);
  },

  // ─── players/teams 단일 문서 동기화 (실패 시 재시도 + 알림) ───
  _unsubPlayers: null,
  _unsubTournaments: null,
  _unsubTeams: null,
  _writing: { players: null, teams: null },

  _syncToFirestore(docName) {
    const uid = this._getDataUID();
    if (!uid) return;
    if (this._isMemberMode) return; // players/teams는 관리자만 기록

    const jsonToWrite = this._json[docName];
    this._checkDocSize(docName, jsonToWrite);
    this._writing[docName] = jsonToWrite;
    const docRef = fbDb.collection('users').doc(uid).collection('data').doc(docName);

    const attempt = (triesLeft) => {
      if (this._json[docName] !== jsonToWrite) return; // 더 최신 저장 발생 → 재시도 취소
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
            setTimeout(() => attempt(triesLeft - 1), 1000 * (4 - triesLeft));
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
  _sizeWarnedAt: { players: 0, teams: 0 },
  _tSizeWarnedAt: {},

  _checkDocSize(docName, json) {
    this._warnIfLarge(json, this._sizeWarnedAt, docName, '데이터(' + docName + ')');
  },
  _checkTournamentSize(id, json) {
    this._warnIfLarge(json, this._tSizeWarnedAt, id, '한 대회의 데이터');
  },
  _warnIfLarge(json, store, key, label) {
    try {
      const bytes = new TextEncoder().encode(json).length;
      if (bytes > 800 * 1024) { // 1,048,576B(1MB) 한계의 약 78%
        const now = Date.now();
        if (now - (store[key] || 0) > 5 * 60 * 1000) {
          store[key] = now;
          const kb = Math.round(bytes / 1024);
          console.warn('[용량경고] ' + label + ' ' + kb + 'KB / 1024KB 한계 근접 (' + key + ')');
          if (typeof Modal !== 'undefined' && Modal.toast) {
            Modal.toast(label + '가 한계(1MB)에 근접했습니다 (' + kb + 'KB).\n오래된 대회를 백업 후 정리하시길 권장합니다.', 'error');
          }
        }
      }
    } catch (e) { /* TextEncoder 미지원 환경은 무시 */ }
  },

  // ─── Firestore → 메모리 (초기 로드) ───

  // 관리자(본인 데이터) 로드: 최초 1회 대회 마이그레이션 실행
  async loadFromFirestore() {
    const uid = this._getDataUID();
    if (!uid) return;
    try {
      await this._migrateTournamentsIfNeeded(uid);
      const dataBase = fbDb.collection('users').doc(uid).collection('data');
      const [pDoc, teamsDoc] = await Promise.all([
        dataBase.doc('players').get(),
        dataBase.doc('teams').get()
      ]);
      this._loadDoc('players', pDoc);
      this._loadDoc('teams', teamsDoc);
      await this._loadTournamentsFromCollection(uid);
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // 멤버 로드(관리자 데이터 열람): 마이그레이션은 하지 않음
  async loadFromFirestoreAsAdmin(adminUID) {
    this._adminUID = adminUID;
    this._isMemberMode = true;
    try {
      const dataBase = fbDb.collection('users').doc(adminUID).collection('data');
      const [pDoc, teamsDoc] = await Promise.all([
        dataBase.doc('players').get(),
        dataBase.doc('teams').get()
      ]);
      this._loadDoc('players', pDoc);
      this._loadDoc('teams', teamsDoc);
      await this._loadTournamentsFromCollection(adminUID);
    } catch (err) {
      console.error('Member Firestore load error:', err);
    }
  },

  _loadDoc(docName, doc) {
    if (!doc.exists) return;
    const json = doc.data().json || '[]';
    this._json[docName] = json;
    this._data[docName] = JSON.parse(json);
  },

  // 대회 컬렉션에서 메모리로 로드. 컬렉션이 비어있으면 레거시 단일 문서로 폴백(전환기 안전망)
  async _loadTournamentsFromCollection(uid) {
    const parent = fbDb.collection('users').doc(uid);
    this._data.tournaments = [];
    this._tJson = {};
    const col = await parent.collection('tournaments').get();
    if (!col.empty) {
      col.forEach(d => {
        const json = d.data().json;
        if (json == null) return;
        this._tJson[d.id] = json;
        try { this._data.tournaments.push(JSON.parse(json)); } catch (e) {}
      });
      return;
    }
    // 폴백: 아직 마이그레이션 전(또는 실패) → 레거시 단일 문서에서 읽어 최소 표시
    const legacy = await parent.collection('data').doc('tournaments').get();
    if (legacy.exists) {
      const arr = JSON.parse(legacy.data().json || '[]');
      arr.forEach(t => {
        if (!t || t.id == null) return;
        this._data.tournaments.push(t);
      });
      console.warn('[전환] 대회 컬렉션이 비어 레거시 문서로 폴백 로드. 관리자 로그인으로 마이그레이션이 완료되면 개별 문서로 전환됩니다.');
    }
  },

  // ─── 마이그레이션: 레거시 data/tournaments(단일) → tournaments/{id}(개별) ───
  // 멱등. 레거시 문서는 삭제하지 않고 백업으로 보존.
  async _migrateTournamentsIfNeeded(uid) {
    const parent = fbDb.collection('users').doc(uid);
    const metaRef = parent.collection('data').doc('_meta');
    try {
      const meta = await metaRef.get();
      if (meta.exists && meta.data().tsMigrated) return; // 이미 완료

      const legacy = await parent.collection('data').doc('tournaments').get();
      let n = 0;
      if (legacy.exists) {
        const arr = JSON.parse(legacy.data().json || '[]');
        let batch = fbDb.batch();
        let inBatch = 0;
        for (const t of arr) {
          if (!t || t.id == null) continue;
          batch.set(parent.collection('tournaments').doc(String(t.id)), { json: JSON.stringify(t) });
          n++; inBatch++;
          if (inBatch >= 400) { await batch.commit(); batch = fbDb.batch(); inBatch = 0; }
        }
        if (inBatch > 0) await batch.commit();
      }
      await metaRef.set({ tsMigrated: true, migratedAt: Date.now() }, { merge: true });
      console.log('[마이그레이션] 대회 ' + n + '개를 개별 문서로 복제 완료 (레거시 문서는 백업 보존)');
    } catch (err) {
      // 실패해도 플래그를 세우지 않음 → 다음 로드에서 재시도(배치 set은 멱등하여 안전)
      // 상위 loadFromFirestore는 폴백 로드로 최소한 데이터를 표시
      console.error('[마이그레이션] 실패 — 레거시 데이터는 그대로 보존됨:', err);
    }
  },

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    this.stopRealtimeSync();
    const uid = this._getDataUID();
    if (!uid) return;
    const parent = fbDb.collection('users').doc(uid);
    const dataBase = parent.collection('data');

    // players / teams: 단일 문서 리스너
    const listenDoc = (docName) => {
      return dataBase.doc(docName).onSnapshot((doc) => {
        if (doc.metadata.hasPendingWrites) return;
        if (!doc.exists) return;
        const remoteJson = doc.data().json || '[]';
        if (this._writing[docName] !== null) {
          if (remoteJson === this._writing[docName]) this._writing[docName] = null;
          return;
        }
        if (remoteJson === this._json[docName]) return; // 에코
        this._json[docName] = remoteJson;
        this._data[docName] = JSON.parse(remoteJson);
        this._onRemoteChange();
      }, (err) => console.error(docName + ' realtime sync error:', err));
    };
    this._unsubPlayers = listenDoc('players');
    this._unsubTeams = listenDoc('teams');

    // tournaments: 컬렉션 리스너 (문서별 추가/수정/삭제 반영)
    this._unsubTournaments = parent.collection('tournaments').onSnapshot((snap) => {
      let changed = false;
      snap.docChanges().forEach((chg) => {
        const id = chg.doc.id;
        if (chg.doc.metadata.hasPendingWrites) return; // 우리 로컬 미확정 쓰기 → 스킵

        if (chg.type === 'removed') {
          const i = this._data.tournaments.findIndex(t => String(t.id) === id);
          if (i !== -1) { this._data.tournaments.splice(i, 1); changed = true; }
          delete this._tJson[id];
          if (this._writingT[id] === '__deleted__') delete this._writingT[id];
          return;
        }

        const remoteJson = chg.doc.data().json;
        if (remoteJson == null) return;

        // 우리 자신의 방금 쓴 값(에코) → 채택만 하고 재렌더 생략
        if (this._writingT[id] === remoteJson) {
          delete this._writingT[id];
          this._tJson[id] = remoteJson;
          return;
        }
        // 이미 알고 있는 최신값
        if (this._tJson[id] === remoteJson) return;

        // 다른 클라이언트의 변경 → 메모리 반영
        let t;
        try { t = JSON.parse(remoteJson); } catch (e) { return; }
        const i = this._data.tournaments.findIndex(x => String(x.id) === id);
        if (i === -1) this._data.tournaments.push(t);
        else this._data.tournaments[i] = t;
        this._tJson[id] = remoteJson;
        changed = true;
      });
      if (changed) this._onRemoteChange();
    }, (err) => console.error('tournaments realtime sync error:', err));
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
