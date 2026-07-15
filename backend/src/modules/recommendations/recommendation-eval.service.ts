import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ContentBasedService } from "./content-based.service";
import { RecommendationMetricsService } from "./recommendation-metrics.service";
import {
  ACTION_SCORE,
  clampScore,
  normalizeScoreMap,
  recencyWeight,
} from "./recommendation.utils";

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
  ndcg: number[];
  lists: string[][];
  diversity: number[];
};

@Injectable()
export class RecommendationEvalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentBased: ContentBasedService,
    private readonly metrics: RecommendationMetricsService,
  ) {}

  private async loadActiveTours() {
    return this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        itinerary: true,
      },
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
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const key of keys) {
      const va = Number(a[key] || 0);
      const vb = Number(b[key] || 0);
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }

    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private behaviorWeight(row: BehaviorRow) {
    const base = Number(row.score ?? ACTION_SCORE[row.action] ?? 1);
    return Math.max(base, 0) * recencyWeight(row.createdAt);
  }

  /**
   * Tạo Collaborative Filtering từ dữ liệu train thực tế.
   * Mọi hành vi xảy ra sau thời điểm bắt đầu tập test đều bị loại bỏ,
   * nhờ đó không dùng tương lai để dự đoán quá khứ.
   */
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
      if (new Date(row.createdAt).getTime() >= cutoff.getTime()) continue;

      const userId = String(row.userId);
      const tourId = String(row.tourId);
      if (!matrix[userId]) matrix[userId] = {};
      matrix[userId][tourId] =
        (matrix[userId][tourId] || 0) + this.behaviorWeight(row);
    }

    // Ghi đè vector user mục tiêu bằng đúng phần train đã tách.
    const targetVector: Record<string, number> = {};
    for (const row of targetTrainRows) {
      if (!row.tourId) continue;
      const tourId = String(row.tourId);
      targetVector[tourId] =
        (targetVector[tourId] || 0) + this.behaviorWeight(row);
    }
    matrix[targetUserId] = targetVector;

    if (!Object.keys(targetVector).length) return {};

    const similarities: Array<{ userId: string; similarity: number }> = [];
    for (const [otherUserId, vector] of Object.entries(matrix)) {
      if (otherUserId === targetUserId) continue;
      const similarity = this.cosineSimilarity(targetVector, vector);
      if (similarity > 0)
        similarities.push({ userId: otherUserId, similarity });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    const result: Record<string, number> = {};

    for (const similar of similarities.slice(0, topUsers)) {
      const vector = matrix[similar.userId] || {};
      for (const [tourId, value] of Object.entries(vector)) {
        if (targetVector[tourId]) continue;
        result[tourId] =
          (result[tourId] || 0) + similar.similarity * Number(value || 0);
      }
    }

    return normalizeScoreMap(result);
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

  private average(values: number[]) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  async evaluate(k = 10) {
    const maxUsers = Math.max(Number(process.env.RECO_EVAL_MAX_USERS || 50), 1);
    const minUniqueTours = Math.max(
      Number(process.env.RECO_EVAL_MIN_UNIQUE_TOURS || 4),
      3,
    );
    const testItems = Math.max(
      Number(process.env.RECO_EVAL_TEST_ITEMS || 2),
      1,
    );
    const topSimilarUsers = Math.max(
      Number(process.env.RECO_EVAL_TOP_SIMILAR_USERS || 30),
      1,
    );
    const contentWeight = Math.min(
      Math.max(Number(process.env.RECO_EVAL_CONTENT_WEIGHT || 0.7), 0),
      1,
    );
    const collaborativeWeight = 1 - contentWeight;

    const activeTours = await this.loadActiveTours();
    const activeTourMap = new Map(
      activeTours.map((tour: any) => [String(tour.id), tour]),
    );
    const totalTourCount = activeTours.length;
    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });

    const allRows = (await this.prisma.userBehavior.findMany({
      where: { userId: { not: null }, tourId: { not: null } },
      include: { tour: { include: { destination: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.max(
        Number(process.env.RECO_EVAL_MAX_BEHAVIORS || 20000),
        1000,
      ),
    })) as unknown as BehaviorRow[];

    const rowsByUser = new Map<string, BehaviorRow[]>();
    for (const row of allRows) {
      if (!row.userId || !row.tourId) continue;
      if (!activeTourMap.has(String(row.tourId))) continue;
      const userId = String(row.userId);
      const bucket = rowsByUser.get(userId) || [];
      bucket.push(row);
      rowsByUser.set(userId, bucket);
    }

    const eligibleUsers = [...rowsByUser.entries()]
      .map(([userId, rows]) => ({
        userId,
        rows,
        uniqueRows: this.uniqueLatestTourRows(rows),
      }))
      .filter((item) => item.uniqueRows.length >= minUniqueTours)
      .sort((a, b) => b.uniqueRows.length - a.uniqueRows.length)
      .slice(0, maxUsers);

    const modelRows: Record<string, ModelAccumulator> = {
      ContentBased: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      Collaborative: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      Hybrid: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
    };

    const evaluatedUserDetails: Array<{
      userId: string;
      trainTours: number;
      testTours: number;
      cutoff: string;
    }> = [];

    for (const item of eligibleUsers) {
      const uniqueRows = item.uniqueRows;
      const safeTestSize = Math.min(testItems, uniqueRows.length - 2);
      if (safeTestSize <= 0) continue;

      // uniqueRows đang mới -> cũ. Test = các tour mới nhất; train = phần cũ hơn.
      const testRows = uniqueRows.slice(0, safeTestSize);
      const trainRows = uniqueRows.slice(safeTestSize);
      if (trainRows.length < 2) continue;

      const relevantIds = new Set(
        testRows
          .map((row) => String(row.tourId))
          .filter((tourId) => activeTourMap.has(tourId)),
      );
      if (!relevantIds.size) continue;

      const interacted = new Set(trainRows.map((row) => String(row.tourId)));
      const cutoff = new Date(
        Math.min(...testRows.map((row) => row.createdAt.getTime())),
      );

      const signals = this.contentBased.buildUserSignals(
        trainRows as any[],
        destinations as any[],
      );

      const contentRaw: Record<string, number> = {};
      for (const tour of activeTours as any[]) {
        const tourId = String(tour.id);
        if (interacted.has(tourId)) continue;
        contentRaw[tourId] = this.contentBased.calcContentScore(
          tour,
          signals,
        ).score;
      }
      const contentScores = normalizeScoreMap(contentRaw);

      const collaborativeScores = this.buildCollaborativeScores(
        item.userId,
        trainRows,
        allRows,
        cutoff,
        topSimilarUsers,
      );

      const hybridScores: Record<string, number> = {};
      for (const tour of activeTours as any[]) {
        const tourId = String(tour.id);
        if (interacted.has(tourId)) continue;
        const content = Number(contentScores[tourId] || 0);
        const collaborative = Number(collaborativeScores[tourId] || 0);

        // Hybrid có fallback tự nhiên sang Content-Based nếu CF chưa có tín hiệu.
        hybridScores[tourId] = clampScore(
          contentWeight * content + collaborativeWeight * collaborative,
        );
      }

      const scoreMaps: Record<string, Record<string, number>> = {
        ContentBased: contentScores,
        Collaborative: collaborativeScores,
        Hybrid: hybridScores,
      };

      for (const [modelName, scoreMap] of Object.entries(scoreMaps)) {
        const ranked = this.rank(scoreMap, k, interacted);
        const row = modelRows[modelName];
        row.precision.push(this.metrics.precisionAtK(ranked, relevantIds, k));
        row.recall.push(this.metrics.recallAtK(ranked, relevantIds, k));
        row.ndcg.push(this.metrics.ndcgAtK(ranked, relevantIds, k));
        row.lists.push(ranked);
        row.diversity.push(this.metrics.diversity(ranked, activeTourMap));
      }

      evaluatedUserDetails.push({
        userId: item.userId,
        trainTours: trainRows.length,
        testTours: relevantIds.size,
        cutoff: cutoff.toISOString(),
      });
    }

    const result = Object.entries(modelRows).map(([modelName, row]) => ({
      modelName,
      precisionAt10: Number(this.average(row.precision).toFixed(4)),
      recallAt10: Number(this.average(row.recall).toFixed(4)),
      ndcgAt10: Number(this.average(row.ndcg).toFixed(4)),
      coverage: Number(
        this.metrics.coverage(row.lists, totalTourCount).toFixed(4),
      ),
      diversity: Number(this.average(row.diversity).toFixed(4)),
      evaluatedUsers: row.precision.length,
    }));

    return {
      generatedAt: new Date().toISOString(),
      source: "database",
      evaluationMethod: "temporal-holdout-by-unique-tour",
      leakageProtection: {
        targetUserTestRemovedFromTraining: true,
        behaviorsAfterTestCutoffRemovedFromCollaborativeMatrix: true,
      },
      config: {
        k,
        maxUsers,
        minUniqueTours,
        testItems,
        topSimilarUsers,
        hybridWeights: {
          contentBased: contentWeight,
          collaborative: collaborativeWeight,
        },
      },
      dataset: {
        activeTours: totalTourCount,
        loadedBehaviors: allRows.length,
        eligibleUsers: eligibleUsers.length,
        evaluatedUsers: evaluatedUserDetails.length,
      },
      result,
      evaluatedUserDetails,
    };
  }
}
