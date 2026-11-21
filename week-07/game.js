// 게임 규칙과 봇. 화면 코드는 여기 없다. (data.js 가 먼저 불러와져야 한다)
// 여러 명이 함께 할 때는 방장의 브라우저가 이 규칙으로 판을 진행하고, 결과를 방(Firestore)에 적는다.
let RNG = Math.random; // 시험할 때 바꿔 끼울 수 있다
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
const seatOf = (st, id) => st.seats.find((s) => s.id === id);
const companiesOf = (st) => st.seats.filter((s) => s.role === "company");
const investorsOf = (st) => st.seats.filter((s) => s.role === "investor");
const heldShares = (st, cid) => investorsOf(st).reduce((n, i) => n + (i.shares[cid] || 0), 0);
// 자산: 기업은 코인, 투자자는 코인 + 가진 주식 값
const worthOf = (st, seat) => seat.coins + (seat.role === "investor" ? companiesOf(st).reduce((n, c) => n + (seat.shares[c.id] || 0) * c.stock, 0) : 0);
const freeShares = (st, cid) => SHARES - heldShares(st, cid);

// 코인을 바꾸는 곳은 여기 하나. 사람 자리면 그 사람의 거래 기록(1번 기능)에 남긴다.
function addCoins(st, seat, amount, reason) {
  const before = seat.coins;
  seat.coins = Math.max(0, seat.coins + amount);
  if (!seat.bot && seat.coins !== before) {
    seat.log = seat.log || [];
    seat.log.unshift({ amount: seat.coins - before, reason, coins: seat.coins });
    seat.log = seat.log.slice(0, 30);
  }
}

// humans: [{uid, nickname, role}] (사람 최대 8명). 모자란 자리는 봇이 채운다.
function newGame(roomName, humans) {
  const comp = humans.filter((h) => h.role === "company");
  const inv = humans.filter((h) => h.role !== "company");
  while (comp.length > MAX_PER_ROLE) inv.push(comp.pop()); // 자리가 넘치면 반대 역할로
  while (inv.length > MAX_PER_ROLE) comp.push(inv.pop());

  const company = (id, name, uid) => ({
    id, role: "company", name, uid: uid || null, bot: !uid, coins: START_COINS,
    factories: [{ level: 1, product: null, price: "mid" }],
    secure: false, stock: START_STOCK, lastChange: 0, log: [], inventory: {}, hand: [], card: null,
  });
  const seats = [];
  comp.forEach((h, k) => seats.push(company("c" + (k + 1), `${h.nickname}의 회사`, h.uid)));
  for (let k = comp.length; k < MIN_PER_ROLE; k++) seats.push(company("c" + (k + 1), BOT_COMPANY_NAMES[k]));

  const shares = {};
  seats.forEach((c) => (shares[c.id] = 0));
  const investor = (id, name, uid) => ({
    id, role: "investor", name, uid: uid || null, bot: !uid, coins: START_COINS, shares: { ...shares }, log: [],
  });
  inv.forEach((h, k) => seats.push(investor("i" + (k + 1), h.nickname, h.uid)));
  for (let k = inv.length; k < MIN_PER_ROLE; k++) seats.push(investor("i" + (k + 1), BOT_INVESTOR_NAMES[k]));

  const st = { version: 2, build: BUILD, room: { name: roomName }, seats, turn: 1, phase: 0, over: false, ready: {}, applied: [] };
  startTurn(st);
  return st;
}

function startTurn(st) {
  const keys = Object.keys(PRODUCTS);
  st.truth = pick(keys);
  const others = keys.filter((k) => k !== st.truth);
  st.hints = {
    a: RNG() < 0.75 ? st.truth : pick(others), // 공식 예보: 자주 맞음
    b: RNG() < 0.5 ? st.truth : pick(others), // 소문: 더 자주 틀림
  };
  st.event = null; st.spy = {}; st.result = null; st.news = []; st.phase = 0; st.ready = {};
  st.seats.forEach((s) => (s.worthStart = worthOf(st, s))); // 이번 턴을 시작할 때 자산 (얼마 벌었는지 비교용)
  companiesOf(st).forEach((c) => {
    c.secure = false;
    c.card = null;
    const ids = Object.keys(CARDS);
    const first = pick(ids);
    c.hand = [first, pick(ids.filter((k) => k !== first))]; // 이번 턴 카드 2장
  });
}

// ---------- 기업 행동 ----------
const need = (st, phase) => (st.phase === phase ? null : "지금은 할 수 없는 단계예요.");

