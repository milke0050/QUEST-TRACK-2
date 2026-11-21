// 화면 코드. 규칙은 game.js, 숫자는 data.js, 로그인·저장은 storage.js 에 있다.
import { Store } from "./storage.js";

let state = null; // 내 판 상태 (로그인 뒤에 Firestore 에서 불러온다)
let auth = { status: "loading", uid: null, nickname: "" }; // loading | out | needNick | in | error
let flash = "";
const app = document.getElementById("app");
const loginSlot = document.getElementById("login-slot");
const errorBox = document.getElementById("error");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const me = () => seatOf(state, state.room.mySeat);
const prod = (p) => (p ? `${PRODUCTS[p].icon} ${PRODUCTS[p].name}` : "쉬는 공장");
const tierText = (t) => `${PRICES[t].label} ${PRICES[t].price}`;
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
    "permission-denied": "저장 권한이 없어요. 보안 규칙을 콘솔에 붙여 넣었는지 확인해 주세요.",
    "unavailable": "서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.",
  };
  return map[code] || `${code || "알 수 없는 오류"} ${(e && e.message) || ""}`.trim();
}
function showError(prefix, e) {
  console.error(prefix, e);
  errorBox.textContent = `⚠️ ${prefix}: ${errText(e)}`;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ""; }

// ---------- 저장 ----------
function persist() {
  if (auth.status !== "in" || !state) return;
  Store.saveGame(auth.uid, auth.nickname, state).then(clearError).catch((e) => showError("저장에 실패했어요", e));
}

function commit(msg) {
  flash = msg || "";
  persist();
  render();
}

// ---------- 로그인 ----------
async function afterLogin(uid) {
  auth = { status: "loading", uid, nickname: "" };
  render();
  try {
    const prof = await Store.loadProfile(uid);
    if (!prof) { auth.status = "needNick"; render(); return; }
    auth.nickname = prof.nickname;
    state = await Store.loadGame(uid);
    auth.status = "in";
    clearError();
  } catch (e) {
    auth.status = "error";
    showError("불러오기에 실패했어요", e);
  }
  render();
}

Store.onUser((u) => {
  if (u) afterLogin(u.uid);
  else { auth = { status: "out", uid: null, nickname: "" }; state = null; render(); }
});

function loginSlotHtml() {
  if (auth.status === "in") return `<span>😀 ${esc(auth.nickname)}</span> <button class="small gray" data-act="logout">로그아웃</button>`;
  if (auth.status === "out" || auth.status === "error") return `<button class="small" data-act="login">Google 로 로그인</button>`;
  if (auth.status === "needNick") return `<button class="small gray" data-act="logout">로그아웃</button>`;
  return "";
}
function loginScreenHtml() {
  if (auth.status === "loading") return `<section class="card"><p>불러오는 중…</p></section>`;
  if (auth.status === "out") return `<section class="card"><h2>로그인하면 열리는 내 사이트</h2>
    <p>Google 로 로그인하면 내 게임이 저장돼서, 어느 기기에서 열어도 이어서 할 수 있어요.</p>
    <p class="muted">Google 이름과 메일은 저장하지 않아요. 내가 정한 별명만 저장돼요.</p>
    <button data-act="login" class="big green">Google 로 로그인</button></section>`;
  if (auth.status === "needNick") return `<section class="card"><h2>별명을 정해 주세요</h2>
    <p class="muted">처음 로그인했어요! 게임에서 보일 별명을 1~12자로 정하세요.<br>실명·전화번호·학교 이름은 쓰지 마세요.</p>
    <p><input type="text" id="nick" maxlength="12" placeholder="별명"></p>
    <button data-act="savenick" class="big green">별명 정하기</button></section>`;
  return `<section class="card"><h2>불러오지 못했어요</h2><p>위쪽 오류 글을 확인하고 다시 시도해 주세요.</p>
    <button data-act="retry" class="big">다시 불러오기</button></section>`;
}

