// league.js - 라운드 로빈 리그 로직 + UI
const League = {
  // 라운드 로빈 스케줄 생성
  generateSchedule(playerNames) {
    const players = [...playerNames];
    // 홀수면 BYE 추가
    if (players.length % 2 !== 0) {
      players.push(null);
    }
    const n = players.length;
    const rounds = [];

    for (let round = 0; round < n - 1; round++) {
      const matches = [];
      for (let i = 0; i < n / 2; i++) {
        const p1 = players[i];
        const p2 = players[n - 1 - i];
        if (p1 && p2) {
          matches.push({
            id: Storage.generateId(),
            player1: p1,
            player2: p2,
            scores: null,
            winner: null,
            round: round,
          });
        }
      }
      rounds.push(matches);
      // 로테이션: 첫 번째 고정, 나머지 시계 방향 회전
      const last = players.pop();
      players.splice(1, 0, last);
    }

    return rounds;
  },

  // 순위표 계산
  calculateStandings(tournament) {
    const standings = {};
    tournament.players.forEach(name => {
      standings[name] = { name, wins: 0, losses: 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, points: 0 };
    });

    for (const round of tournament.rounds) {
      for (const match of round) {
        if (!match.winner || !match.scores) continue;

        const p1 = match.player1;
        const p2 = match.player2;

        if (match.winner === p1) {
          standings[p1].wins++;
          standings[p2].losses++;
          standings[p1].points += 3;
        } else {
          standings[p2].wins++;
          standings[p1].losses++;
          standings[p2].points += 3;
        }

        // 세트/게임 통계
        for (const [s1, s2] of match.scores) {
          standings[p1].gamesWon += s1;
          standings[p1].gamesLost += s2;
          standings[p2].gamesWon += s2;
          standings[p2].gamesLost += s1;
          if (s1 > s2) {
            standings[p1].setsWon++;
            standings[p2].setsLost++;
          } else {
            standings[p2].setsWon++;
            standings[p1].setsLost++;
          }
        }
      }
    }

    return Object.values(standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      const aSetDiff = a.setsWon - a.setsLost;
      const bSetDiff = b.setsWon - b.setsLost;
      if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
      return (b.gamesWon - b.gamesLost) - (a.gamesWon - a.gamesLost);
    });
  },

  // 리그 뷰 렌더링
  render(container, tournament) {
    const rounds = tournament.rounds;
    const standings = this.calculateStandings(tournament);
    const totalMatches = rounds.reduce((sum, r) => sum + r.length, 0);
    const completedMatches = rounds.reduce((sum, r) => sum + r.filter(m => m.winner).length, 0);
    const isComplete = completedMatches === totalMatches;

    if (isComplete && tournament.status !== 'completed') {
      tournament.status = 'completed';
      tournament.completedAt = new Date().toISOString();
      Storage.updateTournament(tournament);
    }

    let html = `
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-gray-800">${Results.escapeHtml(tournament.name)}</h2>
          <span class="text-sm text-gray-500">${tournament.gameTypeLabel || ''} · 리그 · ${tournament.players.length}${tournament.gameType && GAME_TYPES[tournament.gameType]?.doubles ? '팀' : '명'} · ${completedMatches}/${totalMatches} 경기 완료</span>
        </div>
        ${isComplete ? `<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">완료</span>` :
          `<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">진행 중</span>`}
      </div>`;

    // 순위표
    html += `
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
        <div class="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">순위표</div>
        <div class="overflow-x-auto">
          <table class="standings-table w-full text-sm">
            <thead>
              <tr class="bg-gray-50 text-gray-600">
                <th class="px-3 py-2 text-left">#</th>
                <th class="px-3 py-2 text-left">${tournament.gameType && GAME_TYPES[tournament.gameType]?.doubles ? '팀' : '선수'}</th>
                <th class="px-3 py-2 text-center">승</th>
                <th class="px-3 py-2 text-center">패</th>
                <th class="px-3 py-2 text-center">세트</th>
                <th class="px-3 py-2 text-center">점수</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((s, i) => `
                <tr class="${i === 0 && isComplete ? 'bg-yellow-50' : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50')} border-b border-gray-50">
                  <td class="px-3 py-2.5 font-bold ${i === 0 && isComplete ? 'text-yellow-600' : 'text-gray-400'}">${i + 1}</td>
                  <td class="px-3 py-2.5 font-medium text-gray-800">${Results.escapeHtml(s.name)}</td>
                  <td class="px-3 py-2.5 text-center text-green-600 font-semibold">${s.wins}</td>
                  <td class="px-3 py-2.5 text-center text-red-500">${s.losses}</td>
                  <td class="px-3 py-2.5 text-center text-gray-600">${s.setsWon}-${s.setsLost}</td>
                  <td class="px-3 py-2.5 text-center font-bold text-gray-800">${s.points}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    // 경기 일정
    html += `<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-4 py-3 border-b border-gray-100 font-semibold text-gray-700">경기 일정</div>`;

    for (let r = 0; r < rounds.length; r++) {
      html += `
        <div class="border-b border-gray-50 last:border-0">
          <div class="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">라운드 ${r + 1}</div>
          <div class="divide-y divide-gray-50">`;

      for (const match of rounds[r]) {
        const canEdit = !match.winner;
        const p1Won = match.winner === match.player1;
        const p2Won = match.winner === match.player2;

        html += `
          <div class="league-match league-match-mobile flex items-center px-4 py-3 ${canEdit ? 'cursor-pointer hover:bg-green-50 active:bg-green-50' : ''} transition"
               data-match-id="${match.id}" data-round="${r}">
            <div class="league-p1 flex-1 flex items-center justify-end gap-2">
              <span class="text-sm ${p1Won ? 'font-bold text-green-700' : 'text-gray-700'} truncate">${Results.escapeHtml(match.player1)}</span>
              ${p1Won ? '<span class="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">W</span>' : ''}
            </div>
            <div class="league-score mx-3 text-center min-w-[80px]">
              ${match.scores ? `<span class="text-sm font-mono font-semibold text-gray-600">${Results.formatScores(match.scores)}</span>` :
                `<span class="text-xs ${canEdit ? 'text-green-600 font-medium' : 'text-gray-400'}">
                  ${canEdit ? '결과 입력' : 'vs'}</span>`}
            </div>
            <div class="league-p2 flex-1 flex items-center gap-2">
              ${p2Won ? '<span class="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">W</span>' : ''}
              <span class="text-sm ${p2Won ? 'font-bold text-green-700' : 'text-gray-700'} truncate">${Results.escapeHtml(match.player2)}</span>
            </div>
          </div>`;
      }

      html += `</div></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    // 클릭 이벤트 바인딩
    container.querySelectorAll('.league-match').forEach(el => {
      el.onclick = () => {
        const matchId = el.dataset.matchId;
        const round = parseInt(el.dataset.round);
        const match = rounds[round].find(m => m.id === matchId);
        if (!match || match.winner) return;

        Results.showScoreModal(match, tournament, (result) => {
          match.scores = result.scores;
          match.winner = result.winner;

          Storage.updateTournament(tournament);
          this.render(container, tournament);
        });
      };
    });
  },
};
