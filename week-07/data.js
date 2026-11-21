// 게임에 쓰는 숫자와 글을 모아 둔 곳. 규칙을 바꾸고 싶으면 여기 숫자만 고치면 된다.
const PRODUCTS = {
  umbrella: { name: "우산", icon: "☂️" },
  coat: { name: "겨울옷", icon: "🧥" },
  icecream: { name: "아이스크림", icon: "🍦" },
  firework: { name: "불꽃놀이", icon: "🎆" },
};

// 정세 힌트 글: [0] 공식 예보 문장, [1] 소문 문장
const HINT_TEXT = {
  umbrella: ["장마 구름이 몰려온다는 예보가 나왔어요", "하늘이 잔뜩 어두워졌다는 소문이 돌아요"],
  coat: ["때 이른 한파가 온다는 예보가 나왔어요", "눈이 올 것 같다는 소문이 돌아요"],
  icecream: ["폭염 경보가 내려졌다는 예보가 나왔어요", "바닷가에 사람이 몰렸다는 소문이 돌아요"],
  firework: ["큰 축제가 열린다는 예보가 나왔어요", "광장에 무대를 짓는다는 소문이 돌아요"],
};

const PRICES = {
  low: { label: "저가", price: 10, weight: 3 }, // 많이 팔리지만 이익이 작아요
  mid: { label: "적정가", price: 13, weight: 2 },
  high: { label: "고가", price: 17, weight: 1 }, // 적게 팔리지만 이익이 커요
};

const UNIT_COST = [0, 8, 6, 4]; // 공장 레벨별 제품 1개 만드는 비용
const UPKEEP = [0, 10, 30, 60]; // 공장 레벨별 턴마다 내는 유지비
const CAP = [0, 25, 35, 45]; // 공장 레벨별 한 턴에 팔 수 있는 최대 개수
const UPGRADE_COST = { 1: 200, 2: 300 }; // 현재 레벨 -> 올리는 값
const MAX_SLOTS = 3;
const NEW_SLOT_COST = 200;

const DEMAND_MAIN = 100; // 정세에 맞는 제품 수요
const DEMAND_BASE = 20; // 나머지 제품 수요
const NICHE_BONUS = 60;
const SPY_COST = 30;
const SECURE_COST = 40;
const EVENT_CHANCE = 0.25;
const TOTAL_TURNS = 8;
const START_COINS = 1000;
const SHARES = 10; // 회사마다 주식 수
const START_STOCK = 100;

const PHASE_NAMES = ["정세 공개", "기업 준비·비밀 조사", "주식 베팅", "돌발 뉴스", "결과 정산"];

const EVENTS = {
  rawcost: { title: "💥 원자재 폭등!", text: "모든 공장 만드는 비용이 +2코인!" },
  regulation: { title: "🌿 환경 규제!", text: "레벨 2 이상 공장의 유지비가 2배!" },
  niche: { title: "🔥 틈새 트렌드 폭발!", text: "" }, // 글은 게임에서 제품 이름을 넣어 만든다
};

// 방(여러 명이 함께 하기)
const MAX_PER_ROLE = 4; // 기업 4자리 + 투자자 4자리 = 사람 최대 8명
const MIN_PER_ROLE = 2; // 사람이 모자라면 봇이 들어와서 역할마다 최소 2자리를 채운다
const BOT_COMPANY_NAMES = ["햇살상회", "푸른공방", "바람상점", "별빛제작소"];
const BOT_INVESTOR_NAMES = ["투자봇 가", "투자봇 나", "투자봇 다", "투자봇 라"];
