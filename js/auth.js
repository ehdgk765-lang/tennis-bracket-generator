// auth.js - 로그인/회원가입 UI + Firebase Auth 관리
const Auth = {
  initialized: false,

  init() {
    fbAuth.onAuthStateChanged(async (user) => {
      const authEl = document.getElementById('auth-container');
      const appEl = document.getElementById('app-container');

      if (user) {
        // 다른 계정으로 전환된 경우 이전 데이터 정리
        const lastUid = localStorage.getItem('tennis_last_uid');
        if (lastUid && lastUid !== user.uid) {
          localStorage.removeItem(Storage.KEYS.PLAYERS);
          localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
          localStorage.removeItem(Storage.KEYS.TEAMS);
        }
        localStorage.setItem('tennis_last_uid', user.uid);

        // Firestore → localStorage 동기화 (실패해도 앱은 표시)
        try {
          await Storage.loadFromFirestore();
        } catch (e) {
          console.error('Firestore 로드 실패 (오프라인 모드):', e);
        }
        // 실시간 동기화 시작
        Storage.startRealtimeSync();

        authEl.style.display = 'none';

        // 관리자 인증 모달 표시 후 앱 진입
        this.showAdminAuthModal(() => {
          appEl.style.display = '';
          if (!this.initialized) {
            App.init();
            this.initialized = true;
          } else {
            App.navigate(App.currentTab);
          }
        });
      } else {
        // 실시간 동기화 중지
        Storage.stopRealtimeSync();
        // 로그인 페이지 표시 (localStorage는 건드리지 않음 - logout에서 정리)
        authEl.style.display = '';
        appEl.style.display = 'none';
        this.initialized = false;
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

        <!-- 로그인 카드 -->
        <div class="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl shadow-green-100/50 p-6 border border-white/60">
          <form id="auth-form" class="space-y-4">
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
            <div id="auth-admin-pw-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">관리자 비밀번호</label>
              <input type="password" autocomplete="off" id="auth-admin-pw"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="관리자 비밀번호 입력">
            </div>
            <div id="auth-admin-pw-confirm-wrap" style="display:none">
              <label class="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">관리자 비밀번호 확인</label>
              <input type="password" autocomplete="off" id="auth-admin-pw-confirm"
                class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition"
                placeholder="관리자 비밀번호를 다시 입력">
            </div>
            <p id="auth-error" class="text-sm text-red-500 hidden"></p>
            <button type="submit" id="auth-submit-btn"
              class="w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-bold text-lg shadow-md shadow-green-200">
              로그인
            </button>
          </form>
        </div>

        <p class="text-center text-sm text-gray-400 mt-5">
          <span id="auth-toggle-text">계정이 없으신가요?</span>
          <button type="button" id="auth-toggle-btn" class="text-green-600 font-bold hover:underline ml-1">회원가입</button>
        </p>
      </div>`);

    // 로그인 페이지 테마 토글
    const authThemeToggle = container.querySelector('#auth-theme-toggle');
    const authIconSun = container.querySelector('.auth-icon-sun');
    const authIconMoon = container.querySelector('.auth-icon-moon');

    const updateAuthThemeIcons = (isDark) => {
      authIconSun.style.display = isDark ? 'none' : 'block';
      authIconMoon.style.display = isDark ? 'block' : 'none';
    };
    updateAuthThemeIcons(document.documentElement.classList.contains('dark'));

    authThemeToggle.onclick = () => {
      // 기기 다크모드 시 라이트 전환 방지 (삼성 인터넷 어둡게 보기 배경색 통일)
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) return;
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateAuthThemeIcons(isDark);
      // 앱 헤더 아이콘도 동기화
      const iconSun = document.getElementById('icon-sun');
      const iconMoon = document.getElementById('icon-moon');
      const metaColor = document.getElementById('meta-theme-color');
      if (iconSun) iconSun.style.display = isDark ? 'none' : 'block';
      if (iconMoon) iconMoon.style.display = isDark ? 'block' : 'none';
      if (metaColor) metaColor.content = isDark ? '#1e293b' : '#ffffff';
    };

    let isRegister = false;
    const form = container.querySelector('#auth-form');
    const confirmWrap = container.querySelector('#auth-confirm-wrap');
    const adminPwWrap = container.querySelector('#auth-admin-pw-wrap');
    const adminPwConfirmWrap = container.querySelector('#auth-admin-pw-confirm-wrap');
    const submitBtn = container.querySelector('#auth-submit-btn');
    const toggleText = container.querySelector('#auth-toggle-text');
    const toggleBtn = container.querySelector('#auth-toggle-btn');
    const errorEl = container.querySelector('#auth-error');

    toggleBtn.onclick = () => {
      isRegister = !isRegister;
      confirmWrap.style.display = isRegister ? '' : 'none';
      adminPwWrap.style.display = isRegister ? '' : 'none';
      adminPwConfirmWrap.style.display = isRegister ? '' : 'none';
      submitBtn.textContent = isRegister ? '회원가입' : '로그인';
      toggleText.textContent = isRegister ? '이미 계정이 있으신가요?' : '계정이 없으신가요?';
      toggleBtn.textContent = isRegister ? '로그인' : '회원가입';
      errorEl.classList.add('hidden');
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const email = container.querySelector('#auth-email').value.trim();
      const password = container.querySelector('#auth-password').value;
      errorEl.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = '처리 중...';

      try {
        if (isRegister) {
          const confirm = container.querySelector('#auth-password-confirm').value;
          if (password !== confirm) {
            throw { message: '비밀번호가 일치하지 않습니다.' };
          }
          const adminPw = container.querySelector('#auth-admin-pw').value.trim();
          const adminPwConfirm = container.querySelector('#auth-admin-pw-confirm').value.trim();

          // 관리자 비밀번호 필수 검증
          if (!adminPw) {
            throw { message: '관리자 비밀번호를 입력해주세요.' };
          }
          if (adminPw !== adminPwConfirm) {
            throw { message: '관리자 비밀번호가 일치하지 않습니다.' };
          }

          // Firestore 관리자 비밀번호 확인 (read는 비인증 허용)
          const adminDoc = await fbDb.collection('config').doc('adminPassword').get();
          const isFirstUser = !adminDoc.exists;

          if (!isFirstUser && adminPw !== adminDoc.data().password) {
            throw { message: '관리자 비밀번호가 올바르지 않습니다.' };
          }

          // 계정 생성 (이후 인증 상태가 됨)
          await fbAuth.createUserWithEmailAndPassword(email, password);

          // 첫 가입자: 인증된 상태에서 관리자 비밀번호 저장
          if (isFirstUser) {
            await fbDb.collection('config').doc('adminPassword').set({ password: adminPw });
          }
        } else {
          await fbAuth.signInWithEmailAndPassword(email, password);
        }
      } catch (err) {
        errorEl.textContent = this.getErrorMessage(err);
        errorEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = isRegister ? '회원가입' : '로그인';
      }
    };
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
    badge.classList.remove('hidden', 'bg-green-100', 'text-green-700', 'bg-gray-100', 'text-gray-500');
    if (App.isAdmin) {
      badge.textContent = '관리자님';
      badge.classList.add('bg-green-100', 'text-green-700');
    } else {
      badge.textContent = '게스트님';
      badge.classList.add('bg-gray-100', 'text-gray-500');
    }
  },

  async showAdminAuthModal(onComplete) {
    const existing = document.getElementById('admin-auth-modal');
    if (existing) existing.remove();

    // Firestore에서 관리자 비밀번호 존재 여부를 먼저 확인
    let adminPwExists = true;
    try {
      const adminDoc = await fbDb.collection('config').doc('adminPassword').get();
      adminPwExists = adminDoc.exists;
    } catch (e) {
      console.error('관리자 비밀번호 확인 실패:', e);
    }

    const isSetupMode = !adminPwExists;
    const title = isSetupMode ? '관리자 비밀번호 설정' : '관리자 인증';
    const desc = isSetupMode
      ? '관리자 비밀번호가 아직 설정되지 않았습니다.<br>새 관리자 비밀번호를 설정해주세요.'
      : '관리자 비밀번호를 입력하거나<br>게스트로 입장하세요';
    const pwPlaceholder = isSetupMode ? '새 관리자 비밀번호' : '관리자 비밀번호';
    const submitText = isSetupMode ? '비밀번호 설정' : '관리자 인증';

    const modal = document.createElement('div');
    modal.id = 'admin-auth-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';

    modal.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <div class="text-center mb-5">
          <div class="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-gray-800">${title}</h3>
          <p class="text-sm text-gray-500 mt-1">${desc}</p>
        </div>
        <div class="space-y-3 mb-5">
          <input type="password" id="admin-modal-pw" autocomplete="off"
            class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition text-center text-lg"
            placeholder="${pwPlaceholder}">
          ${isSetupMode ? '<input type="password" id="admin-modal-pw-confirm" autocomplete="off" class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 focus:bg-white transition text-center text-lg" placeholder="비밀번호 확인">' : ''}
          <p id="admin-modal-error" class="text-sm text-red-500 text-center hidden"></p>
        </div>
        <div class="space-y-2">
          <button id="admin-modal-submit"
            class="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 active:scale-[0.98] transition-all font-bold shadow-md shadow-green-200">
            ${submitText}
          </button>
          <button id="admin-modal-guest"
            class="w-full py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition font-medium"
            ${isSetupMode ? 'style="display:none"' : ''}>
            게스트로 입장
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const pwInput = modal.querySelector('#admin-modal-pw');
    const errorEl = modal.querySelector('#admin-modal-error');
    pwInput.focus();

    modal.querySelector('#admin-modal-submit').onclick = async () => {
      const pw = pwInput.value.trim();
      if (!pw) {
        errorEl.textContent = '비밀번호를 입력해주세요.';
        errorEl.classList.remove('hidden');
        return;
      }
      try {
        if (isSetupMode) {
          // 설정 모드: 새 비밀번호 저장
          const confirmInput = modal.querySelector('#admin-modal-pw-confirm');
          const pwConfirm = confirmInput ? confirmInput.value.trim() : '';
          if (pw !== pwConfirm) {
            errorEl.textContent = '비밀번호가 일치하지 않습니다.';
            errorEl.classList.remove('hidden');
            return;
          }
          await fbDb.collection('config').doc('adminPassword').set({ password: pw });
          App.isAdmin = true;
          this.updateRoleBadge();
          modal.remove();
          onComplete();
        } else {
          // 인증 모드: 기존 비밀번호 확인
          const doc = await fbDb.collection('config').doc('adminPassword').get();
          if (doc.exists && doc.data().password === pw) {
            App.isAdmin = true;
            this.updateRoleBadge();
            modal.remove();
            onComplete();
          } else {
            errorEl.textContent = '관리자 비밀번호가 올바르지 않습니다.';
            errorEl.classList.remove('hidden');
            pwInput.value = '';
            pwInput.focus();
          }
        }
      } catch (e) {
        errorEl.textContent = '인증 중 오류가 발생했습니다.';
        errorEl.classList.remove('hidden');
      }
    };

    // Enter키로 인증
    pwInput.onkeydown = (e) => {
      if (e.key === 'Enter') modal.querySelector('#admin-modal-submit').click();
    };
    const confirmInput = modal.querySelector('#admin-modal-pw-confirm');
    if (confirmInput) {
      confirmInput.onkeydown = (e) => {
        if (e.key === 'Enter') modal.querySelector('#admin-modal-submit').click();
      };
    }

    modal.querySelector('#admin-modal-guest').onclick = () => {
      App.isAdmin = false;
      this.updateRoleBadge();
      modal.remove();
      onComplete();
    };
  },

  showResetAdminPwModal() {
    const existing = document.getElementById('reset-admin-pw-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'reset-admin-pw-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';

    modal.innerHTML = `
      <div class="bg-white/95 backdrop-blur-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto">
        <div class="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden"></div>
        <div class="text-center mb-5">
          <div class="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg class="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
          </div>
          <h3 class="text-lg font-bold text-gray-800">관리자 비밀번호 재설정</h3>
          <p class="text-sm text-gray-500 mt-1">현재 비밀번호 확인 후<br>새 비밀번호를 설정합니다</p>
        </div>
        <div class="space-y-3 mb-5">
          <input type="password" id="reset-current-pw" autocomplete="off"
            class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition text-center text-lg"
            placeholder="현재 관리자 비밀번호">
          <input type="password" id="reset-new-pw" autocomplete="off"
            class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition text-center text-lg"
            placeholder="새 관리자 비밀번호">
          <input type="password" id="reset-new-pw-confirm" autocomplete="off"
            class="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 focus:bg-white transition text-center text-lg"
            placeholder="새 비밀번호 확인">
          <p id="reset-pw-error" class="text-sm text-red-500 text-center hidden"></p>
        </div>
        <div class="space-y-2">
          <button id="reset-pw-submit"
            class="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 active:scale-[0.98] transition-all font-bold shadow-md shadow-amber-200">
            비밀번호 변경
          </button>
          <button id="reset-pw-cancel"
            class="w-full py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition font-medium">
            취소
          </button>
        </div>
      </div>`;

    document.body.appendChild(modal);

    const currentPwInput = modal.querySelector('#reset-current-pw');
    const newPwInput = modal.querySelector('#reset-new-pw');
    const newPwConfirmInput = modal.querySelector('#reset-new-pw-confirm');
    const errorEl = modal.querySelector('#reset-pw-error');
    currentPwInput.focus();

    modal.querySelector('#reset-pw-submit').onclick = async () => {
      const currentPw = currentPwInput.value.trim();
      const newPw = newPwInput.value.trim();
      const newPwConfirm = newPwConfirmInput.value.trim();
      errorEl.classList.add('hidden');

      if (!currentPw) { errorEl.textContent = '현재 비밀번호를 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
      if (!newPw) { errorEl.textContent = '새 비밀번호를 입력해주세요.'; errorEl.classList.remove('hidden'); return; }
      if (newPw !== newPwConfirm) { errorEl.textContent = '새 비밀번호가 일치하지 않습니다.'; errorEl.classList.remove('hidden'); return; }

      try {
        const doc = await fbDb.collection('config').doc('adminPassword').get();
        if (!doc.exists || doc.data().password !== currentPw) {
          errorEl.textContent = '현재 비밀번호가 올바르지 않습니다.';
          errorEl.classList.remove('hidden');
          currentPwInput.value = '';
          currentPwInput.focus();
          return;
        }
        await fbDb.collection('config').doc('adminPassword').set({ password: newPw });
        modal.remove();
        alert('관리자 비밀번호가 변경되었습니다.');
      } catch (e) {
        errorEl.textContent = '변경 중 오류가 발생했습니다.';
        errorEl.classList.remove('hidden');
      }
    };

    // Enter키로 다음 필드 이동 또는 제출
    currentPwInput.onkeydown = (e) => { if (e.key === 'Enter') newPwInput.focus(); };
    newPwInput.onkeydown = (e) => { if (e.key === 'Enter') newPwConfirmInput.focus(); };
    newPwConfirmInput.onkeydown = (e) => { if (e.key === 'Enter') modal.querySelector('#reset-pw-submit').click(); };

    modal.querySelector('#reset-pw-cancel').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  },

  logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem(Storage.KEYS.TEAMS);
      localStorage.removeItem('tennis_last_uid');
      fbAuth.signOut();
    }
  }
};
