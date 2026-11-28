/* =========================================================
 * main.js — 게임 전체 흐름
 *  타이틀 → 모험(방 1~4, 방마다 보상 고르기) → 5층 밴시 → 승리/패배
 *  또는 타이틀 → 연습장
 * ========================================================= */

let G = null;            // 지금 게임 상태 (없으면 타이틀 화면)
let titleTime = 0;

function newGame(mode) {
  return {
    mode,                 // 'run' 모험 / 'practice' 연습장
    state: 'play',        // 'play' 'reward' 'pause' 'over' 'win'
    time: 0, now: 0,
    player: createPlayer(mode === 'practice' ? SPELLS.map(s => s.id) : STARTING_SPELLS),
    enemies: [], shots: [], hostile: [],
    particles: [], texts: [], lines: [], rings: [], anims: [],
    shake: 0, wailFlash: 0,
    roomIndex: 0, waveIndex: 0, spawnQueue: [], clearT: 0,
    boss: null, victoryT: 0, banner: null, rewards: [],
    mastery: loadMastery(),
    stats: { casts: 0, perfect: 0, combos: 0, fails: 0, breaks: 0, kills: 0, damage: 0 },
  };
}

// ---------- 화면 전환 ----------
function goTitle() {
  G = null;
  Practice.close();
  Overlay.title();
}

function startRun() {
  Practice.close();
  Overlay.hide();
  G = newGame('run');
  startRoom();
}

function startPractice() {
  Overlay.hide();
  G = newGame('practice');
  G.player.support.target = null;
  spawnEnemy(G, 'dummy', 1, 1000);
  Practice.open();
}

function resumeGame() {
  if (G && G.state === 'pause') { G.state = 'play'; Overlay.hide(); }
}

// ---------- 방 진행 ----------
function startRoom() {
  const room = ROOMS[G.roomIndex];
  G.enemies = []; G.shots = []; G.hostile = [];
  G.waveIndex = 0; G.spawnQueue = []; G.clearT = 0;
  G.player.x = 300;
  if (room.boss) {
    spawnBoss(G);
    G.banner = { text: room.name, sub: '보호막을 복합 마법으로 깨고, 노출된 마법진을 노려라!', t: 3 };
  } else {
    G.banner = { text: room.name, sub: '', t: 2 };
    spawnWave();
  }
}

function spawnWave() {
  const list = ROOMS[G.roomIndex].waves[G.waveIndex];
  // 양쪽에서 번갈아 0.7초 간격으로 등장
  G.spawnQueue = list.map((type, i) => ({ type, side: i % 2 === 0 ? 1 : -1, delay: 0.8 + i * 0.7 }));
}

function roomCleared() {
  const p = G.player;
  p.hp = Math.min(p.maxHp, p.hp + 20);
  p.mana = p.maxMana;
  G.rewards = makeRewards();
  G.state = 'reward';
  Overlay.reward(G.rewards);
}

// ---------- 보상 (마법 뽑기) ----------
function rollRarity(floor) {
  // 3층부터 영웅·전설 확률 2배
  const weights = RARITY_ORDER.map(r => RARITIES[r].chance * (floor >= 2 && (r === 'epic' || r === 'legendary') ? 2 : 1));
  let n = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) { n -= weights[i]; if (n <= 0) return RARITY_ORDER[i]; }
  return 'common';
}

function makeSpellReward(exclude) {
  const p = G.player;
  let rar = rollRarity(G.roomIndex);
  // 그 희귀도에 아직 없는 마법이 없으면 한 단계씩 내려가며 찾기
  for (let idx = RARITY_ORDER.indexOf(rar); idx >= 0; idx--) {
    const pool = SPELLS.filter(s => s.rarity === RARITY_ORDER[idx] && !p.spells.includes(s.id) && !exclude.includes(s.id));
    if (pool.length) {
      const sp = pool[Math.floor(Math.random() * pool.length)];
      return { kind: 'spell', id: sp.id, tag: `${RARITIES[sp.rarity].name} ${ELEMENTS[sp.element].icon} ${ELEMENTS[sp.element].name} 마법`,
        title: sp.name, cmd: cmdToArrows(sp.cmd, 1), desc: sp.desc, color: RARITIES[sp.rarity].color };
    }
  }
  return null;
}

