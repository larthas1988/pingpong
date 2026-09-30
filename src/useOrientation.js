import { useEffect } from "react";

/**
 * 横屏适配
 *
 * 移动端竖屏时，把整个场景旋转 90° 以横屏方式呈现，
 * 避免竖屏下视野过窄、球拍显得过大。
 *
 * 注意：旋转后 canvas 的尺寸需要重新计算，这里通过派发 resize 事件
 * 通知引擎重新测量（引擎内部监听 window resize）。
 */
export function useOrientation(appRef) {
  useEffect(() => {
    const appEl = appRef.current;
    if (!appEl) return;

    const applyOrientation = () => {
      const isPortrait = window.innerHeight > window.innerWidth;
      const isTouch =
        "ontouchstart" in window || navigator.maxTouchPoints > 0;

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
    };

    applyOrientation();

    // 竖屏切换时浏览器上报的尺寸可能滞后，延迟再校正一次
    const onOrientationChange = () => setTimeout(applyOrientation, 120);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, [appRef]);
}