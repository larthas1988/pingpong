import { PHASE } from "../useGame.js";

/**
 * 遮罩面板：开始界面 / 结算界面
 * 通过 phase 决定展示内容，visible 控制淡入淡出。
 */
export function Overlay({ phase, score, bestCombo, missReason, onStart }) {
  const visible = phase === PHASE.READY || phase === PHASE.OVER;

  return (
    <div id="overlay" className={visible ? "visible" : undefined}>
      <div className="panel">
        {phase === PHASE.OVER ? (
          <GameOverContent
            score={score}
            bestCombo={bestCombo}
            missReason={missReason}
          />
        ) : (
          <ReadyContent />
        )}
        <button id="start-btn" onClick={onStart}>
          {phase === PHASE.OVER ? "再来一局" : "开始游戏"}
        </button>
      </div>
    </div>
  );
}

function ReadyContent() {
  return (
    <>
      <h1>对墙乒乓球</h1>
      <p className="sub">
        以握拍视角把球打向墙壁，接住回弹的球即可得分
        <br />
        球一旦落地，本局立即结束
      </p>
      <div className="tips">
        <div className="tip">
          <b>移动球拍</b>
          <span>鼠标 / 手指在屏幕上的位置即为球拍位置</span>
        </div>
        <div className="tip">
          <b>移动端</b>
          <span>按住屏幕拖动即可控制球拍</span>
        </div>
      </div>
    </>
  );
}

function GameOverContent({ score, bestCombo, missReason }) {
  const reasonText =
    missReason === "落地" ? "球落地了，本局结束" : "漏球了，本局结束";

  return (
    <>
      <h1>游戏结束</h1>
      <p className="sub">
        {reasonText}
        <br />
        本局得分 <b className="final-score">{score}</b> 分 · 最高连击 {bestCombo}
      </p>
    </>
  );
}