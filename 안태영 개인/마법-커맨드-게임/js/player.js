/* =========================================================
 * player.js — 플레이어: 이동, 회피, 영창, 다중 영창, 마법진 파괴,
 *             도구, 영창 지원병, 기술 숙련도
 * ========================================================= */

function createPlayer(spells) {
  return {
    x: 300, y: GROUND, facing: 1, crouch: false, kx: 0,
    hp: PLAYER_BASE.maxHp, maxHp: PLAYER_BASE.maxHp,
    mana: PLAYER_BASE.maxMana, maxMana: PLAYER_BASE.maxMana,
    invuln: 0, hitstun: 0, dodgeT: 0, dodgeCd: 0, dodgeDir: 1, dash: null,
    casting: null,            // 지금 영창 중인 마법
    queuedCast: 0,               // 영창 중에 미리 누른 Space (선입력)
    chain: [],                // 다중 영창: 최근 마법의 속성과 위력
    chainTimer: 0,
    cooldowns: {},
    vulnerable: 0,            // 마법진 파괴 페널티: 받는 피해 증가
    curse: 0,                 // 밴시 저주: 영창 시간 ×1.5
    charm: 0, hourglass: 0, amplify: false,
    tools: ['potion', 'charm'], toolIndex: 0,
    spells: spells.slice(),
    support: { target: null, ratioIndex: 2, progress: 0, timer: 0, speedLv: 0, displayLv: 0, manaLv: 0 },
    buffer: new CommandBuffer(),
  };
}

