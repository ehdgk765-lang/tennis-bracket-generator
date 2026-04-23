// storage.js - localStorage CRUD + Firestore 동기화
const Storage = {
  KEYS: {
    PLAYERS: 'tennis_players',
    TOURNAMENTS: 'tennis_tournaments',
    TEAMS: 'tennis_teams',
  },

  // 멤버 모드 지원
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

  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage set error:', e);
      return false;
    }
  },

  // 멤버 관련
  getPlayers() {
    return this.get(this.KEYS.PLAYERS) || [];
  },

  savePlayers(players) {
    if (this._isMemberMode) return false;
    const result = this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);
    return result;
  },

  // 팀 관련
  getTeams() {
    return this.get(this.KEYS.TEAMS) || [];
  },

  saveTeams(teams) {
    if (this._isMemberMode) return false;
    const result = this.set(this.KEYS.TEAMS, teams);
    this.syncToFirestore('teams', teams);
    return result;
  },

  // 대회 관련
  getTournaments() {
    return this.get(this.KEYS.TOURNAMENTS) || [];
  },

  saveTournaments(tournaments) {
    const result = this.set(this.KEYS.TOURNAMENTS, tournaments);
    this.syncToFirestore('tournaments', tournaments);
    return result;
  },

  getTournamentById(id) {
    const tournaments = this.getTournaments();
    return tournaments.find(t => t.id === id) || null;
  },

  updateTournament(updatedTournament) {
    const tournaments = this.getTournaments();
    const index = tournaments.findIndex(t => t.id === updatedTournament.id);
    if (index !== -1) {
      tournaments[index] = updatedTournament;
      this.saveTournaments(tournaments);
      return true;
    }
    return false;
  },

  deleteTournament(id) {
    if (this._isMemberMode) return;
    const tournaments = this.getTournaments().filter(t => t.id !== id);
    this.saveTournaments(tournaments);
  },

  // 유틸리티
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  },

  // ─── Firestore 동기화 ───

  _unsubPlayers: null,
  _unsubTournaments: null,
  _unsubTeams: null,

  // localStorage → Firestore (JSON 문자열로 직렬화하여 저장)
  syncToFirestore(docName, data) {
    const uid = this._getDataUID();
    if (!uid) return;
    // 멤버 모드에서는 대회(스코어 입력)만 쓰기 허용
    if (this._isMemberMode && docName !== 'tournaments') return;
    fbDb.collection('users').doc(uid).collection('data').doc(docName)
      .set({ json: JSON.stringify(data || []) })
      .catch(err => console.error('Firestore sync error:', err));
  },

  // Firestore → localStorage (관리자 로그인 시)
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

      if (pDoc.exists) {
        const d = pDoc.data();
        const remote = d.json ? JSON.parse(d.json) : (d.items || []);
        const local = this.getPlayers();
        const remoteNames = new Set(remote.map(p => p.name));
        const localOnly = local.filter(p => !remoteNames.has(p.name));
        const merged = [...remote, ...localOnly];
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(merged));
        if (localOnly.length > 0) this.syncToFirestore('players', merged);
      } else {
        const local = this.getPlayers();
        if (local.length > 0) this.syncToFirestore('players', local);
      }

      if (tDoc.exists) {
        const d = tDoc.data();
        const remote = d.json ? JSON.parse(d.json) : (d.items || []);
        const local = this.getTournaments();
        const remoteIds = new Set(remote.map(t => t.id));
        const localOnly = local.filter(t => !remoteIds.has(t.id));
        const merged = [...remote, ...localOnly];
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(merged));
        if (localOnly.length > 0) this.syncToFirestore('tournaments', merged);
      } else {
        const local = this.getTournaments();
        if (local.length > 0) this.syncToFirestore('tournaments', local);
      }

      if (teamsDoc.exists) {
        const d = teamsDoc.data();
        const remote = d.json ? JSON.parse(d.json) : (d.items || []);
        const local = this.getTeams();
        const remoteIds = new Set(remote.map(t => t.id));
        const localOnly = local.filter(t => !remoteIds.has(t.id));
        const merged = [...remote, ...localOnly];
        localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(merged));
        if (localOnly.length > 0) this.syncToFirestore('teams', merged);
      } else {
        const local = this.getTeams();
        if (local.length > 0) this.syncToFirestore('teams', local);
      }
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },

  // Firestore → localStorage (멤버 로그인 시: 관리자 데이터 읽기 전용)
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

      if (pDoc.exists) {
        const d = pDoc.data();
        const items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(items));
      }
      if (tDoc.exists) {
        const d = tDoc.data();
        const items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(items));
      }
      if (teamsDoc.exists) {
        const d = teamsDoc.data();
        const items = d.json ? JSON.parse(d.json) : (d.items || []);
        localStorage.setItem(this.KEYS.TEAMS, JSON.stringify(items));
      }
    } catch (err) {
      console.error('Member Firestore load error:', err);
    }
  },

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    const uid = this._getDataUID();
    if (!uid) return;
    const base = fbDb.collection('users').doc(uid).collection('data');

    this._unsubPlayers = base.doc('players').onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.PLAYERS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.PLAYERS, newJson);
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Players realtime sync error:', err);
    });

    this._unsubTournaments = base.doc('tournaments').onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.TOURNAMENTS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.TOURNAMENTS, newJson);
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Tournaments realtime sync error:', err);
    });

    this._unsubTeams = base.doc('teams').onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.TEAMS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.TEAMS, newJson);
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Teams realtime sync error:', err);
    });
  },

  stopRealtimeSync() {
    if (this._unsubPlayers) {
      this._unsubPlayers();
      this._unsubPlayers = null;
    }
    if (this._unsubTournaments) {
      this._unsubTournaments();
      this._unsubTournaments = null;
    }
    if (this._unsubTeams) {
      this._unsubTeams();
      this._unsubTeams = null;
    }
  },

  // 원격 변경 시 UI 갱신
  _onRemoteChange() {
    if (typeof App !== 'undefined' && App.currentTab) {
      App.navigate(App.currentTab, App.currentTournamentId);
    }
  },
};
