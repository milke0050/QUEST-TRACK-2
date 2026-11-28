/* =========================================================
 * ui.js — 화면 그리기 (캔버스) + 메뉴 화면 (HTML)
 *  - drawGame   : 배경, 캐릭터, 적, 마법, HUD
 *  - Overlay    : 타이틀 / 보상 / 게임 오버 / 승리 / 일시정지
 *  - Practice   : 커맨드 연습장 패널
 * ========================================================= */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---------- 기본 도형 도우미 ----------
function bar(x, y, w, h, ratio, color, back = '#222a') {
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(ratio, 0, 1), h);
  ctx.strokeStyle = '#000a'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
}
function label(text, x, y, size = 14, color = '#fff', align = 'left', bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  ctx.textAlign = align;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}
function panel(x, y, w, h) {
  ctx.fillStyle = 'rgba(10,12,30,0.62)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(160,170,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
}

// ---------- 배경 ----------
function drawBackground(G) {
  const boss = !!G.boss;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, boss ? '#1a0b24' : '#0e1430');
  g.addColorStop(1, boss ? '#3a1640' : '#22305a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 먼 기둥들
  ctx.fillStyle = boss ? 'rgba(255,120,200,0.05)' : 'rgba(150,170,255,0.06)';
  for (let i = 0; i < 8; i++) ctx.fillRect(60 + i * 165, 120, 40, GROUND - 120);
  // 땅
  ctx.fillStyle = boss ? '#2a1830' : '#1b2238';
  ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = boss ? '#8a4fa0' : '#4a5a9a';
  ctx.fillRect(0, GROUND, W, 3);
  if (G.wailFlash > 0) { ctx.fillStyle = `rgba(255,60,80,${G.wailFlash * 0.4})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- 플레이어 ----------
function drawPlayer(G) {
  const p = G.player;
  const f = p.facing;
  const c = p.casting;
  const progress = c ? 1 - c.t / c.total : 0;

  // 바닥 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 22, 5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  if (p.invuln > 0 && !p.dash && Math.floor(G.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;   // 무적 깜빡임
  drawHoodedMage(G, p, progress);
  ctx.restore();

  // 손앞의 마법진 (화살표를 넣는 동안 조금씩 펼쳐지고, 영창하면 끝까지 커짐)
  if ((p.circleR || 0) > 1.5) drawCastCircle(G, p);

  if (p.charm > 0) {
    ctx.strokeStyle = 'rgba(255,233,168,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 36, 34, 44, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

// 후드 로브 마법사. 오른쪽을 보는 모습으로 그리고, 왼쪽을 보면 좌우로 뒤집는다.
function drawHoodedMage(G, p, progress) {
  const f = p.facing;
  const casting = !!p.casting || (p.circleR || 0) > 6;   // 마법진을 펼치는 중이면 팔을 뻗음
  progress = Math.max(progress, Math.min(1, (p.circleR || 0) / 40));
  const walk = p.walking ? Math.sin(p.walkT * 12) : 0;
  const crouch = p.crouch && !casting;

  ctx.translate(p.x, p.y);
  ctx.scale(f, crouch ? 0.74 : 1);
  if (p.dash || p.dodgeT > 0) ctx.rotate(0.18);           // 대쉬: 앞으로 기울임
  ctx.translate(0, -Math.abs(walk) * 2);                    // 걸을 때 살짝 들썩

  const hurt = p.vulnerable > 0;
  const dark = hurt ? '#3a1822' : '#1f242e';
  const mid = hurt ? '#5c2433' : '#353c4b';
  const light = hurt ? '#86404f' : '#56607a';
  const edge = '#0b0d12';

  // 뒤로 흩날리는 망토 자락
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-10, -52);
  ctx.quadraticCurveTo(-24, -30, -22 - walk * 3, 0);
  ctx.lineTo(-8, 0);
  ctx.closePath(); ctx.fill();

  // 로브 몸통
  const g = ctx.createLinearGradient(-16, -60, 16, 0);
  g.addColorStop(0, light); g.addColorStop(0.45, mid); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.strokeStyle = edge; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, -50);                    // 뒤 어깨
  ctx.quadraticCurveTo(-19, -24, -18 - walk * 2, 0);
  // 들쭉날쭉한 옷자락
  const hem = [-18, -12, -6, 0, 6, 12, 18];
  hem.forEach((x, i) => ctx.lineTo(x + walk * (i % 2 ? 2 : -1), i % 2 ? -4 : 0));
  ctx.quadraticCurveTo(16, -26, 11, -48);  // 앞 가슴
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // 옷 주름
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-4, -40); ctx.quadraticCurveTo(-7, -20, -9 + walk, -2);
  ctx.moveTo(4, -38); ctx.quadraticCurveTo(3, -18, 4 - walk, -3);
  ctx.stroke();

  // 후드
  ctx.fillStyle = mid; ctx.strokeStyle = edge; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-15, -46);
  ctx.quadraticCurveTo(-20, -70, -6, -78);   // 뒤통수
  ctx.quadraticCurveTo(6, -82, 12, -70);     // 정수리 → 앞
  ctx.quadraticCurveTo(17, -60, 12, -48);    // 후드 앞 끝
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // 후드 위쪽 빛
  ctx.strokeStyle = light; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -66); ctx.quadraticCurveTo(-4, -79, 8, -74); ctx.stroke();

  // 얼굴 구멍 (그림자 속 얼굴)
  ctx.fillStyle = '#050608';
  ctx.beginPath(); ctx.ellipse(6, -61, 6, 9, 0.15, 0, Math.PI * 2); ctx.fill();
  // 영창할 때 눈이 청록색으로 빛남
  if (casting) {
    ctx.fillStyle = `rgba(110,255,220,${0.5 + 0.5 * progress})`;
    ctx.shadowColor = '#6effdc'; ctx.shadowBlur = 8;
    ctx.fillRect(7, -63, 3, 2);
    ctx.shadowBlur = 0;
  }

  // 팔과 손
  ctx.strokeStyle = mid; ctx.lineCap = 'round'; ctx.lineWidth = 8;
  if (casting) {
    // 앞으로 뻗은 팔
    const reach = 14 + 8 * Math.min(1, progress * 2);
    ctx.beginPath(); ctx.moveTo(4, -46); ctx.lineTo(4 + reach, -44); ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4, -50); ctx.lineTo(4 + reach, -48); ctx.stroke();
    ctx.fillStyle = '#e6c4a4';
    ctx.beginPath(); ctx.arc(8 + reach, -44, 3.2, 0, Math.PI * 2); ctx.fill();
  } else {
    // 옆에 늘어뜨린 팔 (걸을 때 흔들림)
    ctx.beginPath(); ctx.moveTo(4, -46); ctx.lineTo(7 + walk * 3, -26); ctx.stroke();
    ctx.fillStyle = '#e6c4a4';
    ctx.beginPath(); ctx.arc(7 + walk * 3, -23, 2.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.lineCap = 'butt';
}

// 손앞에 세워진 원형 마법진. 영창이 진행될수록 커진다.
function drawCastCircle(G, p) {
  const f = p.facing;
  const c = p.casting;
  const el = ELEMENTS[p.circleEl || 'none'];
  const teal = '#4ff0d0';
  const r = p.circleR;
  const progress = c ? 1 - c.t / c.total : Math.min(1, r / 30) * 0.6;
  const cx = p.x + f * (34 + r * 0.25), cy = p.y - 44;
  ctx.globalAlpha = c ? 1 : 0.8;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.42, 1);                       // 옆에서 본 원 → 세로로 긴 타원
  ctx.shadowColor = teal; ctx.shadowBlur = 18;
  // 바깥 고리
  ctx.strokeStyle = teal; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  // 안쪽 고리 (속성 색)
  ctx.strokeStyle = el.color; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
  // 도는 룬 무늬
  ctx.rotate(G.time * 4 * f);
  ctx.strokeStyle = 'rgba(190,255,240,0.9)'; ctx.lineWidth = 2.5;
  // 입력한 칸 수만큼 룬이 하나씩 켜짐
  const n = Math.max(1, p.circleRunes || 1);
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / Math.max(n, 6);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.86, a, a + 0.35); ctx.stroke();
  }
  // 가운데 빛
  ctx.fillStyle = `rgba(79,240,208,${0.15 + 0.25 * progress})`;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 손끝의 작은 빛 구슬
  ctx.save();
  ctx.fillStyle = '#c8fff2'; ctx.shadowColor = teal; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(p.x + f * 27, p.y - 44, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;

  if (c) label(`파괴 확률 ${Math.round(c.breakChance * 100)}%`, p.x, p.y - 96, 12, p.charm > 0 ? '#ffe9a8' : '#ffb0b0', 'center');
}

// ---------- 적 ----------
const STATUS_ICON = { burn: '🔥', wet: '💧', slow: '🐌', shock: '⚡', freeze: '❄' };

function drawEnemy(G, e) {
  const rc = rectOf(e);
  ctx.save();
  const tele = e.state === 'tele' || (e.state && e.state.startsWith('tele_'));
  if (tele) { ctx.shadowColor = '#ff4040'; ctx.shadowBlur = 25; }
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : (e.status.freeze > 0 ? '#bfefff' : e.def.color);

  switch (e.type) {
    case 'slime': {
      const squish = Math.sin(G.time * 8 + e.x * 0.05) * 3;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2 + squish / 2, e.w / 2 + squish, e.h / 2 - squish / 2, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bat': {
      const flap = Math.sin(G.time * 18) * 10;
      ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h / 2, 12, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(e.x - 8, e.y - 14); ctx.lineTo(e.x - 26, e.y - 20 - flap); ctx.lineTo(e.x - 10, e.y - 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(e.x + 8, e.y - 14); ctx.lineTo(e.x + 26, e.y - 20 - flap); ctx.lineTo(e.x + 10, e.y - 6); ctx.fill();
      break;
    }
    case 'goblin':
      ctx.fillRect(rc.x + 6, rc.y + 14, rc.w - 12, rc.h - 14);
      ctx.beginPath(); ctx.arc(e.x, rc.y + 14, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3a8a';
      ctx.beginPath(); ctx.moveTo(e.x - 14, rc.y + 6); ctx.lineTo(e.x + 14, rc.y + 6); ctx.lineTo(e.x, rc.y - 18); ctx.fill();
      break;
    case 'golem':
      ctx.fillRect(rc.x, rc.y + 10, rc.w, rc.h - 10);
      ctx.fillRect(rc.x + 12, rc.y, rc.w - 24, 20);
      ctx.fillStyle = '#ffcc66'; ctx.fillRect(e.x - 12, rc.y + 6, 6, 5); ctx.fillRect(e.x + 6, rc.y + 6, 6, 5);
      break;
    case 'dummy':
      ctx.fillRect(e.x - 5, rc.y + 20, 10, rc.h - 20);
      ctx.fillRect(e.x - 30, rc.y + 34, 60, 8);
      ctx.beginPath(); ctx.arc(e.x, rc.y + 16, 16, 0, Math.PI * 2); ctx.fill();
      break;
    case 'banshee':
      drawBanshee(G, e);
      break;
  }
  ctx.restore();

  // 눈 (일반 적)
  if (!e.isBoss && e.type !== 'dummy') {
    ctx.fillStyle = '#111';
    const dir = Math.sign(G.player.x - e.x) || 1;
    ctx.fillRect(e.x + dir * 6 - 2, rc.y + (e.type === 'bat' ? 8 : 10), 4, 4);
  }

  // 체력바 + 상태 아이콘
  if (!e.isBoss) {
    if (e.type !== 'dummy') bar(e.x - 22, rc.y - 12, 44, 5, e.hp / e.maxHp, '#ff5a5a');
  }
  const icons = Object.keys(STATUS_ICON).filter(k => e.status[k] > 0).map(k => STATUS_ICON[k]).join('');
  if (icons) { ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(icons, e.x, rc.y - 18); }
}

function drawBanshee(G, e) {
  const c = centerOf(e);
  // 바닥 마법진 (노출 중)
  if (e.shield <= 0) {
    ctx.save();
    ctx.translate(e.x, GROUND + 6); ctx.scale(1, 0.3); ctx.rotate(G.time);
    ctx.strokeStyle = e.state === 'restore' ? '#ff9ad5' : '#b07aff'; ctx.lineWidth = 6; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, 120, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = i * Math.PI * 2 * 2 / 6 + 0.3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 100, Math.sin(a) * 100); }
    ctx.stroke();
    ctx.restore();
  }
  // 몸 (유령)
  ctx.globalAlpha = 0.9;
  const g = ctx.createLinearGradient(0, e.y - e.h, 0, e.y);
  g.addColorStop(0, e.flash > 0 ? '#ffffff' : '#eef3ff');
  g.addColorStop(1, 'rgba(160,140,255,0.1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(e.x - 30, e.y - e.h + 40);
  ctx.quadraticCurveTo(e.x, e.y - e.h - 20, e.x + 30, e.y - e.h + 40);
  for (let i = 0; i <= 6; i++) {
    const x = e.x + 45 - i * 15;
    ctx.lineTo(x, e.y - (i % 2 ? 10 : 0) + Math.sin(G.time * 6 + i) * 6);
  }
  ctx.closePath(); ctx.fill();
  // 머리카락
  ctx.fillStyle = '#5a4a8a';
  ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h + 28, 30, 26, 0, Math.PI, Math.PI * 2); ctx.fill();
  // 눈과 입
  ctx.fillStyle = '#2a0030';
  ctx.fillRect(e.x - 13, e.y - e.h + 36, 7, 10); ctx.fillRect(e.x + 6, e.y - e.h + 36, 7, 10);
  const mouth = e.state === 'tele_wail' ? 16 : 5;
  ctx.beginPath(); ctx.ellipse(e.x, e.y - e.h + 60, 7, mouth, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  // 통곡 예고 고리
  if (e.state === 'tele_wail') {
    const k = 1 - e.t / BOSS_TELE.wail;
    ctx.strokeStyle = `rgba(255,80,80,${0.3 + 0.5 * k})`; ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(c.x, c.y, 60 + ((k * 120 + i * 40) % 120), 0, Math.PI * 2); ctx.stroke(); }
  }
  // 보호막
  if (e.shield > 0) {
    const k = e.shield / e.shieldMax;
    ctx.strokeStyle = `rgba(127,247,255,${0.4 + 0.5 * k})`; ctx.lineWidth = 3 + 3 * k;
    ctx.fillStyle = 'rgba(127,247,255,0.08)';
    ctx.beginPath(); ctx.arc(c.x, c.y, 92, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 육각 무늬
    ctx.strokeStyle = 'rgba(127,247,255,0.25)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 + G.time * 0.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a) * 92, c.y + Math.sin(a) * 92); ctx.stroke();
    }
  }
}

// ---------- 적의 공격 ----------
function drawHostile(G) {
  for (const h of G.hostile) {
    ctx.save();
    ctx.fillStyle = h.color; ctx.shadowColor = h.color; ctx.shadowBlur = 14;
    if (h.kind === 'wave') {
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.moveTo(h.x - h.w / 2, h.y); ctx.quadraticCurveTo(h.x, h.y - h.h * 1.6, h.x + h.w / 2, h.y); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(h.x, h.y, h.r * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- HUD ----------
function drawHUD(G) {
  const p = G.player;

  // 왼쪽 위: 체력·마나
  panel(14, 14, 300, 92);
  label('체력', 24, 36, 13, '#ffb0b0');
  bar(64, 24, 236, 16, p.hp / p.maxHp, '#e84a5f');
  label(`${Math.ceil(p.hp)} / ${p.maxHp}`, 182, 37, 12, '#fff', 'center');
  label('마나', 24, 60, 13, '#b0d0ff');
  bar(64, 48, 236, 16, p.mana / p.maxMana, '#3d7bff');
  label(`${Math.floor(p.mana)} / ${p.maxMana}`, 182, 61, 12, '#fff', 'center');
  // 상태
  const st = [];
  if (p.vulnerable > 0) st.push(['취약', p.vulnerable, '#ff6b6b']);
  if (p.curse > 0) st.push(['저주', p.curse, '#ff4fd8']);
  if (p.charm > 0) st.push(['부적', p.charm, '#ffe9a8']);
  if (p.hourglass > 0) st.push(['모래시계', p.hourglass, '#ffd27f']);
  if (p.amplify) st.push(['증폭 대기', 0, '#9ff']);
  let sx = 24;
  for (const [name, t, col] of st) {
    const txt = t ? `${name} ${t.toFixed(1)}` : name;
    label(txt, sx, 88, 13, col, 'left', true);
    sx += ctx.measureText(txt).width + 14;
  }
  if (!st.length) label('회피 ' + (p.dodgeCd > 0 ? p.dodgeCd.toFixed(1) + '초' : '준비'), 24, 88, 13, '#9aa');

  // 도구
  panel(14, 112, 300, 36);
  if (p.tools.length) {
    const t = TOOLS[p.tools[p.toolIndex]];
    label(`도구 [C] ${t.icon} ${t.name}`, 24, 135, 14, '#ffe9a8');
    label(`${p.toolIndex + 1}/${p.tools.length} [V]`, 304, 135, 12, '#aaa', 'right');
  } else label('도구 없음', 24, 135, 14, '#777');

  // 가운데 위: 방 이름 / 보스 체력
  if (G.boss && !G.boss.dead) drawBossBar(G, G.boss);
  else if (G.mode === 'run') label(`${ROOMS[G.roomIndex].name}  ·  웨이브 ${Math.min(G.waveIndex + 1, (ROOMS[G.roomIndex].waves || []).length)}/${(ROOMS[G.roomIndex].waves || []).length}`, W / 2, 34, 18, '#dfe4ff', 'center', true);
  else label('연습장 — 아래에서 연습할 마법을 고르세요 (Esc: 처음으로)', W / 2, 34, 18, '#dfe4ff', 'center', true);

  drawSpellbook(G);
  drawSupport(G);
  drawChain(G);
  drawInputLog(G);

  label('A D 이동  S 웅크림  화살표 커맨드 + Space 영창  Shift 대쉬  C 도구  V 도구 바꾸기  Tab 지원병 마법  [ ] 지원 비율  Esc 일시정지', W / 2, H - 10, 13, '#8f98c8', 'center');

  if (G.banner && G.banner.t > 0) {
    ctx.globalAlpha = Math.min(1, G.banner.t);
    label(G.banner.text, W / 2, 230, 40, '#ffffff', 'center', true);
    if (G.banner.sub) label(G.banner.sub, W / 2, 268, 18, '#c9d0ff', 'center');
    ctx.globalAlpha = 1;
  }
}

function drawBossBar(G, b) {
  const x = W / 2 - 260, y = 20;
  label(`${BANSHEE.name}${b.phase === 2 ? ' (분노)' : ''}`, W / 2, y + 2, 18, '#ffd0ff', 'center', true);
  bar(x, y + 10, 520, 16, b.hp / b.maxHp, '#d94a8a');
  if (b.shield > 0) {
    bar(x, y + 30, 520, 8, b.shield / b.shieldMax, '#7ff7ff');
    label('보호막: 복합 마법 ×2.5 · 전기 ×1.3', W / 2, y + 56, 13, '#7ff7ff', 'center');
  } else if (b.state === 'restore') {
    bar(x, y + 30, 520, 8, b.restoreDmg / BANSHEE.restoreInterrupt, '#ff9ad5');
    label(`마법진 복구 중! ${Math.round(b.restoreDmg)}/${BANSHEE.restoreInterrupt} 피해로 저지`, W / 2, y + 56, 13, '#ff9ad5', 'center', true);
  } else {
    bar(x, y + 30, 520, 8, b.exposed / BANSHEE.exposeTime, '#b07aff');
    label(`마법진 노출! 피해 ×1.5 (${Math.max(0, b.exposed).toFixed(1)}초)`, W / 2, y + 56, 14, '#d8b0ff', 'center', true);
  }
}

// 오른쪽: 내 마법서
function drawSpellbook(G) {
  const p = G.player;
  const list = p.spells.map(id => SPELL_MAP[id])
    .sort((a, b) => Object.keys(ELEMENTS).indexOf(a.element) - Object.keys(ELEMENTS).indexOf(b.element) || RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  const x = W - 330, y0 = 70, lh = 21;
  panel(x - 10, y0 - 18, 326, list.length * lh + 30);
  label('마법서 (화살표 커맨드 + Space)', x, y0, 13, '#aab', 'left', true);
  list.forEach((sp, i) => {
    const y = y0 + 20 + i * lh;
    const cd = p.cooldowns[sp.id] || 0;
    const lv = masteryLevel(G, sp.id);
    const col = cd > 0 ? '#666' : RARITIES[sp.rarity].color;
    label(ELEMENTS[sp.element].icon, x, y, 13);
    label(sp.name, x + 22, y, 14, col, 'left', true);
    label(cmdToArrows(sp.cmd, p.facing), x + 118, y, 16, cd > 0 ? '#666' : '#fff');
    label(cd > 0 ? cd.toFixed(1) : (lv ? `Lv${lv}` : ''), x + 306, y, 12, cd > 0 ? '#aaa' : '#9dffb0', 'right');
  });
}

// 오른쪽 아래: 영창 지원병
function drawSupport(G) {
  const p = G.player, s = p.support;
  const x = W - 340, y = H - 150;
  panel(x, y, 326, 112);
  label('영창 지원병 [Tab]', x + 10, y + 20, 14, '#ffe9a8', 'left', true);
  const ratio = SUPPORT.ratios[s.ratioIndex];
  label(`자동 ${Math.round(ratio * 100)}% · 위력 ${Math.round(SUPPORT.power[s.ratioIndex] * 100)}% [ ]`, x + 316, y + 20, 12, '#ccc', 'right');
  if (!s.target) { label('쉬는 중 — Tab 으로 도와줄 마법을 고르세요', x + 10, y + 56, 13, '#999'); return; }
  const sp = SPELL_MAP[s.target];
  const auto = supportAutoCount(p);
  label(`${ELEMENTS[sp.element].icon} ${sp.name}`, x + 10, y + 46, 15, RARITIES[sp.rarity].color, 'left', true);
  // 커맨드 칸: 초록=자동 입력 끝, 노랑=자동 입력 예정, 흰색=내가 직접
  sp.cmd.forEach((d, i) => {
    const bx = x + 12 + i * 38, by = y + 58;
    let fill = 'rgba(255,255,255,0.08)', col = '#fff';
    if (i < s.progress) { fill = 'rgba(80,220,120,0.45)'; col = '#dfffe5'; }
    else if (i < auto) { fill = 'rgba(255,220,90,0.18)'; col = '#ffe08a'; }
    ctx.fillStyle = fill; ctx.fillRect(bx, by, 32, 32);
    const isNext = i === s.progress && i >= auto;
    ctx.strokeStyle = isNext && s.displayLv > 0 ? '#ff6' : (i === sp.cmd.length - 1 ? '#ff9a9a' : '#556');
    ctx.lineWidth = isNext && s.displayLv > 0 ? 3 : 1.5; ctx.strokeRect(bx, by, 32, 32);
    label(arrowFor(d, p.facing), bx + 16, by + 24, 20, col, 'center', true);
  });
  const remain = sp.cmd.slice(s.progress);
  label(`남은 입력: ${cmdToArrows(remain, p.facing)} + Space`, x + 10, y + 106, 13, '#fff');
  if (s.displayLv > 0 && remain.length) label(arrowFor(remain[0], p.facing), x + 300, y + 106, 22, '#ff6', 'right', true);
}

// 가운데 아래: 다중 영창 상태와 다음에 가능한 복합 마법
function drawChain(G) {
  const p = G.player;
  if (!p.chain.length || p.chainTimer <= 0) return;
  const x = W / 2 - 170, y = H - 150;
  panel(x, y, 340, 112);
  label('연속 영창', x + 10, y + 20, 14, '#ffd84a', 'left', true);
  label(p.chain.map(c => ELEMENTS[c.element].icon).join(' → ') + ' → ?', x + 90, y + 20, 15);
  bar(x + 10, y + 28, 320, 6, p.chainTimer / PLAYER_BASE.chainWindow, '#ffd84a');
  // 지금 사슬로 이어질 수 있는 복합 마법 힌트
  const els = p.chain.map(c => c.element);
  const hints = [];
  for (const cb of COMBOS) {
    for (let k = Math.min(els.length, cb.seq.length - 1); k >= 1; k--) {
      if (els.slice(-k).join(',') === cb.seq.slice(0, k).join(',')) {
        const rest = cb.seq.slice(k).map(e => ELEMENTS[e].icon).join(' → ');
        hints.push(`${rest} = ${cb.name}`);
        break;
      }
    }
  }
  hints.slice(0, 4).forEach((h, i) => label(h, x + 14 + (i % 2) * 165, y + 58 + Math.floor(i / 2) * 24, 13, '#fff3c0'));
  if (!hints.length) label('이어질 복합 마법 없음', x + 14, y + 58, 13, '#999');
}

// 왼쪽 아래: 입력 기록 (격투게임 연습 모드처럼)
function drawInputLog(G) {
  const p = G.player;
  const now = G.now;
  const items = p.buffer.list.filter(e => e.d !== 5 && now - e.t < 1800).slice(-14);
  panel(14, H - 70, 420, 40);
  label('입력', 24, H - 44, 13, '#aab', 'left', true);
  items.forEach((e, i) => {
    ctx.globalAlpha = clamp(1 - (now - e.t) / 1800, 0.15, 1);
    label(arrowFor(e.d, p.facing), 68 + i * 26, H - 42, 20, '#fff', 'center', true);
  });
  ctx.globalAlpha = 1;
}

// ---------- 전체 그리기 ----------
function drawGame(G) {
  ctx.save();
  if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake), rand(-G.shake, G.shake));
  drawBackground(G);
  drawShots(ctx, G);
  for (const e of G.enemies) if (!e.dead) drawEnemy(G, e);
  drawPlayer(G);
  drawHostile(G);
  drawFx(ctx, G);
  ctx.restore();
  drawHUD(G);
}

function drawTitleBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0e1430'); g.addColorStop(1, '#2a1846');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H / 2 + 40); ctx.rotate(t * 0.3);
  ctx.strokeStyle = 'rgba(180,140,255,0.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 260, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i <= 5; i++) { const a = i * Math.PI * 4 / 5; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 240, Math.sin(a) * 240); }
  ctx.stroke();
  ctx.restore();
}

/* =========================================================
 * Overlay — HTML 로 만드는 메뉴 화면
 * ========================================================= */
const overlayEl = document.getElementById('overlay');
const Overlay = {
  show(html) { overlayEl.innerHTML = html; overlayEl.hidden = false; },
  hide() { overlayEl.hidden = true; overlayEl.innerHTML = ''; },

  title() {
    this.show(`
      <h1>영창술사</h1>
      <p class="sub">커맨드를 입력해 마법을 쓰는 2D 액션 로그라이크 · 프로토타입</p>
      <div class="btns">
        <button onclick="startRun()">모험 시작</button>
        <button onclick="startPractice()">커맨드 연습장</button>
        <button onclick="Overlay.help()">조작법</button>
      </div>
      <p class="small">숙련도는 이 브라우저에 저장되어 판이 끝나도 남아요.</p>`);
  },

  help() {
    this.show(`
      <h2>조작법</h2>
      <table class="keys">
        <tr><td>A / D</td><td>이동</td></tr>
        <tr><td>S</td><td>웅크림 (몸이 작아짐)</td></tr>
        <tr><td>화살표 + Space</td><td>마법 커맨드. 예) ↓ → + Space = 화염구 (대각선은 필요 없어요)<br>커맨드는 어느 쪽을 보든 그대로예요. 마법은 가장 가까운 적 쪽으로 나가요</td></tr>
        <tr><td>Space 만</td><td>기본 마력탄 (마나 0)</td></tr>
        <tr><td>Shift</td><td>대쉬 (잠깐 무적, 영창 중이면 안전하게 취소)</td></tr>
        <tr><td>C / V</td><td>도구 사용 / 도구 바꾸기</td></tr>
        <tr><td>Tab</td><td>영창 지원병이 도와줄 마법 고르기</td></tr>
        <tr><td>[ / ]</td><td>지원병 자동 입력 비율 낮추기 / 올리기</td></tr>
        <tr><td>Esc</td><td>일시정지</td></tr>
      </table>
      <h3>핵심 규칙</h3>
      <ul>
        <li><b>다중 영창</b>: 마법을 쓰고 1.3초 안에 다음 마법을 쓰면 속성 순서에 따라 <b>복합 마법</b>이 터져요. 화면 아래에 다음 조합이 보여요.</li>
        <li><b>마법진 파괴</b>: 영창 중에 맞으면 마법진이 깨질 수 있어요 (희귀할수록 잘 깨짐). 깨지면 취약(받는 피해 +30%) + 재사용 대기 증가.</li>
        <li><b>속성</b>: 젖은 적 + 전기 = 1.5배, 언 적 + 불 = 2배, 젖은 적 + 불 = 0.75배, 불타는 적 + 바람 = 화상 확산.</li>
        <li><b>밴시</b>: 보호막을 복합 마법으로 깨고, 마법진이 노출됐을 때 몰아치세요. 통곡은 Shift 대쉬로 피할 수 있어요.</li>
      </ul>
      <div class="btns"><button onclick="Overlay.title()">돌아가기</button></div>`);
  },

  reward(options) {
    const cards = options.map((o, i) => `
      <button class="card" style="border-color:${o.color}" onclick="pickReward(${i})">
        <div class="tag" style="color:${o.color}">${o.tag}</div>
        <div class="name">${o.title}</div>
        ${o.cmd ? `<div class="cmd">${o.cmd} + Space</div>` : ''}
        <div class="desc">${o.desc}</div>
      </button>`).join('');
    this.show(`<h2>방 클리어! 보상을 하나 고르세요</h2><p class="small">체력 20 회복, 마나 가득</p><div class="cards">${cards}</div>`);
  },

  end(win, G) {
    const s = G.stats;
    this.show(`
      <h1>${win ? '승리!' : '쓰러졌다…'}</h1>
      <p class="sub">${win ? '밴시를 물리쳤어요.' : `${ROOMS[G.roomIndex].name}에서 쓰러졌어요.`}</p>
      <table class="keys">
        <tr><td>마법 사용</td><td>${s.casts}번 (완벽 ${s.perfect}번)</td></tr>
        <tr><td>복합 마법</td><td>${s.combos}번</td></tr>
        <tr><td>커맨드 실패</td><td>${s.fails}번</td></tr>
        <tr><td>마법진 파괴당함</td><td>${s.breaks}번</td></tr>
        <tr><td>처치</td><td>${s.kills}</td></tr>
        <tr><td>총 피해</td><td>${s.damage}</td></tr>
      </table>
      <p class="small">숙련도는 저장됐어요. 다음 판에서도 그대로예요.</p>
      <div class="btns"><button onclick="startRun()">다시 도전</button><button onclick="goTitle()">처음으로</button></div>`);
  },

  pause() {
    this.show(`<h2>일시정지</h2><div class="btns"><button onclick="resumeGame()">계속하기 (Esc)</button><button onclick="goTitle()">포기하고 처음으로</button></div>`);
  },
};

/* =========================================================
 * Practice — 커맨드 연습장
 *  아래 패널에서 마법을 고르고, 허수아비에게 연습.
 *  Space 를 누를 때마다 성공/실패와 그 이유를 알려 줌.
 * ========================================================= */
const practiceEl = document.getElementById('practice');
const Practice = {
  target: 'fireball',
  tries: 0, ok: 0, streak: 0, best: 0,
  last: '',

  open() {
    this.tries = 0; this.ok = 0; this.streak = 0; this.last = '마법을 고르고 화살표로 커맨드를 넣은 뒤 Space 를 눌러 보세요.';
    practiceEl.hidden = false;
    this.render();
  },
  close() { practiceEl.hidden = true; },

  select(id) { if (document.activeElement) document.activeElement.blur(); this.target = id; this.streak = 0; this.last = `${SPELL_MAP[id].name} 연습 시작!`; this.render(); },

  onAttempt(G, now) {
    const sp = SPELL_MAP[this.target];
    const p = G.player;
    const lv = masteryLevel(G, sp.id);
    const win = windowFor(sp) * (1 + MASTERY.window * lv);
    const noise = PLAYER_BASE.baseNoise + (lv >= 2 ? 1 : 0);
    this.tries++;
    const m = matchCommand(p.buffer.list, sp.cmd, now, p.buffer.lastDir, win, noise);
    if (m.ok) {
      this.ok++; this.streak++; this.best = Math.max(this.best, this.streak);
      this.last = `<b class="good">성공!</b> ${(m.duration / 1000).toFixed(2)}초 (허용 ${(win / 1000).toFixed(2)}초) · 실수 ${m.noise}번${m.noise === 0 && sp.cmd.length >= 3 ? ' · <b class="good">완벽 보너스</b>' : ''}`;
    } else {
      this.streak = 0;
      const typed = p.buffer.recent(now, 1500).map(e => arrowFor(e.d, p.facing)).join('') || '(없음)';
      this.last = `<b class="bad">실패</b> — ${explainFail(p.buffer.list, sp.cmd, now, p.buffer.lastDir, win, noise)}<br>입력: ${typed} / 정답: ${cmdToArrows(sp.cmd, p.facing)}`;
    }
    this.render();
  },

  render() {
    const sp = SPELL_MAP[this.target];
    const groups = Object.keys(ELEMENTS).filter(k => k !== 'none').map(el => {
      const btns = SPELLS.filter(s => s.element === el).map(s =>
        `<button class="sp ${s.id === this.target ? 'on' : ''}" style="color:${RARITIES[s.rarity].color}" onclick="Practice.select('${s.id}')">${s.name}<span>${cmdToArrows(s.cmd, 1)}</span></button>`).join('');
      return `<div class="grp"><b>${ELEMENTS[el].icon} ${ELEMENTS[el].name}</b>${btns}</div>`;
    }).join('');
    const rate = this.tries ? Math.round(this.ok / this.tries * 100) : 0;
    practiceEl.innerHTML = `
      <div class="pr-top">
        <div class="pr-target">
          <div class="pr-name" style="color:${RARITIES[sp.rarity].color}">${ELEMENTS[sp.element].icon} ${sp.name} <small>${RARITIES[sp.rarity].name}</small></div>
          <div class="pr-cmd">${cmdToArrows(sp.cmd, 1)} + Space</div>
          <div class="small">${sp.desc} · 허용 시간 ${(windowFor(sp) / 1000).toFixed(2)}초</div>
        </div>
        <div class="pr-result">
          <div>${this.last}</div>
          <div class="small">성공률 ${rate}% (${this.ok}/${this.tries}) · 연속 ${this.streak} · 최고 연속 ${this.best}</div>
        </div>
      </div>
      <div class="pr-list">${groups}</div>
      <p class="small">연습장에서는 마나가 무한이고 숙련도는 오르지 않아요. 복합 마법도 시험해 보세요.</p>`;
  },
};