// ---------- 화면 조각 ----------
function lobbyHtml() {
  return `
  <section class="card">
    <h2>방 만들기</h2>
    <p class="muted">방을 만들고 내가 앉을 자리를 고르세요. 비는 자리는 봇이 채워요.<br>
    (방과 게임은 내 계정에 저장돼서 어느 기기에서 열어도 이어서 할 수 있어요. 다른 사람이 같은 방에 들어오는 건 아직 못 해요.)</p>
    <p><label>방 이름 <input type="text" id="room-name" value="우리 방" maxlength="12"></label></p>
    <p>
      <label><input type="radio" name="role" value="company" checked> 🏭 기업 플레이어 (공장을 운영해요)</label><br>
      <label><input type="radio" name="role" value="investor"> 📈 투자자 플레이어 (주식을 사고팔아요)</label>
    </p>
    <button data-act="create" class="big green">방 만들고 시작하기</button>
  </section>
  <section class="card">
    <h2>게임 규칙 한눈에</h2>
    <ul class="plain">
      <li>턴마다 정세 힌트를 읽고, 기업은 공장과 가격을 정하고, 투자자는 주식을 사요.</li>
      <li>정세에 맞는 제품을 만든 회사가 많이 팔고, 주가가 올라요.</li>
      <li>${TOTAL_TURNS}턴이 끝났을 때 가진 코인과 주식이 가장 많은 쪽이 이겨요.</li>
    </ul>
  </section>
  <div id="join-slot" class="slot-empty"></div>`;
}

function trackHtml() {
  const steps = PHASE_NAMES.map((n, i) => `<span class="step ${i < state.phase ? "done" : i === state.phase ? "now" : ""}">${i + 1}. ${n}</span>`).join("");
  return `<div class="track"><strong>턴 ${state.turn} / ${TOTAL_TURNS}</strong> ${steps}</div>`;
}

function nextBtnHtml() {
  const labels = ["기업 준비로 ▶", "주식 베팅으로 ▶", "돌발 뉴스 확인 ▶", "결과 정산 ▶", state.turn >= TOTAL_TURNS ? "게임 결과 보기 🏆" : "다음 턴으로 ▶"];
  return `<button data-act="next" class="big green">${labels[state.phase]}</button>`;
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
  const rows = state.log.length
    ? state.log.slice(0, 8).map((l) => `<li><span>${esc(l.reason)}</span><span class="${l.amount >= 0 ? "plus" : "minus"}">${sign(l.amount)} → ${l.coins}코인</span></li>`).join("")
    : '<li class="muted">아직 거래가 없어요.</li>';
  return `<section class="card"><h2>💰 내 코인</h2><div class="coins">${m.coins} 코인</div>${worth}
    <strong>거래 기록</strong><ul class="plain">${rows}</ul></section>`;
}

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
    if (isMine) info = c.factories.map((f, i) => `공장${i + 1} Lv${f.level}: ${prod(f.product)}${f.product ? " · " + tierText(f.price) : ""}`).join("<br>");
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
  const rows = state.seats.map((s) => `<li><span>${s.role === "company" ? "🏭" : "📈"} ${esc(s.name)}</span>
    <span>${s.id === state.room.mySeat ? '<span class="tag me">나</span>' : '<span class="tag">봇</span>'}</span></li>`).join("");
  return `<section class="card"><h2>🚪 ${esc(state.room.name)} 방</h2><ul class="plain">${rows}</ul>
    <button data-act="leave" class="gray small">방 나가기(새 게임)</button></section>`;
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
    <p class="muted">공장마다 만들 제품과 가격을 고르세요. 저가는 많이 팔리고, 고가는 한 개당 이익이 커요.</p>
    ${facs}${addBtn}${secure}<div>${spies}</div>${spyHtml(m.id)}</section>`;
}

function spyBtn(m, c) {
  const done = state.spy[m.id] && state.spy[m.id][c.id];
  return `<button data-act="spy" data-c="${c.id}" class="${done ? "gray" : ""}" ${done || m.coins < SPY_COST ? "disabled" : ""}>🕵️ ${esc(c.name)} 조사 (${SPY_COST}코인)</button>`;
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
      <button class="green" data-act="buy" data-c="${c.id}" ${m.coins < c.stock || freeShares(state, c.id) <= 0 ? "disabled" : ""}>1주 사기</button>
      <button data-act="sell" data-c="${c.id}" ${(m.shares[c.id] || 0) <= 0 ? "disabled" : ""}>1주 팔기</button></div>`).join("");
    return `<section class="card"><h2>📈 주식 베팅</h2><p class="muted">힌트와 조사 결과를 보고 투자할 회사를 고르세요.</p>${rows}${spyHtml(m.id)}</section>`;
  }
  const msg = ["정세 힌트를 읽어 보세요. 어느 회사가 유리할까요?", "", "", "돌발 뉴스가 터질 수 있어요. 주식이 어떻게 될까요?", ""][ph];
  return msg ? `<section class="card"><h2>📈 투자자</h2><p>${msg}</p></section>` : "";
}

