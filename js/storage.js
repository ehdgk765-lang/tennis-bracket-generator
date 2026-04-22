// storage.js - localStorage CRUD + Firestore 동기화
const Storage = {
  KEYS: {
    PLAYERS: 'tennis_players',
    TOURNAMENTS: 'tennis_tournaments',
    TEAMS: 'tennis_teams',
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
    const result = this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);
    return result;
  },

  // 팀 관련
  getTeams() {
    return this.get(this.KEYS.TEAMS) || [];
  },

  saveTeams(teams) {
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
    const user = fbAuth.currentUser;
    if (!user) return;
    fbDb.collection('users').doc(user.uid).collection('data').doc(docName)
      .set({ json: JSON.stringify(data || []) })
      .catch(err => console.error('Firestore sync error:', err));
  },

  // Firestore → localStorage (로그인 시 호출)
  async loadFromFirestore() {
    const user = fbAuth.currentUser;
    if (!user) return;
    try {
      const base = fbDb.collection('users').doc(user.uid).collection('data');
      const [pDoc, tDoc, teamsDoc] = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get(),
        base.doc('teams').get()
      ]);

      if (pDoc.exists) {
        const d = pDoc.data();
        const remote = d.json ? JSON.parse(d.json) : (d.items || []);
        const local = this.getPlayers();
        // 로컬에만 있는 멤버(아직 서버 미동기)를 병합
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
        // 로컬에만 있는 대회(아직 서버 미동기)를 병합
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

  // ─── 실시간 동기화 (onSnapshot) ───

  startRealtimeSync() {
    const user = fbAuth.currentUser;
    if (!user) return;
    const base = fbDb.collection('users').doc(user.uid).collection('data');

    // 멤버 데이터 실시간 리스너
    this._unsubPlayers = base.doc('players').onSnapshot((doc) => {
      // 내가 쓴 변경이 서버 반영 전이면 무시 (localStorage에 이미 있음)
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.PLAYERS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.PLAYERS, newJson);
        // console.log('실시간 동기화: 멤버 데이터 업데이트');
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Players realtime sync error:', err);
    });

    // 대회 데이터 실시간 리스너
    this._unsubTournaments = base.doc('tournaments').onSnapshot((doc) => {
      if (doc.metadata.hasPendingWrites) return;
      if (!doc.exists) return;
      const d = doc.data();
      const items = d.json ? JSON.parse(d.json) : (d.items || []);
      const current = localStorage.getItem(this.KEYS.TOURNAMENTS);
      const newJson = JSON.stringify(items);
      if (current !== newJson) {
        localStorage.setItem(this.KEYS.TOURNAMENTS, newJson);
        // console.log('실시간 동기화: 대회 데이터 업데이트');
        this._onRemoteChange();
      }
    }, (err) => {
      console.error('Tournaments realtime sync error:', err);
    });

    // 팀 데이터 실시간 리스너
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

    // console.log('실시간 동기화 시작');
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
    // console.log('실시간 동기화 중지');
  },

  // 원격 변경 시 UI 갱신
  _onRemoteChange() {
    if (typeof App !== 'undefined' && App.currentTab) {
      App.navigate(App.currentTab, App.currentTournamentId);
    }
  },
};
