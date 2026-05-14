import { apiFetch } from "@/lib/api";
import { getUser } from "@/lib/storage";

const behaviorCache = new Map();

const DEFAULT_ACTION_SCORE = {
  view: 1,
  search: 1,
  compare: 2,
  ask_ai: 2,
  image_search: 2,
  favorite: 3,
  review: 5,
  booking: 6,
};

export async function trackBehavior({
  action = "view",
  tourId,
  keyword,
  meta,
  score,
}) {
  const user = getUser();

  // Chưa đăng nhập thì không ghi hành vi cá nhân hóa
  if (!user) return;

  const safeAction = String(action || "view");
  const safeTourId = tourId ? Number(tourId) : undefined;
  const safeKeyword = keyword ? String(keyword).trim() : undefined;

  const cacheKey = [
    user.id,
    safeAction,
    safeTourId || "",
    safeKeyword || "",
  ].join("|");

  const now = Date.now();
  const lastTime = behaviorCache.get(cacheKey);

  // Chống spam cùng một hành vi liên tục
  if (lastTime && now - lastTime < 3000) return;

  behaviorCache.set(cacheKey, now);

  try {
    await apiFetch("/recommendations/behavior", {
      method: "POST",
      body: JSON.stringify({
        action: safeAction,
        tourId: safeTourId,
        keyword: safeKeyword,
        score: score || DEFAULT_ACTION_SCORE[safeAction] || 1,
        meta: meta || undefined,
      }),
    });
  } catch (error) {
    console.warn("Track behavior failed:", error);
  }
}
