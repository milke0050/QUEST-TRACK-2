/* =========================================================
 * enemies.js — 적과 보스(밴시)의 행동
 *  - spawnEnemy / updateEnemies : 일반 적
 *  - spawnBoss / updateBoss     : 밴시
 *  - updateHostile              : 적이 쏜 공격
 * 모든 적은 공격 전에 "예고"(빛남·글자)를 보여 준다. 피할 시간을 주기 위해서.
 * ========================================================= */

function newStatus() { return { burn: 0, wet: 0, slow: 0, shock: 0, freeze: 0 }; }

function spawnEnemy(G, type, side, x) {
  const d = ENEMIES[type];
  const e = {
    type, def: d,
    x: x !== undefined ? x : (side < 0 ? -50 : W + 50),
    y: d.fly ? rand(440, 490) : GROUND,
    w: d.w, h: d.h,
    hp: d.hp, maxHp: d.hp,
    status: newStatus(), burnTick: 0.5,
    state: 'move', t: rand(1.2, 2.4),
    flash: 0, kx: 0, vx: 0, vy: 0,
  };
  G.enemies.push(e);
  return e;
}

function updateEnemies(G, dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.isBoss) updateBoss(G, e, dt);
    else updateEnemy(G, e, dt);
  }
}

// 상태이상 시간 줄이기 + 화상 피해 (일반 적과 보스 공통)
function tickStatus(G, e, dt) {
  const st = e.status;
  for (const k in st) st[k] = Math.max(0, st[k] - dt);
  if (st.burn > 0) {
    e.burnTick -= dt;
    if (e.burnTick <= 0) { e.burnTick = 0.5; directDamage(G, e, 3); }
  }
  e.flash -= dt;
}

function updateEnemy(G, e, dt) {
  tickStatus(G, e, dt);
  if (e.dead) return;
  const st = e.status;
  const p = G.player;

  // 밀려남
  if (e.kx) {
    e.x += e.kx * dt;
    e.kx *= Math.pow(0.02, dt);
    if (Math.abs(e.kx) < 5) e.kx = 0;
  }
  e.x = clamp(e.x, -80, W + 80);

  if (st.shock > 0 || st.freeze > 0) return;   // 감전·빙결: 아무것도 못 함

  const sp = e.def.speed * (st.slow > 0 ? 0.5 : 1);
  const dx = p.x - e.x;
  const dir = Math.sign(dx) || 1;
  e.t -= dt;

  switch (e.type) {
    case 'slime':
      e.x += dir * sp * dt;
      break;

    case 'bat': {
      // 떠 있다가(hover) → 예고(tele) → 내리꽂기(dive) → 올라가기(rise)
      if (e.state === 'move') {
        const tx = p.x - dir * 140;
        e.x += Math.sign(tx - e.x) * Math.min(Math.abs(tx - e.x), sp * dt);
        e.y += (460 + Math.sin(G.time * 3 + e.x) * 20 - e.y) * 2 * dt;
        if (e.t <= 0 && Math.abs(dx) < 400) { e.state = 'tele'; e.t = 0.45; }
      } else if (e.state === 'tele') {
        if (e.t <= 0) {
          const a = Math.atan2((p.y - 30) - e.y, dx);
          e.vx = Math.cos(a) * 430 * (st.slow > 0 ? 0.5 : 1); e.vy = Math.sin(a) * 430 * (st.slow > 0 ? 0.5 : 1);
          e.state = 'dive'; e.t = 0.9;
        }
      } else if (e.state === 'dive') {
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.y >= GROUND - 5) e.y = GROUND - 5;
        if (e.t <= 0) { e.state = 'rise'; e.t = 0.8; }
      } else if (e.state === 'rise') {
        e.y += (460 - e.y) * 3 * dt;
        if (e.t <= 0) { e.state = 'move'; e.t = rand(2.0, 3.0); }
      }
      break;
    }

    case 'goblin':
      // 거리를 두고 마법탄을 쏜다
      if (e.state === 'move') {
        const ad = Math.abs(dx);
        if (ad < 300) e.x -= dir * sp * dt;
        else if (ad > 460) e.x += dir * sp * dt;
        e.x = clamp(e.x, 30, W - 30);
        if (e.t <= 0) { e.state = 'tele'; e.t = 0.7; }
      } else if (e.state === 'tele' && e.t <= 0) {
        const c = centerOf(e);
        const a = Math.atan2((p.y - 32) - c.y, p.x - c.x);
        G.hostile.push({ kind: 'orb', x: c.x, y: c.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 10, dmg: e.def.dmg, life: 4, color: '#ffb347' });
        e.state = 'move'; e.t = rand(2.3, 3.0);
      }
      break;

    case 'golem':
      // 느리게 다가오다가 땅을 내리쳐 충격파 (양쪽)
      if (e.state === 'move') {
        e.x += dir * sp * dt;
        if (e.t <= 0 && Math.abs(dx) < 500) { e.state = 'tele'; e.t = 0.85; }
      } else if (e.state === 'tele' && e.t <= 0) {
        for (const s of [-1, 1]) G.hostile.push({ kind: 'wave', x: e.x, y: GROUND, vx: s * 380, w: 36, h: 40, dmg: 14, life: 2.5, color: '#c9a36b' });
        G.shake = Math.max(G.shake, 5);
        e.state = 'move'; e.t = rand(3.2, 4.0);
      }
      break;

    case 'dummy':
      e.hp = e.maxHp;   // 연습용: 죽지 않음
      return;
  }

  // 몸통 박치기
  if (e.def.dmg > 0 && rectsOverlap(rectOf(e), playerRect(p))) hurtPlayer(G, e.def.dmg, e.x);
}

