/* =========================================================
 * data.js — 게임의 "숫자와 글"을 모아 둔 곳
 * 밸런스를 바꾸고 싶으면 대부분 이 파일만 고치면 됩니다.
 * ========================================================= */

// 화면 크기와 땅 높이
const W = 1280, H = 720, GROUND = 620;

/* ---------------------------------------------------------
 * 방향 표기 (격투게임에서 쓰는 "숫자 패드 표기")
 *   7 8 9      ↖ ↑ ↗
 *   4 5 6  =   ← · →
 *   1 2 3      ↙ ↓ ↘
 * 6 = →, 4 = ←. 캐릭터가 어느 쪽을 보든 커맨드는 바뀌지 않습니다.
 * (마법은 캐릭터가 바라보는 쪽 = 가장 가까운 적 쪽으로 나갑니다)
 * --------------------------------------------------------- */
// 대각선(1·3·7·9)은 커맨드에 쓰지 않는다. 키보드로 넣기 어렵기 때문.
// 두 키를 같이 누르는 순간 생기는 대각선 입력은 버퍼에 기록하지 않고 무시한다.
const ARROWS = { 1:'↙', 2:'↓', 3:'↘', 4:'←', 5:'·', 6:'→', 7:'↖', 8:'↑', 9:'↗' };

// 속성
const ELEMENTS = {
  fire:     { name:'불',   color:'#ff6a3d', icon:'🔥' },
  water:    { name:'물',   color:'#3da5ff', icon:'💧' },
  wind:     { name:'바람', color:'#6dffa8', icon:'🌪' },
  electric: { name:'전기', color:'#ffe04a', icon:'⚡' },
  none:     { name:'무',   color:'#c9b8ff', icon:'✦' },
};

/* ---------------------------------------------------------
 * 희귀도
 *  chance      : 뽑기 확률(%)
 *  power       : 위력 배율
 *  mana        : 마나 소모
 *  castTime    : 영창 시간(초) — 이 동안 맞으면 마법진이 깨질 수 있음
 *  cooldown    : 재사용 대기(초)
 *  breakChance : 영창 중 맞았을 때 마법진이 깨질 확률
 *  penaltyTime : 마법진이 깨졌을 때 페널티 시간(초)
 * --------------------------------------------------------- */
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RARITIES = {
  common:    { name:'일반', color:'#cfcfcf', chance:50, power:1.0, mana:8,  castTime:0.12, cooldown:0.35, breakChance:0.30, penaltyTime:1.0 },
  uncommon:  { name:'고급', color:'#5fd068', chance:28, power:1.4, mana:14, castTime:0.18, cooldown:0.6,  breakChance:0.40, penaltyTime:1.5 },
  rare:      { name:'희귀', color:'#4aa3ff', chance:14, power:1.9, mana:22, castTime:0.25, cooldown:1.0,  breakChance:0.55, penaltyTime:2.0 },
  epic:      { name:'영웅', color:'#b56cff', chance:6,  power:2.6, mana:32, castTime:0.35, cooldown:1.8,  breakChance:0.70, penaltyTime:2.5 },
  legendary: { name:'전설', color:'#ffb627', chance:2,  power:3.5, mana:45, castTime:0.45, cooldown:3.0,  breakChance:0.85, penaltyTime:3.0 },
};

/* ---------------------------------------------------------
 * 마법 목록
 *  cmd   : 커맨드(숫자 패드 표기). 마지막 방향 + Space(공격) 로 발동
 *  shape : 마법 모양 (effects.js 의 castEffect 가 처리)
 *          bolt(투사체) blast(폭발) wave(땅을 타는 파도) zone(장판)
 *          strike(번개 꽂기) chain(연쇄) cone(전방 밀치기) dash(돌진) rain(비)
 *  dmg   : 기본 피해 (희귀도 배율이 곱해짐)
 *  status: 상태이상 { burn 화상, wet 젖음, slow 둔화, shock 감전, freeze 빙결 } (초)
 * --------------------------------------------------------- */
