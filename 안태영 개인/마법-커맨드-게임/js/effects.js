/* =========================================================
 * effects.js — 마법이 실제로 "나가는" 부분
 *  - castEffect   : 마법 모양(shape)에 맞게 투사체·폭발·장판 등을 만든다
 *  - updateShots  : 만들어진 마법을 움직이고 적과 부딪히면 피해를 준다
 *  - damageEnemy  : 피해 계산, 속성 상호작용, 상태이상
 *  - FX           : 숫자 글자, 파티클 같은 화면 효과
 * ========================================================= */

// ---------- 작은 도우미 함수들 ----------
function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rectOf(e) { return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h }; }   // e.x=가운데, e.y=발
function centerOf(e) { return { x: e.x, y: e.y - e.h / 2 }; }
function playerRect(p) { const h = p.crouch ? 44 : 62; return { x: p.x - 16, y: p.y - h, w: 32, h }; }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function circleRect(cx, cy, r, rc) {
  const nx = clamp(cx, rc.x, rc.x + rc.w), ny = clamp(cy, rc.y, rc.y + rc.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// 가장 가까운 적 (frontOnly 면 바라보는 쪽만)
function nearestEnemy(G, x, y, facing, maxDist, frontOnly) {
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const c = centerOf(e);
    const dx = c.x - x;
    if (frontOnly && dx * facing < -20) continue;
    const d = Math.hypot(dx, c.y - y);
    if (d < maxDist && d < bd) { bd = d; best = e; }
  }
  return best;
}

// ---------- 화면 효과 ----------
const FX = {
  text(G, x, y, msg, color = '#fff', size = 18, life = 0.9) {
    G.texts.push({ x, y, msg, color, size, life, max: life });
  },
  burst(G, x, y, color, n = 12, speed = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = rand(speed * 0.3, speed);
      G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, color, size: rand(2, 5) });
    }
  },
  ring(G, x, y, r, color) { G.rings.push({ x, y, r, color, life: 0.35, max: 0.35 }); },
  lightning(G, x1, y1, x2, y2, color) { G.lines.push({ x1, y1, x2, y2, color, life: 0.2, max: 0.2 }); },
};

// ---------- 피해 계산 ----------
function hitCircle(G, x, y, r, src) {
  for (const e of G.enemies) {
    if (!e.dead && circleRect(x, y, r, rectOf(e))) damageEnemy(G, e, src.dmg, src);
  }
}

function applyStatus(e, status, mul) {
  for (const k in status) {
    let t = status[k] * mul;
    if (e.isBoss) {
      if (k === 'slow') continue;                         // 보스는 둔화 무시
      if (k === 'shock' || k === 'freeze') {
        if (e.shield > 0) continue;                       // 보호막이 있으면 경직 무시
        t *= 0.3;                                         // 보스는 경직 30%만
      }
    }
    e.status[k] = Math.max(e.status[k] || 0, t);
  }
}

/* 속성 상호작용
 *  전기 → 젖은 적 : 피해 ×1.5 (감전 증폭), 젖음 해제
 *  불   → 언 적   : 피해 ×2 (융해), 빙결 해제
 *  불   → 젖은 적 : 피해 ×0.75 (증발), 젖음 해제   ← 물 다음 불은 손해! (대신 '증기' 복합 마법이 있음)
 *  바람 → 불타는 적: 주변 적에게 화상이 번짐
 */