/* =========================================================
 * 밴시 (보스)
 *  1) 보호막(shield)이 있으면 본체 피해 15%만 들어간다.
 *     → 보호막은 복합 마법(×2.5)·전기(×1.3)에 약하다.
 *  2) 보호막이 깨지면 땅으로 떨어져 휘청이고, 8초 동안 마법진이 노출된다(피해 ×1.5).
 *  3) 노출이 끝나면 "마법진 복구" 영창(2.5초). 이때 120 피해를 주면 복구 실패 → 다시 노출.
 *  4) 체력 50% 이하: 분노 — 탄이 늘고, 저주(영창 느려짐) 패턴 추가.
 * 패턴: 통곡(영창 방해) · 영혼탄 · 비명파 · 망령 소환 · 저주의 속삭임
 * ========================================================= */
function spawnBoss(G) {
  const d = BANSHEE;
  const e = {
    isBoss: true, type: 'banshee', def: { name: d.name, color: '#dfe8ff', dmg: 0 },
    x: 1050, y: d.floatBottom, w: d.w, h: d.h,
    hp: d.hp, maxHp: d.hp, shield: d.shield, shieldMax: d.shield,
    status: newStatus(), burnTick: 0.5,
    state: 'idle', t: 2.5, exposed: 0, restoreDmg: 0,
    phase: 1, lastAttack: null, targetX: 1050, flash: 0, kx: 0,
  };
  G.enemies.push(e);
  G.boss = e;
  return e;
}

// 보스가 받는 피해 조정 (damageEnemy 에서 부름)
function bossModifyDamage(G, e, dmg, src) {
  if (e.shield > 0) {
    let sd = dmg;
    if (src.isCombo) sd *= BANSHEE.comboShieldMul;
    if (src.element === 'electric') sd *= 1.3;
    if (src.element === 'none') sd *= 0.4;
    e.shield -= sd;
    if (e.shield <= 0) breakBossShield(G, e);
    return dmg * BANSHEE.shieldReduce;
  }
  if (e.state === 'restore') e.restoreDmg += dmg;
  if (e.exposed > 0) return dmg * BANSHEE.exposedMul;
  return dmg;
}

function breakBossShield(G, e) {
  e.shield = 0;
  e.state = 'stagger';
  e.t = BANSHEE.staggerTime;
  e.exposed = BANSHEE.exposeTime;
  FX.text(G, e.x, e.y - e.h - 50, '보호막 파괴! 마법진 노출!', '#7ff7ff', 26, 1.6);
  FX.burst(G, e.x, e.y - e.h / 2, '#7ff7ff', 40, 420);
  Sound.shatter();
  G.shake = 10;
}

