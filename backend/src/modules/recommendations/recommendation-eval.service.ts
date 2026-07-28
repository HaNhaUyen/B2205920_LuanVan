import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContentBasedService } from "./content-based.service";
import { DeepRecommendationService } from "./deep-recommendation.service";
import { RecommendationMetricsService } from "./recommendation-metrics.service";
import {
  ACTION_SCORE,
  clampScore,
  dot,
  normalizeScoreMap,
} from "./recommendation.utils";
import {
  getRecommendationDataSource,
  recommendationSourceWeight,
} from "./recommendation-data-source";

type BehaviorRow = {
  userId: bigint | null;
  tourId: bigint | null;
  action: string;
  score: number | null;
  keyword?: string | null;
  meta?: unknown;
  createdAt: Date;
  tour?: any;
};

type ModelAccumulator = {
  precision: number[];
  recall: number[];
  hitRate: number[];
  ndcg: number[];
  lists: string[][];
  diversity: number[];
};

type ComponentMaps = {
  ContentBased: Record<string, number>;
  Collaborative: Record<string, number>;
  MatrixFactorization: Record<string, number>;
  SemanticEmbedding: Record<string, number>;
};

type HybridWeights = {
  contentBased: number;
  collaborative: number;
  matrixFactorization: number;
  semanticEmbedding: number;
};

type ValidationCase = {
  maps: ComponentMaps;
  interacted: Set<string>;
  relevantIds: Set<string>;
};

