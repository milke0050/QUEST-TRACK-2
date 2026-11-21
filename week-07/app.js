// 화면 코드. 규칙은 game.js, 숫자는 data.js, 로그인·저장은 storage.js 에 있다.
// 여러 명이 함께 하는 방법: 방장의 브라우저가 판을 진행하고 방(Firestore)에 적는다.
// 다른 사람은 방을 실시간으로 보고, 자기 행동을 '행동 쪽지'로 보낸다. 방장이 확인해서 판에 적용한다.
import { Store } from "./storage.js?v=9";

let auth = { status: "loading", uid: null, nickname: "" }; // loading | out | needNick | in | error
let roomCode = null; // 지금 들어가 있는 방 코드
let room = null; // 방 정보 (rooms/{코드})
let members = []; // 방에 들어온 사람들 (시작 전에 쓴다)
let state = null; // 판 상태 (시작 뒤)
let unsubs = [];
let actionsWatching = false;
let hostBusy = Promise.resolve();
let flash = "";

const app = document.getElementById("app");
const loginSlot = document.getElementById("login-slot");
const errorBox = document.getElementById("error");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const me = () => (state ? state.seats.find((s) => s.uid === auth.uid && !s.bot) : undefined);
const isHost = () => !!room && room.hostUid === auth.uid;
const prod = (p) => (p ? `${PRODUCTS[p].icon} ${PRODUCTS[p].name}` : "쉬는 공장");
const tierText = (t) => `${PRICES[t].label} ${PRICES[t].price}`;
const buyCost = (c) => Math.ceil(c.stock * (1 + TRADE_FEE));
const sellGain = (c) => Math.floor(c.stock * (1 - TRADE_FEE));
const sign = (n) => (n > 0 ? "+" + n : String(n));

// ---------- 오류 보여 주기 ----------
function errText(e) {
  const code = (e && e.code) || "";
  const map = {
    "auth/popup-closed-by-user": "로그인 창이 닫혔어요. 다시 눌러 보세요.",
    "auth/cancelled-popup-request": "로그인 창이 이미 열려 있어요.",
    "auth/popup-blocked": "브라우저가 로그인 창을 막았어요. 팝업을 허용해 주세요.",
    "auth/unauthorized-domain": "이 주소가 Firebase 의 '승인된 도메인'에 없어요. 콘솔에서 추가해 주세요.",
    "auth/operation-not-allowed": "Firebase 콘솔에서 Google 로그인이 켜져 있지 않아요.",
    "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
    "permission-denied": "권한이 없어요. 보안 규칙을 콘솔에 붙여 넣었는지, 시작한 방은 아닌지 확인해 주세요.",
    "unavailable": "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.",
    "app/message": (e && e.message) || "",
  };
  return map[code] || `${code || "알 수 없는 오류"} ${(e && e.message) || ""}`.trim();
}
function showError(prefix, e) {
  console.error(prefix, e);
  errorBox.textContent = `⚠️ ${prefix}: ${errText(e)}`;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ""; }

// ---------- 로그인 ----------
async function afterLogin(uid) {
  auth = { status: "loading", uid, nickname: "" };
  render();
  try {
    const prof = await Store.loadProfile(uid);
    if (!prof) { auth.status = "needNick"; render(); return; }
    auth.nickname = prof.nickname;
    auth.status = "in";
    clearError();
    if (prof.roomCode) enterRoom(prof.roomCode); // 하던 방이 있으면 이어서
  } catch (e) {
    auth.status = "error";
    showError("불러오기에 실패했어요", e);
  }
  render();
}

Store.onUser((u) => {
  if (u) afterLogin(u.uid);
  else { stopWatching(); auth = { status: "out", uid: null, nickname: "" }; resetRoomVars(); render(); }
});

// ---------- 방 들어가기 / 나가기 ----------
function stopWatching() { unsubs.forEach((f) => f()); unsubs = []; actionsWatching = false; }
function resetRoomVars() { roomCode = null; room = null; members = []; state = null; }

function enterRoom(code) {
  stopWatching();
  resetRoomVars();
  roomCode = code;
  unsubs.push(Store.watchRoom(code, onRoom, (e) => showError("방을 불러오지 못했어요", e)));
  unsubs.push(Store.watchMembers(code, (list) => { members = list; render(); }, (e) => showError("사람 목록을 불러오지 못했어요", e)));
}

function leaveLocal(msg) {
  stopWatching();
  resetRoomVars();
  flash = msg || "";
  if (auth.uid) Store.setMyRoom(auth.uid, null).catch(() => {});
  render();
}

