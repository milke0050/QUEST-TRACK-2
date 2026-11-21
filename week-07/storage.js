// 로그인과 저장하는 코드는 모두 여기에만 둔다. (Firebase 로그인 + Firestore)
// 저장하는 것: users/{uid} = 번호(uid)와 별명 / games/{uid} = 내 판 상태. Google 이름·메일은 저장하지 않는다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

// 공개해도 되는 이름표(Firebase 웹 설정값)
const firebaseConfig = {
  apiKey: "AIzaSyCuo46thuFgET17lbJyDNLE7Q1M6-efwPY",
  authDomain: "economic-boardgame-49029.firebaseapp.com",
  projectId: "economic-boardgame-49029",
  storageBucket: "economic-boardgame-49029.firebasestorage.app",
  messagingSenderId: "431818359270",
  appId: "1:431818359270:web:a5f48ea7ee866fe08a5627",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

export const Store = {
  // 로그인 상태가 바뀔 때마다 user(또는 null)를 알려 준다. 필요한 건 uid 뿐이라 {uid} 만 넘긴다.
  onUser(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid } : null));
  },
  login() {
    return signInWithPopup(auth, new GoogleAuthProvider()); // 새 창(팝업)으로 로그인
  },
  logout() {
    return signOut(auth);
  },

  async loadProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { nickname: snap.data().nickname } : null;
  },
  saveProfile(uid, nickname) {
    return setDoc(doc(db, "users", uid), { uid, nickname, createdAt: serverTimestamp() });
  },

  async loadGame(uid) {
    const snap = await getDoc(doc(db, "games", uid));
    if (!snap.exists()) return null;
    const st = JSON.parse(snap.data().stateJson);
    return st && st.version === 1 ? st : null;
  },
  saveGame(uid, nickname, state) {
    return setDoc(doc(db, "games", uid), {
      uid, nickname, stateJson: JSON.stringify(state), updatedAt: serverTimestamp(),
    });
  },
  deleteGame(uid) {
    return deleteDoc(doc(db, "games", uid));
  },
};
