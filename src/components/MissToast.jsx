import { useEffect, useState } from "react";

/**
 * 失分提示：每次失分时重新播放一次弹出动画。
 * 通过 key 变化强制 React 重建节点，从而重启动画。
 */
export function MissToast({ text, reason }) {
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!text) return;
    setAnimKey((k) => k + 1);
  }, [text, reason]);

  if (!text) return <div id="miss-toast" />;

  return (
    <div id="miss-toast" key={animKey} className="show">
      {text}
    </div>
  );
}