function onRoom(data) {
  if (!data) { leaveLocal("방이 없어졌어요."); return; }
  room = data;
  // 방장은 자기 컴퓨터의 판이 가장 최신이라, 처음 불러올 때만 방의 판을 받는다.
  if (data.stateJson && !(isHost() && state)) {
    try { state = JSON.parse(data.stateJson); } catch (e) { showError("판을 읽지 못했어요", e); }
  }
  if (!data.stateJson) state = null;
  if (isHost() && data.status === "playing" && !actionsWatching) startActionWatch();
  render();
}

// ---------- 방장: 행동 쪽지를 읽어 판에 적용 ----------
function startActionWatch() {
  actionsWatching = true;
  unsubs.push(Store.watchActions(roomCode, (list) => hostProcess(list), (e) => showError("행동을 받지 못했어요", e)));
}

function hostProcess(list) {
  hostBusy = hostBusy.then(async () => {
    if (!isHost() || !state) return;
    const doneIds = [];
    let changed = false;
    for (const a of list) {
      if (!a.local) doneIds.push(a.id);
      if (state.applied.includes(a.id)) continue;
      try { applyAction(state, a.uid, a); } catch (e) { console.error("행동 처리 실패", e); }
      state.applied = [...state.applied, a.id].slice(-200);
      changed = true;
    }
    if (changed) {
      tryAdvance(state);
      render();
      try { await Store.saveRoomState(roomCode, state); clearError(); }
      catch (e) { showError("저장에 실패했어요", e); return; }
    }
    if (doneIds.length) Store.deleteActions(roomCode, doneIds).catch(() => {});
  });
}

// 내 행동 보내기: 방장이면 바로 적용, 아니면 쪽지로 보낸다.
function send(type, args = {}) {
  if (!state || !me()) return;
  const a = { type, ...args, turn: state.turn, phase: state.phase };
  if (isHost()) hostProcess([{ id: "local-" + Date.now() + "-" + Math.random(), uid: auth.uid, local: true, ...a }]);
  else Store.sendAction(roomCode, auth.uid, a).catch((e) => showError("행동을 보내지 못했어요", e));
}

function forceAdvance() {
  hostBusy = hostBusy.then(async () => {
    if (!isHost() || !state) return;
    advance(state);
    render();
    try { await Store.saveRoomState(roomCode, state); clearError(); } catch (e) { showError("저장에 실패했어요", e); }
  });
}

async function startGame() {
  try {
    const humans = members.map((m) => ({ uid: m.uid, nickname: m.nickname, role: m.role }));
    state = newGame(room.name, humans);
    await Store.saveRoomState(roomCode, state);
    clearError();
  } catch (e) { state = null; showError("게임을 시작하지 못했어요", e); }
  render();
}

async function leaveRoom() {
  const code = roomCode;
  try {
    if (isHost()) await Store.deleteRoom(code);
    else {
      const st = state;
      if (st && !st.over && me()) await Store.sendAction(code, auth.uid, { type: "leave" });
      await Store.leaveMember(code, auth.uid);
    }
  } catch (e) { showError("방을 나가지 못했어요", e); return; }
  leaveLocal("");
}

// ---------- 화면 조각 ----------
function loginSlotHtml() {
  if (auth.status === "in") return `<span>😀 ${esc(auth.nickname)}</span> <button class="small gray" data-act="logout">로그아웃</button>`;
  if (auth.status === "out" || auth.status === "error") return `<button class="small" data-act="login">Google 로 로그인</button>`;
  if (auth.status === "needNick") return `<button class="small gray" data-act="logout">로그아웃</button>`;
  return "";
}
function loginScreenHtml() {
  if (auth.status === "loading") return `<section class="card"><p>불러오는 중…</p></section>`;
  if (auth.status === "out") return `<section class="card"><h2>로그인하면 열리는 내 사이트</h2>
    <p>Google 로 로그인하면 친구들과 같은 방에서 함께 게임할 수 있어요.</p>
    <p class="muted">Google 이름과 메일은 저장하지 않아요. 내가 정한 별명만 저장돼요.</p>
    <button data-act="login" class="big green">Google 로 로그인</button></section>`;
  if (auth.status === "needNick") return `<section class="card"><h2>별명을 정해 주세요</h2>
    <p class="muted">처음 로그인했어요! 게임에서 보일 별명을 1~12자로 정하세요.<br>실명·전화번호·학교 이름은 쓰지 마세요.</p>
    <p><input type="text" id="nick" maxlength="12" placeholder="별명"></p>
    <button data-act="savenick" class="big green">별명 정하기</button></section>`;
  return `<section class="card"><h2>불러오지 못했어요</h2><p>위쪽 오류 글을 확인하고 다시 시도해 주세요.</p>
    <button data-act="retry" class="big">다시 불러오기</button></section>`;
}

