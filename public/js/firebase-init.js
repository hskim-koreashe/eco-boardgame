/* Firebase 초기화 (compat SDK, 일반 <script> 태그로 로드) */
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/** 익명 로그인. 이미 로그인돼 있으면 그 uid를 그대로 재사용한다. */
function ensureSignedIn() {
  return new Promise((resolve, reject) => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) return resolve(user);
      auth.signInAnonymously().then(cred => resolve(cred.user)).catch(reject);
    });
  });
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmt(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function makeRoomCode() {
  const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외
  let s = "";
  for (let i = 0; i < 5; i++) s += CH[Math.floor(Math.random() * CH.length)];
  return s;
}
