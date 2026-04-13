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

  // 팀 키 생성 (이름 정렬하여 고유 키)
  teamKey(a, b) {
    return [a, b].sort().join('|');
  },

  // usedTeams에 팀 등록
  recordTeam(usedTeams, t) {
    const key = this.teamKey(t[0], t[1]);
    usedTeams.set(key, (usedTeams.get(key) || 0) + 1);
  },

  // 4명을 NTRP 균형 + 중복 팀 최소화로 2팀 분배
  balancedPair(players, ntrpMap, usedTeams) {
    if (players.length !== 4) return [players.slice(0, 2), players.slice(2)];
    const [a, b, c, d] = players;
    const n = [ntrpMap[a] || 2.5, ntrpMap[b] || 2.5, ntrpMap[c] || 2.5, ntrpMap[d] || 2.5];

    const pairings = [
      { t1: [a, b], t2: [c, d], diff: Math.abs((n[0] + n[1]) - (n[2] + n[3])) },
      { t1: [a, c], t2: [b, d], diff: Math.abs((n[0] + n[2]) - (n[1] + n[3])) },
      { t1: [a, d], t2: [b, c], diff: Math.abs((n[0] + n[3]) - (n[1] + n[2])) },
    ];

    // 중복 팀 페널티 (중복 회피 우선, NTRP는 보조)
    pairings.forEach(p => {
      const dup1 = usedTeams.get(this.teamKey(p.t1[0], p.t1[1])) || 0;
      const dup2 = usedTeams.get(this.teamKey(p.t2[0], p.t2[1])) || 0;
      p.score = (dup1 + dup2) * 100 + p.diff;
    });

    pairings.sort((x, y) => x.score - y.score);
    const bestScore = pairings[0].score;
    const best = pairings.filter(p => p.score === bestScore);
    const chosen = best[Math.floor(Math.random() * best.length)];
    return [chosen.t1, chosen.t2];
  },

  // XD(혼합복식)용 NTRP 균형 + 중복 최소화 페어링
  balancedPairXD(males, females, ntrpMap, usedTeams) {
    const [m1, m2] = males;
    const [f1, f2] = females;
    const nm1 = ntrpMap[m1] || 2.5, nm2 = ntrpMap[m2] || 2.5;
    const nf1 = ntrpMap[f1] || 2.5, nf2 = ntrpMap[f2] || 2.5;

    const pairings = [
      { t1: [m1, f1], t2: [m2, f2], diff: Math.abs((nm1 + nf1) - (nm2 + nf2)) },
      { t1: [m1, f2], t2: [m2, f1], diff: Math.abs((nm1 + nf2) - (nm2 + nf1)) },
    ];

    pairings.forEach(p => {
      const dup1 = usedTeams.get(this.teamKey(p.t1[0], p.t1[1])) || 0;
      const dup2 = usedTeams.get(this.teamKey(p.t2[0], p.t2[1])) || 0;
      p.score = (dup1 + dup2) * 100 + p.diff;
    });

    pairings.sort((x, y) => x.score - y.score);
    const bestScore = pairings[0].score;
    const best = pairings.filter(p => p.score === bestScore);
    const chosen = best[Math.floor(Math.random() * best.length)];
    return [chosen.t1, chosen.t2];
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
  generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams) {
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
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);

        // 실제 성별 구성에 따라 표시 타입 결정
        const mCount = picked.filter(p => males.includes(p)).length;
        if (mCount === 4) displayType = 'MD';
        else if (mCount === 0) displayType = 'WD';
      } else if (gameType === 'XD') {
        const mPicked = availM.splice(0, 2);
        const fPicked = availF.splice(0, 2);
        [team1, team2] = this.balancedPairXD(mPicked, fPicked, ntrpMap, usedTeams);
        [...mPicked, ...fPicked].forEach(p => gameCounts[p]++);
      } else if (gameType === 'MD') {
        const picked = availM.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);
      } else {
        const picked = availF.splice(0, 4);
        [team1, team2] = this.balancedPair(picked, ntrpMap, usedTeams);
        picked.forEach(p => gameCounts[p]++);
      }

      // 사용된 팀 기록
      this.recordTeam(usedTeams, team1);
      this.recordTeam(usedTeams, team2);

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
    const usedTeams = new Map(); // 팀키 → 횟수

    const timeSlots = slots.map(time => {
      const matches = this.generateSlotMatches(males, females, courts, gameCounts, allowMixed, usedTeams);
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
        <div id="schedule-header" class="flex items-center justify-between mb-4 pb-1">
          <div>
            <h3 id="schedule-title" class="text-xl font-bold text-gray-800 cursor-pointer hover:text-green-700 transition" title="클릭하여 이름 수정">${Results.escapeHtml(tournament.name)} <svg class="w-3.5 h-3.5 inline-block text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></h3>
            <p class="text-sm text-gray-500 mt-1">
              ${tournament.startTime} ~ ${tournament.endTime} · 코트 ${tournament.courts}면 ·
              남${tournament.males.length} 여${tournament.females.length}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <button id="pdf-download-btn" class="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition font-medium flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              PDF
            </button>
            <span class="text-sm font-medium ${isComplete ? 'text-green-600' : 'text-orange-600'}">
              ${completedMatches}/${totalMatches} 완료
            </span>
          </div>
        </div>

        <!-- 시간표 -->
        <div class="space-y-4 mb-6">
          ${tournament.timeSlots.map((slot, si) => `
            <div class="schedule-slot" data-slot="${si}">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-sm font-bold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">${slot.time}</span>
                <div class="flex-1 border-t border-gray-200"></div>
              </div>
              <div class="grid gap-2 schedule-grid" style="grid-template-columns: repeat(${tournament.courts}, 1fr)">
                ${slot.matches.map((match, mi) => this.renderMatchCard(match, si, mi)).join('')}
              </div>
            </div>
          `).join('')}
        </div>

        <!-- 선수별 통계 -->
        <div id="stats-section" class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
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

    // PDF 다운로드
    const pdfBtn = container.querySelector('#pdf-download-btn');
    if (pdfBtn) {
      pdfBtn.onclick = () => this.exportPDF(container, tournament);
    }

    // 대진표 이름 수정
    const titleEl = container.querySelector('#schedule-title');
    if (titleEl) {
      titleEl.onclick = () => {
        const newName = prompt('대진표 이름을 입력하세요', tournament.name);
        if (newName !== null && newName.trim() !== '') {
          tournament.name = newName.trim();
          Storage.updateTournament(tournament);
          this.render(container, tournament);
        }
      };
    }

    // ─── 선수 탭-교환 + 매치 카드 드래그 ───
    const cards = container.querySelectorAll('.schedule-match-card');
    let selectedPlayer = null;

    // 선수 이름 탭 → 선택/교환
    container.querySelectorAll('.swap-player').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation(); // 카드 클릭(스코어) 방지

        const data = {
          slotIdx: +el.dataset.slotIdx, matchIdx: +el.dataset.matchIdx,
          team: +el.dataset.team, pos: +el.dataset.pos, name: el.dataset.name
        };

        if (!selectedPlayer) {
          // 첫 번째 선수 선택
          selectedPlayer = { el, ...data };
          el.classList.add('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
        } else if (selectedPlayer.slotIdx === data.slotIdx && selectedPlayer.matchIdx === data.matchIdx
          && selectedPlayer.team === data.team && selectedPlayer.pos === data.pos) {
          // 같은 선수 재탭 → 선택 해제
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
          selectedPlayer = null;
        } else {
          // 두 번째 선수 탭 → 교환
          const src = selectedPlayer, tgt = data;
          const srcMatch = tournament.timeSlots[src.slotIdx].matches[src.matchIdx];
          const tgtMatch = tournament.timeSlots[tgt.slotIdx].matches[tgt.matchIdx];
          const srcKey = src.team === 1 ? 'player1' : 'player2';
          const tgtKey = tgt.team === 1 ? 'player1' : 'player2';
          const sameMatch = src.slotIdx === tgt.slotIdx && src.matchIdx === tgt.matchIdx;

          const clearSel = () => {
            selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
            selectedPlayer = null;
          };

          if (sameMatch && srcKey === tgtKey) {
            // 같은 팀 내 순서 변경 - 중복 불가
            const team = srcMatch[srcKey].split(' / ');
            [team[src.pos], team[tgt.pos]] = [team[tgt.pos], team[src.pos]];
            srcMatch[srcKey] = team.join(' / ');
          } else if (sameMatch) {
            // 같은 매치, 다른 팀 간 교환
            const t1 = srcMatch[srcKey].split(' / ');
            const t2 = srcMatch[tgtKey].split(' / ');
            [t1[src.pos], t2[tgt.pos]] = [t2[tgt.pos], t1[src.pos]];
            const all = [...t1, ...t2];
            if (new Set(all).size !== all.length) {
              alert('같은 선수가 동일 경기에 중복됩니다.');
              clearSel();
              return;
            }
            srcMatch[srcKey] = t1.join(' / ');
            srcMatch[tgtKey] = t2.join(' / ');
          } else {
            // 다른 매치 간 교환
            const srcTeam = srcMatch[srcKey].split(' / ');
            const tgtTeam = tgtMatch[tgtKey].split(' / ');
            [srcTeam[src.pos], tgtTeam[tgt.pos]] = [tgtTeam[tgt.pos], srcTeam[src.pos]];

            const srcOther = srcMatch[srcKey === 'player1' ? 'player2' : 'player1'].split(' / ');
            const tgtOther = tgtMatch[tgtKey === 'player1' ? 'player2' : 'player1'].split(' / ');

            if (new Set([...srcTeam, ...srcOther]).size !== srcTeam.length + srcOther.length
              || new Set([...tgtTeam, ...tgtOther]).size !== tgtTeam.length + tgtOther.length) {
              alert('같은 선수가 동일 경기에 중복됩니다.');
              clearSel();
              return;
            }
            srcMatch[srcKey] = srcTeam.join(' / ');
            tgtMatch[tgtKey] = tgtTeam.join(' / ');
          }

          Storage.updateTournament(tournament);
          this.render(container, tournament);
        }
      });
    });

    // 카드 빈 영역 클릭 → 스코어 입력 (선수 선택 중이면 해제)
    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (selectedPlayer) {
          selectedPlayer.el.classList.remove('bg-green-200', 'ring-2', 'ring-green-500', 'rounded');
          selectedPlayer = null;
          return;
        }
        const match = allMatches.find(m => m.id === card.dataset.matchId);
        if (!match) return;
        Results.showScoreModal(match, { setCount: 1 }, (result) => {
          match.scores = result.scores;
          match.winner = result.winner;
          Storage.updateTournament(tournament);
          const allDone = this.getAllMatches(tournament).every(m => m.winner);
          if (allDone) {
            tournament.status = 'completed';
            tournament.completedAt = new Date().toISOString();
            Storage.updateTournament(tournament);
          }
          this.render(container, tournament);
        });
      });
    });

    // 데스크톱: HTML5 Drag and Drop (매치 카드 위치 교환)
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', `${card.dataset.slotIdx},${card.dataset.matchIdx}`);
        requestAnimationFrame(() => card.style.opacity = '0.4');
      });
      card.addEventListener('dragend', () => { card.style.opacity = ''; });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('ring-2', 'ring-green-500');
      });
      card.addEventListener('dragleave', () => card.classList.remove('ring-2', 'ring-green-500'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('ring-2', 'ring-green-500');
        const [si, mi] = e.dataTransfer.getData('text/plain').split(',').map(Number);
        const tSI = +card.dataset.slotIdx, tMI = +card.dataset.matchIdx;
        if (si === tSI && mi === tMI) return;
        const srcSlot = tournament.timeSlots[si], tgtSlot = tournament.timeSlots[tSI];
        [srcSlot.matches[mi], tgtSlot.matches[tMI]] = [tgtSlot.matches[tMI], srcSlot.matches[mi]];
        srcSlot.matches.forEach((m, i) => m.court = i + 1);
        if (si !== tSI) tgtSlot.matches.forEach((m, i) => m.court = i + 1);
        Storage.updateTournament(tournament);
        this.render(container, tournament);
      });
    });
  },

  // PDF 내보내기 (타임슬롯 단위 캡처, 페이지당 4개)
  async exportPDF(container, tournament) {
    const btn = container.querySelector('#pdf-download-btn');
    const origText = btn.innerHTML;
    btn.innerHTML = '생성 중...';
    btn.disabled = true;

    try {
      const { jsPDF } = window.jspdf;
      const captureOpts = { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: -window.scrollY };

      // PDF에서 숨길 요소 (기록 탭에서는 통계 포함)
      const hideSelector = tournament.status === 'completed'
        ? '#pdf-download-btn, .schedule-match-card p'
        : '#pdf-download-btn, .schedule-match-card p, #stats-section';
      const hideEls = container.querySelectorAll(hideSelector);
      hideEls.forEach(el => el.style.display = 'none');

      // 캡처 시 고정 너비 적용 (좁게 → PDF에서 글씨가 크게 보임)
      const slotCaptureW = '450px';
      const headerCaptureW = '700px';

      // 헤더 캡처
      const headerEl = container.querySelector('#schedule-header');
      const origHeaderW = headerEl.style.width;
      headerEl.style.width = headerCaptureW;
      const headerCanvas = await html2canvas(headerEl, captureOpts);
      headerEl.style.width = origHeaderW;

      // 각 타임슬롯 개별 캡처 (좁은 너비로 캡처)
      const slotEls = container.querySelectorAll('.schedule-slot');
      const slotCanvases = [];
      for (const el of slotEls) {
        const origW = el.style.width;
        el.style.width = slotCaptureW;
        slotCanvases.push(await html2canvas(el, captureOpts));
        el.style.width = origW;
      }

      // 통계 테이블 캡처 (기록 탭일 때만)
      let statsCanvas = null;
      const statsEl = container.querySelector('#stats-section');
      if (tournament.status === 'completed' && statsEl) {
        const origStatsW = statsEl.style.width;
        statsEl.style.width = headerCaptureW;
        statsCanvas = await html2canvas(statsEl, captureOpts);
        statsEl.style.width = origStatsW;
      }

      // 숨긴 요소 복원
      hideEls.forEach(el => el.style.display = '');

      // PDF 생성 (2열, 페이지에 들어가는 만큼 채움)
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10;
      const colGap = 4;
      const rowGap = 4;
      const contentW = 210 - margin * 2;
      const colW = (contentW - colGap) / 2;
      const pageH = 297;

      // 슬롯 1개의 자연 높이 (모두 동일한 코트 수이므로 첫 번째로 계산)
      const slotRowH = slotCanvases.length > 0
        ? (slotCanvases[0].height * colW) / slotCanvases[0].width
        : 0;

      const headerH = (headerCanvas.height * contentW) / headerCanvas.width;
      let currentY = margin;
      let slotIdx = 0;
      let pageNum = 0;

      while (slotIdx < slotCanvases.length) {
        if (pageNum > 0) pdf.addPage();
        currentY = margin;

        // 첫 페이지에 헤더 삽입
        if (pageNum === 0) {
          pdf.addImage(headerCanvas.toDataURL('image/png'), 'PNG', margin, currentY, contentW, headerH);
          currentY += headerH + rowGap;
        }

        // 남은 공간에 행을 채울 수 있는 만큼 배치
        while (slotIdx < slotCanvases.length) {
          const remainH = pageH - margin - currentY;
          if (remainH < slotRowH * 0.9) break; // 다음 행이 들어갈 공간 부족

          // 2열 배치
          for (let col = 0; col < 2 && slotIdx < slotCanvases.length; col++) {
            const canvas = slotCanvases[slotIdx];
            const x = margin + col * (colW + colGap);
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, currentY, colW, slotRowH);
            slotIdx++;
          }

          currentY += slotRowH + rowGap;
        }

        pageNum++;
      }

      // 통계 테이블 추가 (기록 탭)
      if (statsCanvas) {
        const statsH = (statsCanvas.height * contentW) / statsCanvas.width;
        const remainH = pageH - margin - currentY;

        if (statsH > remainH) pdf.addPage();
        const statsY = statsH > remainH ? margin : currentY;
        pdf.addImage(statsCanvas.toDataURL('image/png'), 'PNG', margin, statsY, contentW, statsH);
      }

      pdf.save(`${tournament.name}.pdf`);
    } catch (e) {
      console.error('PDF 생성 오류:', e);
      alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  },

  // 선수 이름을 개별 탭 가능한 span으로 렌더링
  renderSwapPlayer(name, slotIdx, matchIdx, team, pos) {
    const allPlayers = Storage.getPlayers();
    const pd = allPlayers.find(p => p.name === name);
    const ntrp = (pd?.ntrp || 2.5).toFixed(1);
    return `<span class="swap-player cursor-pointer hover:bg-yellow-100 rounded px-0.5 transition inline-flex items-center gap-0.5"
      data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}" data-team="${team}" data-pos="${pos}"
      data-name="${Results.escapeHtml(name)}">${Results.escapeHtml(name)}<span class="text-yellow-600 text-xs">${ntrp}</span></span>`;
  },

  // 매치 카드 HTML
  renderMatchCard(match, slotIdx, matchIdx) {
    const cfg = SCHEDULE_GAME_TYPES[match.gameType];
    const hasScore = !!match.winner;
    const t1Names = match.player1.split(' / ');
    const t2Names = match.player2.split(' / ');
    const t1Html = t1Names.map((n, p) => this.renderSwapPlayer(n, slotIdx, matchIdx, 1, p)).join(' <span class="text-gray-300">/</span> ');
    const t2Html = t2Names.map((n, p) => this.renderSwapPlayer(n, slotIdx, matchIdx, 2, p)).join(' <span class="text-gray-300">/</span> ');
    const isWin1 = match.winner === match.player1;
    const isWin2 = match.winner === match.player2;

    return `
      <div class="schedule-match-card bg-white border ${hasScore ? 'border-green-200' : 'border-gray-200'} rounded-xl p-3 cursor-pointer hover:shadow-md transition"
           draggable="true" data-match-id="${match.id}" data-slot-idx="${slotIdx}" data-match-idx="${matchIdx}">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}">${cfg.label}</span>
          <span class="text-xs text-gray-400">코트 ${match.court}</span>
        </div>
        <div class="space-y-0.5">
          <div class="flex items-center justify-between ${isWin1 ? 'bg-green-50' : 'bg-gray-50'} rounded-lg px-2 py-2.5">
            <span class="text-xs sm:text-sm font-medium ${isWin1 ? 'text-green-700' : 'text-gray-800'} flex-1" style="min-width:0">
              ${isWin1 ? '🏆 ' : ''}${t1Html}
            </span>
            ${hasScore ? `<span class="text-xs font-bold ${isWin1 ? 'text-green-600' : 'text-gray-500'} ml-1 flex-shrink-0">${match.scores[0][0]}</span>` : ''}
          </div>
          <div class="text-center text-xs text-gray-300 leading-tight">vs</div>
          <div class="flex items-center justify-between ${isWin2 ? 'bg-green-50' : 'bg-gray-50'} rounded-lg px-2 py-2.5">
            <span class="text-xs sm:text-sm font-medium ${isWin2 ? 'text-green-700' : 'text-gray-800'} flex-1" style="min-width:0">
              ${isWin2 ? '🏆 ' : ''}${t2Html}
            </span>
            ${hasScore ? `<span class="text-xs font-bold ${isWin2 ? 'text-green-600' : 'text-gray-500'} ml-1 flex-shrink-0">${match.scores[0][1]}</span>` : ''}
          </div>
        </div>
        ${!hasScore ? '<p class="text-xs text-gray-400 text-center mt-1.5">탭하여 스코어 입력</p>' : ''}
      </div>`;
  },
};