// ---------- 기술 숙련도 (브라우저 localStorage 에 저장) ----------
const MASTERY_KEY = 'command-magic-mastery';
function loadMastery() {
  try { return JSON.parse(localStorage.getItem(MASTERY_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMastery(m) {
  try { localStorage.setItem(MASTERY_KEY, JSON.stringify(m)); } catch (e) { /* 저장 실패해도 게임은 계속 */ }
}
function masteryLevel(G, id) {
  const uses = G.mastery[id] || 0;
  let lv = 0;
  MASTERY.thresholds.forEach((th, i) => { if (uses >= th) lv = i; });
  return lv;
}
function addMastery(G, id) {
  if (G.mode === 'practice') return;   // 연습장에서는 숙련도가 오르지 않음
  const before = masteryLevel(G, id);
  G.mastery[id] = (G.mastery[id] || 0) + 1;
  saveMastery(G.mastery);
  const after = masteryLevel(G, id);
  if (after > before) {
    FX.text(G, G.player.x, G.player.y - 130, `${SPELL_MAP[id].name} 숙련도 Lv${after}!`, '#9dffb0', 20, 1.5);
    Sound.levelUp();
  }
}

// ---------- 영창 지원병 ----------
function supportInterval(p) {
  return Math.max(SUPPORT.minInterval, SUPPORT.baseInterval - SUPPORT.intervalStep * p.support.speedLv);
}
// 지원병이 자동으로 입력해 줄 칸 수 (마지막 칸은 항상 플레이어 몫)
function supportAutoCount(p) {
  const s = p.support;
  if (!s.target) return 0;
  const len = SPELL_MAP[s.target].cmd.length;
  return Math.round(SUPPORT.ratios[s.ratioIndex] * (len - 1));
}
function updateSupport(G, dt) {
  const p = G.player, s = p.support;
  if (!s.target) return;
  const auto = supportAutoCount(p);
  if (s.progress > auto) s.progress = auto;
  if (s.progress < auto) {
    s.timer -= dt;
    if (s.timer <= 0) { s.progress++; s.timer = supportInterval(p); Sound.tick(); }
  }
}
function cycleSupportTarget(G) {
  const p = G.player;
  const options = [null, ...p.spells.filter(id => SPELL_MAP[id].cmd.length >= 2)];
  const i = options.indexOf(p.support.target);
  p.support.target = options[(i + 1) % options.length];
  p.support.progress = 0;
  p.support.timer = supportInterval(p);
  FX.text(G, p.x, p.y - 100, p.support.target ? `지원병: ${SPELL_MAP[p.support.target].name}` : '지원병 쉬는 중', '#ffe9a8', 16);
}
function changeSupportRatio(G, delta) {
  const s = G.player.support;
  s.ratioIndex = clamp(s.ratioIndex + delta, 0, SUPPORT.ratios.length - 1);
}

// ---------- 매 프레임 ----------
function updatePlayer(G, dt) {
  const p = G.player;
  const now = G.now;

  // 타이머 줄이기
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitstun = Math.max(0, p.hitstun - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.vulnerable = Math.max(0, p.vulnerable - dt);
  p.curse = Math.max(0, p.curse - dt);
  p.charm = Math.max(0, p.charm - dt);
  p.hourglass = Math.max(0, p.hourglass - dt);
  p.queuedCast = Math.max(0, p.queuedCast - dt);
  for (const k in p.cooldowns) p.cooldowns[k] = Math.max(0, p.cooldowns[k] - dt);
  if (p.chainTimer > 0) {
    p.chainTimer -= dt;
    if (p.chainTimer <= 0) p.chain = [];
  }

  // 마나 회복 (영창 중엔 느리게)
  if (G.mode === 'practice') p.mana = p.maxMana;
  p.mana = Math.min(p.maxMana, p.mana + PLAYER_BASE.manaRegen * (p.casting ? 0.4 : 1) * dt);

  // 바라보는 방향: 가장 가까운 적 쪽 (격투게임처럼 자동). 영창 중에는 고정.
  if (!p.casting && !p.dash) {
    const t = nearestEnemy(G, p.x, p.y - 30, 1, 99999, false);
    if (t && Math.abs(t.x - p.x) > 12) p.facing = Math.sign(t.x - p.x);
    else if (!t) {
      if (isDown('KeyD') && !isDown('KeyA')) p.facing = 1;
      if (isDown('KeyA') && !isDown('KeyD')) p.facing = -1;
    }
  }

  // 커맨드 버퍼에 방향 기록 (영창 중에도 기록 → 다음 마법을 미리 입력 가능)
  const dir = readDirection(p.facing);
  p.buffer.update(dir, now);
  p.crouch = isDown('KeyS');

  // 밀려남
  if (p.kx) { p.x += p.kx * dt; p.kx *= Math.pow(0.01, dt); if (Math.abs(p.kx) < 5) p.kx = 0; }

  // 움직임: 돌진 > 회피 > 영창 > 걷기
  if (p.dash) {
    const d = p.dash;
    d.t -= dt;
    p.x += p.facing * d.speed * dt;
    const rc = { x: p.x - 40, y: p.y - 90, w: 80, h: 90 };
    for (const e of G.enemies) {
      if (!e.dead && !d.hit.has(e) && rectsOverlap(rc, rectOf(e))) { d.hit.add(e); damageEnemy(G, e, d.src.dmg, d.src); }
    }
    G.particles.push({ x: p.x, y: p.y - rand(10, 60), vx: -p.facing * 200, vy: 0, life: 0.3, max: 0.3, color: d.color, size: 4 });
    if (d.t <= 0) p.dash = null;
  } else if (p.dodgeT > 0) {
    p.dodgeT -= dt;
    p.x += p.dodgeDir * PLAYER_BASE.dodgeSpeed * dt;
  } else if (p.casting) {
    p.casting.t -= dt;
    if (p.casting.t <= 0) finishCast(G);
  }
  // 걷기 (그림에서 걷는 흔들림을 보여 주려고 walking 을 기록)
  p.walking = false;
  if (!p.dash && p.dodgeT <= 0 && !p.casting && p.hitstun <= 0 && !p.crouch) {
    const mx = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);   // 이동: A / D
    p.x += mx * PLAYER_BASE.speed * dt;
    p.walking = mx !== 0;
  }
  if (p.walking) p.walkT = (p.walkT || 0) + dt;
  p.x = clamp(p.x, 30, W - 30);

  // 버튼
  if (dashPressed()) dodge(G);   // 대쉬: Shift
  if (wasPressed('Space')) {
    if (p.casting || p.hitstun > 0 || p.dodgeT > 0 || p.dash) p.queuedCast = 0.2;   // 선입력
    else tryCast(G);
  } else if (p.queuedCast > 0 && !p.casting && p.hitstun <= 0 && p.dodgeT <= 0 && !p.dash) {
    p.queuedCast = 0;
    tryCast(G);
  }
  if (wasPressed('KeyC')) useTool(G);
  if (wasPressed('KeyV') && p.tools.length) p.toolIndex = (p.toolIndex + 1) % p.tools.length;
  if (wasPressed('Tab')) cycleSupportTarget(G);
  if (wasPressed('BracketLeft')) changeSupportRatio(G, -1);
  if (wasPressed('BracketRight')) changeSupportRatio(G, 1);

  updateSupport(G, dt);
  updatePrecast(G, dt);
}

/* ---------- 마법진 전개 (화살표를 넣는 동안 마법진이 조금씩 펼쳐짐) ----------
 * 최근에 이어서 넣은 화살표(간격 0.6초 이내)가 어떤 마법 커맨드의 앞부분과 맞으면
 * 맞은 칸 수만큼 마법진이 커지고, 그 마법의 속성 색을 띤다.
 * 맞는 마법이 없으면 마법진이 흩어진다.
 * Space 로 영창을 시작하면 그 크기에서 이어서 끝까지 커진다.
 */
function updatePrecast(G, dt) {
  const p = G.player, now = G.now;
  const ents = p.buffer.list.filter(e => e.d !== 5);
  const dirs = [];
  const last = ents[ents.length - 1];
  if (last && (now - last.t < 700 || p.buffer.lastDir !== 5)) {
    dirs.unshift(last.d);
    let t = last.t;
    for (let i = ents.length - 2; i >= 0; i--) {
      if (t - ents[i].t > 600) break;
      dirs.unshift(ents[i].d);
      t = ents[i].t;
    }
  }
  // 입력의 끝부분이 어떤 마법 커맨드의 앞부분과 가장 길게 맞는지
  let best = null, level = 0;
  for (const id of p.spells) {
    const cmd = SPELL_MAP[id].cmd;
    for (let k = Math.min(dirs.length, cmd.length); k >= 1; k--) {
      if (dirs.slice(-k).join() === cmd.slice(0, k).join()) {
        // 더 많이 맞았거나, 같은 칸 수면 커맨드를 다 채운 마법을 우선
        if (k > level || (k === level && best && k === cmd.length && best.cmd.length !== k)) { best = SPELL_MAP[id]; level = k; }
        break;
      }
    }
  }

  let targetR = 0, el = best ? best.element : 'none', runes = level;
  if (p.casting) {
    const c = p.casting;
    const progress = 1 - c.t / c.total;
    // 영창 중에는 줄어들지 않고, 펼쳐 둔 크기에서 이어서 커진다
    targetR = Math.max(p.circleR || 0, (26 + c.stage * 10) * (0.45 + 0.55 * progress));
    el = c.combo ? c.combo.element : c.spell.element;
    runes = c.combo ? 8 : 6;
  } else if (level > 0) {
    targetR = Math.min(30, 7 + 6 * level);
  }
  p.circleR = (p.circleR || 0) + (targetR - (p.circleR || 0)) * Math.min(1, dt * (targetR > (p.circleR || 0) ? 7 : 5));
  if (targetR > 0) { p.circleEl = el; p.circleRunes = runes; }
}

// ---------- 대쉬 (회피) ----------
function dodge(G) {
  const p = G.player;
  if (p.dodgeCd > 0 || p.dash) return;
  if (p.casting) {
    // 스스로 취소하면 마법진 파괴 페널티 없이 마나 절반만 돌려받음
    p.mana += p.casting.mana * 0.5;
    p.casting = null;
    FX.text(G, p.x, p.y - 90, '영창 취소', '#cccccc', 15);
  }
  const mx = (isDown('KeyD') ? 1 : 0) - (isDown('KeyA') ? 1 : 0);
  p.dodgeDir = mx !== 0 ? mx : -p.facing;
  p.dodgeT = PLAYER_BASE.dodgeTime;
  p.dodgeCd = PLAYER_BASE.dodgeCd;
  p.invuln = Math.max(p.invuln, PLAYER_BASE.dodgeTime + 0.04);
  p.hitstun = 0;
}

// ---------- 어떤 마법을 입력했는지 찾기 ----------
function resolveSpell(G, now) {
  const p = G.player;
  // 긴 커맨드부터 검사 (↓→ 가 ↓ 보다 먼저 판정되도록)
  const owned = p.spells.map(id => SPELL_MAP[id]).sort((a, b) => b.cmd.length - a.cmd.length);
  for (const sp of owned) {
    const lv = masteryLevel(G, sp.id);
    const win = windowFor(sp) * (1 + MASTERY.window * lv) * (p.hourglass > 0 ? 1.6 : 1);
    const noise = PLAYER_BASE.baseNoise + (lv >= 2 ? 1 : 0);
    let m = matchCommand(p.buffer.list, sp.cmd, now, p.buffer.lastDir, win, noise);
    let supportUsed = 0;
    // 지원병이 앞부분을 채워 줬다면 남은 부분만 입력해도 됨
    if (!m.ok && p.support.target === sp.id && p.support.progress > 0) {
      const rest = sp.cmd.slice(p.support.progress);
      const m2 = matchCommand(p.buffer.list, rest, now, p.buffer.lastDir, win, noise);
      if (m2.ok) { m = m2; supportUsed = p.support.progress; }
    }
    if (m.ok) {
      if ((p.cooldowns[sp.id] || 0) > 0) return { blocked: `${sp.name} 재사용 대기 ${p.cooldowns[sp.id].toFixed(1)}초` };
      return { spell: sp, noise: m.noise, supportUsed, lv };
    }
  }
  return null;
}

// 지금까지 쌓인 속성 + 이번 속성으로 만들어지는 복합 마법 (3단 먼저)
function findCombo(elements) {
  for (const len of [3, 2]) {
    if (elements.length < len) continue;
    const tail = elements.slice(-len).join(',');
    const c = COMBOS.find(cb => cb.seq.length === len && cb.seq.join(',') === tail);
    if (c) return c;
  }
  return null;
}

// ---------- Space 를 눌렀을 때 ----------
function tryCast(G) {
  const p = G.player;
  const now = G.now;
  if (G.mode === 'practice') Practice.onAttempt(G, now);

  const r = resolveSpell(G, now);
  if (r && r.blocked) { FX.text(G, p.x, p.y - 90, r.blocked, '#aaaaaa', 15); Sound.fail(); return; }
  if (r) { beginCast(G, r); return; }

  // 커맨드를 시도했는데 틀렸다: 최근에 위/아래가 섞인 방향을 2개 이상 넣었으면 시도로 본다
  const recent = p.buffer.recent(now, 700);
  const triedMotion = recent.length >= 2 && recent.some(e => e.d <= 3 || e.d >= 7);
  if (triedMotion) {
    FX.text(G, p.x, p.y - 90, '커맨드 실패', '#ff7070', 18);
    Sound.fail();
    if (p.chain.length) { p.chain = []; p.chainTimer = 0; FX.text(G, p.x, p.y - 112, '연속 영창 끊김', '#ff9a9a', 14); }
    p.buffer.clear();
    G.stats.fails++;
    return;
  }

  // 아무 커맨드 없이 Space: 기본 마력탄
  if ((p.cooldowns.basic || 0) <= 0) {
    castEffect(G, BASIC_BOLT, 1, {});
    p.cooldowns.basic = BASIC_BOLT.cooldown;
    Sound.basic();
  }
}

// ---------- 영창 시작 ----------
function beginCast(G, r) {
  const p = G.player, sp = r.spell, rar = RARITIES[sp.rarity], lv = r.lv;

  const chainEls = p.chainTimer > 0 ? p.chain.map(c => c.element) : [];
  const combo = findCombo([...chainEls, sp.element]);
  const stage = combo ? combo.seq.length : 1;

  const perfect = r.noise === 0 && r.supportUsed === 0 && sp.cmd.length >= 3;   // 실수 없이 긴 커맨드 → 완벽 보너스
  const supportMul = r.supportUsed > 0 ? SUPPORT.power[p.support.ratioIndex] : 1;
  let power = rar.power * (1 + MASTERY.power * lv) * supportMul * (perfect ? 1.1 : 1);
  if (p.amplify) { power *= 1.6; p.amplify = false; }

  let mana = rar.mana * (1 - MASTERY.mana * lv);
  if (r.supportUsed > 0) mana *= (1 - SUPPORT.manaDiscountStep * p.support.manaLv);
  if (combo) mana += 8 * (stage - 1);          // 다중 영창은 마나가 더 든다
  if (G.mode === 'practice') mana = 0;
  if (p.mana < mana) { FX.text(G, p.x, p.y - 90, '마나 부족', '#7fb2ff', 16); Sound.fail(); return; }
  p.mana -= mana;

  const castTime = rar.castTime * (1 - MASTERY.cast * lv) * (p.curse > 0 ? 1.5 : 1) * (combo ? 1.4 : 1);
  const breakChance = Math.min(0.95, rar.breakChance + (combo ? 0.15 * (stage - 1) : 0));

  p.casting = { spell: sp, combo, stage, power, mana, t: castTime, total: castTime, breakChance, perfect, supportUsed: r.supportUsed };
  p.buffer.clear();
  if (p.support.target === sp.id) { p.support.progress = 0; p.support.timer = supportInterval(p); }

  const label = sp.name + (perfect ? ' · 완벽!' : '') + (r.supportUsed ? ' (지원)' : '');
  FX.text(G, p.x, p.y - 96, label, RARITIES[sp.rarity].color, 18);
  if (perfect) { Sound.perfect(); G.stats.perfect++; } else Sound.success();
}

// ---------- 영창 완료 → 마법 발사 ----------
function finishCast(G) {
  const p = G.player, c = p.casting;
  p.casting = null;
  const sp = c.spell;
  const statusMul = masteryLevel(G, sp.id) >= 4 ? 1.5 : 1;

  if (c.combo) {
    // 복합 마법 위력 = 재료 마법들 위력의 평균 (희귀도·숙련도·지원병 효과가 다 반영됨)
    const parts = [...p.chain.slice(-(c.stage - 1)).map(x => x.power), c.power];
    const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
    castEffect(G, c.combo, avg, { isCombo: true, statusMul });
    FX.text(G, p.x, p.y - 140, `★ ${c.combo.name} ★`, '#ffd84a', 30, 1.4);
    Sound.combo();
    G.shake = Math.max(G.shake, 8);
    G.stats.combos++;
    p.chain = [];
    p.chainTimer = 0;
  } else {
    castEffect(G, sp, c.power, { statusMul });
    p.chain.push({ element: sp.element, power: c.power });
    if (p.chain.length > 2) p.chain.shift();   // 3단 조합을 위해 최근 2개만 기억
    p.chainTimer = PLAYER_BASE.chainWindow * (p.hourglass > 0 ? 1.5 : 1);
  }
  p.cooldowns[sp.id] = RARITIES[sp.rarity].cooldown;
  G.stats.casts++;
  addMastery(G, sp.id);
}

// ---------- 마법진 파괴 ----------
// 페널티 조합: ① 낸 마나는 사라짐 ② 받는 피해 +30% ③ 그 마법 재사용 대기 증가
// (영창 속도 감소는 밴시의 저주 패턴에서만 쓰고, 여기선 쓰지 않음 — 페널티가 겹쳐 억울해지는 것을 막기 위해)
function breakCircle(G) {
  const p = G.player, c = p.casting;
  if (!c) return;
  p.casting = null;
  const pen = RARITIES[c.spell.rarity].penaltyTime * (c.combo ? 1.5 : 1);
  p.vulnerable = Math.max(p.vulnerable, pen);
  p.cooldowns[c.spell.id] = (p.cooldowns[c.spell.id] || 0) + pen;
  p.chain = [];
  p.chainTimer = 0;
  FX.text(G, p.x, p.y - 120, '마법진 파괴!', '#ff4a4a', 24, 1.2);
  FX.burst(G, p.x, p.y - 30, ELEMENTS[c.spell.element].color, 30, 350);
  Sound.shatter();
  G.stats.breaks++;
}

// ---------- 플레이어가 맞았을 때 ----------
function hurtPlayer(G, dmg, fromX) {
  const p = G.player;
  if (p.invuln > 0 || p.dash) return false;
  if (G.mode === 'practice') return false;   // 연습장에서는 다치지 않음
  if (p.vulnerable > 0) dmg *= PLAYER_BASE.vulnerableMul;
  dmg = Math.round(dmg);
  p.hp -= dmg;
  p.invuln = PLAYER_BASE.hitInvuln;
  FX.text(G, p.x, p.y - 70, `-${dmg}`, '#ff5050', 22);
  Sound.hurt();
  G.shake = Math.max(G.shake, 8);

  if (p.casting) {
    if (p.charm > 0) FX.text(G, p.x, p.y - 110, '부적이 마법진을 지켰다', '#ffe9a8', 15);
    else if (Math.random() < p.casting.breakChance) { breakCircle(G); p.hitstun = 0.35; }
    else FX.text(G, p.x, p.y - 110, '마법진 버팀!', '#9dd8ff', 15);
  } else {
    p.hitstun = 0.25;
  }
  if (fromX !== undefined) p.kx = (Math.sign(p.x - fromX) || 1) * 260;
  if (p.hp <= 0) { p.hp = 0; onPlayerDead(G); }
  return true;
}

// ---------- 도구 ----------
function useTool(G) {
  const p = G.player;
  if (!p.tools.length) { FX.text(G, p.x, p.y - 90, '도구 없음', '#aaaaaa', 15); return; }
  const id = p.tools[p.toolIndex];
  switch (id) {
    case 'potion': p.mana = Math.min(p.maxMana, p.mana + 50); break;
    case 'charm': p.charm = 10; break;
    case 'repair':
      p.vulnerable = 0; p.curse = 0;
      for (const k in p.cooldowns) p.cooldowns[k] = 0;
      break;
    case 'blink':
      p.x = clamp(p.x - p.facing * 240, 30, W - 30);
      p.invuln = Math.max(p.invuln, 1.2);
      FX.burst(G, p.x, p.y - 30, '#bfe6ff', 20);
      break;
    case 'hourglass': p.hourglass = 15; break;
    case 'amplifier': p.amplify = true; break;
  }
  FX.text(G, p.x, p.y - 100, `${TOOLS[id].icon} ${TOOLS[id].name}`, '#ffe9a8', 17);
  Sound.tool();
  p.tools.splice(p.toolIndex, 1);
  if (p.toolIndex >= p.tools.length) p.toolIndex = 0;
}