function noRoomHtml() {
  return `
  <section class="card">
    <h2>방 만들기</h2>
    <p class="muted">방을 만들면 6글자 코드가 생겨요. 친구에게 코드를 알려 주세요. 사람은 최대 ${MAX_PER_ROLE * 2}명이고, 사람이 모자라면 봇이 들어와요.</p>
    <p><label>방 이름 <input type="text" id="room-name" value="우리 방" maxlength="12"></label></p>
    <p>
      <label><input type="radio" name="role" value="company" checked> 🏭 기업 플레이어 (공장을 운영해요)</label><br>
      <label><input type="radio" name="role" value="investor"> 📈 투자자 플레이어 (주식을 사고팔아요)</label>
    </p>
    <button data-act="create" class="big green">방 만들기</button>
  </section>
  <section class="card">
    <h2>코드로 방 들어가기</h2>
    <p><input type="text" id="join-code" maxlength="6" placeholder="예: K7M2QX" style="text-transform:uppercase"></p>
    <p class="muted">들어갈 때 위에서 고른 역할(기업/투자자)로 앉아요.</p>
    <button data-act="join" class="big">들어가기</button>
  </section>
  <section class="card">
    <h2>게임 규칙 한눈에</h2>
    <ul class="plain">
      <li>턴마다 정세 힌트를 읽고, 기업은 공장과 가격을 정하고, 투자자는 주식을 사요.</li>
      <li>사람이 모두 "준비 완료"를 누르면 다음 단계로 넘어가요.</li>
      <li>정세에 맞는 제품을 만든 회사가 많이 팔고, 주가가 올라요.</li>
      <li>${TOTAL_TURNS}턴이 끝났을 때 가진 코인과 주식이 가장 많은 쪽이 이겨요.</li>
    </ul>
  </section>
  <div id="join-slot" class="slot-empty"></div>`;
}

function roomLobbyHtml() {
  const mine = members.find((m) => m.uid === auth.uid);
  const count = (r) => members.filter((m) => m.role === r).length;
  const rows = ["company", "investor"].map((r) => {
    const list = members.filter((m) => m.role === r);
    const label = r === "company" ? "🏭 기업" : "📈 투자자";
    const bots = Math.max(0, MIN_PER_ROLE - list.length);
    return `<li><span>${label} (${list.length}/${MAX_PER_ROLE})</span><span>${list.map((m) => esc(m.nickname) + (m.uid === room.hostUid ? " 👑" : "")).join(", ") || "-"}${bots ? ` <span class="tag">봇 ${bots}명 들어옴</span>` : ""}</span></li>`;
  }).join("");
  const roleBtn = (r, text) => `<button data-act="role" data-role="${r}" class="${mine && mine.role === r ? "green" : "gray"}" ${count(r) >= MAX_PER_ROLE && !(mine && mine.role === r) ? "disabled" : ""}>${text}</button>`;
  const start = isHost()
    ? `<button data-act="start" class="big green">게임 시작 (사람 ${members.length}명${members.length ? "" : ""})</button>`
    : `<p class="muted">방장이 시작하기를 기다리고 있어요…</p>`;
  return `<section class="card"><h2>🚪 ${esc(room.name)} 방</h2>
    <p>방 코드 <strong style="font-size:1.6rem;letter-spacing:.15em">${esc(room.code)}</strong></p>
    <p class="muted">친구에게 이 코드를 알려 주세요. 시작하면 새로 들어올 수 없어요.</p>
    <ul class="plain">${rows}</ul>
    <p>내 역할 바꾸기: ${roleBtn("company", "🏭 기업")} ${roleBtn("investor", "📈 투자자")}</p>
    ${start}
    <button data-act="leave" class="gray small">${isHost() ? "방 닫기" : "방 나가기"}</button></section>`;
}

function trackHtml() {
  const steps = PHASE_NAMES.map((n, i) => `<span class="step ${i < state.phase ? "done" : i === state.phase ? "now" : ""}">${i + 1}. ${n}</span>`).join("");
  return `<div class="track"><strong>턴 ${state.turn} / ${TOTAL_TURNS}</strong> ${steps}</div>`;
}