function resultHtml() {
  if (state.phase !== 4 || !state.result) return "";
  const r = state.result;
  const blocks = companiesOf(state).map((c) => {
    const x = r.companies[c.id];
    const rows = x.rows.map((w) => w.idle
      ? `<div class="row">공장 ${w.idx + 1} · 쉬었어요 (유지비만 나가요)</div>`
      : `<div class="row">공장 ${w.idx + 1} (Lv${w.level}) ${prod(w.product)} · ${tierText(w.tier)}<br>
         <span class="formula">판매량 = 작은 쪽(능력 ${w.cap}, 수요 몫 ${w.share}) = <strong>${w.sold}개</strong></span><br>
         매출 ${w.sold * w.price} − 만드는 비용 ${w.sold * w.unit}</div>`).join("");
    return `<div class="co"><strong>${esc(c.name)}</strong>${rows}
      <div>유지비 −${x.upkeep} → <strong class="${x.profit >= 0 ? "plus" : "minus"}">이번 턴 이익 ${sign(x.profit)}코인</strong></div>
      <div>주가 ${x.stockFrom} → <span class="${x.stockTo >= x.stockFrom ? "up" : "down"}">${x.stockTo}</span>${x.perShare ? ` · 1주당 배당 ${x.perShare}코인` : ""}</div></div>`;
  }).join("");
  const myDiv = r.dividends[state.room.mySeat] ? `<p class="plus">내가 받은 배당금 +${r.dividends[state.room.mySeat]}코인 🎁</p>` : "";
  return `<section class="card"><h2>📊 결과 정산</h2>
    <p>정세 발표: ${prod(r.truth)}${r.event ? ` · 돌발: ${r.event.title}` : ""}</p>
    <p class="formula">판매 공식 · 판매량 = 작은 쪽(생산 능력, 제품 수요 × 내 가격 몫)<br>내 가격 몫 = 내 가중치 ÷ 같은 제품 공장들의 가중치 합 (저가 3 · 적정가 2 · 고가 1)</p>
    ${blocks}${myDiv}</section>`;
}

function newsHtml() {
  const msgs = [...(state.news || [])];
  return msgs.length ? `<div class="toast">${msgs.map(esc).join("<br>")}</div>` : "";
}

