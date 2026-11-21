// 로그인과 저장하는 코드는 모두 여기에만 둔다. (Firebase 로그인 + Firestore)
// 저장하는 것
//   users/{uid}                  번호(uid)와 별명, 지금 들어가 있는 방 코드
//   rooms/{코드}                  방 정보 + 판 상태(stateJson). 방장만 고칠 수 있다.
//   rooms/{코드}/members/{uid}    방에 들어온 사람(별명, 고른 역할)
//   rooms/{코드}/actions/{id}     방장이 아닌 사람이 보낸 행동 (방장이 읽고 판에 적용한 뒤 지운다)
// Google 이름·메일은 저장하지 않는다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, orderBy, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

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

const roomRef = (code) => doc(db, "rooms", code);
const membersCol = (code) => collection(db, "rooms", code, "members");
const actionsCol = (code) => collection(db, "rooms", code, "actions");

// 헷갈리는 글자(0 O 1 I)를 뺀 방 코드 글자들
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

function fail(message) {
  const e = new Error(message);
  e.code = "app/message";
  return e;
}

export const Store = {
  // ---------- 로그인 ----------
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

  // ---------- 내 정보 ----------
  async loadProfile(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { nickname: snap.data().nickname, roomCode: snap.data().roomCode || null } : null;
  },
  saveProfile(uid, nickname) {
    return setDoc(doc(db, "users", uid), { uid, nickname, createdAt: serverTimestamp() });
  },
  setMyRoom(uid, code) {
    return updateDoc(doc(db, "users", uid), { roomCode: code || null });
  },

  // ---------- 방 ----------
  async createRoom(uid, nickname, name, role) {
    let code = newCode();
    for (let n = 0; n < 5 && (await getDoc(roomRef(code))).exists(); n++) code = newCode();
    await setDoc(roomRef(code), { code, hostUid: uid, hostName: nickname, name, status: "lobby", stateJson: null, updatedAt: serverTimestamp() });
    await setDoc(doc(membersCol(code), uid), { uid, nickname, role, joinedAt: serverTimestamp() });
    await this.setMyRoom(uid, code);
    return code;
  },
  async joinRoom(uid, nickname, rawCode, role) {
    const code = String(rawCode || "").trim().toUpperCase();
    if (code.length !== 6) throw fail("방 코드는 6글자예요.");
    const snap = await getDoc(roomRef(code));
    if (!snap.exists()) throw fail("그런 방이 없어요. 코드를 다시 확인해 주세요.");
    const mine = await getDoc(doc(membersCol(code), uid));
    if (!mine.exists()) {
      if (snap.data().status !== "lobby") throw fail("이미 시작한 방이에요.");
      await setDoc(doc(membersCol(code), uid), { uid, nickname, role, joinedAt: serverTimestamp() });
    }
    await this.setMyRoom(uid, code);
    return code;
  },
  setMyRole(code, uid, nickname, role) {
    return setDoc(doc(membersCol(code), uid), { uid, nickname, role, joinedAt: serverTimestamp() });
  },
  leaveMember(code, uid) {
    return deleteDoc(doc(membersCol(code), uid));
  },
  // 방장만: 방과 그 안의 기록을 모두 지운다.
  async deleteRoom(code) {
    for (const col of [membersCol(code), actionsCol(code)]) {
      const snap = await getDocs(col);
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await deleteDoc(roomRef(code));
  },

  // 방 정보가 바뀔 때마다 cb(데이터 또는 null). 반환값을 부르면 구독이 멈춘다.
  watchRoom(code, cb, onErr) {
    return onSnapshot(roomRef(code), (s) => cb(s.exists() ? s.data() : null), onErr);
  },
  watchMembers(code, cb, onErr) {
    return onSnapshot(membersCol(code), (s) => cb(s.docs.map((d) => d.data())), onErr);
  },

  // ---------- 판 (방장이 쓴다) ----------
  saveRoomState(code, state) {
    return updateDoc(roomRef(code), {
      stateJson: JSON.stringify(state), status: state.over ? "over" : "playing", updatedAt: serverTimestamp(),
    });
  },

  // ---------- 행동 (방장이 아닌 사람이 보내고, 방장이 읽는다) ----------
  sendAction(code, uid, action) {
    const data = { uid, createdAt: serverTimestamp() };
    for (const k of ["type", "i", "product", "price", "c", "turn", "phase"]) if (action[k] !== undefined) data[k] = action[k];
    return addDoc(actionsCol(code), data);
  },
  watchActions(code, cb, onErr) {
    return onSnapshot(query(actionsCol(code), orderBy("createdAt")), (s) => {
      cb(s.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, onErr);
  },
  deleteActions(code, ids) {
    return Promise.all(ids.map((id) => deleteDoc(doc(actionsCol(code), id))));
  },
};