function bossPickAttack(G, e) {
  const list = ['wail', 'orbs', 'orbs', 'sonic', 'sonic'];
  if (G.enemies.filter(x => !x.dead && !x.isBoss).length < 3) list.push('summon');
  if (e.phase === 2) list.push('whisper', 'wail');
  const choices = list.filter(a => a !== e.lastAttack);
  return choices[Math.floor(Math.random() * choices.length)];
}

const BOSS_TELE = { wail: 1.1, orbs: 0.6, sonic: 0.6, summon: 0.8, whisper: 0.7 };
const BOSS_TELE_TEXT = { wail: '밴시가 숨을 들이쉰다… (Shift 대쉬로 회피!)', orbs: '영혼탄', sonic: '비명파 — 땅을 조심!', summon: '망령 소환', whisper: '저주의 속삭임' };

function updateBoss(G, e, dt) {
  tickStatus(G, e, dt);
  if (e.dead) return;
  const p = G.player;
  e.t -= dt;

  // 분노 (2페이즈)
  if (e.phase === 1 && e.hp < e.maxHp * 0.5) {
    e.phase = 2;
    FX.text(G, W / 2, 200, '밴시가 분노한다!', '#ff5a7a', 34, 2);
    Sound.wail();
  }

  // 노출 시간
  if (e.exposed > 0) e.exposed -= dt;
  if (e.shield <= 0 && e.exposed <= 0 && e.state !== 'restore' && e.state !== 'stagger') {
    e.state = 'restore'; e.t = BANSHEE.restoreTime; e.restoreDmg = 0;
    FX.text(G, e.x, e.y - e.h - 40, '마법진 복구 중! 막아라!', '#ff9ad5', 22, 1.5);
  }

  // 높이: 보호막이 없으면 땅에 내려옴 (모든 마법이 닿음)
  const targetBottom = e.shield > 0 ? BANSHEE.floatBottom + Math.sin(G.time * 2) * 18 : GROUND;
  e.y += (targetBottom - e.y) * 3 * dt;

  // 좌우 이동
  e.x += clamp(e.targetX - e.x, -220 * dt, 220 * dt);

  const stunned = e.status.shock > 0 || e.status.freeze > 0;

  switch (e.state) {
    case 'stagger':
      if (e.t <= 0) { e.state = 'idle'; e.t = 1.2; }
      break;

    case 'restore':
      if (e.restoreDmg >= BANSHEE.restoreInterrupt) {
        // 복구 실패!
        e.state = 'stagger'; e.t = 1.5; e.exposed = 4;
        FX.text(G, e.x, e.y - e.h - 40, '복구 실패! 다시 노출!', '#7ff7ff', 24, 1.5);
        Sound.shatter();
      } else if (e.t <= 0) {
        e.shieldMax = Math.round(BANSHEE.shield * (e.phase === 2 ? 1.25 : 1));
        e.shield = e.shieldMax;
        e.exposed = 0;
        e.state = 'idle'; e.t = 1.5;
        FX.text(G, e.x, e.y - e.h - 40, '보호막 재생성', '#7ff7ff', 22, 1.3);
      }
      break;

    case 'idle':
      if (stunned) break;
      if (e.t <= 0) {
        const atk = bossPickAttack(G, e);
        e.lastAttack = atk;
        e.state = 'tele_' + atk;
        e.t = BOSS_TELE[atk] * (e.phase === 2 ? 0.85 : 1);
        FX.text(G, e.x, e.y - e.h - 30, BOSS_TELE_TEXT[atk], atk === 'wail' ? '#ff6b6b' : '#e8e0ff', atk === 'wail' ? 22 : 16, BOSS_TELE[atk] + 0.3);
      }
      break;

    default:
      if (e.state.startsWith('tele_') && e.t <= 0) {
        bossDoAttack(G, e, e.state.slice(5));
        e.state = 'idle';
        e.t = (e.phase === 2 ? rand(1.2, 1.8) : rand(1.7, 2.4)) * (e.exposed > 0 ? 1.4 : 1);
        // 가끔 플레이어 반대쪽으로 이동
        if (Math.random() < 0.4) e.targetX = p.x < W / 2 ? rand(950, 1150) : rand(130, 330);
      }
  }
}