function damageEnemy(G, e, amount, src) {
  if (e.dead) return;
  const st = e.status;
  const el = src.element;
  let dmg = amount;
  let tag = null;

  if (el === 'electric' && st.wet > 0) { dmg *= 1.5; st.wet = 0; tag = '감전 증폭!'; }
  else if (el === 'fire' && st.freeze > 0) { dmg *= 2; st.freeze = 0; tag = '융해!'; }
  else if (el === 'fire' && st.wet > 0) { dmg *= 0.75; st.wet = 0; tag = '증발…'; }
  if (el === 'wind' && st.burn > 0) {
    for (const o of G.enemies) {
      if (o !== e && !o.dead && Math.abs(o.x - e.x) < 170) o.status.burn = Math.max(o.status.burn, st.burn);
    }
    tag = '불길 확산!';
  }

  if (e.def.weak === el) dmg *= 1.5;
  else if (e.def.resist === el) dmg *= 0.6;

  if (e.isBoss) dmg = bossModifyDamage(G, e, dmg, src);

  if (src.status) applyStatus(e, src.status, src.statusMul || 1);
  if (src.knock && !e.isBoss) {
    const dir = src.dir || Math.sign(e.x - G.player.x) || 1;
    e.kx = dir * src.knock * (e.type === 'golem' ? 0.4 : 1);
  }

  dmg = Math.round(dmg);
  e.hp -= dmg;
  e.flash = 0.12;
  G.stats.damage += dmg;
  const color = src.isCombo ? '#ffd84a' : (ELEMENTS[el] ? ELEMENTS[el].color : '#fff');
  FX.text(G, e.x + rand(-12, 12), e.y - e.h - 8, String(dmg), color, src.isCombo ? 30 : 18);
  if (tag) FX.text(G, e.x, e.y - e.h - 34, tag, '#ffffff', 16);
  Sound.hit();
  if (e.hp <= 0) killEnemy(G, e);
}

// 효과 없이 바로 깎는 피해 (화상 지속 피해)
function directDamage(G, e, amount) {
  if (e.dead) return;
  if (e.isBoss && e.shield > 0) { e.shield = Math.max(0, e.shield - amount * 0.5); return; }
  e.hp -= amount;
  FX.text(G, e.x + rand(-10, 10), e.y - e.h, String(amount), '#ff9a5a', 13, 0.6);
  if (e.hp <= 0) killEnemy(G, e);
}

function killEnemy(G, e) {
  if (e.dead) return;
  e.dead = true;
  FX.burst(G, e.x, e.y - e.h / 2, e.def.color, 22, 300);
  G.stats.kills++;
  if (e.isBoss) onBossDefeated(G);
}

// 번개 내려치기 그림 + 맞은 자리에 전기 스파크. 그림이 없으면 false.
// 원래 10fps 반복 시트지만, 피해가 바로 들어가므로 한 번만 빠르게(22fps) 재생해 맞는 순간과 맞춘다.
function strikeAnim(G, x, bottomY, element) {
  if (!playAnim(G, 'strike', x, bottomY + 6, { anchor: 'bottom', scale: 2.2, fps: 22, life: 10 / 22 })) return false;
  if (element === 'electric') playAnim(G, 'spark', x, bottomY - 60, { scale: 0.55, fps: 40 });
  return true;
}

/* ---------------------------------------------------------
 * castEffect: 마법을 실제로 만든다
 *  spell : SPELLS / COMBOS / BASIC_BOLT 의 항목
 *  power : 최종 위력 배율
 * --------------------------------------------------------- */