function setFactory(st, cid, i, product, price) {
  const f = seatOf(st, cid).factories[i];
  if (!f || need(st, 1)) return;
  f.product = product || null;
  f.price = price;
}
function upgradeFactory(st, cid, i) {
  const c = seatOf(st, cid), f = c.factories[i], cost = f && UPGRADE_COST[f.level];
  if (need(st, 1) || !cost) return "더 올릴 수 없어요.";
  if (c.coins < cost) return "코인이 모자라요.";
  addCoins(st, c, -cost, `공장 ${i + 1} 업그레이드`);
  f.level++;
  return null;
}
function addFactory(st, cid) {
  const c = seatOf(st, cid);
  if (need(st, 1) || c.factories.length >= MAX_SLOTS) return "공장은 최대 3개예요.";
  if (c.coins < NEW_SLOT_COST) return "코인이 모자라요.";
  addCoins(st, c, -NEW_SLOT_COST, "새 공장 짓기");
  c.factories.push({ level: 1, product: null, price: "mid" });
  return null;
}
function toggleSecure(st, cid) {
  const c = seatOf(st, cid);
  if (need(st, 1) || c.secure) return null;
  if (c.coins < SECURE_COST) return "코인이 모자라요.";
  addCoins(st, c, -SECURE_COST, "비공개 생산(보안)");
  c.secure = true;
  return null;
}

// 카드: 준비 단계에서 한 장만 쓸 수 있다. 효과는 정산 때 적용된다.
function useCard(st, cid, card) {
  const c = seatOf(st, cid), def = CARDS[card];
  if (need(st, 1) || !def) return "지금은 카드를 쓸 수 없어요.";
  if (c.card) return "이번 턴에는 이미 카드를 썼어요.";
  if (!(c.hand || []).includes(card)) return "그 카드는 없어요.";
  if (c.coins < def.cost) return "코인이 모자라요.";
  addCoins(st, c, -def.cost, `카드 ${def.name}`);
  c.card = card;
  return null;
}

// 비밀 조사: 코인을 내고 다른 회사의 공장 제품과 가격을 훔쳐본다.
// 소식(news)은 누구에게 온 것인지 seat 로 구분한다.
function spyOn(st, spyId, targetId) {
  const s = seatOf(st, spyId), t = seatOf(st, targetId);
  if (need(st, 1) || spyId === targetId || !t || t.role !== "company") return "지금은 조사할 수 없어요.";
  st.spy[spyId] = st.spy[spyId] || {};
  if (st.spy[spyId][targetId]) return "이미 조사했어요.";
  if (s.coins < SPY_COST) return "코인이 모자라요.";
  addCoins(st, s, -SPY_COST, `${t.name} 조사`);
  if (t.secure) {
    st.spy[spyId][targetId] = { blocked: true };
    st.news.push({ seat: t.id, text: `🛡️ ${s.name} 님이 우리 회사를 조사했지만 보안으로 막았어요.` });
  } else {
    st.spy[spyId][targetId] = { factories: t.factories.map((f) => ({ product: f.product, price: f.price })) };
    st.news.push({ seat: t.id, text: `👀 ${s.name} 님이 우리 회사의 공장 정보를 훔쳐봤어요!` });
  }
  return null;
}

// ---------- 투자자 행동 ----------
function buyShare(st, iid, cid) {
  const i = seatOf(st, iid), c = seatOf(st, cid);
  if (need(st, 2)) return "지금은 거래할 수 없어요.";
  if (freeShares(st, cid) <= 0) return "살 수 있는 주식이 없어요.";
  const cost = Math.ceil(c.stock * (1 + TRADE_FEE));
  if (i.coins < cost) return "코인이 모자라요.";
  addCoins(st, i, -cost, `${c.name} 주식 1주 사기`);
  if (BUY_PAYS_COMPANY) addCoins(st, c, c.stock, "주식을 판 돈");
  i.shares[cid]++;
  return null;
}
function sellShare(st, iid, cid) {
  const i = seatOf(st, iid), c = seatOf(st, cid);
  if (need(st, 2) || !(i.shares[cid] > 0)) return "팔 주식이 없어요.";
  addCoins(st, i, Math.floor(c.stock * (1 - TRADE_FEE)), `${c.name} 주식 1주 팔기`);
  i.shares[cid]--;
  return null;
}

