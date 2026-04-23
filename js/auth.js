// auth.js - 관리자/멤버 로그인 + Firebase Auth 관리
const Auth = {
  initialized: false,
  loginMode: null, // 'admin' | 'member'

  init() {
    fbAuth.onAuthStateChanged(async (user) => {
      const authEl = document.getElementById('auth-container');
      const appEl = document.getElementById('app-container');

      if (user) {
        if (user.isAnonymous) {
          // 익명 사용자는 더 이상 사용하지 않음 → 로그아웃
          fbAuth.signOut();
          return;
        }

        // Firestore에서 멤버 계정인지 확인
        try {
          const memberDoc = await fbDb.collection('memberAccounts').doc(user.uid).get();

          if (memberDoc.exists) {
            // ── 멤버 로그인 ──
            const adminUID = memberDoc.data().adminUID;
            this.loginMode = 'member';
            localStorage.removeItem(Storage.KEYS.PLAYERS);
            localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
            localStorage.removeItem(Storage.KEYS.TEAMS);

            try {
              await Storage.loadFromFirestoreAsAdmin(adminUID);
            } catch (e) {
              console.error('Firestore 로드 실패:', e);
            }
            Storage.startRealtimeSync();

            App.isAdmin = false;

            const showApp = () => {
              authEl.style.display = 'none';
              appEl.style.display = '';
              this.updateRoleBadge();
              if (!this.initialized) { App.init(); this.initialized = true; }
              else App.navigate(App.currentTab);
            };

            const savedName = sessionStorage.getItem('memberName');
            if (savedName) {
              App.memberName = savedName;
              showApp();
            } else {
              this.showMemberNameSelection(() => { showApp(); });
            }

          } else {
            // ── 관리자 로그인 ──
            this.loginMode = 'admin';
            Storage.resetMemberMode();

            const lastUid = localStorage.getItem('tennis_last_uid');
            if (lastUid && lastUid !== user.uid) {
              localStorage.removeItem(Storage.KEYS.PLAYERS);
              localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
              localStorage.removeItem(Storage.KEYS.TEAMS);
            }
            localStorage.setItem('tennis_last_uid', user.uid);

            try {
              await Storage.loadFromFirestore();
            } catch (e) {
              console.error('Firestore 로드 실패 (오프라인 모드):', e);
            }
            Storage.startRealtimeSync();

            App.isAdmin = true;
            App.memberName = null;
            authEl.style.display = 'none';
            appEl.style.display = '';
            this.updateRoleBadge();

            if (!this.initialized) { App.init(); this.initialized = true; }
            else App.navigate(App.currentTab);
          }
        } catch (e) {
          console.error('계정 유형 확인 실패:', e);
          // Firestore 오류 시 관리자로 처리
          this.loginMode = 'admin';
          Storage.resetMemberMode();
          try { await Storage.loadFromFirestore(); } catch (_) {}
          Storage.startRealtimeSync();
          App.isAdmin = true;
          App.memberName = null;
          authEl.style.display = 'none';
          appEl.style.display = '';
          this.updateRoleBadge();
          if (!this.initialized) { App.init(); this.initialized = true; }
          else App.navigate(App.currentTab);
        }

      } else {
        // 로그아웃 상태
        Storage.stopRealtimeSync();
        Storage.resetMemberMode();
        authEl.style.display = '';
        appEl.style.display = 'none';
        this.initialized = false;
        this.loginMode = null;
        App.memberName = null;
        this.renderLogin();
      }
    });
  },

  renderLogin() {
    const container = document.getElementById('auth-container');
    morphHTML(container, `
      <!-- 테마 토글 -->
      <button id="auth-theme-toggle" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 hover:bg-white/50 transition-all" title="테마 전환" aria-label="테마 전환">
        <svg class="auth-icon-sun w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <svg class="auth-icon-moon w-5 h-5 text-yellow-400" style="display:none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <div class="w-full max-w-sm mx-auto px-6">
        <!-- 로고 영역 -->
        <div class="text-center mb-8">
          <div class="relative inline-block mb-4">
            <div class="auth-logo-bg w-36 h-36 rounded-3xl mx-auto" role="img" aria-label="Tennis"></div>
          </div>
          <h1 class="text-2xl font-extrabold bg-gradient-to-r from-green-600 to-emerald-500 bg-clip-text text-transparent">Happy Tennis Life</h1>
          <p class="text-sm text-gray-400 mt-1">테니스를 더 즐겁게</p>
        </div>

        <!-- 로그인 탭 -->
        <div class="flex gap-2 mb-4">
          <button id="login-tab-admin" class="flex-1 py-2 rounded-full text-sm font-semibold transition bg-green-600 text-white">관리자 로그인</button>
          <button id="login-tab-member" class="flex-1 py-2 rounded-full text-sm font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200">멤버 로그인</button>
        </div>

        <!-- 관리자 로그인 카드 -->
        <div id="admin-login-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-green-100/50 p-6 border border-white/60">
          <form id="admin-auth-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">이메일</label>
              <input type="email" autocomplete="off" id="auth-email" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="email@example.com">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input type="password" autocomplete="off" id="auth-password" required minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="6자 이상">
            </div>
            <div id="auth-confirm-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호 확인</label>
              <input type="password" autocomplete="off" id="auth-password-confirm" minlength="6"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="비밀번호를 다시 입력">
            </div>
            <p id="admin-auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="admin-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md shadow-green-200">
              로그인
            </button>
          </form>
          <p class="text-center text-sm text-gray-400 mt-4">
            <span id="auth-toggle-text">계정이 없으신가요?</span>
            <button type="button" id="auth-toggle-btn" class="text-green-600 font-bold hover:underline ml-1">회원가입</button>
          </p>
        </div>

        <!-- 멤버 로그인 카드 -->
        <div id="member-login-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-green-100/50 p-6 border border-white/60" style="display:none">
          <form id="member-auth-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">이메일</label>
              <input type="email" autocomplete="off" id="member-login-email" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="호스트가 알려준 이메일">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input type="password" autocomplete="off" id="member-login-pw" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="비밀번호">
            </div>
            <p id="member-auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="member-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md shadow-blue-200">
              멤버 로그인
            </button>
          </form>
          <p class="text-center text-sm text-gray-400 mt-4">관리자에게 이메일과 비밀번호를 문의하세요</p>
        </div>
      </div>`);

    // 테마 토글
    const authThemeToggle = container.querySelector('#auth-theme-toggle');
    const authIconSun = container.querySelector('.auth-icon-sun');
    const authIconMoon = container.querySelector('.auth-icon-moon');
    const updateAuthThemeIcons = (isDark) => {
      authIconSun.style.display = isDark ? 'none' : 'block';
      authIconMoon.style.display = isDark ? 'block' : 'none';
    };
    updateAuthThemeIcons(document.documentElement.classList.contains('dark'));
    authThemeToggle.onclick = () => {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return;
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateAuthThemeIcons(isDark);
      const iconSun = document.getElementById('icon-sun');
      const iconMoon = document.getElementById('icon-moon');
      const metaColor = document.getElementById('meta-theme-color');
      if (iconSun) iconSun.style.display = isDark ? 'none' : 'block';
      if (iconMoon) iconMoon.style.display = isDark ? 'block' : 'none';
      if (metaColor) metaColor.content = isDark ? '#1e293b' : '#ffffff';
    };

    // ── 탭 전환 ──
    const tabAdmin = container.querySelector('#login-tab-admin');
    const tabMember = container.querySelector('#login-tab-member');
    const adminSection = container.querySelector('#admin-login-section');
    const memberSection = container.querySelector('#member-login-section');

    tabAdmin.onclick = () => {
      tabAdmin.className = 'flex-1 py-2 rounded-full text-sm font-semibold transition bg-green-600 text-white';
      tabMember.className = 'flex-1 py-2 rounded-full text-sm font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200';
      adminSection.style.display = '';
      memberSection.style.display = 'none';
    };
    tabMember.onclick = () => {
      tabMember.className = 'flex-1 py-2 rounded-full text-sm font-semibold transition bg-blue-600 text-white';
      tabAdmin.className = 'flex-1 py-2 rounded-full text-sm font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200';
      adminSection.style.display = 'none';
      memberSection.style.display = '';
    };

    // ── 관리자: 로그인/회원가입 토글 ──
    let isRegister = false;
    const adminForm = container.querySelector('#admin-auth-form');
    const confirmWrap = container.querySelector('#auth-confirm-wrap');
    const adminSubmitBtn = container.querySelector('#admin-submit-btn');
    const toggleText = container.querySelector('#auth-toggle-text');
    const toggleBtn = container.querySelector('#auth-toggle-btn');
    const adminErrorEl = container.querySelector('#admin-auth-error');

    toggleBtn.onclick = () => {
      isRegister = !isRegister;
      confirmWrap.style.display = isRegister ? '' : 'none';
      adminSubmitBtn.textContent = isRegister ? '회원가입' : '로그인';
      toggleText.textContent = isRegister ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
      toggleBtn.textContent = isRegister ? '로그인' : '회원가입';
      adminErrorEl.classList.add('hidden');
    };

    // ── 관리자: 폼 제출 ──
    adminForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = container.querySelector('#auth-email').value.trim();
      const password = container.querySelector('#auth-password').value;
      adminErrorEl.classList.add('hidden');
      adminSubmitBtn.disabled = true;
      adminSubmitBtn.textContent = '처리 중...';

      try {
        if (isRegister) {
          const confirm = container.querySelector('#auth-password-confirm').value;
          if (password !== confirm) throw { message: '비밀번호가 일치하지 않습니다.' };
          await fbAuth.createUserWithEmailAndPassword(email, password);
        } else {
          await fbAuth.signInWithEmailAndPassword(email, password);
        }
      } catch (err) {
        adminErrorEl.textContent = this.getErrorMessage(err);
        adminErrorEl.classList.remove('hidden');
        adminSubmitBtn.disabled = false;
        adminSubmitBtn.textContent = isRegister ? '회원가입' : '로그인';
      }
    };

    // ── 멤버: 폼 제출 ──
    const memberForm = container.querySelector('#member-auth-form');
    const memberSubmitBtn = container.querySelector('#member-submit-btn');
    const memberErrorEl = container.querySelector('#member-auth-error');

    memberForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = container.querySelector('#member-login-email').value.trim();
      const password = container.querySelector('#member-login-pw').value;
      memberErrorEl.classList.add('hidden');
      memberSubmitBtn.disabled = true;
      memberSubmitBtn.textContent = '처리 중...';

      try {
        await this.handleMemberLogin(email, password);
      } catch (err) {
        memberErrorEl.textContent = err.message || '로그인에 실패했습니다.';
        memberErrorEl.classList.remove('hidden');
        memberSubmitBtn.disabled = false;
        memberSubmitBtn.textContent = '멤버 로그인';
      }
    };
  },

  async handleMemberLogin(email, password) {
    // onAuthStateChanged가 자동 처리하므로 signIn만 하면 됨
    // 단, 관리자 계정으로 멤버 탭에서 로그인 시 onAuthStateChanged에서 자동 판별
    await fbAuth.signInWithEmailAndPassword(email, password);
  },

  showMemberNameSelection(onComplete) {
    const existing = document.getElementById('member-name-modal');
    if (existing) existing.remove();

    const players = Storage.getPlayers();

    const modal = document.createElement('div');
    modal.id = 'member-name-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';

    modal.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full flex flex-col">
        <div class="px-5 py-4 border-b border-gray-100 text-center flex-shrink-0 relative">
          <button id="member-name-close-btn" class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
          <div class="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-gray-800">본인 이름 입력</h3>
          <p class="text-sm text-gray-500 mt-1">호스트가 등록한 본인 이름을 입력해주세요</p>
        </div>
        <div class="px-5 py-4 space-y-3">
          <input type="text" id="member-name-input" autocomplete="off"
            class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition text-center text-lg"
            placeholder="이름 입력">
          <p id="member-name-error" class="text-sm text-red-500 hidden text-center"></p>
          <button id="member-name-confirm-btn"
            class="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] transition-all font-bold text-base shadow-md shadow-blue-200">
            확인
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const nameInput = modal.querySelector('#member-name-input');
    const errorEl = modal.querySelector('#member-name-error');
    const confirmBtn = modal.querySelector('#member-name-confirm-btn');
    const closeBtn = modal.querySelector('#member-name-close-btn');

    const doConfirm = () => {
      const inputName = nameInput.value.trim();
      if (!inputName) {
        errorEl.textContent = '이름을 입력해주세요.';
        errorEl.classList.remove('hidden');
        return;
      }
      const found = players.find(p => p.name === inputName);
      if (!found) {
        errorEl.textContent = '등록된 멤버 이름이 아닙니다. 다시 확인해주세요.';
        errorEl.classList.remove('hidden');
        return;
      }
      App.memberName = inputName;
      sessionStorage.setItem('memberName', inputName);
      modal.remove();
      onComplete();
    };

    confirmBtn.onclick = doConfirm;
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
    };
    nameInput.oninput = () => errorEl.classList.add('hidden');

    closeBtn.onclick = () => {
      modal.remove();
      sessionStorage.removeItem('memberName');
      App.memberName = null;
      this.loginMode = null;
      fbAuth.signOut();
    };

    setTimeout(() => nameInput.focus(), 100);
  },

  getErrorMessage(err) {
    const code = err.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential')
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (code === 'auth/email-already-in-use') return '이미 사용 중인 이메일입니다.';
    if (code === 'auth/weak-password') return '비밀번호가 너무 짧습니다. (6자 이상)';
    if (code === 'auth/invalid-email') return '올바른 이메일 형식을 입력해주세요.';
    if (code === 'auth/too-many-requests') return '너무 많은 시도입니다. 잠시 후 다시 시도해주세요.';
    return err.message || '오류가 발생했습니다.';
  },

  updateRoleBadge() {
    const badge = document.getElementById('role-badge');
    if (!badge) return;
    badge.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-gray-100', 'text-gray-500', 'bg-blue-100', 'text-blue-700');
    if (App.isAdmin) {
      badge.textContent = '관리자님';
      badge.classList.add('bg-green-100', 'text-green-700');
    } else if (App.memberName) {
      badge.textContent = App.memberName + '님';
      badge.classList.add('bg-blue-100', 'text-blue-700');
    } else {
      badge.textContent = '게스트님';
      badge.classList.add('bg-gray-100', 'text-gray-500');
    }
  },

  logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem(Storage.KEYS.TEAMS);
      localStorage.removeItem('tennis_last_uid');
      sessionStorage.removeItem('memberName');
      App.memberName = null;
      this.loginMode = null;
      fbAuth.signOut();
    }
  }
};