function overHtml() {
  const scores = finalScores(state);
  const rows = scores.map((x, i) => `<li><span>${i + 1}위 ${x.seat.role === "company" ? "🏭" : "📈"} ${esc(x.seat.name)} ${x.seat.id === state.room.mySeat ? '<span class="tag me">나</span>' : ""}</span><strong>${x.worth}코인</strong></li>`).join("");
  const mine = scores.findIndex((x) => x.seat.id === state.room.mySeat) + 1;
  return `<section class="card"><h2>🏆 게임 끝!</h2><p>나는 ${scores.length}명 중 <strong>${mine}위</strong>였어요.</p>
    <ul class="plain">${rows}</ul>
    <p class="muted">순위 값 = 코인 + (투자자: 가진 주식 값 / 기업: 공장에 쓴 돈)</p>
    <button data-act="leave" class="big green">새 게임 하기</button></section>`;
}

// ---------- 전체 그리기 ----------
function render() {
  const toast = flash ? `<div class="toast">${esc(flash)}</div>` : "";
  flash = "";
  loginSlot.innerHTML = loginSlotHtml();
  if (auth.status !== "in") { app.innerHTML = loginScreenHtml(); return; }
  if (!state) { app.innerHTML = toast + lobbyHtml(); return; }
  if (state.over) { app.innerHTML = overHtml(); return; }
  const m = me();
  const panel = m.role === "company" ? companyPanelHtml() : investorPanelHtml();
  app.innerHTML = `${toast}${trackHtml()}${nextBtnHtml()}${newsHtml()}
    <div class="cols" style="margin-top:12px">
      <div>${hintsHtml()}${eventHtml()}${panel}${resultHtml()}</div>
      <div>${walletHtml()}${companiesHtml()}${seatsHtml()}</div>
    </div>`;
}

// ---------- 누르기 / 고르기 ----------
function run(fn) { const err = fn(); commit(err || ""); }

// 로그인·로그아웃·별명 단추 (로그인 단추는 누르는 순간 바로 팝업을 열어야 막히지 않는다)
async function authAction(act) {
  try {
    if (act === "login") { await Store.login(); }
    else if (act === "logout") { await Store.logout(); clearError(); }
    else if (act === "retry") { await afterLogin(auth.uid); }
    else if (act === "savenick") {
      const nick = (document.getElementById("nick").value || "").trim();
      if (nick.length < 1 || nick.length > 12) { showError("별명을 확인해 주세요", { message: "1~12자로 정해 주세요." }); return; }
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

app.addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "SELECT") return;
  if (["login", "logout", "retry", "savenick"].includes(b.dataset.act)) { authAction(b.dataset.act); return; }
  if (auth.status !== "in") return;
  const act = b.dataset.act, m = state && state.room ? me() : null, i = Number(b.dataset.i), c = b.dataset.c;
  if (act === "create") {
    const name = (document.getElementById("room-name").value || "우리 방").trim() || "우리 방";
    const role = document.querySelector("input[name=role]:checked").value;
    state = newGame(name, role);
    commit();
  } else if (act === "leave") {
    if (state.over || confirm("방을 나가면 지금 게임이 사라져요. 나갈까요?")) {
      state = null; render();
      Store.deleteGame(auth.uid).then(clearError).catch((err) => showError("지우기에 실패했어요", err));
    }
  } else if (act === "next") { advance(state); commit(); }
  else if (act === "upgrade") run(() => upgradeFactory(state, m.id, i));
  else if (act === "addfac") run(() => addFactory(state, m.id));
  else if (act === "secure") run(() => toggleSecure(state, m.id));
  else if (act === "spy") run(() => spyOn(state, m.id, c));
  else if (act === "buy") run(() => buyShare(state, m.id, c));
  else if (act === "sell") run(() => sellShare(state, m.id, c));
});

app.addEventListener("change", (e) => {
  const s = e.target;
  if (auth.status !== "in" || !state) return;
  if (!s.dataset || !s.dataset.act || s.tagName !== "SELECT") return;
  const m = me(), i = Number(s.dataset.i), f = m.factories[i];
  if (s.dataset.act === "product") setFactory(state, m.id, i, s.value, f.price);
  else if (s.dataset.act === "price") setFactory(state, m.id, i, f.product, s.value);
  commit();
});

render();