// ---------- 봇 ----------
function hintScore(st) {
  const s = {};
  Object.keys(PRODUCTS).forEach((p) => (s[p] = 0));
  s[st.hints.a] += 3;
  s[st.hints.b] += 2;
  return s;
}
function rankedProducts(st) {
  const s = hintScore(st), noise = {};
  Object.keys(s).forEach((p) => (noise[p] = RNG()));
  return Object.keys(s).sort((a, b) => s[b] - s[a] || noise[b] - noise[a]);
}

function botPrepare(st) {
  const ranked = rankedProducts(st);
  companiesOf(st).filter((c) => c.bot).forEach((c) => {
    if (c.factories.length < MAX_SLOTS && c.coins > 600 && RNG() < 0.3) addFactory(st, c.id);
    c.factories.forEach((f, i) => {
      if (f.level < 3 && c.coins > 600 && RNG() < 0.3) upgradeFactory(st, c.id, i);
    });
    c.factories.forEach((f, i) => {
      let want = i === 0 || RNG() < 0.5 ? ranked[0] : ranked[1];
      const crowded = companiesOf(st).some((o) => o.id !== c.id && o.factories.some((g) => g.product === want));
      if (crowded && want === ranked[0] && RNG() < 0.4) want = ranked[1]; // 남들이 몰린 제품은 가끔 피한다
      f.product = want;
      const r = RNG();
      f.price = f.level >= 2 ? (r < 0.2 ? "low" : r < 0.5 ? "mid" : "high") : r < 0.3 ? "low" : r < 0.8 ? "mid" : "high";
    });
    if (c.coins > 300 && RNG() < 0.3) toggleSecure(st, c.id);
    if (c.coins > 300 && RNG() < 0.4) useCard(st, c.id, pick(c.hand));
  });
}

function botSpy(st) {
  const cs = companiesOf(st);
  st.seats.filter((s) => s.bot).forEach((s) => {
    const chance = s.role === "investor" ? 0.4 : 0.2;
    const targets = cs.filter((c) => c.id !== s.id);
    if (RNG() < chance && s.coins >= SPY_COST + 100 && targets.length) spyOn(st, s.id, pick(targets).id);
  });
}

function botInvest(st) {
  const score = hintScore(st);
  investorsOf(st).filter((i) => i.bot).forEach((i) => {
    const fits = companiesOf(st).map((c) => {
      const info = st.spy[i.id] && st.spy[i.id][c.id];
      const fit = info && !info.blocked
        ? info.factories.reduce((n, f) => n + (f.product ? score[f.product] : 0), 0)
        : c.factories.length * 2;
      return { c, fit };
    }).sort((a, b) => b.fit - a.fit);
    const best = fits[0];
    if (best.fit >= 3 && RNG() < 0.8) {
      for (let n = 0; n < 2; n++) buyShare(st, i.id, best.c.id);
    }
    fits.forEach(({ c, fit }) => {
      if (fit <= 1 && i.shares[c.id] > 0 && RNG() < 0.6) sellShare(st, i.id, c.id);
    });
  });
}

// ---------- 돌발 이벤트 · 정산 ----------
function rollEvent(st) {
  st.event = null;
  if (RNG() >= EVENT_CHANCE) return;
  const id = pick(Object.keys(EVENTS));
  if (id === "niche") {
    const product = pick(Object.keys(PRODUCTS).filter((k) => k !== st.truth));
    st.event = { id, title: EVENTS.niche.title, product, text: `${PRODUCTS[product].icon} ${PRODUCTS[product].name} 수요가 +${NICHE_BONUS} 늘었어요!` };
  } else {
    st.event = { id, ...EVENTS[id] };
  }
}