function readyHtml() {
  const m = me();
  const humans = state.seats.filter((s) => !s.bot);
  const done = humans.filter((s) => state.ready[s.id]);
  const waiting = humans.filter((s) => !state.ready[s.id]).map((s) => esc(s.name));
  const isReady = !!state.ready[m.id];
  const label = state.phase === 4 && state.turn >= TOTAL_TURNS ? "마치고 결과 보기" : "준비 완료";
  const btn = isReady
    ? `<button data-act="unready" class="big gray">✅ ${label} (눌러서 취소)</button>`
    : `<button data-act="ready" class="big green">${label} ▶</button>`;
  const wait = waiting.length ? `<div class="muted">기다리는 중: ${waiting.join(", ")}</div>` : "";
  const force = isHost() && waiting.length ? `<button data-act="force" class="small gray">기다리지 않고 넘기기 (방장)</button>` : "";
  return `${btn}<div class="muted">준비 ${done.length}/${humans.length}명</div>${wait}${force}`;
}

function hintsHtml() {
  const h = state.hints;
  const reveal = state.phase === 4 ? `<div class="hint"><strong>정세 발표:</strong> 이번엔 ${prod(state.truth)} 가 대박 제품이었어요!</div>` : "";
  return `<section class="card"><h2>🌍 이번 턴 정세 힌트 <span class="muted">(모두에게 똑같이 보여요)</span></h2>
    <div class="hint">📡 <strong>공식 예보</strong> · ${HINT_TEXT[h.a][0]}</div>
    <div class="hint rumor">🗣️ <strong>소문</strong> · ${HINT_TEXT[h.b][1]}</div>
    <p class="muted">예보는 자주 맞지만 틀릴 때도 있어요. 소문은 더 자주 틀려요.</p>${reveal}</section>`;
}

function eventHtml() {
  if (state.phase < 3) return "";
  const e = state.event;
  const body = e ? `<div class="event"><strong>🚨 ${e.title}</strong><br>${e.text}</div>` : `<div class="event none">오늘은 돌발 뉴스가 없어요. 평온한 하루예요 ☀️</div>`;
  return `<section class="card"><h2>돌발 뉴스</h2>${body}</section>`;
}

function walletHtml() {
  const m = me();
  let worth = "";
  if (m.role === "investor") {
    const stocks = companiesOf(state).reduce((n, c) => n + (m.shares[c.id] || 0) * c.stock, 0);
    worth = `<div class="muted">가진 주식 값 ${stocks}코인 · 합계 ${m.coins + stocks}코인</div>`;
  }
  const log = m.log || [];
  const rows = log.length
    ? log.slice(0, 8).map((l) => `<li><span>${esc(l.reason)}</span><span class="${l.amount >= 0 ? "plus" : "minus"}">${sign(l.amount)} → ${l.coins}코인</span></li>`).join("")
    : '<li class="muted">아직 거래가 없어요.</li>';
  return `<section class="card"><h2>💰 내 코인</h2><div class="coins">${m.coins} 코인</div>${worth}
    <strong>거래 기록</strong><ul class="plain">${rows}</ul></section>`;
}

const invText = (c) => {
  const k = Object.keys(c.inventory || {});
  return k.length ? k.map((p) => `${PRODUCTS[p].icon}${c.inventory[p]}개`).join(" · ") : "없음";
};

function buildingEmoji(c) {
  const total = c.factories.reduce((n, f) => n + f.level, 0);
  return total <= 1 ? "🏠" : total <= 3 ? "🏬" : "🏭";
}

function spyHtml(viewerId) {
  const mine = state.spy[viewerId];
  if (!mine) return "";
  return Object.keys(mine).map((cid) => {
    const c = seatOf(state, cid), info = mine[cid];
    if (info.blocked) return `<div class="hint">🛡️ ${esc(c.name)} 조사 실패! 보안이 켜져 있었어요.</div>`;
    const list = info.factories.map((f, i) => `공장${i + 1}: ${prod(f.product)}${f.product ? " · " + tierText(f.price) : ""}`).join("<br>");
    return `<div class="hint">🕵️ <strong>${esc(c.name)}</strong> 조사 결과<br>${list}</div>`;
  }).join("");
}