function makeRewards() {
  const p = G.player;
  const opts = [];
  const taken = [];
  for (let i = 0; i < 2; i++) {
    const r = makeSpellReward(taken);
    if (r) { opts.push(r); taken.push(r.id); }
  }
  // 세 번째 칸: 도구 / 지원병 강화 / 최대 체력
  const extras = [];
  const toolIds = Object.keys(TOOLS);
  const tid = toolIds[Math.floor(Math.random() * toolIds.length)];
  if (p.tools.length < MAX_TOOLS) extras.push({ kind: 'tool', id: tid, tag: '도구', title: `${TOOLS[tid].icon} ${TOOLS[tid].name}`, desc: TOOLS[tid].desc, color: '#ffe9a8' });
  const s = p.support;
  if (s.speedLv < 3) extras.push({ kind: 'support', id: 'speed', tag: '지원병 강화', title: '빠른 손놀림', desc: `자동 입력 간격 ${supportInterval(p).toFixed(2)}초 → ${Math.max(SUPPORT.minInterval, supportInterval(p) - SUPPORT.intervalStep).toFixed(2)}초`, color: '#ffd27f' });
  if (s.displayLv < 1) extras.push({ kind: 'support', id: 'display', tag: '지원병 강화', title: '친절한 안내', desc: '다음에 넣을 방향을 크게 표시해 준다.', color: '#ffd27f' });
  if (s.manaLv < 3) extras.push({ kind: 'support', id: 'mana', tag: '지원병 강화', title: '마나 절약', desc: '지원병이 도운 마법의 마나 소모 -8%.', color: '#ffd27f' });
  extras.push({ kind: 'hp', tag: '몸 단련', title: '최대 체력 +20', desc: '최대 체력이 20 늘고 그만큼 회복한다.', color: '#ff9a9a' });
  while (opts.length < 3 && extras.length) opts.push(extras.splice(Math.floor(Math.random() * extras.length), 1)[0]);
  return opts;
}

function pickReward(i) {
  if (!G || G.state !== 'reward') return;
  const o = G.rewards[i];
  const p = G.player;
  if (o.kind === 'spell') p.spells.push(o.id);
  else if (o.kind === 'tool') p.tools.push(o.id);
  else if (o.kind === 'support') p.support[o.id + 'Lv']++;
  else if (o.kind === 'hp') { p.maxHp += 20; p.hp += 20; }
  Overlay.hide();
  G.roomIndex++;
  G.state = 'play';
  startRoom();
}

// ---------- 패배 / 승리 ----------
function onPlayerDead(G) {
  if (G.state !== 'play') return;
  G.state = 'over';
  setTimeout(() => Overlay.end(false, G), 600);
}

// ---------- 매 프레임 ----------
function update(dt) {
  G.time += dt;
  G.now = G.time * 1000;
  G.wailFlash = Math.max(0, G.wailFlash - dt);
  if (G.banner) G.banner.t -= dt;

  updatePlayer(G, dt);
  if (G.state !== 'play') return;
  updateEnemies(G, dt);
  updateShots(G, dt);
  updateHostile(G, dt);
  G.enemies = G.enemies.filter(e => !e.dead);

  // 대기 중인 적 등장
  for (const q of G.spawnQueue) {
    q.delay -= dt;
    if (q.delay <= 0) { spawnEnemy(G, q.type, q.side); q.done = true; }
  }
  G.spawnQueue = G.spawnQueue.filter(q => !q.done);

  if (G.mode === 'run') {
    const room = ROOMS[G.roomIndex];
    if (room.boss) {
      if (G.victoryT > 0) {
        G.victoryT -= dt;
        if (G.victoryT <= 0) { G.state = 'win'; Overlay.end(true, G); }
      }
    } else if (G.enemies.length === 0 && G.spawnQueue.length === 0) {
      G.clearT += dt;
      if (G.clearT > 0.8) {
        G.clearT = 0;
        G.waveIndex++;
        if (G.waveIndex < room.waves.length) spawnWave();
        else roomCleared();
      }
    }
  }
}

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(1 / 30, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  try {
    if (G) {
      if (G.state === 'play') update(dt);
      updateFx(G, dt);
      drawGame(G);
    } else {
      titleTime += dt;
      drawTitleBackground(titleTime);
    }
  } catch (err) {
    // 오류가 나면 화면에 보여 줘서 원인을 찾기 쉽게
    console.error(err);
    const box = document.getElementById('error');
    box.hidden = false;
    box.textContent = '오류: ' + err.message + ' (F12 → Console 에서 자세히 볼 수 있어요)';
  }
  endFrameInput();
  requestAnimationFrame(frame);
}

// Esc: 일시정지 / 연습장 나가기
window.addEventListener('keydown', e => {
  if (e.code !== 'Escape' || !G) return;
  if (G.mode === 'practice') { goTitle(); return; }
  if (G.state === 'play') { G.state = 'pause'; Overlay.pause(); }
  else if (G.state === 'pause') resumeGame();
});

goTitle();
requestAnimationFrame(frame);