// 판매 공식: 제품마다 손님 수(수요)는 정해져 있고, 그 손님을 가격과 품질(공장 레벨)로 나눠 갖는다.
//   내 손님 = 손님 수 × 내 몫,  내 몫 = 내 가중치 ÷ 같은 제품 공장들의 가중치 합
//   가중치 = 가격 가중치(저가 3 · 적정가 2 · 고가 1) × 품질(공장 레벨)
//   판 개수 = 작은 쪽( 가진 수량 , 내 손님 )  (가진 수량 = 이번에 만든 개수 + 지난 재고)
//   (광고·방해 카드는 내 손님을 늘리거나 줄인다)
// 경쟁 과열: 같은 제품을 만드는 공장이 하나 더 있을 때마다 판매 가격이 내려간다.
// 재고: 팔리지 않은 제품은 다음 턴으로 넘어간다(보관비가 든다). 만드는 비용은 만들 때 낸다.
function settle(st) {
  const cs = companiesOf(st), ev = st.event;
  const demand = {};
  Object.keys(PRODUCTS).forEach((p) => (demand[p] = p === st.truth ? DEMAND_MAIN : DEMAND_BASE));
  if (ev && ev.id === "niche") demand[ev.product] += NICHE_BONUS;
  const extra = ev && ev.id === "rawcost" ? 2 : 0;

  const weightSum = {}, crowd = {};
  cs.forEach((c) => c.factories.forEach((f) => {
    if (!f.product) return;
    weightSum[f.product] = (weightSum[f.product] || 0) + PRICES[f.price].weight * QUALITY[f.level];
    crowd[f.product] = (crowd[f.product] || 0) + 1;
  }));

  const res = {};
  cs.forEach((c) => {
    const r = { rows: [], revenue: 0, cost: 0, upkeep: 0, storage: 0, refund: 0, profit: 0, customers: 0, sold: 0, card: c.card || null };
    // 카드 효과
    const sabotaged = cs.filter((o) => o.id !== c.id && o.card === "sabotage").length;
    const mult = (c.card === "ad" ? 1.3 : 1) * Math.pow(0.85, sabotaged);
    const rush = c.card === "rush" ? 10 : 0;
    const disc = c.card === "discount" ? 2 : 0;

    const inv = { ...(c.inventory || {}) };
    const carriedUsed = {}, leftovers = {};
    c.factories.forEach((f, i) => {
      let u = UPKEEP[f.level];
      if (ev && ev.id === "regulation" && f.level >= 2) u *= 2;
      r.upkeep += u;
      if (!f.product) { r.rows.push({ idx: i, level: f.level, idle: true }); return; }
      const p = PRICES[f.price];
      const share = Math.floor((demand[f.product] * p.weight * QUALITY[f.level] * mult) / weightSum[f.product]); // 내 손님 수
      const produced = CAP[f.level] + rush;
      const carried = carriedUsed[f.product] ? 0 : inv[f.product] || 0; // 남은 재고는 첫 공장이 맡아 판다
      carriedUsed[f.product] = true;
      const have = produced + carried;
      const sold = Math.min(have, share);
      leftovers[f.product] = (leftovers[f.product] || 0) + (have - sold);
      const penalty = Math.min(CROWD_MAX, (crowd[f.product] - 1) * CROWD_PENALTY);
      const price = Math.max(CROWD_MIN_PRICE, p.price - penalty);
      const unit = Math.max(1, UNIT_COST[f.level] + extra - disc);
      r.rows.push({ idx: i, level: f.level, product: f.product, tier: f.price, base: p.price, price, penalty: p.price - price, share, produced, carried, have, sold, left: have - sold, unit });
      r.revenue += sold * price;
      r.cost += produced * unit;
      r.customers += share;
      r.sold += sold;
    });
    // 새 재고: 이번에 만든 제품은 남은 만큼, 안 만든 제품은 그대로. 한도를 넘으면 버린다.
    const next = {};
    Object.keys(inv).forEach((k) => { if (!(k in leftovers)) next[k] = inv[k]; });
    Object.keys(leftovers).forEach((k) => (next[k] = leftovers[k]));
    let kept = 0;
    Object.keys(next).forEach((k) => {
      next[k] = Math.min(INV_MAX, next[k]);
      if (next[k] <= 0) delete next[k]; else kept += next[k];
    });
    c.inventory = next;
    r.storage = kept * INV_FEE;
    r.profit = r.revenue - r.cost - r.upkeep - r.storage;
    if (c.card === "insurance" && r.profit < 0) { r.refund = Math.floor(-r.profit * 0.7); r.profit += r.refund; }
    res[c.id] = r;
  });

  const dividends = {};
  cs.forEach((c) => {
    const r = res[c.id];
    addCoins(st, c, r.profit, "이번 턴 정산");
    const per = r.profit > 0 ? Math.floor((r.profit * DIVIDEND_RATE) / SHARES) : 0;
    r.perShare = per;
    investorsOf(st).forEach((i) => {
      const pay = per * (i.shares[c.id] || 0);
      if (pay > 0) {
        addCoins(st, c, -pay, "배당금 지급");
        addCoins(st, i, pay, `${c.name} 배당금`);
        dividends[i.id] = (dividends[i.id] || 0) + pay;
      }
    });
    const pct = Math.max(-STOCK_DOWN_MAX, Math.min(STOCK_UP_MAX, r.profit / STOCK_PCT_DIV));
    const old = c.stock;
    c.stock = Math.max(20, Math.round(old * (1 + pct)));
    c.lastChange = c.stock - old;
    r.stockFrom = old; r.stockTo = c.stock;
  });
  // 이번 턴 얼마 벌었나: 기업은 정산 이익, 투자자는 자산(코인+주식 값)이 늘어난 만큼
  const gain = {};
  st.seats.forEach((x) => {
    gain[x.id] = x.role === "company" ? res[x.id].profit : worthOf(st, x) - (x.worthStart === undefined ? worthOf(st, x) : x.worthStart);
  });
  const totalCustomers = cs.reduce((n, c) => n + res[c.id].customers, 0);
  st.result = { truth: st.truth, event: ev, companies: res, dividends, gain, totalCustomers };
}