function bossDoAttack(G, e, atk) {
  const p = G.player;
  const c = centerOf(e);
  switch (atk) {
    case 'wail': {
      // 통곡: 영창 방해. 회피(무적) 중이면 피할 수 있다.
      Sound.wail();
      G.wailFlash = 0.5;
      FX.ring(G, c.x, c.y, 400, '#ff6b6b');
      if (p.invuln > 0 || p.dash) { FX.text(G, p.x, p.y - 100, '통곡 회피!', '#9dffb0', 20); break; }
      p.buffer.clear();
      if (p.chain.length) { p.chain = []; p.chainTimer = 0; }
      if (p.casting) {
        if (p.charm > 0) FX.text(G, p.x, p.y - 110, '부적이 영창을 지켰다!', '#ffe9a8', 18);
        else breakCircle(G, '통곡');
      }
      FX.text(G, p.x, p.y - 90, '영창 방해!', '#ff6b6b', 20);
      hurtPlayer(G, 6, e.x);
      break;
    }
    case 'orbs': {
      const n = e.phase === 2 ? 5 : 3;
      const base = Math.atan2((p.y - 32) - c.y, p.x - c.x);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.22;
        G.hostile.push({ kind: 'orb', x: c.x, y: c.y, vx: Math.cos(a) * 270, vy: Math.sin(a) * 270, r: 12, dmg: 10, life: 5, color: '#c7b8ff' });
      }
      break;
    }
    case 'sonic':
      for (const s of [-1, 1]) G.hostile.push({ kind: 'wave', x: e.x, y: GROUND, vx: s * 500, w: 40, h: 46, dmg: 14, life: 3, color: '#ff8fc8' });
      G.shake = Math.max(G.shake, 4);
      break;
    case 'summon':
      spawnEnemy(G, 'bat', -1);
      spawnEnemy(G, 'bat', 1);
      break;
    case 'whisper': {
      const a = Math.atan2((p.y - 32) - c.y, p.x - c.x);
      G.hostile.push({ kind: 'curse', x: c.x, y: c.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, r: 14, dmg: 4, life: 5, color: '#ff4fd8', homing: true });
      break;
    }
  }
}

function onBossDefeated(G) {
  FX.text(G, W / 2, 220, '밴시 처치!', '#ffd84a', 44, 3);
  G.victoryT = 2.0;
}

// ---------- 적의 공격 ----------
function updateHostile(G, dt) {
  const p = G.player;
  const pr = playerRect(p);
  for (const h of G.hostile) {
    if (h.homing) {
      // 천천히 플레이어 쪽으로 방향을 튼다
      const want = Math.atan2((p.y - 32) - h.y, p.x - h.x);
      const cur = Math.atan2(h.vy, h.vx);
      let diff = want - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const na = cur + clamp(diff, -1.2 * dt, 1.2 * dt);
      const sp = Math.hypot(h.vx, h.vy);
      h.vx = Math.cos(na) * sp; h.vy = Math.sin(na) * sp;
    }
    h.x += h.vx * dt; h.y += (h.vy || 0) * dt; h.life -= dt;

    let touching;
    if (h.kind === 'wave') touching = rectsOverlap({ x: h.x - h.w / 2, y: h.y - h.h, w: h.w, h: h.h }, pr);
    else touching = circleRect(h.x, h.y, h.r, pr);

    if (touching && p.invuln <= 0 && !p.dash) {
      const hurt = hurtPlayer(G, h.dmg, h.x);
      if (hurt && h.kind === 'curse') {
        p.curse = 5;
        FX.text(G, p.x, p.y - 110, '저주: 영창 느려짐', '#ff4fd8', 18);
      }
      if (hurt) h.dead = true;
    }
    if (h.life <= 0 || h.x < -80 || h.x > W + 80 || h.y > H + 40) h.dead = true;
  }
  G.hostile = G.hostile.filter(h => !h.dead);
}