@Injectable()
export class RecommendationEvalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBased: ContentBasedService,
    private readonly deepRecommendation: DeepRecommendationService,
    private readonly metrics: RecommendationMetricsService,
  ) {}

  private async loadActiveTours() {
    return this.prisma.tour.findMany({
      where: { status: "published" },
      include: { destination: true, itinerary: true },
      orderBy: { id: "asc" },
    });
  }

  private rank(
    scoreMap: Record<string, number>,
    k: number,
    excluded: Set<string>,
  ) {
    return Object.entries(scoreMap)
      .filter(([tourId]) => !excluded.has(String(tourId)))
      .filter(([, score]) => Number.isFinite(Number(score)))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, k)
      .map(([tourId]) => String(tourId));
  }

  private cosineSimilarity(
    a: Record<string, number>,
    b: Record<string, number>,
  ) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (const key of keys) {
      const va = Number(a[key] || 0);
      const vb = Number(b[key] || 0);
      dotProduct += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    if (!normA || !normB) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private behaviorWeight(row: BehaviorRow, referenceTime: Date) {
    const base = Number(row.score ?? ACTION_SCORE[row.action] ?? 1);
    const sourceWeight = recommendationSourceWeight(
      getRecommendationDataSource(row.meta),
    );
    const ageDays = Math.max(
      0,
      (referenceTime.getTime() - row.createdAt.getTime()) / 86400000,
    );
    const timeWeight = Math.max(0.1, 1 / (1 + 0.1 * ageDays));
    return Math.max(base, 0) * timeWeight * sourceWeight;
  }

  private buildCollaborativeScores(
    targetUserId: string,
    targetTrainRows: BehaviorRow[],
    allRows: BehaviorRow[],
    cutoff: Date,
    topUsers: number,
  ) {
    const matrix: Record<string, Record<string, number>> = {};
    for (const row of allRows) {
      if (!row.userId || !row.tourId) continue;
      if (row.createdAt.getTime() >= cutoff.getTime()) continue;
      const userId = String(row.userId);
      const tourId = String(row.tourId);
      if (!matrix[userId]) matrix[userId] = {};
      matrix[userId][tourId] =
        (matrix[userId][tourId] || 0) + this.behaviorWeight(row, cutoff);
    }

    const targetVector: Record<string, number> = {};
    for (const row of targetTrainRows) {
      if (!row.tourId || row.createdAt.getTime() >= cutoff.getTime()) continue;
      const tourId = String(row.tourId);
      targetVector[tourId] =
        (targetVector[tourId] || 0) + this.behaviorWeight(row, cutoff);
    }
    matrix[targetUserId] = targetVector;
    if (!Object.keys(targetVector).length) return {};

    const similarities = Object.entries(matrix)
      .filter(([userId]) => userId !== targetUserId)
      .map(([userId, vector]) => ({
        userId,
        similarity: this.cosineSimilarity(targetVector, vector),
      }))
      .filter((item) => item.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topUsers);

    const result: Record<string, number> = {};
    for (const similar of similarities) {
      for (const [tourId, value] of Object.entries(
        matrix[similar.userId] || {},
      )) {
        if (targetVector[tourId]) continue;
        result[tourId] =
          (result[tourId] || 0) + similar.similarity * Number(value || 0);
      }
    }
    return normalizeScoreMap(result);
  }

  private seededValue(seed: string) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return ((hash >>> 0) % 100000) / 100000;
  }

  private initialVector(key: string, k: number) {
    return Array.from(
      { length: k },
      (_, index) => (this.seededValue(`${key}:${index}`) - 0.5) * 0.1,
    );
  }

  /**
   * Huấn luyện MF cục bộ tại đúng cutoff của từng người dùng.
   * Không dùng factor đã train từ toàn bộ database vì factor đó có thể đã nhìn thấy test.
   */
  private buildMatrixFactorizationScores(
    targetUserId: string,
    targetTrainRows: BehaviorRow[],
    allRows: BehaviorRow[],
    cutoff: Date,
    activeTourIds: string[],
  ) {
    const k = Math.max(2, Number(process.env.RECO_EVAL_MF_K || 10));
    const epochs = Math.max(1, Number(process.env.RECO_EVAL_MF_EPOCHS || 25));
    const lr = Math.max(0.0001, Number(process.env.RECO_EVAL_MF_LR || 0.025));
    const lambda = Math.max(0, Number(process.env.RECO_EVAL_MF_LAMBDA || 0.04));

    const pairValues = new Map<
      string,
      { userId: string; tourId: string; value: number }
    >();
    const add = (row: BehaviorRow) => {
      if (
        !row.userId ||
        !row.tourId ||
        row.createdAt.getTime() >= cutoff.getTime()
      )
        return;
      const sourceWeight = recommendationSourceWeight(
        getRecommendationDataSource(row.meta),
      );
      if (sourceWeight <= 0) return;
      const userId = String(row.userId);
      const tourId = String(row.tourId);
      const key = `${userId}:${tourId}`;
      const value = this.behaviorWeight(row, cutoff);
      const current = pairValues.get(key);
      if (current) current.value += value;
      else pairValues.set(key, { userId, tourId, value });
    };

    for (const row of allRows) {
      if (String(row.userId) === targetUserId) continue;
      add(row);
    }
    for (const row of targetTrainRows) add(row);

    const interactions = [...pairValues.values()].map((item) => ({
      ...item,
      rating: Math.max(0, Math.min(Math.log1p(item.value) / Math.log1p(25), 1)),
    }));
    if (!interactions.length) return {};

    const userIds = [...new Set(interactions.map((item) => item.userId))];
    const tourIds = [...new Set(interactions.map((item) => item.tourId))];
    if (!userIds.includes(targetUserId)) return {};

    const P: Record<string, number[]> = {};
    const Q: Record<string, number[]> = {};
    for (const userId of userIds)
      P[userId] = this.initialVector(`eval-u:${userId}`, k);
    for (const tourId of tourIds)
      Q[tourId] = this.initialVector(`eval-t:${tourId}`, k);

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      for (const row of interactions) {
        const p = P[row.userId];
        const q = Q[row.tourId];
        const error = row.rating - dot(p, q);
        for (let index = 0; index < k; index += 1) {
          const pu = p[index];
          const qt = q[index];
          p[index] += lr * (error * qt - lambda * pu);
          q[index] += lr * (error * pu - lambda * qt);
        }
      }
    }

    const raw: Record<string, number> = {};
    const p = P[targetUserId];
    for (const tourId of activeTourIds) {
      const q = Q[tourId];
      if (!q) continue;
      raw[tourId] = Math.max(0, dot(p, q));
    }
    return normalizeScoreMap(raw);
  }

  private uniqueLatestTourRows(rows: BehaviorRow[]) {
    const seen = new Set<string>();
    const unique: BehaviorRow[] = [];
    for (const row of [...rows].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )) {
      if (!row.tourId) continue;
      const tourId = String(row.tourId);
      if (seen.has(tourId)) continue;
      seen.add(tourId);
      unique.push(row);
    }
    return unique;
  }

  private isPositiveEvaluationRow(row: BehaviorRow) {
    const configured = String(
      process.env.RECO_EVAL_POSITIVE_ACTIONS || "favorite,booking,review",
    )
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return configured.includes(String(row.action || "").trim());
  }

  private buildTargetTrainRows(
    rows: BehaviorRow[],
    cutoff: Date,
    heldOutTourIds: Set<string>,
    maxRows: number,
  ) {
    return rows
      .filter((row) => row.tourId)
      .filter((row) => row.createdAt.getTime() < cutoff.getTime())
      .filter((row) => !heldOutTourIds.has(String(row.tourId)))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, maxRows);
  }

  private average(values: number[]) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  private weightedHybrid(
    maps: ComponentMaps,
    weights: HybridWeights,
    activeTourIds: string[],
  ) {
    const result: Record<string, number> = {};
    for (const tourId of activeTourIds) {
      result[tourId] = clampScore(
        weights.contentBased * Number(maps.ContentBased[tourId] || 0) +
          weights.collaborative * Number(maps.Collaborative[tourId] || 0) +
          weights.matrixFactorization *
            Number(maps.MatrixFactorization[tourId] || 0) +
          weights.semanticEmbedding *
            Number(maps.SemanticEmbedding[tourId] || 0),
      );
    }
    return result;
  }

  private generateWeightCandidates(step = 0.1): HybridWeights[] {
    const units = Math.round(1 / step);
    const candidates: HybridWeights[] = [];
    for (let c = 0; c <= units; c += 1) {
      for (let cf = 0; cf <= units - c; cf += 1) {
        for (let mf = 0; mf <= units - c - cf; mf += 1) {
          const sem = units - c - cf - mf;
          candidates.push({
            contentBased: c / units,
            collaborative: cf / units,
            matrixFactorization: mf / units,
            semanticEmbedding: sem / units,
          });
        }
      }
    }
    return candidates.filter(
      (item) =>
        item.collaborative + item.matrixFactorization > 0 &&
        item.contentBased + item.semanticEmbedding > 0,
    );
  }

  private selectHybridWeights(
    validationCases: ValidationCase[],
    activeTourIds: string[],
    k: number,
  ) {
    const step = Math.min(
      0.5,
      Math.max(0.05, Number(process.env.RECO_EVAL_WEIGHT_STEP || 0.1)),
    );
    const candidates = this.generateWeightCandidates(step);
    const rows = candidates.map((weights) => {
      const ndcg: number[] = [];
      const recall: number[] = [];
      const precision: number[] = [];
      for (const item of validationCases) {
        const ranked = this.rank(
          this.weightedHybrid(item.maps, weights, activeTourIds),
          k,
          item.interacted,
        );
        ndcg.push(this.metrics.ndcgAtK(ranked, item.relevantIds, k));
        recall.push(this.metrics.recallAtK(ranked, item.relevantIds, k));
        precision.push(this.metrics.precisionAtK(ranked, item.relevantIds, k));
      }
      return {
        weights,
        validationNdcgAtK: this.average(ndcg),
        validationRecallAtK: this.average(recall),
        validationPrecisionAtK: this.average(precision),
      };
    });

    rows.sort(
      (a, b) =>
        b.validationNdcgAtK - a.validationNdcgAtK ||
        b.validationRecallAtK - a.validationRecallAtK ||
        b.validationPrecisionAtK - a.validationPrecisionAtK,
    );

    return {
      selected: rows[0]?.weights || {
        contentBased: 0.2,
        collaborative: 0.4,
        matrixFactorization: 0.2,
        semanticEmbedding: 0.2,
      },
      criterion:
        "Chọn trọng số có NDCG@K trung bình cao nhất trên tập validation; nếu bằng nhau ưu tiên Recall@K rồi Precision@K.",
      step,
      validationCases: validationCases.length,
      topCandidates: rows.slice(0, 10).map((row) => ({
        weights: row.weights,
        validationNdcgAtK: Number(row.validationNdcgAtK.toFixed(4)),
        validationRecallAtK: Number(row.validationRecallAtK.toFixed(4)),
        validationPrecisionAtK: Number(row.validationPrecisionAtK.toFixed(4)),
      })),
    };
  }

  private newAccumulator(): ModelAccumulator {
    return {
      precision: [],
      recall: [],
      hitRate: [],
      ndcg: [],
      lists: [],
      diversity: [],
    };
  }

  private addMetrics(
    row: ModelAccumulator,
    ranked: string[],
    relevantIds: Set<string>,
    k: number,
    activeTourMap: Map<string, any>,
  ) {
    row.precision.push(this.metrics.precisionAtK(ranked, relevantIds, k));
    row.recall.push(this.metrics.recallAtK(ranked, relevantIds, k));
    row.hitRate.push(this.metrics.hitRateAtK(ranked, relevantIds, k));
    row.ndcg.push(this.metrics.ndcgAtK(ranked, relevantIds, k));
    row.lists.push(ranked);
    row.diversity.push(this.metrics.diversity(ranked, activeTourMap));
  }

  private async buildComponentMaps(
    targetUserId: string,
    trainRows: BehaviorRow[],
    allRows: BehaviorRow[],
    cutoff: Date,
    activeTours: any[],
    destinations: any[],
    topSimilarUsers: number,
  ): Promise<ComponentMaps> {
    const interacted = new Set(trainRows.map((row) => String(row.tourId)));
    const signals = this.contentBased.buildUserSignals(
      trainRows as any[],
      destinations,
    );
    const contentRaw: Record<string, number> = {};
    for (const tour of activeTours) {
      const tourId = String(tour.id);
      if (interacted.has(tourId)) continue;
      contentRaw[tourId] = this.contentBased.calcContentScore(
        tour,
        signals,
      ).score;
    }

    return {
      ContentBased: normalizeScoreMap(contentRaw),
      Collaborative: this.buildCollaborativeScores(
        targetUserId,
        trainRows,
        allRows,
        cutoff,
        topSimilarUsers,
      ),
      MatrixFactorization: this.buildMatrixFactorizationScores(
        targetUserId,
        trainRows,
        allRows,
        cutoff,
        activeTours.map((tour) => String(tour.id)),
      ),
      SemanticEmbedding: await this.deepRecommendation.scoreToursForUser(
        trainRows as any[],
        activeTours,
      ),
    };
  }

  async evaluate(k = 10) {
    const safeK = Math.min(Math.max(Math.round(Number(k) || 10), 1), 100);
    const evaluationNow = new Date();
    const maxUsers = Math.max(Number(process.env.RECO_EVAL_MAX_USERS || 50), 1);
    const testItems = Math.max(
      Number(process.env.RECO_EVAL_TEST_ITEMS || 2),
      1,
    );
    const validationItems = Math.max(
      Number(process.env.RECO_EVAL_VALIDATION_ITEMS || 1),
      1,
    );
    const minUniqueTours = Math.max(
      Number(process.env.RECO_EVAL_MIN_UNIQUE_TOURS || 6),
      testItems + validationItems + 3,
    );
    const topSimilarUsers = Math.max(
      Number(process.env.RECO_EVAL_TOP_SIMILAR_USERS || 30),
      1,
    );
    const maxTrainRowsPerUser = Math.max(
      Number(process.env.RECO_EVAL_MAX_TRAIN_ROWS_PER_USER || 250),
      10,
    );

    const activeTours = (await this.loadActiveTours()) as any[];
    const activeTourMap = new Map(
      activeTours.map((tour) => [String(tour.id), tour]),
    );
    const activeTourIds = activeTours.map((tour) => String(tour.id));
    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });

    const loadedRows = (await this.prisma.userBehavior.findMany({
      where: {
        userId: { not: null },
        tourId: { not: null },
        createdAt: { lte: evaluationNow },
      },
      include: { tour: { include: { destination: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.max(
        Number(process.env.RECO_EVAL_MAX_BEHAVIORS || 20000),
        1000,
      ),
    })) as unknown as BehaviorRow[];

    const futureBehaviorCount = await this.prisma.userBehavior.count({
      where: {
        userId: { not: null },
        tourId: { not: null },
        createdAt: { gt: evaluationNow },
      },
    });

    const sourceCounts: Record<string, number> = {};
    const rowsByUser = new Map<string, BehaviorRow[]>();

    for (const row of loadedRows) {
      const source = getRecommendationDataSource(row.meta);
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;

      if (recommendationSourceWeight(source) <= 0) continue;
      if (!row.userId || !row.tourId) continue;
      if (!activeTourMap.has(String(row.tourId))) continue;

      const userId = String(row.userId);
      const bucket = rowsByUser.get(userId) || [];
      bucket.push(row);
      rowsByUser.set(userId, bucket);
    }

    const eligibleUsers = [...rowsByUser.entries()]
      .map(([userId, rows]) => {
        const positiveRows = rows.filter((row) =>
          this.isPositiveEvaluationRow(row),
        );
        return {
          userId,
          rows,
          uniquePositiveRows: this.uniqueLatestTourRows(positiveRows),
        };
      })
      .filter((item) => item.uniquePositiveRows.length >= minUniqueTours)
      .sort((a, b) => Number(a.userId) - Number(b.userId))
      .slice(0, maxUsers);

    const validationCases: ValidationCase[] = [];
    const preparedCases: Array<{
      userId: string;
      trainRows: BehaviorRow[];
      testRows: BehaviorRow[];
      cutoff: Date;
      testMaps: ComponentMaps;
      interacted: Set<string>;
      relevantIds: Set<string>;
    }> = [];

    for (const item of eligibleUsers) {
      // uniquePositiveRows được sắp xếp mới nhất -> cũ nhất.
      const positives = item.uniquePositiveRows;
      const testRows = positives.slice(0, testItems);
      const validationRows = positives.slice(
        testItems,
        testItems + validationItems,
      );

      if (
        testRows.length < testItems ||
        validationRows.length < validationItems
      ) {
        continue;
      }

      /*
       * VALIDATION:
       * - cutoff là thời điểm positive validation cũ nhất.
       * - loại toàn bộ tour test + validation khỏi lịch sử đích.
       * Điều này ngăn trường hợp người dùng đã view tour trước khi favorite/booking,
       * làm rò rỉ chính item cần dự đoán.
       */
      const validationCutoff = new Date(
        Math.min(...validationRows.map((row) => row.createdAt.getTime())),
      );
      const validationHeldOut = new Set(
        [...testRows, ...validationRows].map((row) => String(row.tourId)),
      );
      const validationTrainRows = this.buildTargetTrainRows(
        item.rows,
        validationCutoff,
        validationHeldOut,
        maxTrainRowsPerUser,
      );

      if (this.uniqueLatestTourRows(validationTrainRows).length < 3) continue;

      const validationRelevant = new Set(
        validationRows.map((row) => String(row.tourId)),
      );
      const validationMaps = await this.buildComponentMaps(
        item.userId,
        validationTrainRows,
        loadedRows,
        validationCutoff,
        activeTours,
        destinations as any[],
        topSimilarUsers,
      );

      validationCases.push({
        maps: validationMaps,
        interacted: new Set(
          validationTrainRows
            .filter((row) => row.tourId)
            .map((row) => String(row.tourId)),
        ),
        relevantIds: validationRelevant,
      });

      /*
       * TEST:
       * - cutoff là thời điểm test cũ nhất.
       * - chỉ loại test item; validation item đã xảy ra trước cutoff có thể được
       *   dùng như lịch sử thật.
       */
      const testCutoff = new Date(
        Math.min(...testRows.map((row) => row.createdAt.getTime())),
      );
      const testHeldOut = new Set(testRows.map((row) => String(row.tourId)));
      const testTrainRows = this.buildTargetTrainRows(
        item.rows,
        testCutoff,
        testHeldOut,
        maxTrainRowsPerUser,
      );

      if (this.uniqueLatestTourRows(testTrainRows).length < 3) continue;

      const relevantIds = new Set(testRows.map((row) => String(row.tourId)));
      const testMaps = await this.buildComponentMaps(
        item.userId,
        testTrainRows,
        loadedRows,
        testCutoff,
        activeTours,
        destinations as any[],
        topSimilarUsers,
      );

      preparedCases.push({
        userId: item.userId,
        trainRows: testTrainRows,
        testRows,
        cutoff: testCutoff,
        testMaps,
        interacted: new Set(
          testTrainRows
            .filter((row) => row.tourId)
            .map((row) => String(row.tourId)),
        ),
        relevantIds,
      });
    }

    const weightSelection = this.selectHybridWeights(
      validationCases,
      activeTourIds,
      safeK,
    );

    const modelRows: Record<string, ModelAccumulator> = {
      ContentBased: this.newAccumulator(),
      Collaborative: this.newAccumulator(),
      MatrixFactorization: this.newAccumulator(),
      SemanticEmbedding: this.newAccumulator(),
      Hybrid: this.newAccumulator(),
    };

    const evaluatedUserDetails: Array<{
      userId: string;
      trainRows: number;
      trainUniqueTours: number;
      validationTours: number;
      testTours: number;
      cutoff: string;
    }> = [];

    for (const item of preparedCases) {
      const scoreMaps: Record<string, Record<string, number>> = {
        ...item.testMaps,
        Hybrid: this.weightedHybrid(
          item.testMaps,
          weightSelection.selected,
          activeTourIds,
        ),
      };

      for (const [modelName, scoreMap] of Object.entries(scoreMaps)) {
        const ranked = this.rank(scoreMap, safeK, item.interacted);
        this.addMetrics(
          modelRows[modelName],
          ranked,
          item.relevantIds,
          safeK,
          activeTourMap,
        );
      }

      evaluatedUserDetails.push({
        userId: item.userId,
        trainRows: item.trainRows.length,
        trainUniqueTours: this.uniqueLatestTourRows(item.trainRows).length,
        validationTours: validationItems,
        testTours: item.relevantIds.size,
        cutoff: item.cutoff.toISOString(),
      });
    }

    const result = Object.entries(modelRows).map(([modelName, row]) => ({
      modelName,
      [`precisionAt${safeK}`]: Number(this.average(row.precision).toFixed(4)),
      [`recallAt${safeK}`]: Number(this.average(row.recall).toFixed(4)),
      [`hitRateAt${safeK}`]: Number(this.average(row.hitRate).toFixed(4)),
      [`ndcgAt${safeK}`]: Number(this.average(row.ndcg).toFixed(4)),
      coverage: Number(
        this.metrics.coverage(row.lists, activeTours.length).toFixed(4),
      ),
      diversity: Number(this.average(row.diversity).toFixed(4)),
      evaluatedUsers: row.precision.length,
    }));

    return {
      generatedAt: evaluationNow.toISOString(),
      source: "database",
      evaluationMethod:
        "nested-temporal-holdout-positive-actions-by-unique-tour",
      relevanceDefinition: {
        positiveActions: String(
          process.env.RECO_EVAL_POSITIVE_ACTIONS || "favorite,booking,review",
        )
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        note: "View/search/ask_ai vẫn được dùng làm tín hiệu huấn luyện nhưng không mặc định được xem là ground truth.",
      },
      leakageProtection: {
        futureBehaviorsExcluded: true,
        targetHeldOutToursRemovedFromTargetTraining: true,
        targetUserValidationAndTestRemovedFromValidationTraining: true,
        targetUserTestRemovedFromTestTraining: true,
        behaviorsAfterEachCutoffRemovedFromCollaborativeAndMF: true,
        hybridWeightsSelectedOnValidationNotTest: true,
      },
      config: {
        k: safeK,
        maxUsers,
        minUniqueTours,
        validationItems,
        testItems,
        topSimilarUsers,
        maxTrainRowsPerUser,
        sourceWeights: {
          real: recommendationSourceWeight("real"),
          recommendation_persona_seed_v2: recommendationSourceWeight(
            "recommendation_persona_seed_v2",
          ),
          seed: recommendationSourceWeight("seed"),
          extra_huge_seed: recommendationSourceWeight("extra_huge_seed"),
          evaluation_seed: recommendationSourceWeight("evaluation_seed"),
        },
        hybridWeightSelection: weightSelection,
      },
      dataset: {
        activeTours: activeTours.length,
        loadedBehaviors: loadedRows.length,
        excludedFutureBehaviors: futureBehaviorCount,
        sourceCounts,
        eligibleUsers: eligibleUsers.length,
        validationCases: validationCases.length,
        evaluatedUsers: evaluatedUserDetails.length,
      },
      result,
      evaluatedUserDetails,
      recommendedProductionEnv: {
        RECO_HYBRID_CONTENT_WEIGHT: weightSelection.selected.contentBased,
        RECO_HYBRID_COLLABORATIVE_WEIGHT:
          weightSelection.selected.collaborative,
        RECO_HYBRID_MF_WEIGHT: weightSelection.selected.matrixFactorization,
        RECO_HYBRID_SEMANTIC_WEIGHT: weightSelection.selected.semanticEmbedding,
      },
    };
  }
}
