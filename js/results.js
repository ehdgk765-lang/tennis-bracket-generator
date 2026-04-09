// results.js - 스코어 입력 UI + 승자 판정 로직
const Results = {
  // 스코어 입력 모달 표시
  showScoreModal(match, tournament, onSave) {
    const existing = document.getElementById('score-modal');
    if (existing) existing.remove();

    const setCount = tournament.setCount || 3;
    const setsToWin = Math.ceil(setCount / 2);

    const modal = document.createElement('div');
    modal.id = 'score-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';

    const player1Name = match.player1 || 'BYE';
    const player2Name = match.player2 || 'BYE';

    let setsHTML = '';
    for (let i = 0; i < setCount; i++) {
      const s1 = match.scores ? (match.scores[i]?.[0] ?? '') : '';
      const s2 = match.scores ? (match.scores[i]?.[1] ?? '') : '';
      setsHTML += `
        <div class="flex items-center gap-2 justify-center">
          <span class="text-sm text-gray-500 w-16">세트 ${i + 1}</span>
          <input type="number" min="0" max="7" class="score-input w-14 h-10 text-center border border-gray-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500"
            data-set="${i}" data-player="0" value="${s1}" placeholder="0">
          <span class="text-gray-400 font-bold">:</span>
          <input type="number" min="0" max="7" class="score-input w-14 h-10 text-center border border-gray-300 rounded-lg text-lg font-bold focus:ring-2 focus:ring-green-500 focus:border-green-500"
            data-set="${i}" data-player="1" value="${s2}" placeholder="0">
        </div>`;
    }

    modal.innerHTML = `
      <div class="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <h3 class="text-lg font-bold text-center mb-4">스코어 입력</h3>
        <div class="flex justify-between items-center mb-4 px-1 sm:px-2">
          <span class="font-semibold text-green-700 text-xs sm:text-sm flex-1 text-center truncate">${this.escapeHtml(player1Name)}</span>
          <span class="text-gray-400 mx-2 flex-shrink-0">vs</span>
          <span class="font-semibold text-blue-700 text-xs sm:text-sm flex-1 text-center truncate">${this.escapeHtml(player2Name)}</span>
        </div>
        <div class="space-y-3 mb-5">${setsHTML}</div>
        <div id="score-error" class="text-red-500 text-sm text-center mb-3 hidden"></div>
        <div class="flex gap-3">
          <button id="score-cancel" class="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition font-medium">취소</button>
          <button id="score-save" class="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 transition font-medium">저장</button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    modal.querySelector('#score-cancel').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    modal.querySelector('#score-save').onclick = () => {
      const scores = [];
      const inputs = modal.querySelectorAll('.score-input');

      for (let i = 0; i < setCount; i++) {
        const s1 = inputs[i * 2].value;
        const s2 = inputs[i * 2 + 1].value;
        if (s1 !== '' && s2 !== '') {
          scores.push([parseInt(s1), parseInt(s2)]);
        }
      }

      if (scores.length === 0) {
        const err = modal.querySelector('#score-error');
        err.textContent = '최소 1세트의 스코어를 입력해주세요.';
        err.classList.remove('hidden');
        return;
      }

      const result = this.determineWinner(scores, setsToWin);
      if (!result.valid) {
        const err = modal.querySelector('#score-error');
        err.textContent = result.error;
        err.classList.remove('hidden');
        return;
      }

      onSave({
        scores: scores,
        winner: result.winner === 0 ? match.player1 : match.player2,
        winnerIndex: result.winner,
        setsWon: result.setsWon,
      });

      modal.remove();
    };

    // 첫 번째 입력에 포커스
    setTimeout(() => {
      const firstInput = modal.querySelector('.score-input');
      if (firstInput) firstInput.focus();
    }, 100);
  },

  // 승자 판정
  determineWinner(scores, setsToWin) {
    let p1Sets = 0;
    let p2Sets = 0;

    for (const [s1, s2] of scores) {
      if (s1 < 0 || s2 < 0) {
        return { valid: false, error: '스코어는 0 이상이어야 합니다.' };
      }
      if (s1 === s2) {
        return { valid: false, error: '같은 스코어는 입력할 수 없습니다.' };
      }
      if (s1 > s2) p1Sets++;
      else p2Sets++;
    }

    if (p1Sets < setsToWin && p2Sets < setsToWin) {
      return { valid: false, error: `${setsToWin}세트 선승이 필요합니다. 세트를 더 입력해주세요.` };
    }

    return {
      valid: true,
      winner: p1Sets >= setsToWin ? 0 : 1,
      setsWon: [p1Sets, p2Sets],
    };
  },

  // 스코어 문자열로 포매팅
  formatScores(scores) {
    if (!scores || scores.length === 0) return '-';
    return scores.map(([s1, s2]) => `${s1}-${s2}`).join(', ');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
