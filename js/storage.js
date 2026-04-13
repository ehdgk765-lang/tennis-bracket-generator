// storage.js - localStorage CRUD + Firestore 동기화
const Storage = {
  KEYS: {
    PLAYERS: 'tennis_players',
    TOURNAMENTS: 'tennis_tournaments',
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

  // 선수 관련
  getPlayers() {
    return this.get(this.KEYS.PLAYERS) || [];
  },

  savePlayers(players) {
    const result = this.set(this.KEYS.PLAYERS, players);
    this.syncToFirestore('players', players);
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

  // localStorage → Firestore (비동기, fire-and-forget)
  syncToFirestore(docName, data) {
    const user = fbAuth.currentUser;
    if (!user) return;
    fbDb.collection('users').doc(user.uid).collection('data').doc(docName)
      .set({ items: data || [] })
      .catch(err => console.error('Firestore sync error:', err));
  },

  // Firestore → localStorage (로그인 시 호출)
  async loadFromFirestore() {
    const user = fbAuth.currentUser;
    if (!user) return;
    try {
      const base = fbDb.collection('users').doc(user.uid).collection('data');
      const [pDoc, tDoc] = await Promise.all([
        base.doc('players').get(),
        base.doc('tournaments').get()
      ]);

      if (pDoc.exists) {
        localStorage.setItem(this.KEYS.PLAYERS, JSON.stringify(pDoc.data().items));
      } else {
        // 첫 로그인: 기존 로컬 데이터가 있으면 Firestore로 업로드
        const local = this.getPlayers();
        if (local.length > 0) this.syncToFirestore('players', local);
      }

      if (tDoc.exists) {
        localStorage.setItem(this.KEYS.TOURNAMENTS, JSON.stringify(tDoc.data().items));
      } else {
        const local = this.getTournaments();
        if (local.length > 0) this.syncToFirestore('tournaments', local);
      }
    } catch (err) {
      console.error('Firestore load error:', err);
    }
  },
};
