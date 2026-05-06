// utils.js - 공통 유틸리티
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
