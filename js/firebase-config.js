// firebase-config.js - Firebase 초기화
const firebaseConfig = {
  apiKey: "AIzaSyAddLnhSCdiUcyVqY8S0GHxrBqmBfp-CcY",
  authDomain: "happy-tennis-life.firebaseapp.com",
  projectId: "happy-tennis-life",
  storageBucket: "happy-tennis-life.firebasestorage.app",
  messagingSenderId: "914688098524",
  appId: "1:914688098524:web:2a25c832fe0ec196cf3419",
  measurementId: "G-BT1WSEC6Q0"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDb = firebase.firestore();

// 오프라인 퍼시스턴스 활성화 (IndexedDB 캐시)
// .set() 쓰기가 즉시 로컬 캐시에 반영되어 새로고침 시 데이터 유실 방지
fbDb.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence: 다른 탭에서 이미 활성화됨');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence: 브라우저 미지원');
    }
  });
