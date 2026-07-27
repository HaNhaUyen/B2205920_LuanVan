export type RecommendationDataSource =
  | "real"
  | "recommendation_persona_seed_v2"
  | "seed"
  | "extra_huge_seed"
  | "evaluation_seed"
  | "unknown";

export function getRecommendationDataSource(
  meta: unknown,
): RecommendationDataSource {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return "real";
  const source = (meta as Record<string, unknown>).source;
  if (typeof source !== "string" || !source.trim()) return "real";
  return source as RecommendationDataSource;
}

export function recommendationSourceWeight(source: RecommendationDataSource) {
  switch (source) {
    case "real":
      return 1;
    case "recommendation_persona_seed_v2":
      return 0.8;
    case "seed":
      return Number(process.env.RECO_LEGACY_SEED_WEIGHT || 0.35);
    case "extra_huge_seed":
      return Number(process.env.RECO_EXTRA_HUGE_SEED_WEIGHT || 0);
    case "evaluation_seed":
      return Number(process.env.RECO_EVALUATION_SEED_WEIGHT || 0);
    default:
      return 0;
  }
}

export function isAllowedRecommendationSource(meta: unknown) {
  return recommendationSourceWeight(getRecommendationDataSource(meta)) > 0;
}