const SPELLS = [
  // ---- 불: 지속 피해·폭발·화상 ----
  { id:'ember',      name:'불씨',      element:'fire', rarity:'common',    cmd:[2],           shape:'bolt',  dmg:10, speed:620, size:10, status:{ burn:2 }, desc:'작은 불꽃을 쏜다. 화상 2초.' },
  { id:'fireball',   name:'화염구',    element:'fire', rarity:'uncommon',  cmd:[2,6],       shape:'bolt',  dmg:14, speed:520, size:18, explode:70, status:{ burn:3 }, desc:'닿으면 폭발하는 불덩이.' },
  { id:'flamepillar',name:'화염 기둥', element:'fire', rarity:'rare',      cmd:[6,2,6],     shape:'blast', dmg:18, dist:240, radius:75, delay:0.25, status:{ burn:4 }, desc:'적 발밑에서 불기둥이 솟는다.' },
  { id:'inferno',    name:'폭염진',    element:'fire', rarity:'epic',      cmd:[4,2,6,2,6],   shape:'zone',  dmg:7,  dist:220, radius:130, life:3, tick:0.3, status:{ burn:4 }, desc:'불타는 마법진을 3초 동안 펼친다.' },
  { id:'sunfall',    name:'태양 낙하', element:'fire', rarity:'legendary', cmd:[2,6,2,6,8,8], shape:'blast', dmg:32, dist:280, radius:170, delay:0.6, status:{ burn:5 }, desc:'하늘에서 작은 태양이 떨어진다.' },

  // ---- 물: 범위·이동 방해·빙결 ----
  { id:'droplet',    name:'물방울',    element:'water', rarity:'common',   cmd:[4],           shape:'bolt',  dmg:7,  speed:560, size:11, status:{ wet:4 }, desc:'적을 적신다. 젖은 적은 전기에 약하다.' },
  { id:'wave',       name:'물결',      element:'water', rarity:'uncommon', cmd:[2,4],       shape:'wave',  dmg:10, speed:420, w:60, h:70, life:1.4, status:{ wet:5, slow:2 }, desc:'땅을 타고 가는 물결. 젖음 + 둔화.' },
  { id:'whirlpool',  name:'소용돌이',  element:'water', rarity:'rare',     cmd:[6,2,4],     shape:'zone',  dmg:5,  dist:200, radius:115, life:3, tick:0.35, pull:130, status:{ wet:4, slow:1 }, desc:'적을 끌어당기는 소용돌이.' },
  { id:'tidal',      name:'빙결 해일', element:'water', rarity:'epic',     cmd:[6,2,4,2,4],   shape:'wave',  dmg:22, speed:380, w:120, h:150, life:2.2, status:{ wet:4, freeze:1.5 }, desc:'거대한 파도가 적을 얼린다.' },

  // ---- 바람: 빠른 투사체·밀쳐내기·이동 보조 ----
  { id:'gust',       name:'바람칼',    element:'wind', rarity:'common',    cmd:[6,6],         shape:'bolt',  dmg:9,  speed:950, size:8, pierce:2, knock:120, desc:'아주 빠른 바람 칼날. 3명까지 관통.' },
  { id:'tornado',    name:'회오리',    element:'wind', rarity:'uncommon',  cmd:[2,8],         shape:'wave',  dmg:6,  speed:260, w:50, h:140, life:2.0, multiHit:0.25, knock:60, desc:'천천히 나아가며 여러 번 때린다.' },
  { id:'galeblade',  name:'질풍 베기', element:'wind', rarity:'rare',      cmd:[6,4,6],       shape:'dash',  dmg:18, distance:260, knock:200, desc:'앞으로 돌진하며 벤다. 돌진 중 무적.' },
  { id:'tempest',    name:'대폭풍',    element:'wind', rarity:'epic',      cmd:[2,8,2,8,6],   shape:'cone',  dmg:20, range:360, knock:520, desc:'앞쪽의 적을 멀리 날려 버린다.' },

  // ---- 전기: 순간 폭발 피해·연쇄·감전 ----
  { id:'spark',      name:'스파크',    element:'electric', rarity:'common',    cmd:[8],             shape:'strike', dmg:9,  count:1, range:520, status:{ shock:0.25 }, desc:'가장 가까운 적에게 작은 번개.' },
  { id:'thunder',    name:'번개 강타', element:'electric', rarity:'uncommon',  cmd:[6,2],         shape:'strike', dmg:18, count:1, range:620, radius:60, status:{ shock:0.5 }, desc:'굵은 번개를 내리꽂는다.' },
  { id:'chainbolt',  name:'연쇄 번개', element:'electric', rarity:'rare',      cmd:[4,6,4,6],       shape:'chain',  dmg:15, jumps:4, range:560, jumpRange:230, status:{ shock:0.4 }, desc:'적 사이를 튀는 번개.' },
  { id:'judgment',   name:'뇌신의 심판', element:'electric', rarity:'legendary', cmd:[6,2,4,6,8,8], shape:'strike', dmg:34, count:6, range:1500, radius:80, status:{ shock:1.2 }, desc:'화면의 적 여섯에게 벼락.' },
];
const SPELL_MAP = {};
SPELLS.forEach(s => { SPELL_MAP[s.id] = s; });

