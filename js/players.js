// players.js - 선수 관리 CRUD + UI 렌더링
const Players = {
  render(container) {
    const players = Storage.getPlayers();
    const males = players.filter(p => p.gender === 'M');
    const females = players.filter(p => p.gender === 'F');

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">선수 관리</h2>

        <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
          <!-- 선수 추가 입력 -->
          <div class="px-4 py-3 border-b border-gray-100">
            <div class="flex gap-2 overflow-hidden">
              <input type="text" id="player-name-input"
                class="min-w-0 flex-1 px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-base"
                placeholder="이름 입력" maxlength="20" style="flex:1 1 0;min-width:0">
              <select id="player-gender-select"
                class="px-2 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm font-medium bg-white flex-shrink-0">
                <option value="M">남</option>
                <option value="F">여</option>
              </select>
              <button id="add-player-btn"
                class="px-4 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 active:bg-green-800 transition font-medium whitespace-nowrap flex-shrink-0">
                추가
              </button>
            </div>
          </div>
          <!-- 헤더 -->
          <div class="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <span class="font-semibold text-gray-700 text-sm">등록 선수</span>
            <span class="text-xs text-gray-500">남 ${males.length} · 여 ${females.length} · 총 ${players.length}명</span>
          </div>
          <!-- 선수 목록 -->
          <div id="player-list" class="divide-y divide-gray-50">
            ${players.length === 0
              ? '<p class="text-gray-400 text-center py-8">등록된 선수가 없습니다.</p>'
              : players.map((p, i) => `
                <div class="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 h-7 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">${i + 1}</span>
                    <span class="text-gray-800 font-medium truncate">${this.escapeHtml(p.name)}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
                  </div>
                  <button class="delete-player-btn text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1 transition text-sm flex-shrink-0 ml-2"
                    data-id="${p.id}">삭제</button>
                </div>
              `).join('')}
          </div>
        </div>
      </div>`;

    this.bindEvents(container);
  },

  bindEvents(container) {
    const input = container.querySelector('#player-name-input');
    const genderSelect = container.querySelector('#player-gender-select');
    const addBtn = container.querySelector('#add-player-btn');

    const addPlayer = () => {
      const name = input.value.trim();
      const gender = genderSelect.value;
      if (!name) return;

      const players = Storage.getPlayers();
      if (players.some(p => p.name === name)) {
        alert('이미 등록된 선수입니다.');
        return;
      }

      players.push({ id: Storage.generateId(), name, gender });
      Storage.savePlayers(players);
      this.render(container);
    };

    addBtn.onclick = addPlayer;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') addPlayer();
    };

    container.querySelectorAll('.delete-player-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        if (!confirm('선수를 삭제하시겠습니까?')) return;
        const players = Storage.getPlayers().filter(p => p.id !== id);
        Storage.savePlayers(players);
        this.render(container);
      };
    });

    input.focus();
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
};
