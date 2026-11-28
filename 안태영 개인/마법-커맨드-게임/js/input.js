/* =========================================================
 * input.js — 키보드 읽기 + 커맨드 입력 버퍼 + 커맨드 판정
 *
 * 흐름
 *  1) 매 프레임 지금 누르고 있는 방향을 숫자(1~9)로 바꾼다.
 *  2) 방향이 바뀔 때마다 { 방향, 시각 } 을 버퍼에 쌓는다.
 *  3) Space(발사)를 누르면 버퍼를 뒤에서부터 읽어 마법 커맨드와 맞는지 본다.
 * ========================================================= */

// ---------- 키보드 ----------
const Keys = { down: new Set(), pressed: new Set() };
const BLOCK_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];
// 대쉬 키 (왼쪽·오른쪽 Shift 둘 다)
function dashPressed() { return wasPressed('ShiftLeft') || wasPressed('ShiftRight'); }

window.addEventListener('keydown', e => {
  if (BLOCK_KEYS.includes(e.code)) e.preventDefault();   // 화면이 스크롤되지 않게
  if (!e.repeat) Keys.pressed.add(e.code);              // 이번 프레임에 "새로" 누른 키
  Keys.down.add(e.code);                                // 누르고 있는 키
  Sound.init();
});
window.addEventListener('keyup', e => {
  if (BLOCK_KEYS.includes(e.code)) e.preventDefault();   // Space 로 버튼이 눌리지 않게
  Keys.down.delete(e.code);
});
window.addEventListener('blur', () => Keys.down.clear());

function wasPressed(code) { return Keys.pressed.has(code); }
function isDown(code) { return Keys.down.has(code); }
function endFrameInput() { Keys.pressed.clear(); }

// 커맨드용 키(화살표)를 숫자 패드 방향으로 바꾼다.
// 마법 커맨드는 화살표, 이동은 A/D — 둘을 나눠서 커맨드를 넣어도 캐릭터가 움직이지 않는다.
// 커맨드는 바라보는 방향과 상관없이 늘 같다: → 는 언제나 6, ← 는 언제나 4.
// (facing 은 예전 코드와 맞추려고 받기만 하고 쓰지 않음)
function readDirection(facing) {
  const x = (isDown('ArrowRight') ? 1 : 0) - (isDown('ArrowLeft') ? 1 : 0);
  const y = (isDown('ArrowUp') ? 1 : 0) - (isDown('ArrowDown') ? 1 : 0);
  return 5 + x + y * 3;
}


// 좌우 반전 (1↔3, 4↔6, 7↔9)
function mirrorDir(d) {
  if (d % 3 === 1) return d + 2;
  if (d % 3 === 0) return d - 2;
  return d;
}

// 화면에 보여 줄 화살표 (뒤집지 않음)
function arrowFor(d, facing) { return ARROWS[d]; }
function cmdToArrows(cmd, facing) { return cmd.map(d => arrowFor(d, facing)).join(''); }

// ---------- 커맨드 입력 버퍼 ----------
class CommandBuffer {
  constructor() {
    this.list = [];     // { d: 방향, t: 시각(ms) }
    this.lastDir = 5;   // 지금 누르고 있는 방향
  }
  update(dir, now) {
    // 대각선(1·3·7·9)은 무시: ↓ 에서 → 로 굴리다 생기는 ↘ 는 기록하지 않는다
    if (dir !== 5 && dir % 2 === 1) return;
    if (dir !== this.lastDir) {
      this.list.push({ d: dir, t: now });
      this.lastDir = dir;
      if (this.list.length > 40) this.list.shift();
    }
  }
  clear() { this.list = []; }
  // 최근 ms 안에 들어온 방향들 (중립 5 제외)
  recent(now, ms) { return this.list.filter(e => e.d !== 5 && now - e.t <= ms); }
}

/* ---------------------------------------------------------
 * 커맨드 판정
 *  list       : 버퍼
 *  cmd        : 필요한 방향 배열 (예: [2,3,6])
 *  now        : 지금 시각(ms)
 *  currentDir : 지금 누르고 있는 방향
 *  windowMs   : 첫 방향 ~ 마지막 방향 허용 시간
 *  maxNoise   : 사이에 끼어도 되는 잘못된 방향 수
 * 결과: { ok, noise, duration, reason }
 *  reason: 'order'(순서 틀림) 'late'(Space를 너무 늦게) 'slow'(커맨드가 너무 느림) 'noise'(실수 많음)
 * --------------------------------------------------------- */
function matchCommand(list, cmd, now, currentDir, windowMs, maxNoise) {
  if (!cmd || cmd.length === 0) return { ok: false, reason: 'order' };
  const entries = list.filter(e => e.d !== 5);   // 중립은 무시
  let i = entries.length - 1;
  if (i < 0) return { ok: false, reason: 'order' };

  // 1) 마지막 방향이 맞는지, 그리고 Space 를 제때 눌렀는지
  const last = entries[i];
  if (last.d !== cmd[cmd.length - 1]) return { ok: false, reason: 'order' };
  const held = currentDir === last.d;
  if (!held && now - last.t > PLAYER_BASE.lastInputGrace) return { ok: false, reason: 'late' };

  // 2) 뒤에서부터 나머지 방향을 순서대로 찾는다
  let ci = cmd.length - 2;
  let noise = 0;
  let firstT = last.t;
  i--;
  while (ci >= 0) {
    if (i < 0) return { ok: false, reason: 'order' };
    const e = entries[i];
    if (last.t - e.t > windowMs) return { ok: false, reason: 'slow' };
    if (e.d === cmd[ci]) { firstT = e.t; ci--; }
    else noise++;
    i--;
  }
  if (noise > maxNoise) return { ok: false, reason: 'noise', noise };
  return { ok: true, noise, duration: last.t - firstT };
}

// 연습장용: 왜 실패했는지 사람이 읽을 수 있는 말로
function explainFail(list, cmd, now, currentDir, windowMs, maxNoise) {
  const r = matchCommand(list, cmd, now, currentDir, windowMs, maxNoise);
  if (r.ok) return null;
  // 시간·실수 제한을 풀고 다시 보면 원인을 알 수 있다
  const loose = matchCommand(list, cmd, now, currentDir, Infinity, Infinity);
  if (loose.ok) {
    if (loose.duration > windowMs) return `너무 느려요 (${(loose.duration / 1000).toFixed(2)}초 / 허용 ${(windowMs / 1000).toFixed(2)}초)`;
    if (loose.noise > maxNoise) return `사이에 잘못된 방향이 ${loose.noise}번 (허용 ${maxNoise}번)`;
  }
  if (r.reason === 'late') return '마지막 방향을 떼고 Space 를 너무 늦게 눌렀어요';
  return '순서가 달라요';
}