// 처음 가지고 시작하는 마법 (속성마다 일반 1개)
const STARTING_SPELLS = ['ember', 'droplet', 'gust', 'spark'];

// 방향키 없이 Space 만 누르면 나가는 기본 마력탄 (마나 0, 약함)
const BASIC_BOLT = { id:'basic', name:'마력탄', element:'none', rarity:'common', cmd:[], shape:'bolt', dmg:5, speed:720, size:7, cooldown:0.28 };

// 커맨드 입력 허용 시간(ms): 첫 방향 ~ 마지막 방향 사이. 길수록 넉넉하게.
function windowFor(spell) { return 150 + 180 * spell.cmd.length; }

/* ---------------------------------------------------------
 * 복합 마법 (다중 영창)
 * 연속 영창 시간(chainWindow) 안에 속성 순서대로 마법을 쓰면 발동.
 * 규칙: 3단 조합의 앞 두 개는 2단 조합과 겹치지 않게 만든다.
 *      (겹치면 2단이 먼저 터져서 3단을 만들 수 없기 때문)
 * --------------------------------------------------------- */
const COMBOS = [
  // 2단
  { seq:['fire','wind'],       name:'화염 폭풍',  element:'fire',     shape:'wave',   dmg:26, speed:430, w:110, h:170, life:1.6, multiHit:0.2, knock:80, status:{ burn:4 } },
  { seq:['water','electric'],  name:'광역 감전',  element:'electric', shape:'strike', dmg:24, count:8, range:1000, radius:90, status:{ shock:0.8 } },
  { seq:['wind','electric'],   name:'번개 폭풍',  element:'electric', shape:'zone',   dmg:9,  dist:230, radius:150, life:2.5, tick:0.2, status:{ shock:0.2 } },
  { seq:['water','fire'],      name:'증기 안개',  element:'water',    shape:'zone',   dmg:6,  dist:0,   radius:190, life:3, tick:0.3, status:{ slow:1 } },
  { seq:['electric','fire'],   name:'플라즈마 창', element:'fire',    shape:'bolt',   dmg:40, speed:1300, size:16, pierce:99, status:{ burn:3 } },
  { seq:['wind','water'],      name:'폭우',       element:'water',    shape:'rain',   dmg:10, count:14, status:{ wet:6, slow:1.5 } },
  { seq:['wind','wind'],       name:'진공 칼날',  element:'wind',     shape:'bolt',   dmg:22, speed:1100, size:22, pierce:99, knock:250 },
  // 3단 (희귀 복합 마법)
  { seq:['water','wind','fire'],         name:'증기 폭발',   element:'fire',     shape:'blast',  dmg:60, dist:240, radius:200, delay:0.35, status:{ burn:3 } },
  { seq:['fire','fire','electric'],      name:'초고온 폭발', element:'fire',     shape:'blast',  dmg:80, dist:220, radius:150, delay:0.4, status:{ burn:6 } },
  { seq:['electric','electric','electric'], name:'뇌운',     element:'electric', shape:'rain',   dmg:16, count:20, status:{ shock:0.4 } },
  { seq:['water','water','water'],       name:'절대 영도',   element:'water',    shape:'strike', dmg:20, count:99, range:2000, radius:0, status:{ freeze:3 } },
  { seq:['wind','fire','electric'],      name:'뇌염 회오리', element:'electric', shape:'wave',   dmg:14, speed:300, w:90, h:200, life:2.4, multiHit:0.15, status:{ burn:3, shock:0.2 } },
];

/* ---------------------------------------------------------
 * 영창 지원병
 *  ratios : 자동 입력 비율 단계 (마지막 입력은 항상 플레이어)
 *  power  : 비율별 위력
 * --------------------------------------------------------- */
const SUPPORT = {
  ratios: [0, 0.25, 0.5, 0.75, 1],
  power:  [1, 0.95, 0.85, 0.70, 0.60],
  baseInterval: 0.45,   // 자동 입력 1칸에 걸리는 시간(초)
  intervalStep: 0.10,   // 속도 업그레이드 1단계마다 줄어드는 시간
  minInterval: 0.15,
  manaDiscountStep: 0.08,
};