function advance(st) {
  if (st.over) return;
  if (st.phase === 0) { st.phase = 1; botPrepare(st); } // 봇은 새 단계가 열린 뒤에 행동한다
  else if (st.phase === 1) { botSpy(st); st.phase = 2; botInvest(st); }
  else if (st.phase === 2) { rollEvent(st); st.phase = 3; }
  else if (st.phase === 3) { settle(st); st.phase = 4; }
  else if (st.turn >= TOTAL_TURNS) st.over = true;
  else { st.turn++; startTurn(st); }
  st.ready = {};
}

// ---------- 여러 명이 함께 할 때: 사람이 보낸 행동을 판에 적용 ----------
// 방장의 브라우저만 이 함수를 부른다. 보낸 사람(uid)이 정말 그 자리의 주인인지 여기서 확인한다.
function applyAction(st, uid, a) {
  const s = st.seats.find((x) => x.uid === uid && !x.bot);
  if (!s) return;
  if (a.type === "leave") { s.bot = true; s.uid = null; delete st.ready[s.id]; return; } // 나가면 봇이 이어받는다
  if (a.turn !== st.turn || a.phase !== st.phase) return; // 이미 지난 단계의 행동은 무시
  const isCo = s.role === "company", isInv = s.role === "investor";
  const cid = a.c, validCo = companiesOf(st).some((c) => c.id === cid);
  switch (a.type) {
    case "setFactory":
      if (isCo && Number.isInteger(a.i) && PRICES[a.price] && (!a.product || PRODUCTS[a.product])) setFactory(st, s.id, a.i, a.product, a.price);
      break;
    case "upgrade": if (isCo && Number.isInteger(a.i)) upgradeFactory(st, s.id, a.i); break;
    case "addfac": if (isCo) addFactory(st, s.id); break;
    case "secure": if (isCo) toggleSecure(st, s.id); break;
    case "card": if (isCo && CARDS[a.c]) useCard(st, s.id, a.c); break;
    case "spy": if (validCo) spyOn(st, s.id, cid); break;
    case "buy": if (isInv && validCo) buyShare(st, s.id, cid); break;
    case "sell": if (isInv && validCo) sellShare(st, s.id, cid); break;
    case "ready": st.ready[s.id] = true; break;
    case "unready": delete st.ready[s.id]; break;
  }
}

// 사람이 모두 "준비 완료"를 누르면 다음 단계로 넘어간다.
function tryAdvance(st) {
  const humans = st.seats.filter((s) => !s.bot);
  if (!st.over && humans.length && humans.every((s) => st.ready[s.id])) { advance(st); return true; }
  return false;
}

// 마지막 순위: 코인 + 주식 값(투자자) / 코인 + 공장에 쓴 돈(기업)
function finalScores(st) {
  return st.seats.map((s) => {
    let worth = s.coins;
    if (s.role === "investor") companiesOf(st).forEach((c) => (worth += (s.shares[c.id] || 0) * c.stock));
    else {
      s.factories.forEach((f, i) => { worth += (i > 0 ? NEW_SLOT_COST : 0) + (f.level >= 2 ? 200 : 0) + (f.level >= 3 ? 300 : 0); });
      if (OWNER_SHARES_COUNT) worth += freeShares(st, s.id) * s.stock; // 안 팔린 주식은 회사 주인 몫
    }
    return { seat: s, worth };
  }).sort((a, b) => b.worth - a.worth);
}

if (typeof module !== "undefined") {
  module.exports = { newGame, advance, applyAction, tryAdvance, setFactory, upgradeFactory, addFactory, toggleSecure, useCard, spyOn, buyShare, sellShare, finalScores, settle, seatOf, setRng: (f) => (RNG = f) };
}
