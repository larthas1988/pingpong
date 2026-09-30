import { useRef } from "react";
import { useGame, PHASE } from "../useGame.js";
import { useOrientation } from "../useOrientation.js";
import { Hud } from "./Hud.jsx";
import { Leaderboard } from "./Leaderboard.jsx";
import { Overlay } from "./Overlay.jsx";
import { MissToast } from "./MissToast.jsx";

/**
 * 应用根组件
 *
 * 布局：canvas 作为主画布铺满全屏，其余 UI 以绝对定位浮在其上。
 * 游戏引擎只依赖 canvas 元素，UI 层完全由 React 托管。
 */
export function App() {
  const canvasRef = useRef(null);
  const appRef = useRef(null);

  // 移动端竖屏时把整个场景旋转 90°，以横屏方式呈现
  useOrientation(appRef);

  const { score, combo, bestCombo, phase, missReason, missText, leaderboard, start } =
    useGame(canvasRef);

  return (
    <div id="app" ref={appRef}>
      <canvas id="scene" ref={canvasRef} />

      <Hud score={score} combo={combo} />
      <Leaderboard list={leaderboard} />
      <MissToast text={missText} reason={missReason} />

      <Overlay
        phase={phase}
        score={score}
        bestCombo={bestCombo}
        missReason={missReason}
        onStart={start}
      />
    </div>
  );
}

export { PHASE };