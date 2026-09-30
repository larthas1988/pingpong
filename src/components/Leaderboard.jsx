/**
 * 排行榜：展示本地最高分记录（最多 5 条）
 */
export function Leaderboard({ list }) {
  return (
    <div id="leaderboard">
      <h3>排行榜</h3>
      <ol id="rank-list">
        {list.length === 0 ? (
          <li className="empty">暂无记录</li>
        ) : (
          list.map((item, i) => (
            <li key={item.date ?? i} className={i < 3 ? `top${i + 1}` : undefined}>
              <span className="rk">{i + 1}</span>
              <span className="sc">{item.score} 分</span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}