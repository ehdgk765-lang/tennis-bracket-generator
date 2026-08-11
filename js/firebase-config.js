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

// 오프라인 캐싱은 앱 자체 localStorage + onSnapshot 실시간 동기화로 처리
// Firestore persistence(IndexedDB)는 이중 캐싱으로 모바일 성능 저하 원인이 되어 비활성화
