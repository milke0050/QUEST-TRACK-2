// 게임 규칙과 봇. 화면 코드는 여기 없다. (data.js 가 먼저 불러와져야 한다)
let RNG = Math.random; // 시험할 때 바꿔 끼울 수 있다
const pick = (arr) => arr[Math.floor(RNG() * arr.length)];
const seatOf = (st, id) => st.seats.find((s) => s.id === id);
const companiesOf = (st) => st.seats.filter((s) => s.role === "company");
const investorsOf = (st) => st.seats.filter((s) => s.role === "investor");
const heldShares = (st, cid) => investorsOf(st).reduce((n, i) => n + (i.shares[cid] || 0), 0);
const freeShares = (st, cid) => SHARES - heldShares(st, cid);

// 코인을 바꾸는 곳은 여기 하나. 내 자리면 거래 기록(1번 기능)에 남긴다.
function addCoins(st, seat, amount, reason) {
  const before = seat.coins;
  seat.coins = Math.max(0, seat.coins + amount);
  if (seat.id === st.room.mySeat && seat.coins !== before) {
    st.log.unshift({ amount: seat.coins - before, reason, coins: seat.coins });
    st.log = st.log.slice(0, 30);
  }
}

function newGame(roomName, myRole) {
  const company = (id, name) => ({
    id, role: "company", name, bot: true, coins: START_COINS,
    factories: [{ level: 1, product: null, price: "mid" }],
    secure: false, stock: START_STOCK, lastChange: 0,
  });
  const investor = (id, name) => ({
    id, role: "investor", name, bot: true, coins: START_COINS, shares: { c1: 0, c2: 0 },
  });
  const st = {
    version: 1,
    room: { name: roomName, mySeat: myRole === "company" ? "c1" : "i1" },
    seats: [company("c1", "햇살상회"), company("c2", "푸른공방"), investor("i1", "투자자 1"), investor("i2", "투자자 2")],
    turn: 1, phase: 0, over: false, log: [],
  };
  seatOf(st, st.room.mySeat).bot = false;
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
  st.event = null; st.spy = {}; st.result = null; st.news = []; st.phase = 0;
  companiesOf(st).forEach((c) => (c.secure = false));
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

// 비밀 조사: 코인을 내고 다른 회사의 공장 제품과 가격을 훔쳐본다.
function spyOn(st, spyId, targetId) {
  const s = seatOf(st, spyId), t = seatOf(st, targetId);
  if (need(st, 1) || spyId === targetId) return "지금은 조사할 수 없어요.";
  st.spy[spyId] = st.spy[spyId] || {};
  if (st.spy[spyId][targetId]) return "이미 조사했어요.";
  if (s.coins < SPY_COST) return "코인이 모자라요.";
  addCoins(st, s, -SPY_COST, `${t.name} 조사`);
  if (t.secure) {
    st.spy[spyId][targetId] = { blocked: true };
    if (t.id === st.room.mySeat) st.news.push(`🛡️ ${s.name}가 우리 회사를 조사했지만 보안으로 막았어요.`);
  } else {
    st.spy[spyId][targetId] = { factories: t.factories.map((f) => ({ product: f.product, price: f.price })) };
    if (t.id === st.room.mySeat) st.news.push(`👀 ${s.name}가 우리 회사의 공장 정보를 훔쳐봤어요!`);
  }
  return null;
}

// ---------- 투자자 행동 ----------
function buyShare(st, iid, cid) {
  const i = seatOf(st, iid), c = seatOf(st, cid);
  if (need(st, 2)) return "지금은 거래할 수 없어요.";
  if (freeShares(st, cid) <= 0) return "살 수 있는 주식이 없어요.";
  if (i.coins < c.stock) return "코인이 모자라요.";
  addCoins(st, i, -c.stock, `${c.name} 주식 1주 사기`);
  i.shares[cid]++;
  return null;
}
function sellShare(st, iid, cid) {
  const i = seatOf(st, iid), c = seatOf(st, cid);
  if (need(st, 2) || !(i.shares[cid] > 0)) return "팔 주식이 없어요.";
  addCoins(st, i, c.stock, `${c.name} 주식 1주 팔기`);
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
      f.product = i === 0 || RNG() < 0.5 ? ranked[0] : ranked[1];
      const r = RNG();
      f.price = f.level >= 2 ? (r < 0.2 ? "low" : r < 0.5 ? "mid" : "high") : r < 0.3 ? "low" : r < 0.8 ? "mid" : "high";
    });
    if (c.coins > 300 && RNG() < 0.3) toggleSecure(st, c.id);
  });
}
function botSpy(st) {
  const cs = companiesOf(st);
  st.seats.filter((s) => s.bot).forEach((s) => {
    const chance = s.role === "investor" ? 0.4 : 0.2;
    if (RNG() < chance && s.coins >= SPY_COST + 100) {
      const targets = cs.filter((c) => c.id !== s.id);
      spyOn(st, s.id, pick(targets).id);
    }
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

// 판매 공식: 판매량 = 작은 쪽( 공장 생산 능력 , 제품 수요 × 내 가격 몫 )
//   내 가격 몫 = 내 가격 가중치 ÷ 같은 제품을 만드는 모든 공장의 가중치 합
//   (저가 3 · 적정가 2 · 고가 1)
function settle(st) {
  const cs = companiesOf(st), ev = st.event;
  const demand = {};
  Object.keys(PRODUCTS).forEach((p) => (demand[p] = p === st.truth ? DEMAND_MAIN : DEMAND_BASE));
  if (ev && ev.id === "niche") demand[ev.product] += NICHE_BONUS;
  const extra = ev && ev.id === "rawcost" ? 2 : 0;

  const weightSum = {};
  cs.forEach((c) => c.factories.forEach((f) => {
    if (f.product) weightSum[f.product] = (weightSum[f.product] || 0) + PRICES[f.price].weight;
  }));

  const res = {};
  cs.forEach((c) => {
    const r = { rows: [], revenue: 0, cost: 0, upkeep: 0, profit: 0 };
    c.factories.forEach((f, i) => {
      let u = UPKEEP[f.level];
      if (ev && ev.id === "regulation" && f.level >= 2) u *= 2;
      r.upkeep += u;
      if (!f.product) { r.rows.push({ idx: i, level: f.level, idle: true }); return; }
      const p = PRICES[f.price];
      const share = Math.floor((demand[f.product] * p.weight) / weightSum[f.product]);
      const sold = Math.min(CAP[f.level], share);
      const unit = UNIT_COST[f.level] + extra;
      r.rows.push({ idx: i, level: f.level, product: f.product, tier: f.price, price: p.price, share, cap: CAP[f.level], sold, unit });
      r.revenue += sold * p.price;
      r.cost += sold * unit;
    });
    r.profit = r.revenue - r.cost - r.upkeep;
    res[c.id] = r;
  });

  const dividends = {};
  cs.forEach((c) => {
    const r = res[c.id];
    addCoins(st, c, r.profit, "이번 턴 정산");
    const per = r.profit > 0 ? Math.floor((r.profit * 0.2) / SHARES) : 0;
    r.perShare = per;
    investorsOf(st).forEach((i) => {
      const pay = per * (i.shares[c.id] || 0);
      if (pay > 0) {
        addCoins(st, c, -pay, "배당금 지급");
        addCoins(st, i, pay, `${c.name} 배당금`);
        dividends[i.id] = (dividends[i.id] || 0) + pay;
      }
    });
    const pct = Math.max(-0.3, Math.min(0.6, r.profit / 400));
    const old = c.stock;
    c.stock = Math.max(20, Math.round(old * (1 + pct)));
    c.lastChange = c.stock - old;
    r.stockFrom = old; r.stockTo = c.stock;
  });
  st.result = { truth: st.truth, event: ev, companies: res, dividends };
}

function advance(st) {
  if (st.over) return;
  if (st.phase === 0) { st.phase = 1; botPrepare(st); } // 봇은 새 단계가 열린 뒤에 행동한다
  else if (st.phase === 1) { botSpy(st); st.phase = 2; botInvest(st); }
  else if (st.phase === 2) { rollEvent(st); st.phase = 3; }
  else if (st.phase === 3) { settle(st); st.phase = 4; }
  else if (st.turn >= TOTAL_TURNS) st.over = true;
  else { st.turn++; startTurn(st); }
}

// 마지막 순위: 코인 + 주식 값(투자자) / 코인 + 공장에 쓴 돈(기업)
function finalScores(st) {
  return st.seats.map((s) => {
    let worth = s.coins;
    if (s.role === "investor") companiesOf(st).forEach((c) => (worth += (s.shares[c.id] || 0) * c.stock));
    else s.factories.forEach((f, i) => { worth += (i > 0 ? NEW_SLOT_COST : 0) + (f.level >= 2 ? 200 : 0) + (f.level >= 3 ? 300 : 0); });
    return { seat: s, worth };
  }).sort((a, b) => b.worth - a.worth);
}

if (typeof module !== "undefined") {
  module.exports = { newGame, advance, setFactory, upgradeFactory, addFactory, toggleSecure, spyOn, buyShare, sellShare, finalScores, settle, seatOf, setRng: (f) => (RNG = f) };
}
