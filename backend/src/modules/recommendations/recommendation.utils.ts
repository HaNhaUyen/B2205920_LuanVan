export const ACTION_SCORE: Record<string, number> = {
  view: 1,
  view_detail: 2,
  search: 2,
  favorite: 4,
  ask_ai: 2,
  image_search: 3,
  compare: 2,
  booking_draft: 5,
  booking: 10,
  review: 6,
  cancel_booking: -3,
  skip_recommendation: -1,
};

export function stripText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function truncateText(value: any, maxLength = 190) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function addScore(map: Record<string, number>, key: any, score: number) {
  if (!key) return;
  const safeKey = String(key);
  map[safeKey] = (map[safeKey] || 0) + score;
}

export function normalizeNumber(value: any, maxValue: number) {
  const number = Number(value || 0);
  if (!maxValue || maxValue <= 0) return 0;
  return Math.min(number / maxValue, 1);
}

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

export function recencyWeight(createdAt: Date | string) {
  const daysAgo = Math.max(
    0,
    (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0.1, 1 / (1 + daysAgo * 0.1));
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += (a[i] || 0) * (b[i] || 0);
    normA += (a[i] || 0) * (a[i] || 0);
    normB += (b[i] || 0) * (b[i] || 0);
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeScoreMap(map: Record<string, number>) {
  const max = Math.max(...Object.values(map), 1);
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    result[key] = normalizeNumber(value, max) * 100;
  }
  return result;
}

export function dot(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < n; i += 1) total += (a[i] || 0) * (b[i] || 0);
  return total;
}