function castEffect(G, spell, power, opts = {}) {
  const p = G.player;
  const f = p.facing;
  const src = {
    element: spell.element,
    dmg: spell.dmg * power,
    status: spell.status || null,
    knock: spell.knock || 0,
    isCombo: !!opts.isCombo,
    statusMul: opts.statusMul || 1,
    dir: f,
  };
  const cx = p.x + f * 24, cy = p.y - 38;   // 손 위치
  const color = ELEMENTS[spell.element].color;

  // 땅 위의 목표 지점: 앞쪽 가장 가까운 적, 없으면 정해진 거리
  const groundTarget = (dist) => {
    const t = nearestEnemy(G, p.x, cy, f, 700, true);
    return t ? t.x : p.x + f * dist;
  };

  switch (spell.shape) {
    case 'bolt': {
      // 앞쪽 가장 가까운 적을 향해 살짝 조준 (위아래 각도 제한)
      const t = nearestEnemy(G, cx, cy, f, 1000, true);
      let ang = 0;
      if (t) { const c = centerOf(t); ang = clamp(Math.atan2(c.y - cy, Math.abs(c.x - cx)), -0.9, 0.9); }
      G.shots.push({ kind: 'bolt', x: cx, y: cy, vx: Math.cos(ang) * spell.speed * f, vy: Math.sin(ang) * spell.speed,
        r: spell.size, pierce: spell.pierce || 0, explode: spell.explode || 0, hit: new Set(), life: 1.8, color,
        sprite: spell.element === 'wind' ? 'windFly' : null, ...src });
      break;
    }
    case 'blast': {
      const t = nearestEnemy(G, p.x, cy, f, 750, true);
      const x = t ? t.x : p.x + f * spell.dist;
      const y = t ? centerOf(t).y : GROUND - 40;
      const anim = spell.element === 'fire' &&
        playAnim(G, 'fireBomb', x, y, { scale: spell.radius * 2 / 58, chargeTime: spell.delay, chargeFrames: 7 });
      G.shots.push({ kind: 'blast', x, y, r: spell.radius, t: spell.delay, max: spell.delay, color, anim, ...src });
      break;
    }
    case 'wave':
      G.shots.push({ kind: 'wave', x: cx, y: GROUND, vx: f * spell.speed, w: spell.w, h: spell.h, life: spell.life, max: spell.life,
        multiHit: spell.multiHit || 0, hitTimes: new Map(), color, ...src });
      break;
    case 'zone': {
      const x = spell.dist === 0 ? p.x : groundTarget(spell.dist);
      G.shots.push({ kind: 'zone', x, y: GROUND - 40, r: spell.radius, life: spell.life, max: spell.life, tick: spell.tick, timer: 0,
        pull: spell.pull || 0, color, ...src });
      break;
    }
    case 'strike': {
      // 가까운 적부터 count 명에게 번개
      const targets = G.enemies.filter(e => !e.dead && Math.abs(e.x - p.x) <= spell.range)
        .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, spell.count);
      if (targets.length === 0) {
        const x = p.x + f * 200;
        if (!strikeAnim(G, x, GROUND, spell.element)) FX.lightning(G, x, 0, x, GROUND, color);
      }
      for (const t of targets) {
        const c = centerOf(t);
        if (!strikeAnim(G, c.x, t.y, spell.element)) FX.lightning(G, c.x + rand(-30, 30), 0, c.x, c.y, color);
        FX.burst(G, c.x, c.y, color, 10);
        if (spell.radius) hitCircle(G, c.x, c.y, spell.radius, src);
        else damageEnemy(G, t, src.dmg, src);
      }
      break;
    }
    case 'chain': {
      let cur = nearestEnemy(G, cx, cy, f, spell.range, false);
      let fromX = cx, fromY = cy, dmg = src.dmg;
      const hit = new Set();
      for (let j = 0; j <= spell.jumps && cur; j++) {
        const c = centerOf(cur);
        FX.lightning(G, fromX, fromY, c.x, c.y, color);
        playAnim(G, 'spark', c.x, c.y, { scale: 0.5, fps: 40 });
        hit.add(cur);
        damageEnemy(G, cur, dmg, src);
        dmg *= 0.85;   // 튈 때마다 15% 약해짐
        fromX = c.x; fromY = c.y;
        let next = null, nd = Infinity;
        for (const e of G.enemies) {
          if (e.dead || hit.has(e)) continue;
          const ec = centerOf(e);
          const d = Math.hypot(ec.x - c.x, ec.y - c.y);
          if (d < spell.jumpRange && d < nd) { nd = d; next = e; }
        }
        cur = next;
      }
      break;
    }
    case 'cone': {
      for (const e of G.enemies) {
        if (e.dead) continue;
        const c = centerOf(e);
        const dx = (c.x - p.x) * f;
        if (dx >= -10 && dx <= spell.range && Math.abs(c.y - cy) < 230) damageEnemy(G, e, src.dmg, src);
      }
      for (let k = 0; k < 6; k++) {
        playAnim(G, 'windFly', cx, cy + (k - 2.5) * 32, { scale: 2.2, flip: f, vx: f * 1000, life: 0.38, t: k * 0.04 });
      }
      for (let k = 0; k < 30; k++) {
        G.particles.push({ x: cx, y: cy + rand(-60, 60), vx: f * rand(500, 900), vy: rand(-80, 80), life: 0.4, max: 0.4, color, size: rand(2, 4) });
      }
      break;
    }
    case 'dash':
      p.dash = { t: 0.22, speed: spell.distance / 0.22, hit: new Set(), src, color };
      p.invuln = Math.max(p.invuln, 0.3);
      break;
    case 'rain':
      G.shots.push({ kind: 'rain', left: spell.count, timer: 0, interval: 0.09, color, ...src });
      break;
  }
}

