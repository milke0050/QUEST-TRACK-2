// 저장하는 코드는 모두 여기에만 둔다. (지금은 이 기기의 브라우저, 나중에 서버로 바꿀 자리)
// 방, 판 상태, 코인, 주식, 거래 기록이 모두 state 하나에 들어 있다.
const Store = (() => {
  const KEY = "week07-game";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const st = raw ? JSON.parse(raw) : null;
      return st && st.version === 1 ? st : null;
    } catch (e) {
      return null;
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* 저장이 막혀도 게임은 계속된다 */
    }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  return { load, save, reset };
})();
