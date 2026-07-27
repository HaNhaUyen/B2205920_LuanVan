import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACTION_SCORE,
  addScore,
  normalizeScoreMap,
  recencyWeight,
} from "./recommendation.utils";
import {
  getRecommendationDataSource,
  recommendationSourceWeight,
} from "./recommendation-data-source";

@Injectable()
export class CollaborativeService {
  constructor(private readonly prisma: PrismaService) {}

  async buildUserTourMatrix(sinceDays = 180) {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);
    const maxToursPerUser = Math.max(
      4,
      Number(process.env.RECO_MAX_TOURS_PER_USER || 25),
    );

    const rows = await this.prisma.userBehavior.findMany({
      where: {
        userId: { not: null },
        tourId: { not: null },
        createdAt: { gte: since },
      },
      select: {
        userId: true,
        tourId: true,
        action: true,
        score: true,
        meta: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(
        Number(process.env.RECO_MAX_TRAIN_BEHAVIORS || 50000),
        5000,
      ),
    });

    const perUserTour = new Map<
      string,
      Map<string, { value: number; latestAt: Date }>
    >();

    for (const row of rows as any[]) {
      if (!row.userId || !row.tourId) continue;
      const sourceWeight = recommendationSourceWeight(
        getRecommendationDataSource(row.meta),
      );
      if (sourceWeight <= 0) continue;

      const userId = String(row.userId);
      const tourId = String(row.tourId);
      const base = Number(row.score ?? ACTION_SCORE[row.action] ?? 1);
      const weightedScore = base * recencyWeight(row.createdAt) * sourceWeight;
      if (weightedScore <= 0) continue;

      if (!perUserTour.has(userId)) perUserTour.set(userId, new Map());
      const bucket = perUserTour.get(userId)!;
      const current = bucket.get(tourId);
      if (!current) {
        bucket.set(tourId, { value: weightedScore, latestAt: row.createdAt });
      } else {
        current.value += weightedScore;
        if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      }
    }

    const matrix: Record<string, Record<string, number>> = {};
    for (const [userId, tours] of perUserTour.entries()) {
      const selected = [...tours.entries()]
        .sort((a, b) => b[1].latestAt.getTime() - a[1].latestAt.getTime())
        .slice(0, maxToursPerUser);
      matrix[userId] = {};
      for (const [tourId, item] of selected) {
        matrix[userId][tourId] = Math.log1p(item.value);
      }
    }

    return matrix;
  }

  cosineSimilarity(a: Record<string, number>, b: Record<string, number>) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const key of keys) {
      const va = a[key] || 0;
      const vb = b[key] || 0;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }

    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async recommendByUserCF(
    userId: bigint,
    options: { topUsers?: number; sinceDays?: number } = {},
  ) {
    const matrix = await this.buildUserTourMatrix(options.sinceDays || 180);
    const target = matrix[String(userId)] || {};
    const result: Record<string, number> = {};
    const similarUsers: Array<{ userId: string; similarity: number }> = [];

    if (!Object.keys(target).length) return { scores: result, similarUsers };

    for (const [otherUserId, vector] of Object.entries(matrix)) {
      if (otherUserId === String(userId)) continue;
      const similarity = this.cosineSimilarity(target, vector);
      if (similarity > 0)
        similarUsers.push({ userId: otherUserId, similarity });
    }

    const topSimilarUsers = similarUsers
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.topUsers || 30);

    for (const similar of topSimilarUsers) {
      const vector = matrix[similar.userId] || {};
      for (const [tourId, value] of Object.entries(vector)) {
        if (target[tourId]) continue;
        addScore(result, tourId, similar.similarity * Number(value || 0));
      }
    }

    return { scores: normalizeScoreMap(result), similarUsers: topSimilarUsers };
  }
}