/* ---------------------------------------------------------
 * 기술 숙련도 (브라우저에 저장되어 판이 끝나도 남음)
 *  thresholds: 레벨별 필요 사용 횟수 (Lv0 ~ Lv4)
 *  레벨마다 : 위력 +3%, 마나 -5%, 입력 허용 시간 +12%, 영창 시간 -6%
 *  Lv2      : 방향 실수 1번 더 허용
 *  Lv4      : 상태이상 시간 +50%
 * --------------------------------------------------------- */
const MASTERY = { thresholds:[0, 5, 15, 30, 60], power:0.03, mana:0.05, window:0.12, cast:0.06 };

// 도구
const TOOLS = {
  potion:    { name:'마나 물약',       icon:'🧪', desc:'마나를 50 회복한다.' },
  charm:     { name:'영창 보호 부적',   icon:'📜', desc:'10초 동안 맞아도 마법진이 깨지지 않는다.' },
  repair:    { name:'마법진 복구 도구', icon:'🔧', desc:'마법진 파괴 페널티와 저주, 모든 재사용 대기를 없앤다.' },
  blink:     { name:'순간 회피 장치',   icon:'💨', desc:'뒤로 순간이동하고 1.2초 무적.' },
  hourglass: { name:'영창 모래시계',    icon:'⏳', desc:'15초 동안 입력 허용 시간 ×1.6, 연속 영창 시간 ×1.5.' },
  amplifier: { name:'증폭 수정',       icon:'💎', desc:'다음 마법(복합 포함) 위력 ×1.6.' },
};
const MAX_TOOLS = 5;

// 플레이어 기본 수치
const PLAYER_BASE = {
  maxHp: 100, maxMana: 100, manaRegen: 9, speed: 260,
  dodgeTime: 0.28, dodgeCd: 0.8, dodgeSpeed: 700,
  hitInvuln: 0.9,          // 맞은 뒤 무적 시간 (연속으로 억울하게 맞지 않게)
  vulnerableMul: 1.3,      // 마법진 파괴 페널티: 받는 피해 +30%
  chainWindow: 1.3,        // 연속 영창 허용 시간(초)
  lastInputGrace: 300,     // 마지막 방향을 뗀 뒤 Space 를 눌러도 되는 시간(ms)
  baseNoise: 1,            // 커맨드 사이 허용되는 잘못된 방향 수
};

// 일반 적
const ENEMIES = {
  slime:  { name:'슬라임',      hp:40,  speed:75,  w:46, h:34, dmg:10, fly:false, color:'#6fdc8c', weak:'electric', resist:'water' },
  bat:    { name:'박쥐 정령',   hp:26,  speed:160, w:42, h:26, dmg:8,  fly:true,  color:'#a685e2', weak:'wind',     resist:'fire' },
  goblin: { name:'고블린 술사', hp:50,  speed:70,  w:40, h:56, dmg:12, fly:false, color:'#e0a548', weak:'fire',     resist:'electric' },
  golem:  { name:'돌 골렘',     hp:130, speed:42,  w:66, h:80, dmg:18, fly:false, color:'#9a9a9a', weak:'water',    resist:'wind' },
  dummy:  { name:'허수아비',    hp:999999, speed:0, w:50, h:90, dmg:0, fly:false, color:'#c8a46e' },
};

// 보스: 밴시
const BANSHEE = {
  name: '밴시', hp: 1500, shield: 300, w: 90, h: 130,
  floatBottom: 420,       // 보호막이 있을 때 떠 있는 높이(발 위치)
  shieldReduce: 0.15,     // 보호막이 있을 때 본체가 받는 피해 비율
  comboShieldMul: 2.5,    // 복합 마법은 보호막에 2.5배
  exposeTime: 8,          // 마법진 노출 시간
  exposedMul: 1.5,        // 노출 중 받는 피해 배율
  staggerTime: 2.5,       // 보호막이 깨진 직후 휘청이는 시간
  restoreTime: 2.5,       // 마법진 복구(보호막 재생성) 영창 시간
  restoreInterrupt: 120,  // 복구 중 이만큼 때리면 복구 실패
};

// 층(방) 구성. 마지막은 보스.
const ROOMS = [
  { name:'1층 · 이끼 동굴',     waves:[['slime','slime','slime'], ['slime','slime','bat']] },
  { name:'2층 · 박쥐 둥지',     waves:[['bat','bat','slime'], ['bat','bat','bat','slime']] },
  { name:'3층 · 고블린 야영지', waves:[['goblin','slime','slime'], ['goblin','goblin','bat']] },
  { name:'4층 · 돌의 회랑',     waves:[['golem','slime'], ['golem','goblin','bat','bat']] },
  { name:'5층 · 밴시의 성소',   boss:true },
];
