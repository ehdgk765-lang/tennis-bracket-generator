// auth.js - 관리자/멤버 로그인 + Firebase Auth 관리
const Auth = {
  initialized: false,
  loginMode: null, // 'admin' | 'member'

  // 멤버 ID → Firebase Auth 이메일 변환
  toMemberEmail(id) { return id + '@member.htl.app'; },
  // 멤버 숫자 비밀번호 → Firebase Auth 비밀번호 변환 (6자 최소 충족용)
  toMemberPw(pin) { return pin + '_HTL!'; },

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
            } else if (this._pendingMemberName) {
              const pendingName = this._pendingMemberName;
              this._pendingMemberName = null;
              const regPlayers = Storage.getPlayers();
              const found = regPlayers.find(p => p.name === pendingName);
              if (found) {
                App.memberName = pendingName;
                sessionStorage.setItem('memberName', pendingName);
                showApp();
              } else {
                // 등록되지 않은 이름 — 로그아웃 후 로그인 화면에서 에러 표시
                this._memberNameError = '등록된 멤버 이름이 아닙니다. 다시 확인해주세요.';
                fbAuth.signOut();
              }
            } else {
              // pendingName 없이 진입 (세션 만료 등) — 로그인 화면으로
              fbAuth.signOut();
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
      <!-- 도움말 버튼 (fixed: 스크롤해도 고정) -->
      <button id="auth-help-btn" class="fixed top-4 left-4 z-[60] w-10 h-10 flex items-center justify-center rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 hover:bg-white/50 transition-all" title="도움말" aria-label="도움말">
        <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </button>

      <!-- 도움말 모달 -->
      <div id="auth-help-modal" class="fixed inset-0 z-[60] flex items-center justify-center p-4" style="display:none">
        <div id="auth-help-backdrop" class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-white/90 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl max-w-sm w-full max-h-[80vh] flex flex-col border border-white/60 dark:border-slate-700/60">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
            <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">도움말</h3>
            <button id="auth-help-close" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div id="auth-help-content" class="px-5 py-4 overflow-y-auto text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-3" style="word-break:keep-all">
            <p><strong class="text-gray-700 dark:text-gray-200">Happy Tennis Life</strong>는 무료로 누구나 이용하실 수 있는 대진표 생성/공유 웹앱입니다.</p>
            <p>호스트로 계정을 생성하면 대진표 생성이 가능하고, 멤버 계정을 생성해서 다른 사람과 대진표를 공유할 수 있습니다.</p>
            <p>멤버는 호스트가 생성한 계정으로 로그인 후, 호스트가 등록한 멤버의 이름을 확인하여 로그인할 수 있습니다.</p>
            <p>멤버 등록, 팀 등록, 대진표 생성, PDF 내보내기 등 다양한 기능을 이용하실 수 있습니다.</p>
            <div class="bg-green-50 dark:bg-slate-700/50 rounded-xl p-3 space-y-1.5">
              <p class="font-semibold text-gray-700 dark:text-gray-200 text-xs">사용 예시</p>
              <ol class="list-decimal list-inside space-y-1 text-gray-500 dark:text-gray-400 text-xs">
                <li>호스트 계정 생성, 로그인 후 멤버를 등록하고 대진표를 생성합니다.</li>
                <li>우측 상단 버튼을 통해 멤버 계정을 생성하고 멤버들에게 계정을 공유해 주세요.</li>
                <li>멤버는 전달받은 계정으로 로그인 후, 본인 이름을 입력하여 접속합니다. 호스트가 생성해둔 대진표를 확인, 게임 후 스코어를 입력합니다.</li>
                <li>결과는 실시간으로 집계되고, 생성한 대진이 종료되면 결과도 표시됩니다.</li>
              </ol>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500">추가로 궁금하신 사항이나 건의사항은 화면 하단의 개발자에게 편하게 문의해 주세요.</p>
          </div>
        </div>
      </div>

      <!-- 테마 토글 (fixed: 스크롤해도 고정) -->
      <button id="auth-theme-toggle" class="fixed top-4 right-4 z-[60] w-10 h-10 flex items-center justify-center rounded-xl bg-white/30 backdrop-blur-sm border border-white/40 hover:bg-white/50 transition-all" title="테마 전환" aria-label="테마 전환">
        <svg class="auth-icon-sun w-5 h-5 text-gray-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
        </svg>
        <svg class="auth-icon-moon w-5 h-5 text-yellow-400" style="display:none" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
        </svg>
      </button>

      <div class="flex flex-col min-h-full py-10 auth-scroll-content">
      <div class="w-full max-w-sm mx-auto my-auto px-6">
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
          <button id="login-tab-admin" class="flex-1 py-2 rounded-full text-sm font-semibold transition bg-green-600 text-white">호스트 로그인</button>
          <button id="login-tab-member" class="flex-1 py-2 rounded-full text-sm font-semibold transition bg-gray-100 text-gray-600 hover:bg-gray-200">멤버 로그인</button>
        </div>

        <!-- 관리자 로그인 카드 -->
        <div id="admin-login-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-100">
          <div class="flex justify-end mb-2">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" id="remember-admin-email" class="w-3.5 h-3.5 rounded accent-green-600">
              <span class="text-xs text-gray-400">로그인 정보 기억하기</span>
            </label>
          </div>
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
              class="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md">
              로그인
            </button>
          </form>
          <p class="text-center text-sm text-gray-400 mt-4">
            <span id="auth-toggle-text">호스트 계정이 없으신가요?</span>
            <button type="button" id="auth-toggle-btn" class="text-green-600 font-bold hover:underline ml-1">회원가입</button>
          </p>
        </div>

        <!-- 멤버 로그인 카드 -->
        <div id="member-login-section" class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-gray-100" style="display:none">
          <div class="flex justify-end mb-2">
            <label class="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" id="remember-member-id" class="w-3.5 h-3.5 rounded accent-blue-600">
              <span class="text-xs text-gray-400">로그인 정보 기억하기</span>
            </label>
          </div>
          <form id="member-auth-form" class="space-y-4">
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">멤버 ID</label>
              <input type="text" autocomplete="off" id="member-login-id" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="호스트가 알려준 ID">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">비밀번호</label>
              <input type="password" autocomplete="off" id="member-login-pw" required inputmode="numeric" pattern="[0-9]*"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="숫자 비밀번호">
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">이름</label>
              <input type="text" autocomplete="off" id="member-login-name" required
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="호스트가 등록한 본인 이름">
            </div>
            <p id="member-auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="member-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl hover:from-blue-600 hover:to-indigo-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md">
              멤버 로그인
            </button>
          </form>
          <p class="text-center text-sm text-gray-400 mt-4">호스트에게 ID와 비밀번호를 문의하세요</p>
        </div>

        <!-- 인스타그램 링크 -->
        <div class="mt-8 pb-6 text-center">
          <span class="text-sm text-gray-400">Created by</span><br>
          <a href="https://www.instagram.com/happy_tennis_life" target="_blank" rel="noopener noreferrer"
             class="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-pink-500 dark:text-gray-500 dark:hover:text-pink-400 transition-colors">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            @happy_tennis_life
          </a>
        </div>
      </div>
      </div>`);

    // 도움말 모달
    const helpModal = container.querySelector('#auth-help-modal');
    container.querySelector('#auth-help-btn').onclick = () => helpModal.style.display = '';
    container.querySelector('#auth-help-close').onclick = () => helpModal.style.display = 'none';
    container.querySelector('#auth-help-backdrop').onclick = () => helpModal.style.display = 'none';

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

    // ── 기억하기: 저장된 값 복원 ──
    const rememberAdminCb = container.querySelector('#remember-admin-email');
    const rememberMemberCb = container.querySelector('#remember-member-id');
    const adminEmailInput = container.querySelector('#auth-email');
    const memberIdInput = container.querySelector('#member-login-id');

    const savedAdminEmail = localStorage.getItem('tennis_saved_admin_email');
    if (savedAdminEmail) {
      adminEmailInput.value = savedAdminEmail;
      const savedAdminPw = localStorage.getItem('tennis_saved_admin_pw');
      if (savedAdminPw) container.querySelector('#auth-password').value = Cipher.decode(savedAdminPw);
      rememberAdminCb.checked = true;
    }
    const memberNameInput = container.querySelector('#member-login-name');
    const memberErrorEl = container.querySelector('#member-auth-error');
    const savedMemberId = localStorage.getItem('tennis_saved_member_id');
    if (savedMemberId) {
      memberIdInput.value = savedMemberId;
      rememberMemberCb.checked = true;
      const savedMemberPw = localStorage.getItem('tennis_saved_member_pw');
      if (savedMemberPw) container.querySelector('#member-login-pw').value = Cipher.decode(savedMemberPw);
      const savedMemberName = localStorage.getItem('tennis_saved_member_name');
      if (savedMemberName) memberNameInput.value = savedMemberName;
      // 저장된 멤버 ID가 있으면 멤버 탭으로 자동 전환
      tabMember.click();
    }

    // 이름 오류로 돌아온 경우 에러 표시 + 입력값 복원
    if (this._memberNameError) {
      tabMember.click();
      memberErrorEl.textContent = this._memberNameError;
      memberErrorEl.classList.remove('hidden');
      this._memberNameError = null;
      if (this._pendingMemberLogin) {
        memberIdInput.value = this._pendingMemberLogin.id || '';
        container.querySelector('#member-login-pw').value = this._pendingMemberLogin.pw || '';
        memberNameInput.value = this._pendingMemberLogin.name || '';
        this._pendingMemberLogin = null;
      }
    }

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
        // 기억하기 처리
        if (rememberAdminCb.checked) {
          localStorage.setItem('tennis_saved_admin_email', email);
          localStorage.setItem('tennis_saved_admin_pw', Cipher.encode(password));
        } else {
          localStorage.removeItem('tennis_saved_admin_email');
          localStorage.removeItem('tennis_saved_admin_pw');
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

    memberForm.onsubmit = async (e) => {
      e.preventDefault();
      const loginId = container.querySelector('#member-login-id').value.trim();
      const pin = container.querySelector('#member-login-pw').value.trim();
      const memberName = container.querySelector('#member-login-name').value.trim();
      memberErrorEl.classList.add('hidden');
      memberSubmitBtn.disabled = true;
      memberSubmitBtn.textContent = '처리 중...';

      try {
        if (!loginId) throw { message: 'ID를 입력해주세요.' };
        if (!pin) throw { message: '비밀번호를 입력해주세요.' };
        if (!memberName) throw { message: '이름을 입력해주세요.' };
        this._pendingMemberName = memberName;
        this._pendingMemberLogin = { id: loginId, pw: pin, name: memberName };
        await this.handleMemberLogin(loginId, pin);
        // 기억하기 처리
        if (rememberMemberCb.checked) {
          localStorage.setItem('tennis_saved_member_id', loginId);
          localStorage.setItem('tennis_saved_member_pw', Cipher.encode(pin));
          localStorage.setItem('tennis_saved_member_name', memberName);
        } else {
          localStorage.removeItem('tennis_saved_member_id');
          localStorage.removeItem('tennis_saved_member_pw');
          localStorage.removeItem('tennis_saved_member_name');
        }
      } catch (err) {
        this._pendingMemberName = null;
        this._pendingMemberLogin = null;
        memberErrorEl.textContent = err.message || '로그인에 실패했습니다.';
        memberErrorEl.classList.remove('hidden');
        memberSubmitBtn.disabled = false;
        memberSubmitBtn.textContent = '멤버 로그인';
      }
    };
  },

  async handleMemberLogin(loginId, pin) {
    const email = this.toMemberEmail(loginId);
    const password = this.toMemberPw(pin);
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
    lockScroll();

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
      modal.remove(); unlockScroll();
      onComplete();
    };

    confirmBtn.onclick = doConfirm;
    nameInput.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
    };
    nameInput.oninput = () => errorEl.classList.add('hidden');

    closeBtn.onclick = () => {
      modal.remove(); unlockScroll();
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

  async logout() {
    if (this._logoutPending) return;
    this._logoutPending = true;
    if (await Modal.confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem(Storage.KEYS.TEAMS);
      localStorage.removeItem('tennis_last_uid');
      sessionStorage.removeItem('memberName');
      App.memberName = null;
      this.loginMode = null;
      fbAuth.signOut();
    }
    this._logoutPending = false;
  }
};
