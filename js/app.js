// app.js - 앱 초기화, 탭 전환, 대회 생성
const GAME_TYPES = {
  MS: { label: '남자단식', icon: '🏃‍♂️', gender: 'M', doubles: false },
  WS: { label: '여자단식', icon: '🏃‍♀️', gender: 'F', doubles: false },
  MD: { label: '남자복식', icon: '👬', gender: 'M', doubles: true },
  WD: { label: '여자복식', icon: '👭', gender: 'F', doubles: true },
  XD: { label: '혼합복식', icon: '👫', gender: 'mixed', doubles: true },
};

const App = {
  currentTab: 'players',
  currentTournamentId: null,

  init() {
    this.bindTabs();
    this.navigate('players');
  },

  bindTabs() {
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.onclick = () => this.navigate(tab.dataset.tab);
    });
  },

  navigate(tabName, tournamentId) {
    this.currentTab = tabName;

    document.querySelectorAll('[data-tab]').forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('tab-active');
        tab.classList.remove('text-gray-500');
      } else {
        tab.classList.remove('tab-active');
        tab.classList.add('text-gray-500');
      }
    });

    const content = document.getElementById('main-content');

    switch (tabName) {
      case 'players':
        Players.render(content);
        break;
      case 'create':
        this.renderCreateForm(content);
        break;
      case 'active':
        this.renderTournamentList(content, 'active', tournamentId);
        break;
      case 'history':
        this.renderTournamentList(content, 'completed');
        break;
    }
  },

  // 경기 종류에 따른 자격 선수 필터링
  getEligiblePlayers(gameType) {
    const players = Storage.getPlayers();
    const config = GAME_TYPES[gameType];
    if (config.gender === 'mixed') return players;
    return players.filter(p => p.gender === config.gender);
  },

  renderCreateForm(container) {
    const allPlayers = Storage.getPlayers();

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">대회 만들기</h2>

        ${allPlayers.length < 2 ? `
          <div class="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
            <p class="text-yellow-800 font-medium mb-2">선수를 2명 이상 등록해주세요.</p>
            <button onclick="App.navigate('players')" class="text-green-600 font-semibold hover:underline">선수 관리로 이동</button>
          </div>` : `
        <form id="create-form" class="space-y-5">
          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">대회명</label>
            <input type="text" id="tournament-name" required maxlength="30"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="예: 2024년 봄 정기대회">
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">경기 종류</label>
            <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
              ${Object.entries(GAME_TYPES).map(([key, cfg], i) => `
                <label class="cursor-pointer">
                  <input type="radio" name="gameType" value="${key}" ${i === 0 ? 'checked' : ''} class="sr-only peer">
                  <div class="border-2 border-gray-200 rounded-xl py-2.5 px-1 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                    <div class="text-lg">${cfg.icon}</div>
                    <div class="text-xs font-semibold text-gray-700 mt-0.5">${cfg.label}</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">대회 형식</label>
            <div class="grid grid-cols-2 gap-3">
              <label class="format-option relative cursor-pointer">
                <input type="radio" name="format" value="tournament" checked class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl p-4 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <div class="text-2xl mb-1">🏆</div>
                  <div class="font-semibold text-gray-800">토너먼트</div>
                  <div class="text-xs text-gray-500 mt-1">싱글 엘리미네이션</div>
                </div>
              </label>
              <label class="format-option relative cursor-pointer">
                <input type="radio" name="format" value="league" class="sr-only peer">
                <div class="border-2 border-gray-200 rounded-xl p-4 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                  <div class="text-2xl mb-1">📊</div>
                  <div class="font-semibold text-gray-800">리그</div>
                  <div class="text-xs text-gray-500 mt-1">라운드 로빈</div>
                </div>
              </label>
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-2">세트 수</label>
            <div class="flex gap-3">
              ${[1, 3, 5].map(n => `
                <label class="flex-1 cursor-pointer">
                  <input type="radio" name="setCount" value="${n}" ${n === 3 ? 'checked' : ''} class="sr-only peer">
                  <div class="border-2 border-gray-200 rounded-xl py-2.5 text-center peer-checked:border-green-500 peer-checked:bg-green-50 transition">
                    <span class="font-semibold text-gray-800">${n}세트</span>
                    <div class="text-xs text-gray-500">${Math.ceil(n / 2)}세트 선승</div>
                  </div>
                </label>
              `).join('')}
            </div>
          </div>

          <!-- 참가자 영역: 경기 종류에 따라 동적 렌더 -->
          <div id="participants-section"></div>

          <button type="submit"
            class="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-semibold text-lg">
            대회 생성
          </button>
        </form>`}
      </div>`;

    if (allPlayers.length < 2) return;

    // 경기 종류 변경 시 참가자 섹션 다시 렌더
    const gameTypeRadios = container.querySelectorAll('input[name="gameType"]');
    gameTypeRadios.forEach(r => {
      r.onchange = () => this.renderParticipantsSection(container);
    });

    // 최초 렌더
    this.renderParticipantsSection(container);

    // 폼 제출
    container.querySelector('#create-form').onsubmit = (e) => {
      e.preventDefault();

      const name = container.querySelector('#tournament-name').value.trim();
      const gameType = container.querySelector('input[name="gameType"]:checked').value;
      const format = container.querySelector('input[name="format"]:checked').value;
      const setCount = parseInt(container.querySelector('input[name="setCount"]:checked').value);
      const config = GAME_TYPES[gameType];

      if (!name) { alert('대회명을 입력해주세요.'); return; }

      let participants;

      if (config.doubles) {
        // 복식: 팀 목록 수집
        participants = this.collectTeams(container, gameType);
        if (!participants) return; // 에러는 collectTeams에서 처리
        if (participants.length < 2) { alert('최소 2팀 이상 필요합니다.'); return; }
      } else {
        // 단식: 선택된 선수 수집
        const selected = Array.from(container.querySelectorAll('.player-checkbox:checked')).map(cb => cb.value);
        if (selected.length < 2) { alert('2명 이상 선택해주세요.'); return; }
        participants = selected;
      }

      const tournament = {
        id: Storage.generateId(),
        name,
        gameType,
        gameTypeLabel: config.label,
        format,
        setCount,
        players: participants,
        status: 'active',
        createdAt: new Date().toISOString(),
        completedAt: null,
        rounds: format === 'tournament'
          ? Tournament.generateBracket(participants)
          : League.generateSchedule(participants),
      };

      const tournaments = Storage.getTournaments();
      tournaments.push(tournament);
      Storage.saveTournaments(tournaments);

      this.navigate('active', tournament.id);
    };
  },

  // 참가자 섹션 동적 렌더
  renderParticipantsSection(container) {
    const section = container.querySelector('#participants-section');
    const gameType = container.querySelector('input[name="gameType"]:checked').value;
    const config = GAME_TYPES[gameType];

    if (config.doubles) {
      this.renderDoublesSection(section, gameType);
    } else {
      this.renderSinglesSection(section, gameType);
    }
  },

  // 단식 참가자 선택 UI
  renderSinglesSection(section, gameType) {
    const eligible = this.getEligiblePlayers(gameType);
    const config = GAME_TYPES[gameType];

    if (eligible.length < 2) {
      section.innerHTML = `
        <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
          <p class="text-yellow-800">${config.label}에 참가 가능한 선수가 부족합니다. (현재 ${eligible.length}명)</p>
        </div>`;
      return;
    }

    section.innerHTML = `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">참가 선수 선택</label>
        <input type="text" id="player-search" placeholder="이름 검색..."
          class="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm mb-2">
        <div class="flex justify-between items-center mb-2">
          <span id="selected-count" class="text-sm text-gray-500">0명 선택</span>
          <button type="button" id="select-all-btn" class="text-sm text-green-600 font-medium hover:underline">전체 선택</button>
        </div>
        <div id="player-checkbox-list" class="bg-white border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
          ${eligible.map(p => `
            <label class="player-item flex items-center px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition" data-name="${Results.escapeHtml(p.name.toLowerCase())}">
              <input type="checkbox" name="players" value="${Results.escapeHtml(p.name)}" class="player-checkbox w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500">
              <span class="ml-3 text-sm text-gray-800">${Results.escapeHtml(p.name)}</span>
              <span class="ml-2 text-xs px-1.5 py-0.5 rounded font-medium ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
            </label>
          `).join('')}
        </div>
      </div>`;

    // 검색 필터
    const searchInput = section.querySelector('#player-search');
    const playerItems = section.querySelectorAll('.player-item');
    searchInput.oninput = () => {
      const query = searchInput.value.trim().toLowerCase();
      playerItems.forEach(item => {
        const name = item.dataset.name;
        item.style.display = (!query || name.includes(query)) ? '' : 'none';
      });
    };

    const selectAllBtn = section.querySelector('#select-all-btn');
    const countEl = section.querySelector('#selected-count');

    const updateCount = () => {
      const checked = section.querySelectorAll('.player-checkbox:checked').length;
      countEl.textContent = `${checked}명 선택`;
    };

    section.querySelectorAll('.player-checkbox').forEach(cb => { cb.onchange = updateCount; });

    let allSelected = false;
    selectAllBtn.onclick = () => {
      allSelected = !allSelected;
      // 전체 선택/해제는 현재 보이는 항목만 대상
      section.querySelectorAll('.player-item').forEach(item => {
        if (item.style.display !== 'none') {
          item.querySelector('.player-checkbox').checked = allSelected;
        }
      });
      selectAllBtn.textContent = allSelected ? '선택 해제' : '전체 선택';
      updateCount();
    };
  },

  // 검색형 선수 선택 드롭다운 생성 (복식용)
  createSearchableSelect(container, id, label, players) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex-1 relative';
    wrapper.innerHTML = `
      <label class="block text-xs text-gray-500 mb-1">${label}</label>
      <input type="text" id="${id}" autocomplete="off"
        class="searchable-select w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
        placeholder="이름 검색..." data-value="">
      <div id="${id}-dropdown" class="searchable-dropdown hidden absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto"></div>`;

    container.appendChild(wrapper);

    const input = wrapper.querySelector(`#${id}`);
    const dropdown = wrapper.querySelector(`#${id}-dropdown`);

    const renderOptions = (query) => {
      const q = (query || '').toLowerCase();
      const filtered = players.filter(p => !q || p.name.toLowerCase().includes(q));
      if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="px-3 py-2 text-sm text-gray-400">결과 없음</div>';
      } else {
        dropdown.innerHTML = filtered.map(p => `
          <div class="search-option px-3 py-2 text-sm text-gray-800 hover:bg-green-50 cursor-pointer transition flex items-center gap-2" data-name="${Results.escapeHtml(p.name)}">
            <span>${Results.escapeHtml(p.name)}</span>
            <span class="text-xs px-1.5 py-0.5 rounded font-medium ${p.gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${p.gender === 'M' ? '남' : '여'}</span>
          </div>
        `).join('');
      }
      dropdown.querySelectorAll('.search-option').forEach(opt => {
        opt.onmousedown = (e) => {
          e.preventDefault();
          input.value = opt.dataset.name;
          input.dataset.value = opt.dataset.name;
          dropdown.classList.add('hidden');
        };
      });
    };

    input.onfocus = () => {
      renderOptions(input.value);
      dropdown.classList.remove('hidden');
    };
    input.oninput = () => {
      input.dataset.value = '';
      renderOptions(input.value);
      dropdown.classList.remove('hidden');
    };
    input.onblur = () => {
      setTimeout(() => dropdown.classList.add('hidden'), 150);
    };
  },

  // 복식 팀 조합 UI
  renderDoublesSection(section, gameType) {
    const config = GAME_TYPES[gameType];
    const allPlayers = Storage.getPlayers();
    let eligibleMales, eligibleFemales, eligibleAll;

    if (gameType === 'XD') {
      eligibleMales = allPlayers.filter(p => p.gender === 'M');
      eligibleFemales = allPlayers.filter(p => p.gender === 'F');
      if (eligibleMales.length < 1 || eligibleFemales.length < 1) {
        section.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
            <p class="text-yellow-800">혼합복식을 위해 남자 1명, 여자 1명 이상이 필요합니다.<br>(남 ${eligibleMales.length}명, 여 ${eligibleFemales.length}명)</p>
          </div>`;
        return;
      }
    } else {
      eligibleAll = this.getEligiblePlayers(gameType);
      if (eligibleAll.length < 2) {
        section.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center text-sm">
            <p class="text-yellow-800">${config.label}에 참가 가능한 선수가 부족합니다. (현재 ${eligibleAll.length}명)</p>
          </div>`;
        return;
      }
    }

    section.innerHTML = `
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-2">팀 조합</label>
        <div id="team-form" class="flex gap-2 items-end"></div>
        <div id="team-list" class="mt-3 space-y-2"></div>
        <div id="team-count" class="text-sm text-gray-500 mt-2">0팀 등록됨</div>
      </div>`;

    const teamForm = section.querySelector('#team-form');

    if (gameType === 'XD') {
      this.createSearchableSelect(teamForm, 'team-male', '남자 선수', eligibleMales);
      this.createSearchableSelect(teamForm, 'team-female', '여자 선수', eligibleFemales);
    } else {
      this.createSearchableSelect(teamForm, 'team-p1', '선수 1', eligibleAll);
      this.createSearchableSelect(teamForm, 'team-p2', '선수 2', eligibleAll);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium whitespace-nowrap self-end';
    addBtn.textContent = '팀 추가';
    addBtn.onclick = () => this.addTeam(section, gameType);
    teamForm.appendChild(addBtn);
  },

  addTeam(section, gameType) {
    let p1Name, p2Name, input1, input2;

    if (gameType === 'XD') {
      input1 = section.querySelector('#team-male');
      input2 = section.querySelector('#team-female');
      p1Name = input1.dataset.value || input1.value.trim();
      p2Name = input2.dataset.value || input2.value.trim();
      if (!p1Name || !p2Name) { alert('남자 선수와 여자 선수를 모두 선택해주세요.'); return; }
    } else {
      input1 = section.querySelector('#team-p1');
      input2 = section.querySelector('#team-p2');
      p1Name = input1.dataset.value || input1.value.trim();
      p2Name = input2.dataset.value || input2.value.trim();
      if (!p1Name || !p2Name) { alert('두 선수를 모두 선택해주세요.'); return; }
      if (p1Name === p2Name) { alert('같은 선수를 선택할 수 없습니다.'); return; }
    }

    // 입력된 이름이 실제 선수인지 확인
    const allPlayers = Storage.getPlayers();
    if (!allPlayers.some(p => p.name === p1Name) || !allPlayers.some(p => p.name === p2Name)) {
      alert('등록된 선수 이름을 선택해주세요.');
      return;
    }

    const teamName = `${p1Name} / ${p2Name}`;
    const teamList = section.querySelector('#team-list');

    // 중복 팀 검사
    const existingTeams = teamList.querySelectorAll('.team-entry');
    for (const entry of existingTeams) {
      if (entry.dataset.team === teamName) {
        alert('이미 등록된 팀입니다.');
        return;
      }
      const parts = entry.dataset.team.split(' / ');
      if (parts.includes(p1Name) || parts.includes(p2Name)) {
        alert(`${parts.includes(p1Name) ? p1Name : p2Name} 선수는 이미 다른 팀에 속해 있습니다.`);
        return;
      }
    }

    // 입력 초기화
    input1.value = '';
    input1.dataset.value = '';
    input2.value = '';
    input2.dataset.value = '';

    const teamEl = document.createElement('div');
    teamEl.className = 'team-entry flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-2.5';
    teamEl.dataset.team = teamName;
    teamEl.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">${teamList.children.length + 1}</span>
        <span class="text-sm font-medium text-gray-800">${Results.escapeHtml(p1Name)}</span>
        <span class="text-gray-400">&</span>
        <span class="text-sm font-medium text-gray-800">${Results.escapeHtml(p2Name)}</span>
      </div>
      <button type="button" class="remove-team-btn text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50 transition">삭제</button>`;

    teamEl.querySelector('.remove-team-btn').onclick = () => {
      teamEl.remove();
      this.updateTeamNumbers(section);
    };

    teamList.appendChild(teamEl);
    this.updateTeamNumbers(section);
  },

  updateTeamNumbers(section) {
    const entries = section.querySelectorAll('.team-entry');
    entries.forEach((entry, i) => {
      entry.querySelector('.w-6').textContent = i + 1;
    });
    section.querySelector('#team-count').textContent = `${entries.length}팀 등록됨`;
  },

  // 팀 목록 수집
  collectTeams(container, gameType) {
    const teamEntries = container.querySelectorAll('.team-entry');
    const teams = Array.from(teamEntries).map(e => e.dataset.team);
    return teams;
  },

  renderTournamentList(container, statusFilter, openTournamentId) {
    const all = Storage.getTournaments();
    const tournaments = statusFilter === 'active'
      ? all.filter(t => t.status === 'active')
      : all.filter(t => t.status === 'completed');

    const isActive = statusFilter === 'active';

    if (openTournamentId) {
      const t = all.find(t => t.id === openTournamentId);
      if (t) {
        this.renderTournamentDetail(container, t);
        return;
      }
    }

    if (tournaments.length === 0) {
      container.innerHTML = `
        <div class="max-w-lg mx-auto text-center py-12">
          <div class="text-5xl mb-4">${isActive ? '🎾' : '📋'}</div>
          <h2 class="text-xl font-bold text-gray-800 mb-2">${isActive ? '진행 중인 대회가 없습니다' : '완료된 대회가 없습니다'}</h2>
          <p class="text-gray-500 mb-4">${isActive ? '새 대회를 만들어보세요!' : '대회를 완료하면 여기에 표시됩니다.'}</p>
          ${isActive ? '<button onclick="App.navigate(\'create\')" class="px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-medium">대회 만들기</button>' : ''}
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="max-w-lg mx-auto">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">${isActive ? '진행 중인 대회' : '대회 기록'}</h2>
        <div class="space-y-3">
          ${tournaments.map(t => {
            const dateStr = new Date(t.createdAt).toLocaleDateString('ko-KR');
            const gameLabel = t.gameTypeLabel || (t.gameType ? GAME_TYPES[t.gameType]?.label : '');
            const isDoubles = t.gameType ? GAME_TYPES[t.gameType]?.doubles : false;
            const countLabel = isDoubles ? `${t.players.length}팀` : `${t.players.length}명`;
            return `
              <div class="tournament-card bg-white border border-gray-200 rounded-2xl p-4 cursor-pointer hover:shadow-md hover:border-green-300 transition"
                   data-id="${t.id}">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="font-bold text-gray-800">${Results.escapeHtml(t.name)}</h3>
                  <div class="flex items-center gap-2">
                    ${gameLabel ? `<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">${gameLabel}</span>` : ''}
                    <span class="text-xs px-2 py-1 rounded-full ${t.format === 'tournament' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
                      ${t.format === 'tournament' ? '토너먼트' : '리그'}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-4 text-sm text-gray-500">
                  <span>${countLabel}</span>
                  <span>${dateStr}</span>
                  ${t.status === 'completed' && t.format === 'tournament' ?
                    `<span class="text-yellow-600 font-medium">우승: ${Results.escapeHtml(t.rounds[t.rounds.length - 1][0].winner || '-')}</span>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    container.querySelectorAll('.tournament-card').forEach(card => {
      card.onclick = () => {
        const t = Storage.getTournamentById(card.dataset.id);
        if (t) this.renderTournamentDetail(container, t);
      };
    });
  },

  renderTournamentDetail(container, tournament) {
    this.currentTournamentId = tournament.id;

    const wrapper = document.createElement('div');
    wrapper.className = 'max-w-4xl mx-auto';

    const backBtn = document.createElement('button');
    backBtn.className = 'flex items-center gap-1 text-gray-500 hover:text-gray-800 mb-4 text-sm font-medium transition';
    backBtn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg> 목록으로`;
    backBtn.onclick = () => {
      this.currentTournamentId = null;
      this.navigate(tournament.status === 'completed' ? 'history' : 'active');
    };

    const detailContainer = document.createElement('div');

    wrapper.appendChild(backBtn);
    wrapper.appendChild(detailContainer);
    container.innerHTML = '';
    container.appendChild(wrapper);

    const actionBar = document.createElement('div');
    actionBar.className = 'flex justify-end mb-2';
    actionBar.innerHTML = `<button id="delete-tournament-btn" class="text-sm text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1 transition">대회 삭제</button>`;
    detailContainer.appendChild(actionBar);

    actionBar.querySelector('#delete-tournament-btn').onclick = () => {
      if (!confirm('이 대회를 삭제하시겠습니까?')) return;
      Storage.deleteTournament(tournament.id);
      this.currentTournamentId = null;
      this.navigate(tournament.status === 'completed' ? 'history' : 'active');
    };

    const viewContainer = document.createElement('div');
    detailContainer.appendChild(viewContainer);

    if (tournament.format === 'tournament') {
      Tournament.render(viewContainer, tournament);
    } else {
      League.render(viewContainer, tournament);
    }
  },
};

// 앱 시작
document.addEventListener('DOMContentLoaded', () => App.init());
