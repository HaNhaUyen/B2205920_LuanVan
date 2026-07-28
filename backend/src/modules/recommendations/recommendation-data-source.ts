export type RecommendationDataSource =
  | "real"
  | "recommendation_persona_seed_v2"
  | "recommendation_persona_seed_v3"
  | "seed"
  | "extra_huge_seed"
  | "evaluation_seed"
  | "unknown";

/**
 * Đọc nguồn dữ liệu từ trường meta của user_behaviors.
 *
 * Dữ liệu thật thường không có meta.source nên mặc định được xem là "real".
 */
export function getRecommendationDataSource(
  meta: unknown,
): RecommendationDataSource {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return "real";
  }

  const source = (meta as Record<string, unknown>).source;

  if (typeof source !== "string" || !source.trim()) {
    return "real";
  }

  const normalizedSource = source.trim();

  switch (normalizedSource) {
    case "real":
    case "recommendation_persona_seed_v2":
    case "recommendation_persona_seed_v3":
    case "seed":
    case "extra_huge_seed":
    case "evaluation_seed":
      return normalizedSource;

    default:
      return "unknown";
  }
}

/**
 * Đọc biến môi trường kiểu số an toàn.
 */
function envNumber(name: string, fallback: number, min = 0, max = 1): number {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === null || rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue < min || parsedValue > max) {
    return fallback;
  }

  return parsedValue;
}

/**
 * Trọng số theo nguồn dữ liệu.
 *
 * real:
 *   Dữ liệu phát sinh thật trong hệ thống, luôn có trọng số 1.
 *
 * recommendation_persona_seed_v2/v3:
 *   Dữ liệu persona có cấu trúc, dùng RECO_PERSONA_SEED_WEIGHT.
 *
 * Các seed cũ khác:
 *   Mặc định bằng 0 để không ảnh hưởng quá trình huấn luyện và đánh giá.
 */
export function recommendationSourceWeight(
  source: RecommendationDataSource,
): number {
  switch (source) {
    case "real":
      return 1;

    case "recommendation_persona_seed_v2":
    case "recommendation_persona_seed_v3":
      return envNumber("RECO_PERSONA_SEED_WEIGHT", 0.8);

    case "seed":
      return envNumber("RECO_LEGACY_SEED_WEIGHT", 0);

    case "extra_huge_seed":
      return envNumber("RECO_EXTRA_HUGE_SEED_WEIGHT", 0);

    case "evaluation_seed":
      return envNumber("RECO_EVALUATION_SEED_WEIGHT", 0);

    case "unknown":
    default:
      return 0;
  }
}

/**
 * Kiểm tra hành vi có được phép tham gia huấn luyện hay không.
 */
export function isAllowedRecommendationSource(meta: unknown): boolean {
  const source = getRecommendationDataSource(meta);
  return recommendationSourceWeight(source) > 0;
}

/**
 * Trả về cả nguồn và trọng số để service khác có thể dùng trực tiếp.
 */
export function resolveRecommendationSource(meta: unknown): {
  source: RecommendationDataSource;
  weight: number;
  allowed: boolean;
} {
  const source = getRecommendationDataSource(meta);
  const weight = recommendationSourceWeight(source);

  return {
    source,
    weight,
    allowed: weight > 0,
  };
}
