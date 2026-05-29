import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/storage";

const behaviorCache = new Map();
const dwellTimers = new Map();

const DEFAULT_ACTION_SCORE = {
  view: 1,
  view_detail: 2,
  search: 2,
  compare: 2,
  ask_ai: 2,
  image_search: 3,
  favorite: 4,
  booking_draft: 5,
  review: 6,
  booking: 10,
  cancel_booking: -3,
  skip_recommendation: -1,
};

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function normalizeMeta(meta) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    return undefined;
  const safe = {};
  Object.entries(meta).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (["function", "object"].includes(typeof value)) return;
    const text = String(value).trim();
    if (!text) return;
    safe[key] = text.length > 180 ? text.slice(0, 180) : value;
  });
  return Object.keys(safe).length ? safe : undefined;
}

export async function trackBehavior({
  action = "view",
  tourId,
  keyword,
  meta,
  score,
  dedupeMs = 3000,
}) {
  const user = getUser();

  // Chưa đăng nhập thì không ghi hành vi cá nhân hóa.
  // Điều này tránh tạo dữ liệu rác và vẫn giữ trải nghiệm khách vãng lai nhẹ.
  if (!user) return;

  const safeAction = String(action || "view").trim();
  const safeTourId = tourId ? Number(tourId) : undefined;
  const safeKeyword = keyword
    ? String(keyword).trim().slice(0, 190)
    : undefined;

  const cacheKey = [
    user.id,
    safeAction,
    safeTourId || "",
    safeKeyword || "",
  ].join("|");

  const now = Date.now();
  const lastTime = behaviorCache.get(cacheKey);

  // Chống spam cùng một hành vi liên tục.
  if (lastTime && now - lastTime < dedupeMs) return;
  behaviorCache.set(cacheKey, now);

  try {
    await apiFetch("/recommendations/behavior", {
      method: "POST",
      body: JSON.stringify({
        action: safeAction,
        tourId: safeTourId,
        keyword: safeKeyword,
        score: score ?? DEFAULT_ACTION_SCORE[safeAction] ?? 1,
        meta: normalizeMeta(meta),
      }),
    });
  } catch (error) {
    console.warn("Track behavior failed:", error);
  }
}

export function startTourDwellTracking(tourId, meta = {}) {
  if (!tourId) return;
  const key = String(tourId);
  dwellTimers.set(key, {
    startedAt: Date.now(),
    meta,
  });
}

export async function endTourDwellTracking(tourId, extraMeta = {}) {
  if (!tourId) return;
  const key = String(tourId);
  const timer = dwellTimers.get(key);
  if (!timer) return;

  dwellTimers.delete(key);
  const seconds = Math.round((Date.now() - timer.startedAt) / 1000);

  // Chỉ xem là tín hiệu quan tâm thật nếu người dùng ở lại trang chi tiết >= 20 giây.
  if (seconds < 20) return;

  await trackBehavior({
    action: "view_detail",
    tourId,
    score: seconds >= 90 ? 3 : 2,
    dedupeMs: 30_000,
    meta: {
      ...timer.meta,
      ...extraMeta,
      dwellSeconds: seconds,
      source: "tour_detail_dwell",
    },
  });
}

export async function trackSearchKeyword(keyword, meta = {}) {
  const text = String(keyword || "").trim();
  if (!text) return;
  await trackBehavior({
    action: "search",
    keyword: text,
    score: DEFAULT_ACTION_SCORE.search,
    meta: {
      ...meta,
      source: "search_box",
    },
  });
}

export async function trackRecommendationSkip(tourId, meta = {}) {
  if (!tourId) return;
  await trackBehavior({
    action: "skip_recommendation",
    tourId,
    score: DEFAULT_ACTION_SCORE.skip_recommendation,
    dedupeMs: 60_000,
    meta: {
      ...meta,
      source: "recommendation_block",
    },
  });
}
