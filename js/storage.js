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
    list[idx] = updatedTournament;
    this._setLocal('tournaments', list);
    this._syncToFirestore('tournaments');
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

  // 쓰기 진행 중 플래그 (onSnapshot 무시용)
  _writing: { players: false, tournaments: false, teams: false },

  // 메모리 → Firestore
  _syncToFirestore(docName) {
    const uid = this._getDataUID();
    if (!uid) return;
    if (this._isMemberMode && docName !== 'tournaments') return;

    this._writing[docName] = true;
    const docRef = fbDb.collection('users').doc(uid).collection('data').doc(docName);
    docRef.set({ json: this._json[docName] })
      .then(() => { this._writing[docName] = false; })
      .catch(err => {
        console.error('Firestore sync error:', err);
        this._writing[docName] = false;
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
    const uid = this._getDataUID();
    if (!uid) return;
    const base = fbDb.collection('users').doc(uid).collection('data');

    const listen = (docName) => {
      return base.doc(docName).onSnapshot((doc) => {
        if (doc.metadata.hasPendingWrites) return;
        if (!doc.exists) return;
        if (this._writing[docName]) return; // 쓰기 진행 중이면 무시
        const remoteJson = doc.data().json || '[]';
        if (remoteJson === this._json[docName]) return; // 동일 데이터면 무시
        // DB가 정본 → 메모리 갱신
        this._json[docName] = remoteJson;
        this._data[docName] = JSON.parse(remoteJson);
        this._onRemoteChange();
      }, (err) => {
        console.error(`${docName} realtime sync error:`, err);
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
