import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACTION_SCORE,
  addScore,
  normalizeScoreMap,
  recencyWeight,
} from "./recommendation.utils";

@Injectable()
export class CollaborativeService {
  constructor(private readonly prisma: PrismaService) {}

  async buildUserTourMatrix(sinceDays = 180) {
    const since = new Date();
    since.setDate(since.getDate() - sinceDays);

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
        createdAt: true,
      },
      take: 5000,
    });

    const matrix: Record<string, Record<string, number>> = {};
    for (const row of rows as any[]) {
      if (!row.userId || !row.tourId) continue;
      const userId = String(row.userId);
      const tourId = String(row.tourId);
      const base = Number(row.score || ACTION_SCORE[row.action] || 1);
      const weightedScore = base * recencyWeight(row.createdAt);
      if (!matrix[userId]) matrix[userId] = {};
      matrix[userId][tourId] = (matrix[userId][tourId] || 0) + weightedScore;
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
      const sim = this.cosineSimilarity(target, vector);
      if (sim > 0) similarUsers.push({ userId: otherUserId, similarity: sim });
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