function companiesHtml() {
  const m = me();
  const boom = (c) => state.phase === 4 && state.result && state.result.companies[c.id].profit >= 200;
  const items = companiesOf(state).map((c) => {
    const isMine = c.id === m.id;
    const arrow = c.lastChange > 0 ? `<span class="up">▲${c.lastChange}</span>` : c.lastChange < 0 ? `<span class="down">▼${-c.lastChange}</span>` : "";
    let info;
    if (isMine) info = c.factories.map((f, i) => `공장${i + 1} Lv${f.level}: ${prod(f.product)}${f.product ? " · " + tierText(f.price) : ""}`).join("<br>") + `<br>📦 재고: ${invText(c)}`;
    else info = `공장 ${c.factories.length}개 (총 레벨 ${c.factories.reduce((n, f) => n + f.level, 0)}) · 만드는 제품은 조사해야 알 수 있어요`;
    const held = m.role === "investor" ? ` · 내 주식 ${m.shares[c.id] || 0}주` : "";
    return `<div class="co ${boom(c) ? "boom" : ""}"><span class="bld">${buildingEmoji(c)}${boom(c) ? "🎉" : ""}</span>
      <strong>${esc(c.name)}</strong> ${isMine ? '<span class="tag me">내 회사</span>' : ""} ${c.bot ? '<span class="tag">봇</span>' : ""}<br>
      주가 <strong>${c.stock}</strong> ${arrow} · 남은 주식 ${freeShares(state, c.id)}/${SHARES}${held}<br>
      <span class="muted">${info}</span></div>`;
  }).join("");
  return `<section class="card"><h2>🏙️ 회사들</h2>${items}</section>`;
}

function seatsHtml() {
  const m = me();
  const rows = state.seats.map((s) => `<li><span>${s.role === "company" ? "🏭" : "📈"} ${esc(s.name)} ${s.uid && s.uid === room.hostUid ? "👑" : ""}</span>
    <span>${m && s.id === m.id ? '<span class="tag me">나</span>' : s.bot ? '<span class="tag">봇</span>' : '<span class="tag">사람</span>'}
    ${!s.bot && state.ready[s.id] ? "✅" : ""}</span></li>`).join("");
  return `<section class="card"><h2>🚪 ${esc(room.name)} 방 · ${esc(room.code)}</h2><ul class="plain">${rows}</ul>
    <button data-act="leave" class="gray small">${isHost() ? "방 닫기(모두 나가요)" : "방 나가기"}</button></section>`;
}

function spyBtn(m, c) {
  const done = state.spy[m.id] && state.spy[m.id][c.id];
  return `<button data-act="spy" data-c="${c.id}" class="${done ? "gray" : ""}" ${done || m.coins < SPY_COST ? "disabled" : ""}>🕵️ ${esc(c.name)} 조사 (${SPY_COST}코인)</button>`;
}

function companyPanelHtml() {
  const m = me(), ph = state.phase;
  if (ph !== 1) {
    const msg = ["정세 힌트를 읽고 어떤 제품이 잘 팔릴지 생각해 보세요.", "", "투자자들이 주식을 사고파는 중이에요. 우리 회사 주가가 어떻게 될까요?", "돌발 뉴스가 판을 흔들 수 있어요!", ""][ph];
    return msg ? `<section class="card"><h2>🏭 내 회사 · ${esc(m.name)}</h2><p>${msg}</p></section>` : "";
  }
  const facs = m.factories.map((f, i) => {
    const up = UPGRADE_COST[f.level];
    const prodOpts = `<option value="">쉬기</option>` + Object.keys(PRODUCTS).map((p) => `<option value="${p}" ${f.product === p ? "selected" : ""}>${prod(p)}</option>`).join("");
    const priceOpts = Object.keys(PRICES).map((k) => `<option value="${k}" ${f.price === k ? "selected" : ""}>${tierText(k)}</option>`).join("");
    return `<div class="fac"><strong>공장 ${i + 1} · 레벨 ${f.level}</strong>
      <div class="muted">만드는 비용 ${UNIT_COST[f.level]} · 유지비 ${UPKEEP[f.level]}/턴 · 최대 ${CAP[f.level]}개</div>
      <select data-act="product" data-i="${i}">${prodOpts}</select>
      <select data-act="price" data-i="${i}">${priceOpts}</select>
      ${up ? `<button class="small" data-act="upgrade" data-i="${i}" ${m.coins < up ? "disabled" : ""}>업그레이드 (${up}코인)</button>` : '<span class="tag">최고 레벨</span>'}</div>`;
  }).join("");
  const addBtn = m.factories.length < MAX_SLOTS ? `<button data-act="addfac" ${m.coins < NEW_SLOT_COST ? "disabled" : ""}>공장 더 짓기 (${NEW_SLOT_COST}코인)</button>` : "";
  const secure = `<button data-act="secure" class="${m.secure ? "gray" : ""}" ${m.secure || m.coins < SECURE_COST ? "disabled" : ""}>${m.secure ? "🛡️ 비공개 생산 켜짐" : `🛡️ 비공개 생산 켜기 (${SECURE_COST}코인)`}</button>`;
  const spies = companiesOf(state).filter((c) => c.id !== m.id).map((c) => spyBtn(m, c)).join("");
  return `<section class="card"><h2>🏭 내 회사 · ${esc(m.name)} <span class="muted">(준비 단계)</span></h2>
    <p class="muted">공장마다 만들 제품과 가격을 고르세요. 저가는 많이 팔리고, 고가는 한 개당 이익이 커요.
    같은 제품을 사려는 손님(수요)은 정해져 있어서 경쟁 공장끼리 나눠 가져요. 값이 싸고 공장 레벨(품질)이 높을수록 더 많이 가져와요. 공장은 능력만큼 만들어 놓고 팔아요. 못 판 건 재고로 남아 다음 턴에 팔 수 있지만 보관비가 들어요. 같은 제품을 만드는 공장이 많으면 값이 내려가요.</p>
    <div class="muted">📦 재고: ${invText(m)}</div>
    ${facs}${addBtn}${secure}<div>${spies}</div>${spyHtml(m.id)}</section>${cardsHtml(m)}`;
}

