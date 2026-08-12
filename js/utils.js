// utils.js - 공통 유틸리티

// ── 게임 타입 상수 ──
const GAME_TYPES = {
  MS: { label: '남자단식', icon: '🏃‍♂️', gender: 'M', doubles: false },
  WS: { label: '여자단식', icon: '🏃‍♀️', gender: 'F', doubles: false },
  MD: { label: '남자복식', icon: '👬', gender: 'M', doubles: true },
  WD: { label: '여자복식', icon: '👭', gender: 'F', doubles: true },
  XD: { label: '혼합복식', icon: '👫', gender: 'mixed', doubles: true },
};

const SCHEDULE_GAME_TYPES = {
  XD: { label: '혼합복식', icon: '👫', badgeClass: 'bg-purple-100 text-purple-700', needM: 2, needF: 2, singles: false },
  MD: { label: '남자복식', icon: '👬', badgeClass: 'bg-blue-100 text-blue-700', needM: 4, needF: 0, singles: false },
  WD: { label: '여자복식', icon: '👭', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 4, singles: false },
  FD: { label: '섞어복식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 4, singles: false },
  MS: { label: '남자단식', icon: '🏃‍♂️', badgeClass: 'bg-blue-100 text-blue-700', needM: 2, needF: 0, singles: true },
  WS: { label: '여자단식', icon: '🏃‍♀️', badgeClass: 'bg-pink-100 text-pink-700', needM: 0, needF: 2, singles: true },
  FS: { label: '섞어단식', icon: '🔀', badgeClass: 'bg-orange-100 text-orange-700', needM: 0, needF: 0, needAny: 2, singles: true },
};

// ── 한국어 초성 검색 ──
const _CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChoseong(str) {
  return [...str].map(ch => {
    const c = ch.charCodeAt(0);
    return (c >= 0xAC00 && c <= 0xD7A3) ? _CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }).join('');
}
function matchesKoreanSearch(name, query) {
  if (!query) return true;
  if (name.toLowerCase().includes(query.toLowerCase())) return true;
  return getChoseong(name).includes(query);
}

// ── 팀 맵 빌더 ──
function buildTeamMap() {
  const map = {};
  Storage.getTeams().forEach(t => (t.members || []).forEach(n => { map[n] = t.name; }));
  return map;
}

// ── 모달 배경 스크롤 잠금 ──
let _scrollLockCount = 0;
let _savedScrollY = 0;

function lockScroll() {
  if (_scrollLockCount === 0) {
    _savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${_savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.overflow = 'hidden';
  }
  _scrollLockCount++;
}

function unlockScroll() {
  _scrollLockCount--;
  if (_scrollLockCount <= 0) {
    _scrollLockCount = 0;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.overflow = '';
    window.scrollTo(0, _savedScrollY);
  }
}

// ── 모바일 가상 키보드 대응: visual viewport 높이 추적 ──
(function() {
  if (!window.visualViewport) return;

  function setVVH() {
    var vvh = window.visualViewport.height;
    document.documentElement.style.setProperty('--vvh', vvh + 'px');

    // 로그인 화면: 키보드가 input을 가리면 콘텐츠를 위로 밀어올림 (transform)
    var wrapper = document.querySelector('#auth-container .auth-scroll-content');
    if (!wrapper) return;

    var el = document.activeElement;
    if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') || !wrapper.contains(el)) {
      wrapper.style.transform = '';
      wrapper.dataset.shift = '0';
      return;
    }

    requestAnimationFrame(function() {
      var currentShift = parseFloat(wrapper.dataset.shift) || 0;
      // 로그인 버튼까지 보이도록 form 하단 기준으로 계산
      var form = el.closest('form');
      var bottom = form ? form.getBoundingClientRect().bottom : el.getBoundingClientRect().bottom;
      var originalBottom = bottom + currentShift;
      var gap = originalBottom + 20 - vvh;
      var newShift = Math.max(0, gap);
      wrapper.dataset.shift = String(newShift);
      wrapper.style.transform = newShift > 0 ? ('translateY(-' + newShift + 'px)') : '';
    });
  }

  // input 포커스 해제 시 원위치
  document.addEventListener('focusout', function() {
    setTimeout(function() {
      var wrapper = document.querySelector('#auth-container .auth-scroll-content');
      if (!wrapper) return;
      var ae = document.activeElement;
      if (!ae || (ae.tagName !== 'INPUT' && ae.tagName !== 'TEXTAREA') || !wrapper.contains(ae)) {
        wrapper.style.transform = '';
        wrapper.dataset.shift = '0';
      }
    }, 100);
  });

  window.visualViewport.addEventListener('resize', setVVH);
  setVVH();
})();

// ── localStorage 비밀번호 난독화 ──
const Cipher = {
  _key: 'hTL_t3nN!s',
  encode(str) {
    if (!str) return '';
    const k = this._key;
    const encoded = [...str].map((ch, i) =>
      String.fromCharCode(ch.charCodeAt(0) ^ k.charCodeAt(i % k.length))
    ).join('');
    return btoa(unescape(encodeURIComponent(encoded)));
  },
  decode(str) {
    if (!str) return '';
    try {
      const decoded = decodeURIComponent(escape(atob(str)));
      const k = this._key;
      return [...decoded].map((ch, i) =>
        String.fromCharCode(ch.charCodeAt(0) ^ k.charCodeAt(i % k.length))
      ).join('');
    } catch (e) { return ''; }
  }
};

// ── 커스텀 모달 (alert / confirm) ──
const Modal = {
  alert(message, title) {
    return new Promise(resolve => {
      const overlay = this._createOverlay(() => resolve());
      const box = document.createElement('div');
      box.className = 'custom-modal-box';
      box.innerHTML = `
        <div class="w-11 h-11 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3 flex-shrink-0">
          <svg class="w-5 h-5 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h3 class="modal-title">${this._escape(title || '알림')}</h3>
        <p class="modal-message">${this._escape(message)}</p>
        <div class="flex gap-2.5 mt-5">
          <button class="modal-btn modal-btn-primary flex-1" data-action="ok">확인</button>
        </div>`;
      const okBtn = box.querySelector('[data-action="ok"]');
      okBtn.onclick = () => { this._close(overlay); resolve(); };
      const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); document.removeEventListener('keydown', onKey); okBtn.click(); } };
      document.addEventListener('keydown', onKey);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      lockScroll();
      requestAnimationFrame(() => { requestAnimationFrame(() => { overlay.classList.add('modal-active'); }); });
    });
  },

  confirm(message, title) {
    return new Promise(resolve => {
      let onKey;
      const cleanup = () => document.removeEventListener('keydown', onKey);
      const overlay = this._createOverlay(() => { cleanup(); resolve(false); });
      const box = document.createElement('div');
      box.className = 'custom-modal-box';
      box.innerHTML = `
        <div class="w-11 h-11 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3 flex-shrink-0">
          <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/>
          </svg>
        </div>
        <h3 class="modal-title">${this._escape(title || '확인')}</h3>
        <p class="modal-message">${this._escape(message)}</p>
        <div class="flex gap-2.5 mt-5">
          <button class="modal-btn modal-btn-cancel flex-1" data-action="cancel">취소</button>
          <button class="modal-btn modal-btn-primary flex-1" data-action="ok">확인</button>
        </div>`;
      box.querySelector('[data-action="cancel"]').onclick = () => { cleanup(); this._close(overlay); resolve(false); };
      const okBtn = box.querySelector('[data-action="ok"]');
      okBtn.onclick = () => { cleanup(); this._close(overlay); resolve(true); };
      onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); } };
      document.addEventListener('keydown', onKey);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      lockScroll();
      requestAnimationFrame(() => { requestAnimationFrame(() => { overlay.classList.add('modal-active'); }); });
    });
  },

  // 비차단 토스트 알림 (type: 'error' | 'success' | undefined=정보)
  toast(message, type) {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-wrap';
      wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 76px);z-index:9999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;padding:0 12px;';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    const bg = type === 'error' ? '#dc2626' : (type === 'success' ? '#16a34a' : '#374151');
    el.style.cssText = 'max-width:92vw;background:' + bg + ';color:#fff;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:500;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.22);opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:auto;text-align:center;white-space:pre-line;';
    el.textContent = message;
    wrap.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    const dur = type === 'error' ? 4200 : 2200;
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 250);
    }, dur);
  },

  _createOverlay(onDismiss) {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && onDismiss) {
        this._close(overlay);
        onDismiss();
      }
    });
    return overlay;
  },

  _close(overlay) {
    overlay.classList.remove('modal-active');
    overlay.classList.add('modal-closing');
    setTimeout(() => { overlay.remove(); unlockScroll(); }, 200);
  },

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// ── 성별 뱃지 HTML ──
function genderBadge(gender, style) {
  if (style === 'text') {
    if (gender === 'M') return '<span class="text-xs text-blue-600">남</span>';
    if (gender === 'F') return '<span class="text-xs text-pink-600">여</span>';
    return '';
  }
  if (gender === 'M') return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">남</span>';
  if (gender === 'F') return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-pink-100 text-pink-700">여</span>';
  return '<span class="text-xs px-1.5 py-0.5 rounded font-medium bg-gray-100 text-gray-500">-</span>';
}
