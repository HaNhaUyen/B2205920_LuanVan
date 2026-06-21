export type ScoreMap = Record<string, number>;

export type TourCandidate = any;

export interface UserSignals {
  tourScore: ScoreMap;
  destinationScore: ScoreMap;
  themeScore: ScoreMap;
  typeScore: ScoreMap;
  keywordScore: ScoreMap;
  avgPrice: number | null;
  avgDuration: number | null;
}

export interface RecommendationDebugScore {
  tourId: string;
  finalScore: number;
  contentScore: number;
  collaborativeScore: number;
  matrixFactorizationScore: number;
  deepLearningScore: number;
  businessScore: number;
  exactIntentBonus: number;
  destinationPenalty: number;
  alreadyInteractedPenalty: number;
  reasons: string[];
}

export interface HybridScoredTour {
  tour: TourCandidate;
  score: number;
  contentScore: number;
  collaborativeScore: number;
  matrixFactorizationScore: number;
  deepLearningScore: number;
  businessScore: number;
  exactIntentBonus: number;
  destinationPenalty: number;
  alreadyInteractedPenalty: number;
  reasons: string[];
}

export interface RecommendationResult {
  strategy: string;
  data: TourCandidate[];
  debug?: RecommendationDebugScore[];
  weights?: Record<string, number>;
}
