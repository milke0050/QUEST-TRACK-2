// 저장하는 코드는 모두 여기에만 둔다. (지금은 이 기기의 브라우저, 나중에 서버로 바꿀 자리)
const Store = (() => {
  const KEY = "week07-game";
  const START = { coins: 1000, log: [] };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...START, ...JSON.parse(raw) } : structuredClone(START);
    } catch (e) {
      return structuredClone(START);
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
    return structuredClone(START);
  }

  return { load, save, reset };
})();