function cardsHtml(m) {
  const hand = m.hand || [];
  if (!hand.length) return "";
  const btns = hand.map((k) => {
    const c = CARDS[k], used = m.card === k;
    return `<div class="row"><strong>${c.icon} ${c.name}</strong> <span class="muted">${c.text}</span><br>
      <button data-act="card" data-c="${k}" class="${used ? "gray" : ""}" ${m.card || m.coins < c.cost ? "disabled" : ""}>${used ? "사용함 ✅" : `쓰기 (${c.cost}코인)`}</button></div>`;
  }).join("");
  return `<section class="card"><h2>🃏 이번 턴 카드 <span class="muted">(한 장만 쓸 수 있어요, 정산 때 효과가 나와요)</span></h2>${btns}</section>`;
}

function investorPanelHtml() {
  const m = me(), ph = state.phase;
  if (ph === 1) {
    return `<section class="card"><h2>📈 투자자 · 정보 탐색 <span class="muted">(준비 단계)</span></h2>
      <p class="muted">코인을 내고 회사의 공장과 가격을 몰래 조사할 수 있어요. 보안이 켜진 회사는 막혀요.</p>
      ${companiesOf(state).map((c) => spyBtn(m, c)).join("")}${spyHtml(m.id)}</section>`;
  }
  if (ph === 2) {
    const rows = companiesOf(state).map((c) => `<div class="row"><strong>${esc(c.name)}</strong> 주가 ${c.stock}코인 · 내 주식 ${m.shares[c.id] || 0}주 · 남은 주식 ${freeShares(state, c.id)}<br>
      <button class="green" data-act="buy" data-c="${c.id}" ${m.coins < buyCost(c) || freeShares(state, c.id) <= 0 ? "disabled" : ""}>1주 사기 (−${buyCost(c)})</button>
      <button data-act="sell" data-c="${c.id}" ${(m.shares[c.id] || 0) <= 0 ? "disabled" : ""}>1주 팔기 (+${sellGain(c)})</button></div>`).join("");
    return `<section class="card"><h2>📈 주식 베팅</h2><p class="muted">힌트와 조사 결과를 보고 투자할 회사를 고르세요. 사고팔 때마다 수수료 ${Math.round(TRADE_FEE * 100)}%가 붙어요.</p>${rows}${spyHtml(m.id)}</section>`;
  }
  const msg = ["정세 힌트를 읽어 보세요. 어느 회사가 유리할까요?", "", "", "돌발 뉴스가 터질 수 있어요. 주식이 어떻게 될까요?", ""][ph];
  return msg ? `<section class="card"><h2>📈 투자자</h2><p>${msg}</p></section>` : "";
}

