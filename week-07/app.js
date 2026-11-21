let state = Store.load();

// 코인을 바꾸는 곳은 여기 하나. 바꿀 때마다 기록을 남기고 저장한다.
function changeCoins(amount, reason) {
  if (state.coins + amount < 0) return false; // 코인이 모자라면 거래 안 됨
  state.coins += amount;
  state.log.unshift({ amount, reason, coins: state.coins });
  state.log = state.log.slice(0, 20);
  Store.save(state);
  render();
  return true;
}

function render() {
  document.getElementById("coins").textContent = state.coins;
  const ul = document.getElementById("log");
  ul.innerHTML = "";
  if (state.log.length === 0) {
    ul.innerHTML = '<li class="empty">아직 거래가 없어요.</li>';
    return;
  }
  for (const item of state.log) {
    const li = document.createElement("li");
    const sign = item.amount >= 0 ? "+" : "";
    const cls = item.amount >= 0 ? "plus" : "minus";
    const reason = document.createElement("span");
    reason.textContent = item.reason;
    const amt = document.createElement("span");
    amt.className = cls;
    amt.textContent = `${sign}${item.amount} → ${item.coins}코인`;
    li.append(reason, amt);
    ul.appendChild(li);
  }
}

document.getElementById("t-plus").onclick = () => changeCoins(100, "시험: 번 돈");
document.getElementById("t-minus").onclick = () => {
  if (!changeCoins(-100, "시험: 쓴 돈")) alert("코인이 모자라요!");
};
document.getElementById("t-reset").onclick = () => { state = Store.reset(); render(); };

render();
