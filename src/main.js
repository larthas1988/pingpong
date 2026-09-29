import { Game } from "./game.js";
import { InputController } from "./controls.js";
import { getLeaderboard, submitScore } from "./leaderboard.js";

const canvas = document.getElementById("scene");
const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const rankListEl = document.getElementById("rank-list");
const overlayEl = document.getElementById("overlay");
const startBtn = document.getElementById("start-btn");
const missToast = document.getElementById("miss-toast");

// ---------------------------------------------------------------- 排行榜渲染
function renderLeaderboard(highlightScore = null) {
  const list = getLeaderboard();
  rankListEl.innerHTML = "";

  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "暂无记录";
    rankListEl.appendChild(li);
    return;
  }

  list.forEach((item, i) => {
    const li = document.createElement("li");
    if (i < 3) li.classList.add(`top${i + 1}`);

    const rk = document.createElement("span");
    rk.className = "rk";
    rk.textContent = `${i + 1}`;

    const sc = document.createElement("span");
    sc.className = "sc";
    sc.textContent = `${item.score} 分`;

    li.append(rk, sc);
    rankListEl.appendChild(li);
  });
}

// ---------------------------------------------------------------- 游戏实例
const game = new Game(canvas, {
  onScore(score, combo) {
    scoreEl.textContent = score;
    comboEl.textContent = combo;
    // 连击时给得分数字一个脉冲
    scoreEl.animate(
      [{ transform: "scale(1.25)" }, { transform: "scale(1)" }],
      { duration: 220, easing: "ease-out" }
    );
  },
  onMiss(score, reason) {
    showMissToast(reason === "落地" ? "球落地了！" : "漏球了！");
  },
  onGameOver(score, bestCombo, reason) {
    if (score > 0) submitScore(score);
    renderLeaderboard(score);

    // 延迟展示结算面板
    setTimeout(() => {
      showGameOverPanel(score, bestCombo, reason);
    }, 900);
  },
});

const input = new InputController(canvas);

// ---------------------------------------------------------------- 主循环驱动
function tick() {
  const { x, y } = input.getValues();
  game.setControl(x, y);
  requestAnimationFrame(tick);
}
tick();

// ---------------------------------------------------------------- UI 交互
function showMissToast(text) {
  missToast.textContent = text;
  missToast.classList.remove("show");
  // 触发重排以重启动画
  void missToast.offsetWidth;
  missToast.classList.add("show");
}

function showGameOverPanel(score, bestCombo, reason) {
  const reasonText =
    reason === "落地" ? "球落地了，本局结束" : "漏球了，本局结束";
  overlayEl.querySelector(".panel").innerHTML = `
    <h1>游戏结束</h1>
    <p class="sub">${reasonText}<br/>本局得分 <b style="color:#6ee7ff;font-size:20px">${score}</b> 分 · 最高连击 ${bestCombo}</p>
    <button id="start-btn">再来一局</button>
  `;
  overlayEl.classList.add("visible");
  bindStartButton();
}

function bindStartButton() {
  const btn = overlayEl.querySelector("#start-btn");
  if (!btn) return;
  btn.addEventListener("click", startGame, { once: true });
}

function startGame() {
  overlayEl.classList.remove("visible");
  game.start();
}

// ---------------------------------------------------------------- 横屏适配
// 移动端竖屏时，把整个场景旋转 90° 以横屏方式呈现，
// 避免竖屏下视野过窄、球拍显得过大。
const appEl = document.getElementById("app");

function applyOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth;
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

  if (isTouch && isPortrait) {
    // 旋转 90°：宽高互换，居中铺满
    const w = window.innerWidth;
    const h = window.innerHeight;
    appEl.style.position = "fixed";
    appEl.style.width = `${h}px`;
    appEl.style.height = `${w}px`;
    appEl.style.left = "50%";
    appEl.style.top = "50%";
    appEl.style.transformOrigin = "center center";
    appEl.style.transform = "translate(-50%, -50%) rotate(90deg)";
  } else {
    appEl.style.position = "";
    appEl.style.width = "";
    appEl.style.height = "";
    appEl.style.left = "";
    appEl.style.top = "";
    appEl.style.transformOrigin = "";
    appEl.style.transform = "";
  }

  // 旋转后需要重新计算 canvas 尺寸
  window.dispatchEvent(new Event("resize"));
}

// ---------------------------------------------------------------- 初始化
renderLeaderboard();
bindStartButton();
applyOrientation();
window.addEventListener("orientationchange", () =>
  setTimeout(applyOrientation, 120)
);

// 页面隐藏时暂停
document.addEventListener("visibilitychange", () => {
  if (document.hidden) game.stop();
});