// 가져온 몫 막대그래프(그림): 시장 전체 판매 중 회사마다 몇 %를 가져왔는지
function shareChartHtml(r, m) {
  const rows = companiesOf(state).map((c) => ({ c, sold: r.companies[c.id].sold }))
    .sort((x, y) => y.sold - x.sold);
  const total = r.totalSold || 0, W = 340, rowH = 34, barX = 112, barW = 160, H = rows.length * rowH + 6;
  const body = rows.map(({ c, sold }, i) => {
    const pct = total ? Math.round((sold / total) * 100) : 0, y = 4 + i * rowH;
    const name = c.name.length > 9 ? c.name.slice(0, 8) + "…" : c.name;
    const color = c.id === m.id ? "#ffb703" : "#2c6bd6";
    return `<text x="0" y="${y + 18}" font-size="12" fill="currentColor">${esc(name)}</text>
      <rect x="${barX}" y="${y + 4}" width="${barW}" height="20" rx="4" fill="#e3e8f2"/>
      <rect x="${barX}" y="${y + 4}" width="${Math.round((barW * pct) / 100)}" height="20" rx="4" fill="${color}"/>
      <text x="${barX + barW + 8}" y="${y + 19}" font-size="13" font-weight="bold" fill="currentColor">${pct}%</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="회사별로 가져온 수요 몫 막대그래프">${body}</svg>`;
}

function resultHtml() {
  if (state.phase !== 4 || !state.result) return "";
  const r = state.result, m = me();
  const money = (n) => `<span class="${n >= 0 ? "plus" : "minus"}">${sign(n)}코인</span>`;
  const mine = r.gain[m.id];

  const stocks = companiesOf(state).map((c) => {
    const x = r.companies[c.id], d = x.stockTo - x.stockFrom;
    const arrow = d > 0 ? `<span class="up">▲${d}</span>` : d < 0 ? `<span class="down">▼${-d}</span>` : "-";
    return `<li><span>${esc(c.name)}${c.id === m.id ? ' <span class="tag me">내 회사</span>' : ""}</span><span>${x.stockFrom} → <strong>${x.stockTo}</strong> ${arrow}</span></li>`;
  }).join("");

  return `<section class="card"><h2>📊 이번 턴 결과</h2>
      <div class="muted">내가 번 순수익${m.role === "investor" ? " (배당과 주식 값 변화 포함)" : ""}</div>
      <div class="bigmoney">${money(mine)}</div></section>
    <section class="card"><h2>🥧 수요 몫: 경쟁해서 가져온 비율</h2>
      <p class="muted">같은 제품을 사려는 손님은 정해져 있어서, 경쟁하는 회사끼리 나눠 가졌어요.</p>${shareChartHtml(r, m)}</section>
    <section class="card"><h2>📈 주가</h2><ul class="plain">${stocks}</ul></section>`;
}

function newsHtml() {
  const m = me();
  const msgs = (state.news || []).filter((n) => n.seat === m.id).map((n) => n.text);
  return msgs.length ? `<div class="toast">${msgs.map(esc).join("<br>")}</div>` : "";
}

function overHtml() {
  const scores = finalScores(state), m = me();
  const rows = scores.map((x, i) => `<li><span>${i + 1}위 ${x.seat.role === "company" ? "🏭" : "📈"} ${esc(x.seat.name)} ${m && x.seat.id === m.id ? '<span class="tag me">나</span>' : x.seat.bot ? '<span class="tag">봇</span>' : ""}</span><strong>${x.worth}코인</strong></li>`).join("");
  const mine = m ? scores.findIndex((x) => x.seat.id === m.id) + 1 : 0;
  return `<section class="card"><h2>🏆 게임 끝!</h2>${mine ? `<p>나는 ${scores.length}명 중 <strong>${mine}위</strong>였어요.</p>` : ""}
    <ul class="plain">${rows}</ul>
    <p class="muted">순위 값 = 코인 + (투자자: 가진 주식 값 / 기업: 공장에 쓴 돈)</p>
    <button data-act="leave" class="big green">${isHost() ? "방 닫고 새 게임 하기" : "방 나가기"}</button></section>`;
}

// ---------- 전체 그리기 ----------
function render() {
  const toast = flash ? `<div class="toast">${esc(flash)}</div>` : "";
  flash = "";
  loginSlot.innerHTML = loginSlotHtml();
  if (auth.status !== "in") { app.innerHTML = loginScreenHtml(); return; }
  if (!roomCode) { app.innerHTML = toast + noRoomHtml(); return; }
  if (!room) { app.innerHTML = toast + `<section class="card"><p>방을 불러오는 중…</p></section>`; return; }
  if (room.status === "lobby" || !state) {
    app.innerHTML = toast + (room.status === "lobby" ? roomLobbyHtml() : `<section class="card"><p>판을 불러오는 중…</p></section>`);
    return;
  }
  const m = me();
  if (!m) {
    app.innerHTML = toast + `<section class="card"><h2>자리가 없어요</h2><p>이 방에서 나갔거나, 시작할 때 들어와 있지 않았어요.</p>
      <button data-act="leave" class="big gray">방 나가기</button></section>`;
    return;
  }
  if (state.over) { app.innerHTML = overHtml(); return; }
  const panel = m.role === "company" ? companyPanelHtml() : investorPanelHtml();
  // 방을 시작한 사람과 화면 버전이 다르면(옛 파일이 남아 있으면) 알려 준다.
  const oldWarn = state.build !== BUILD
    ? `<div class="toast">⚠️ 이 방은 다른 버전(${esc(state.build || "옛")})으로 시작됐고, 내 화면은 버전 ${BUILD}이에요. Ctrl+F5 로 새로고침해 보세요.</div>` : "";
  app.innerHTML = `${oldWarn}${toast}${trackHtml()}${readyHtml()}${newsHtml()}
    <div class="cols" style="margin-top:12px">
      <div>${hintsHtml()}${eventHtml()}${panel}${resultHtml()}</div>
      <div>${walletHtml()}${companiesHtml()}${seatsHtml()}</div>
    </div>`;
}

// ---------- 누르기 / 고르기 ----------
async function authAction(act) {
  try {
    if (act === "login") { await Store.login(); }
    else if (act === "logout") { await Store.logout(); clearError(); }
    else if (act === "retry") { await afterLogin(auth.uid); }
    else if (act === "savenick") {
      const nick = (document.getElementById("nick").value || "").trim();
      if (nick.length < 1 || nick.length > 12) { showError("별명을 확인해 주세요", { code: "app/message", message: "1~12자로 정해 주세요." }); return; }
      await Store.saveProfile(auth.uid, nick);
      clearError();
      await afterLogin(auth.uid);
    }
  } catch (e) {
    showError(act === "login" ? "로그인에 실패했어요" : act === "savenick" ? "별명을 저장하지 못했어요" : "처리하지 못했어요", e);
  }
}

loginSlot.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b) authAction(b.dataset.act);
});

