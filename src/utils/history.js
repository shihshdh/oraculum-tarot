/**
 * 占卜历史记录（存 localStorage）
 * 每条记录：{id, timestamp, question, cards, reading}
 */

const HISTORY_KEY = 'tarot-history';
const MAX_ENTRIES = 50;

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (_) {
    return [];
  }
}

export function saveHistoryEntry(entry) {
  const list = loadHistory();
  list.unshift({
    id: `hist-${Date.now()}`,
    timestamp: Date.now(),
    ...entry,
  });
  // 限制条数
  const trimmed = list.slice(0, MAX_ENTRIES);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed[0];
}

export function deleteHistoryEntry(id) {
  const list = loadHistory().filter((e) => e.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

export function formatTimestamp(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
