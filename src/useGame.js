import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "./game.js";
import { InputController } from "./controls.js";
import { getLeaderboard, submitScore } from "./leaderboard.js";

/**
 * 游戏状态机：ready(开始遮罩) -> playing -> over(结算遮罩)
 */
export const PHASE = {
  READY: "ready",
  PLAYING: "playing",
  OVER: "over",
};

/**
 * 把 Three.js 引擎（Game）与输入控制器（InputController）接入 React。
 *
 * 设计要点：
 * - 引擎实例只创建一次，存放在 ref 中，避免 React 重渲染时重建 WebGL 上下文。
 * - 引擎回调通过 ref 转发，保证回调里读到的永远是最新的 setState。
 * - 分数、连击、阶段等 UI 状态由 React 托管，替代原先的手动 DOM 操作。
 */
export function useGame(canvasRef) {
  const gameRef = useRef(null);
  const inputRef = useRef(null);
  const rafRef = useRef(0);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [phase, setPhase] = useState(PHASE.READY);
  const [missReason, setMissReason] = useState(null);
  const [missText, setMissText] = useState("");
  const [leaderboard, setLeaderboard] = useState(() => getLeaderboard());

  // 引擎回调里需要读取最新的 phase，用 ref 镜像一份避免闭包过期
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const refreshLeaderboard = useCallback(() => {
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const game = new Game(canvas, {
      onScore(nextScore, nextCombo) {
        setScore(nextScore);
        setCombo(nextCombo);
        setBestCombo((prev) => Math.max(prev, nextCombo));
      },
      onMiss(_score, reason) {
        setMissReason(reason);
        setMissText(reason === "落地" ? "球落地了！" : "漏球了！");
      },
      onGameOver(finalScore, finalBestCombo, reason) {
        if (finalScore > 0) submitScore(finalScore);
        refreshLeaderboard();
        setBestCombo(finalBestCombo);
        setMissReason(reason);

        // 延迟展示结算面板，让失分提示先播完
        window.setTimeout(() => {
          setPhase(PHASE.OVER);
        }, 900);
      },
    });

    gameRef.current = game;
    inputRef.current = new InputController(canvas);

    // 主循环：把输入控制值喂给引擎
    const tick = () => {
      const input = inputRef.current;
      if (input) {
        const { x, y } = input.getValues();
        game.setControl(x, y);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    // 页面隐藏时暂停
    const onVisibilityChange = () => {
      if (document.hidden) game.stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      game.dispose();
      gameRef.current = null;
      inputRef.current = null;
    };
  }, [canvasRef, refreshLeaderboard]);

  const start = useCallback(() => {
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setMissReason(null);
    setMissText("");
    setPhase(PHASE.PLAYING);
    gameRef.current?.start();
  }, []);

  return {
    score,
    combo,
    bestCombo,
    phase,
    missReason,
    missText,
    leaderboard,
    start,
    refreshLeaderboard,
  };
}