app.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "SELECT") return;
  const act = b.dataset.act;
  if (["login", "logout", "retry", "savenick"].includes(act)) { authAction(act); return; }
  if (auth.status !== "in") return;
  const i = Number(b.dataset.i), c = b.dataset.c;
  const pickedRole = () => (document.querySelector("input[name=role]:checked") || {}).value || "company";
  try {
    if (act === "create") {
      const name = (document.getElementById("room-name").value || "우리 방").trim() || "우리 방";
      enterRoom(await Store.createRoom(auth.uid, auth.nickname, name, pickedRole()));
    } else if (act === "join") {
      enterRoom(await Store.joinRoom(auth.uid, auth.nickname, document.getElementById("join-code").value, pickedRole()));
    } else if (act === "role") {
      await Store.setMyRole(roomCode, auth.uid, auth.nickname, b.dataset.role);
    } else if (act === "start") { await startGame(); }
    else if (act === "leave") {
      if (state && state.over) await leaveRoom();
      else if (confirm(isHost() ? "방을 닫으면 모두 나가고 게임이 사라져요. 닫을까요?" : "방을 나갈까요? 내 자리는 봇이 이어받아요.")) await leaveRoom();
    }
    else if (act === "ready") send("ready");
    else if (act === "unready") send("unready");
    else if (act === "force") forceAdvance();
    else if (act === "upgrade") send("upgrade", { i });
    else if (act === "addfac") send("addfac");
    else if (act === "secure") send("secure");
    else if (act === "card") send("card", { c });
    else if (act === "spy") send("spy", { c });
    else if (act === "buy") send("buy", { c });
    else if (act === "sell") send("sell", { c });
  } catch (err) {
    showError("처리하지 못했어요", err);
  }
});

app.addEventListener("change", (e) => {
  const s = e.target;
  if (auth.status !== "in" || !state || !me()) return;
  if (!s.dataset || !s.dataset.act || s.tagName !== "SELECT") return;
  const i = Number(s.dataset.i), f = me().factories[i];
  if (!f) return;
  if (s.dataset.act === "product") send("setFactory", { i, product: s.value, price: f.price });
  else if (s.dataset.act === "price") send("setFactory", { i, product: f.product || "", price: s.value });
});

render();