// ---------- 매 프레임: 마법 움직이기 ----------
function updateShots(G, dt) {
  for (const s of G.shots) {
    switch (s.kind) {
      case 'bolt': {
        s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
        for (const e of G.enemies) {
          if (e.dead || s.hit.has(e)) continue;
          if (!circleRect(s.x, s.y, s.r, rectOf(e))) continue;
          s.hit.add(e);
          if (s.explode) {
            hitCircle(G, s.x, s.y, s.explode, s);
            if (!playAnim(G, 'fireBomb', s.x, s.y, { scale: s.explode * 2 / 58, startFrame: 7 })) FX.ring(G, s.x, s.y, s.explode, s.color);
            FX.burst(G, s.x, s.y, s.color, 12, 260);
            s.dead = true;
          } else {
            if (s.sprite === 'windFly') playAnim(G, 'windExplode', s.x, s.y, { scale: 1 + s.r / 10, flip: Math.sign(s.vx) || 1 });
            damageEnemy(G, e, s.dmg, s);
            if (s.pierce <= 0) s.dead = true; else s.pierce--;
          }
          break;
        }
        if (s.life <= 0 || s.x < -60 || s.x > W + 60 || s.y < -60 || s.y > H) s.dead = true;
        break;
      }
      case 'blast':
        s.t -= dt;
        if (s.t <= 0) {
          hitCircle(G, s.x, s.y, s.r, s);
          FX.burst(G, s.x, s.y, s.color, s.anim ? 14 : 30, 380);
          if (!s.anim) FX.ring(G, s.x, s.y, s.r, s.color);
          G.shake = Math.max(G.shake, 6);
          Sound.boom();
          s.dead = true;
        }
        break;
      case 'wave': {
        s.x += s.vx * dt; s.life -= dt;
        const rc = { x: s.x - s.w / 2, y: s.y - s.h, w: s.w, h: s.h };
        for (const e of G.enemies) {
          if (e.dead || !rectsOverlap(rc, rectOf(e))) continue;
          const lastT = s.hitTimes.get(e);
          if (lastT === undefined || (s.multiHit && G.time - lastT >= s.multiHit)) {
            s.hitTimes.set(e, G.time);
            damageEnemy(G, e, s.dmg, s);
          }
        }
        if (s.life <= 0 || s.x < -150 || s.x > W + 150) s.dead = true;
        break;
      }
      case 'zone':
        s.life -= dt; s.timer -= dt;
        if (s.timer <= 0) { s.timer = s.tick; hitCircle(G, s.x, s.y, s.r, s); }
        if (s.pull) {
          for (const e of G.enemies) {
            if (!e.dead && !e.isBoss && Math.abs(e.x - s.x) < s.r * 1.3) e.x += Math.sign(s.x - e.x) * s.pull * dt;
          }
        }
        if (s.life <= 0) s.dead = true;
        break;
      case 'rain':
        s.timer -= dt;
        if (s.timer <= 0 && s.left > 0) {
          s.timer = s.interval; s.left--;
          // 절반은 적 위치를 노리고, 절반은 아무 데나
          const alive = G.enemies.filter(e => !e.dead);
          const x = (alive.length && Math.random() < 0.5) ? alive[Math.floor(Math.random() * alive.length)].x + rand(-30, 30) : rand(60, W - 60);
          if (!(s.element === 'electric' && strikeAnim(G, x, GROUND, s.element))) FX.lightning(G, x + rand(-20, 20), 0, x, GROUND, s.color);
          for (const e of alive) if (Math.abs(e.x - x) < 60) damageEnemy(G, e, s.dmg, s);
        }
        if (s.left <= 0) s.dead = true;
        break;
    }
  }
  G.shots = G.shots.filter(s => !s.dead);
}

