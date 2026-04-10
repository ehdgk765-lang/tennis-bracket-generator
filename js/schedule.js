// schedule.js - 시간/코트 기반 대진표 생성 + 렌더링
const SCHEDULE_GAME_TYPES = {
  XD: { label: '혼합복식', icon: '👫', badgeClass: 'bg-purple-100 text-purple-700', needM: 2, needF: 2 },
  MD: { label: '남자복식', icon: '👬', badgeClass: 'bg-blue-100 text-blue-700', needM: 4, needF: 0 },
  WD: { label: '여자복식', icon: '👭', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 4 },
  FD: { label: '섞어복식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 4 },
};

const Schedule = {
  // 시간 슬롯 계산 (30분 단위)
  calculateTimeSlots(startTime, endTime) {
    const slots = [];
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let current = sh * 60 + sm;
    const end = eh * 60 + em;

    while (current + 30 <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      current += 30;
    }
    return slots;
  },

  // 가용 선수로 가능한 게임 타입 확인
  getPossibleTypes(availMales, availFemales, allowMixed) {
    const types = [];
    if (availMales.length >= 2 && availFemales.length >= 2) types.push('XD');
    if (availMales.length >= 4) types.push('MD');
    if (availFemales.length >= 4) types.push('WD');
    if (allowMixed && (availMales.length + availFemales.length) >= 4) types.push('FD');
    return types;
  },

  // 배열 셔플 (Fisher-Yates)
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // NTRP 맵 생성 (이름 → NTRP)
  buildNtrpMap() {
    const map = {};
    Storage.getPlayers().forEach(p => { map[p.name] = p.ntrp || 2.5; });
    return map;
  },

  // 4명을 NTRP 균형에 맞게 2팀으로 분배
  balancedPair(players, ntrpMap) {
    if (players.length !== 4) return [players.slice(0, 2), players.slice(2)];
    const [a, b, c, d] = players;
    const n = [ntrpMap[a] || 2.5, ntrpMap[b] || 2.5, ntrpMap[c] || 2.5, ntrpMap[d] || 2.5];

    const pairings = [
      { t1: [a, b], t2: [c, d], diff: Math.abs((n[0] + n[1]) - (n[2] + n[3])) },
      { t1: [a, c], t2: [b, d], diff: Math.abs((n[0] + n[2]) - (n[1] + n[3])) },
      { t1: [a, d], t2: [b, c], diff: Math.abs((n[0] + n[3]) - (n[1] + n[2])) },
    ];

    pairings.sort((x, y) => x.diff - y.diff);
    const bestDiff = pairings[0].diff;
    const best = pairings.filter(p => p.diff === bestDiff);
    const chosen = best[Math.floor(Math.random() * best.length)];
    return [chosen.t1, chosen.t2];
  },

  // XD(혼합복식)용 NTRP 균형 페어링: 각 팀 = 남1+여1
  balancedPairXD(males, females, ntrpMap) {
    const [m1, m2] = males;
    const [f1, f2] = females;
    const nm1 = ntrpMap[m1] || 2.5, nm2 = ntrpMap[m2] || 2.5;
    const nf1 = ntrpMap[f1] || 2.5, nf2 = ntrpMap[f2] || 2.5;

    const diff1 = Math.abs((nm1 + nf1) - (nm2 + nf2));
    const diff2 = Math.abs((nm1 + nf2) - (nm2 + nf1));

    if (diff1 < diff2) return [[m1, f1], [m2, f2]];
    if (diff2 < diff1) return [[m1, f2], [m2, f1]];
    return Math.random() < 0.5 ? [[m1, f1], [m2, f2]] : [[m1, f2], [m2, f1]];
  },

  // 게임 수 기준 정렬 (동점자는 셔플)
  sortByCountShuffled(players, gameCounts) {
    const shuffled = this.shuffle([...players]);
    shuffled.sort((a, b) => (gameCounts[a] || 0) - (gameCounts[b] || 0));
    return shuffled;
  },

  // N개 코트에 대한 모든 게임 타입 조합 생성
  generatePlans(numCourts, allowMixed) {
    const types = allowMixed ? ['XD', 'MD', 'WD', 'FD'] : ['XD', 'MD', 'WD'];
    if (numCourts === 0) return [[]];
    const result = [];
    const sub = this.generatePlans(numCourts - 1, allowMixed);
    for (const t of types) {
      for (const s of sub) {
        result.push([t, ...s]);
      }
    }
    return result;
  },

  // 플랜이 선수 수로 실행 가능한지 확인
  isPlanValid(plan, maleCount, femaleCount) {
    let needM = 0, needF = 0, needAny = 0;
    for (const type of plan) {
      const cfg = SCHEDULE_GAME_TYPES[type];
      needM += cfg.needM;
      needF += cfg.needF;
      if (cfg.needAny) needAny += cfg.needAny;
    }
    const remainM = maleCount - needM;
    const remainF = femaleCount - needF;
    return remainM >= 0 && remainF >= 0 && (remainM + remainF) >= needAny;
  },

  // 한 타임슬롯의 매치 생성 (플랜 기반)
  generateSlotMatches(males, females, courts, gameCounts, allowMixed) {
    // 코트를 최대한 채우는 유효한 플랜 찾기
    let validPlans = [];
    for (let n = courts; n >= 1; n--) {
      const plans = this.generatePlans(n, allowMixed);
      validPlans = plans.filter(p => this.isPlanValid(p, males.length, females.length));
      if (validPlans.length > 0) break;
    }

    if (validPlans.length === 0) return [];

    // 유효한 플랜 중 랜덤 선택
    const plan = validPlans[Math.floor(Math.random() * validPlans.length)];

    // NTRP 맵 + 가용 선수 정렬: 경기 수 적은 순 (동점 셔플)
    const ntrpMap = this.buildNtrpMap();
    let availM = this.sortByCountShuffled(males, gameCounts);
    let availF = this.sortByCountShuffled(females, gameCounts);

    const matches = [];

    // 성별 지정 타입(XD/MD/WD) 먼저, FD(섞어복식)는 나중에 처리
    const orderedPlan = plan.map((gameType, idx) => ({ gameType, court: idx + 1 }));
    orderedPlan.sort((a, b) => (a.gameType === 'FD' ? 1 : 0) - (b.gameType === 'FD' ? 1 : 0));

    orderedPlan.forEach(({ gameType, court }) => {
      let team1, team2;
      let displayType = gameType;

      if (gameType === 'FD') {
        // 섞어복식: 성별 무관, 남은 전체 풀에서 4명 선택
        let allAvail = this.sortByCountShuffled([...availM, ...availF], gameCounts);
        const picked = allAvail.slice(0, 4);
        picked.forEach(p => {
          let idx = availM.indexOf(p);
          if (idx >= 0) { availM.splice(idx, 1); return; }
          idx = availF.indexOf(p);
          if (idx >= 0) availF.splice(idx, 1);
        });
        [team1, team2] = this.balancedPair(picked, ntrpMap);
        picked.forEach(p => gameCounts[p]++);

        // 실제 성별 구성에 따라 표시 타입 결정
        const mCount = picked.filter(p => males.includes(p)).length;
        if (mCount === 4) displayType = 'MD';
        else if (mCount === 0) displayType = 'WD';
      } else if (gameType === 'XD') {
        const mPicked = availM.splice(0, 2);
        const fPicked = availF.splice(0, 2);
        [team1, team2] = this.balancedPairXD(mPicked, fPicked, ntrpMap);
        [...mPicked, ...fPicked].forEach(p => gameCounts[p]++);
      } else if (gameType === 'MD') {
        const picked = availM.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap);
        picked.forEach(p => gameCounts[p]++);
      } else {
        const picked = availF.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap);
        picked.forEach(p => gameCounts[p]++);
      }

      matches.push({
        id: Storage.generateId(),
        court,
        gameType: displayType,
        gameTypeLabel: SCHEDULE_GAME_TYPES[displayType].label,
        player1: team1.join(' / '),
        player2: team2.join(' / '),
        scores: null,
        winner: null,
      });
    });

    return matches;
  },

  // 대진표 생성
  generate(males, females, courts, startTime, endTime, allowMixed) {
    const slots = this.calculateTimeSlots(startTime, endTime);
    const gameCounts = {};
    [...males, ...females].forEach(p => { gameCounts[p] = 0; });

    const timeSlots = slots.map(time => {
      const matches = this.generateSlotMatches(males, females, courts, gameCounts, allowMixed);
      return { time, matches };
    });

    return timeSlots;
  },

  // 전체 매치 목록 추출
  getAllMatches(tournament) {
    const matches = [];
    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        matches.push(m);
      }
    }
    return matches;
  },

  // 선수별 통계 계산
  calcPlayerStats(tournament) {
    const stats = {};
    const allPlayers = [...(tournament.males || []), ...(tournament.females || [])];
    allPlayers.forEach(p => { stats[p] = { name: p, games: 0, wins: 0, losses: 0 }; });

    for (const slot of tournament.timeSlots) {
      for (const m of slot.matches) {
        const t1 = m.player1.split(' / ');
        const t2 = m.player2.split(' / ');
        [...t1, ...t2].forEach(p => {
          if (stats[p]) stats[p].games++;
        });
        if (m.winner) {
          const winners = m.winner.split(' / ');
          const losers = m.winner === m.player1 ? t2 : t1;
          winners.forEach(p => { if (stats[p]) stats[p].wins++; });
          losers.forEach(p => { if (stats[p]) stats[p].losses++; });
        }
      }
    }

    return Object.values(stats).sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.games - a.games);
  },

  // 대진표 렌더링
  render(container, tournament) {
    const allMatches = this.getAllMatches(tournament);
    const totalMatches = allMatches.length;
    const completedMatches = allMatches.filter(m => m.winner).length;
    const playerStats = this.calcPlayerStats(tournament);
    const isComplete = totalMatches > 0 && totalMatches === completedMatches;

    container.innerHTML = `
      <div>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold text-gray-800">${Results.escapeHtml(tournament.name)}</h3>
            <p class="text-sm text-gray-500 mt-1">
              ${tournament.startTime} ~ ${tournament.endTime} · 코트 ${tournament.courts}면 ·
              남${tournament.males.length} 여${tournament.females.length}
            </p>
          </div>
          <span class="text-sm font-medium ${isComplete ? 'text-green-600' : 'text-orange-600'}">
            ${completedMatches}/${totalMatches} 완료
          </span>
        </div>

        <!-- 시간표 -->
        <div class="space-y-4 mb-6">
          ${tournament.timeSlots.map(slot => `
            <div>
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">${slot.time}</span>
                <div class="flex-1 border-t border-gray-200"></div>
              </div>
              <div class="grid gap-2 schedule-grid" style="grid-template-columns: repeat(${tournament.courts}, 1fr)">
                ${slot.matches.map(match => this.renderMatchCard(match)).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 선수별 통계 -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-4 py-3 bg-gray-50/50 border-b border-gray-100">
            <span class="font-semibold text-gray-700 text-sm">선수별 통계</span>
          </div>
          <table class="w-full text-sm standings-table">
            <thead>
              <tr class="border-b border-gray-100 text-gray-500 text-xs">
                <th class="text-left px-4 py-2">선수</th>
                <th class="text-center px-2 py-2">경기</th>
                <th class="text-center px-2 py-2">승</th>
                <th class="text-center px-2 py-2">패</th>
                <th class="text-center px-2 py-2">승률</th>
              </tr>
            </thead>
            <tbody>
              ${(() => { const allPlayersData = Storage.getPlayers(); return playerStats.map(s => {
                const winRate = s.games > 0 ? Math.round((s.wins / s.games) * 100) : 0;
                const pd = allPlayersData.find(pl => pl.name === s.name);
                const gender = pd?.gender;
                const ntrp = pd?.ntrp || 2.5;
                return `
                  <tr class="border-b border-gray-50 hover:bg-gray-50">
                    <td class="px-4 py-2 font-medium text-gray-800">
                      ${Results.escapeHtml(s.name)}
                      <span class="text-xs px-1 py-0.5 rounded font-medium ${gender === 'M' ? 'bg-blue-100 text-blue-700' : gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}">${gender === 'M' ? '남' : gender === 'F' ? '여' : '-'}</span>
                      <span class="text-xs px-1 py-0.5 rounded font-medium bg-yellow-100 text-yellow-700">${ntrp.toFixed(1)}</span>
                    </td>
                    <td class="text-center px-2 py-2 text-gray-600">${s.games}</td>
                    <td class="text-center px-2 py-2 text-green-600 font-medium">${s.wins}</td>
                    <td class="text-center px-2 py-2 text-red-500">${s.losses}</td>
                    <td class="text-center px-2 py-2 text-gray-600">${s.games > 0 ? winRate + '%' : '-'}</td>
                  </tr>`;
              }).join(''); })()}
            </tbody>
          </table>
        </div>
      </div>`;

    // 매치 카드 클릭 → 스코어 입력
    container.querySelectorAll('.schedule-match-card').forEach(card => {
      card.onclick = () => {
        const matchId = card.dataset.matchId;
        const match = allMatches.find(m => m.id === matchId);
        if (!match) return;

        Results.showScoreModal(match, { setCount: 1 }, (result) => {
          match.scores = result.scores;
          match.winner = result.winner;
          Storage.updateTournament(tournament);

          // 전체 완료 시 status 변경
          const allDone = this.getAllMatches(tournament).every(m => m.winner);
          if (allDone) {
            tournament.status = 'completed';
            tournament.completedAt = new Date().toISOString();
            Storage.updateTournament(tournament);
          }

          this.render(container, tournament);
        });
      };
    });
  },

  // 매치 카드 HTML
  renderMatchCard(match) {
    const cfg = SCHEDULE_GAME_TYPES[match.gameType];
    const hasScore = !!match.winner;
    const t1Html = Results.formatTeamHtml(match.player1);
    const t2Html = Results.formatTeamHtml(match.player2);
    const isWin1 = match.winner === match.player1;
    const isWin2 = match.winner === match.player2;

    return `
      <div class="schedule-match-card bg-white border ${hasScore ? 'border-green-200' : 'border-gray-200'} rounded-xl p-3 cursor-pointer hover:shadow-md transition"
           data-match-id="${match.id}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}">${cfg.label}</span>
          <span class="text-xs text-gray-400">코트 ${match.court}</span>
        </div>
        <div class="space-y-0.5">
          <div class="flex items-center justify-between ${isWin1 ? 'bg-green-50' : 'bg-gray-50'} rounded-lg px-2 py-1.5">
            <span class="text-xs sm:text-sm font-medium ${isWin1 ? 'text-green-700' : 'text-gray-800'} flex-1" style="overflow:hidden">
              ${isWin1 ? '🏆 ' : ''}${t1Html}
            </span>
            ${hasScore ? `<span class="text-xs font-bold ${isWin1 ? 'text-green-600' : 'text-gray-500'} ml-1 flex-shrink-0">${match.scores[0][0]}</span>` : ''}
          </div>
          <div class="text-center text-xs text-gray-300 leading-tight">vs</div>
          <div class="flex items-center justify-between ${isWin2 ? 'bg-green-50' : 'bg-gray-50'} rounded-lg px-2 py-1.5">
            <span class="text-xs sm:text-sm font-medium ${isWin2 ? 'text-green-700' : 'text-gray-800'} flex-1" style="overflow:hidden">
              ${isWin2 ? '🏆 ' : ''}${t2Html}
            </span>
            ${hasScore ? `<span class="text-xs font-bold ${isWin2 ? 'text-green-600' : 'text-gray-500'} ml-1 flex-shrink-0">${match.scores[0][1]}</span>` : ''}
          </div>
        </div>
        ${!hasScore ? '<p class="text-xs text-gray-400 text-center mt-1.5">탭하여 스코어 입력</p>' : ''}
      </div>`;
  },
};
