import { useEffect, useRef } from "react";

/**
 * 顶部得分 HUD：得分 + 最高连击
 * 得分变化时用 Web Animations API 播放一次脉冲动画。
 */
export function Hud({ score, combo }) {
  const scoreRef = useRef(null);

  useEffect(() => {
    const el = scoreRef.current;
    if (!el) return;
    el.animate(
      [{ transform: "scale(1.25)" }, { transform: "scale(1)" }],
      { duration: 220, easing: "ease-out" }
    );
  }, [score]);

  return (
    <div id="hud">
      <div className="score-box">
        <span className="label">得分</span>
        <span id="score" className="value" ref={scoreRef}>
          {score}
        </span>
      </div>
      <div className="score-box">
        <span className="label">最高连击</span>
        <span id="combo" className="value">
          {combo}
        </span>
      </div>
    </div>
  );
}