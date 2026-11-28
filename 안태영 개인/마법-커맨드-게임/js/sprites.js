/* =========================================================
 * sprites.js — 스프라이트 시트(그림 파일) 불러오기와 이펙트 애니메이션
 *
 *  시트 = 같은 크기 프레임이 가로 한 줄로 이어진 PNG
 *  Anim = 화면에 한 번 재생되는 애니메이션 (위치, 크기, 시간)
 *
 *  그림이 아직 안 불러와졌으면 Sprites.ready() 가 false 라서
 *  예전의 도형 이펙트로 대신 그린다. (그림 파일이 없어도 게임은 돌아감)
 * ========================================================= */

// 에셋: Torch Drop (CC0, 출처 표기 필요 없음)
const SHEETS = {
  windFly:     { src: 'assets/images/wind_fly.png',                 fw: 48,  fh: 35,  frames: 5,  fps: 12, loop: true },  // 바람 칼날 날기
  windExplode: { src: 'assets/images/wind_explode.png',             fw: 48,  fh: 35,  frames: 5,  fps: 14, loop: false }, // 바람 칼날 터짐
  spark:       { src: 'assets/images/lightning-spark_explode.png',  fw: 104, fh: 220, frames: 20, fps: 24, loop: false }, // 하늘색 전기 스파크
  strike:      { src: 'assets/images/lightning-strike_strike.png',  fw: 64,  fh: 128, frames: 10, fps: 10, loop: true },  // 번개 내려치기
  fireBomb:    { src: 'assets/images/fire-bomb_explode.png',        fw: 64,  fh: 64,  frames: 14, fps: 18, loop: false }, // 불꽃 폭탄 (0~6 모이기, 7~13 폭발)
};

const Sprites = {
  load() {
    for (const key in SHEETS) {
      const s = SHEETS[key];
      s.img = new Image();
      s.img.onload = () => { s.loaded = true; };
      s.img.onerror = () => console.warn('그림을 못 불러왔어요:', s.src);
      s.img.src = s.src;
    }
  },
  ready(key) { return !!(SHEETS[key] && SHEETS[key].loaded); },

  // 한 프레임 그리기. anchor: 'center'(가운데 기준) / 'bottom'(아래 가운데 기준)
  drawFrame(ctx, key, frame, x, y, opt = {}) {
    const s = SHEETS[key];
    if (!s || !s.loaded) return;
    const scale = opt.scale || 1;
    ctx.save();
    ctx.imageSmoothingEnabled = false;          // 픽셀 아트: 최근접(nearest) 필터
    ctx.globalAlpha = opt.alpha === undefined ? 1 : opt.alpha;
    ctx.translate(x, y);
    if (opt.rot) ctx.rotate(opt.rot);
    ctx.scale((opt.flip || 1) * scale, scale);
    const dy = opt.anchor === 'bottom' ? -s.fh : -s.fh / 2;
    ctx.drawImage(s.img, frame * s.fw, 0, s.fw, s.fh, -s.fw / 2, dy, s.fw, s.fh);
    ctx.restore();
  },
};

/* ---------------------------------------------------------
 * Anim: 화면에 재생되는 이펙트
 *  key        : SHEETS 이름
 *  x, y       : 위치
 *  scale      : 크기 배율
 *  fps        : 재생 속도 (없으면 시트 기본값)
 *  startFrame : 몇 번째 프레임부터 재생할지
 *  chargeTime / chargeFrames : 앞쪽 chargeFrames 장을 chargeTime 초에 걸쳐 천천히 재생
 *                              (불꽃 폭탄이 "모였다가" 정확히 피해가 들어갈 때 터지도록)
 *  vx, vy     : 움직이는 이펙트
 *  life       : 반복 애니메이션이면 몇 초 동안 보일지
 * --------------------------------------------------------- */
function playAnim(G, key, x, y, opt = {}) {
  if (!Sprites.ready(key)) return false;
  G.anims.push(Object.assign({ key, x, y, t: 0, scale: 1, flip: 1, rot: 0, vx: 0, vy: 0, anchor: 'center', alpha: 1 }, opt));
  return true;
}

function animFrame(a) {
  const s = SHEETS[a.key];
  const fps = a.fps || s.fps;
  if (a.chargeTime && a.t < a.chargeTime) return Math.floor(a.t / a.chargeTime * a.chargeFrames);
  const base = a.chargeTime ? a.chargeFrames : (a.startFrame || 0);
  const tt = a.chargeTime ? a.t - a.chargeTime : a.t;
  const i = base + Math.floor(tt * fps);
  return a.life ? i % s.frames : i;      // life 가 있으면 반복
}

function updateAnims(G, dt) {
  for (const a of G.anims) {
    a.t += dt;
    a.x += a.vx * dt; a.y += a.vy * dt;
    if (a.life) { if (a.t >= a.life) a.dead = true; }
    else if (animFrame(a) >= SHEETS[a.key].frames) a.dead = true;
  }
  G.anims = G.anims.filter(a => !a.dead);
}

function drawAnims(ctx, G) {
  for (const a of G.anims) {
    const fade = a.life ? Math.min(1, (a.life - a.t) / 0.15) : 1;
    Sprites.drawFrame(ctx, a.key, animFrame(a), a.x, a.y, { scale: a.scale, flip: a.flip, rot: a.rot, anchor: a.anchor, alpha: a.alpha * fade });
  }
}

Sprites.load();