// ---------- 매 프레임: 화면 효과 ----------
function updateFx(G, dt) {
  updateAnims(G, dt);
  for (const pt of G.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 300 * dt; pt.life -= dt; }
  for (const t of G.texts) { t.y -= 40 * dt; t.life -= dt; }
  for (const l of G.lines) l.life -= dt;
  for (const r of G.rings) r.life -= dt;
  G.particles = G.particles.filter(p => p.life > 0);
  G.texts = G.texts.filter(t => t.life > 0);
  G.lines = G.lines.filter(l => l.life > 0);
  G.rings = G.rings.filter(r => r.life > 0);
  G.shake = Math.max(0, G.shake - 30 * dt);
}

// ---------- 그리기: 플레이어 마법 ----------
function drawShots(ctx, G) {
  for (const s of G.shots) {
    ctx.save();
    switch (s.kind) {
      case 'bolt':
        if (s.sprite && Sprites.ready(s.sprite)) {
          const flip = Math.sign(s.vx) || 1;
          const a = Math.atan2(s.vy, Math.abs(s.vx));
          const sh = SHEETS[s.sprite];
          const frame = Math.floor(G.time * sh.fps) % sh.frames;
          Sprites.drawFrame(ctx, s.sprite, frame, s.x, s.y, { scale: 1 + s.r / 10, flip, rot: flip === 1 ? a : -a });
          break;
        }
        ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.arc(s.x - s.vx * 0.02, s.y - s.vy * 0.02, s.r * 0.8, 0, Math.PI * 2); ctx.fill();
        break;
      case 'blast': {
        const k = 1 - s.t / s.max;   // 0 → 1 (곧 터짐)
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.globalAlpha = (0.5 + 0.5 * k) * (s.anim ? 0.45 : 1);
        ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        if (!s.anim) {
          ctx.fillStyle = s.color; ctx.globalAlpha = 0.15 + 0.25 * k;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r * k, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'wave':
        ctx.fillStyle = s.color; ctx.globalAlpha = 0.45 * Math.min(1, s.life / 0.3 + 0.2);
        ctx.shadowColor = s.color; ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(s.x - s.w / 2, s.y);
        ctx.quadraticCurveTo(s.x - s.w / 4, s.y - s.h * 1.05, s.x + s.w / 2, s.y - s.h * 0.6 + Math.sin(G.time * 20) * 6);
        ctx.lineTo(s.x + s.w / 2, s.y);
        ctx.fill();
        break;
      case 'zone':
        ctx.translate(s.x, s.y + 30);
        ctx.scale(1, 0.35);
        ctx.rotate(G.time * 2);
        ctx.strokeStyle = s.color; ctx.lineWidth = 6; ctx.globalAlpha = 0.6 * Math.min(1, s.life);
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) {
          const a = i * Math.PI * 4 / 5;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * s.r * 0.85, Math.sin(a) * s.r * 0.85);
        }
        ctx.stroke();
        ctx.fillStyle = s.color; ctx.globalAlpha = 0.12;
        ctx.beginPath(); ctx.arc(0, 0, s.r, 0, Math.PI * 2); ctx.fill();
        break;
    }
    ctx.restore();
  }
}

function drawFx(ctx, G) {
  drawAnims(ctx, G);
  for (const l of G.lines) {
    ctx.save();
    ctx.strokeStyle = l.color; ctx.lineWidth = 3; ctx.shadowColor = l.color; ctx.shadowBlur = 14;
    ctx.globalAlpha = l.life / l.max;
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1);
    const n = 7;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      ctx.lineTo(l.x1 + (l.x2 - l.x1) * k + rand(-14, 14), l.y1 + (l.y2 - l.y1) * k + rand(-8, 8));
    }
    ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.restore();
  }
  for (const r of G.rings) {
    ctx.save();
    const k = 1 - r.life / r.max;
    ctx.strokeStyle = r.color; ctx.lineWidth = 4 * (1 - k) + 1; ctx.globalAlpha = 1 - k;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.6 + 0.6 * k), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  for (const pt of G.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life / t.max * 2);
    ctx.font = `bold ${t.size}px sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(t.msg, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.msg, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
