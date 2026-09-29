/**
 * 排行榜：使用 localStorage 持久化本地最高分记录
 */

const STORAGE_KEY = "wall-pingpong-leaderboard";
const MAX_ENTRIES = 5;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((it) => typeof it?.score === "number")
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ENTRIES);
  } catch (e) {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    /* 忽略隐私模式下的写入失败 */
  }
}

export function getLeaderboard() {
  return read();
}

/** 提交一次成绩，返回是否进入排行榜 */
export function submitScore(score) {
  if (score <= 0) return false;
  const list = read();
  const entry = { score, date: Date.now() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_ENTRIES);
  write(trimmed);
  return trimmed.some((it) => it.date === entry.date);
}

export function getBestScore() {
  const list = read();
  return list.length ? list[0].score : 0;
}

export function clearLeaderboard() {
  write([]);
}