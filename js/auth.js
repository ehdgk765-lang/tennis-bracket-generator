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
        appEl.style.display = '';
        if (!this.initialized) {
          App.init();
          this.initialized = true;
        } else {
          App.navigate(App.currentTab);
        }
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
    container.innerHTML = `
      <div class="w-full max-w-sm mx-auto px-6">
        <div class="text-center mb-8">
          <div class="text-5xl mb-3">🎾</div>
          <h1 class="text-2xl font-bold text-gray-800">Happy Tennis Life</h1>
          <p class="text-sm text-gray-500 mt-1">로그인하여 시작하세요</p>
        </div>
        <form id="auth-form" class="space-y-4">
          <div>
            <input type="email" id="auth-email" required
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="이메일">
          </div>
          <div>
            <input type="password" id="auth-password" required minlength="6"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="비밀번호 (6자 이상)">
          </div>
          <div id="auth-confirm-wrap" style="display:none">
            <input type="password" id="auth-password-confirm" minlength="6"
              class="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500"
              placeholder="비밀번호 확인">
          </div>
          <p id="auth-error" class="text-sm text-red-500 hidden"></p>
          <button type="submit" id="auth-submit-btn"
            class="w-full py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 transition font-semibold text-lg">
            로그인
          </button>
        </form>
        <p class="text-center text-sm text-gray-500 mt-4">
          <span id="auth-toggle-text">계정이 없으신가요?</span>
          <button type="button" id="auth-toggle-btn" class="text-green-600 font-semibold hover:underline ml-1">회원가입</button>
        </p>
      </div>`;

    let isRegister = false;
    const form = container.querySelector('#auth-form');
    const confirmWrap = container.querySelector('#auth-confirm-wrap');
    const submitBtn = container.querySelector('#auth-submit-btn');
    const toggleText = container.querySelector('#auth-toggle-text');
    const toggleBtn = container.querySelector('#auth-toggle-btn');
    const errorEl = container.querySelector('#auth-error');

    toggleBtn.onclick = () => {
      isRegister = !isRegister;
      confirmWrap.style.display = isRegister ? '' : 'none';
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
          await fbAuth.createUserWithEmailAndPassword(email, password);
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

  logout() {
    if (confirm('로그아웃 하시겠습니까?')) {
      localStorage.removeItem(Storage.KEYS.PLAYERS);
      localStorage.removeItem(Storage.KEYS.TOURNAMENTS);
      localStorage.removeItem('tennis_last_uid');
      fbAuth.signOut();
    }
  }
};
