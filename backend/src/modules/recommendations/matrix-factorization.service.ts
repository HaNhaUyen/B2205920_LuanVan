import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACTION_SCORE,
  dot,
  normalizeScoreMap,
  recencyWeight,
} from "./recommendation.utils";
import {
  getRecommendationDataSource,
  recommendationSourceWeight,
} from "./recommendation-data-source";

type TrainingRow = {
  userId: bigint | null;
  tourId: bigint | null;
  action: string;
  score: number | null;
  meta: unknown;
  createdAt: Date;
};

type AggregatedInteraction = {
  userId: string;
  tourId: string;
  value: number;
  latestAt: Date;
};

@Injectable()
export class MatrixFactorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private seededValue(seed: string) {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
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

  private normalizeRating(value: number) {
    // Dùng log để giảm ảnh hưởng của người dùng có quá nhiều lượt tương tác.
    const compressed = Math.log1p(Math.max(value, 0));
    return Math.max(0, Math.min(compressed / Math.log1p(25), 1));
  }

  private aggregateRows(rows: TrainingRow[], maxToursPerUser: number) {
    const pairs = new Map<string, AggregatedInteraction>();
    const sourceCounts: Record<string, number> = {};

    for (const row of rows) {
      if (!row.userId || !row.tourId) continue;
      const source = getRecommendationDataSource(row.meta);
      const sourceWeight = recommendationSourceWeight(source);
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      if (sourceWeight <= 0) continue;

      const base = Number(row.score ?? ACTION_SCORE[row.action] ?? 1);
      const weighted = base * recencyWeight(row.createdAt) * sourceWeight;
      if (weighted <= 0) continue;

      const userId = String(row.userId);
      const tourId = String(row.tourId);
      const key = `${userId}:${tourId}`;
      const current = pairs.get(key);
      if (!current) {
        pairs.set(key, {
          userId,
          tourId,
          value: weighted,
          latestAt: row.createdAt,
        });
      } else {
        current.value += weighted;
        if (row.createdAt > current.latestAt) current.latestAt = row.createdAt;
      }
    }

    const byUser = new Map<string, AggregatedInteraction[]>();
    for (const item of pairs.values()) {
      const bucket = byUser.get(item.userId) || [];
      bucket.push(item);
      byUser.set(item.userId, bucket);
    }

    const interactions: AggregatedInteraction[] = [];
    for (const bucket of byUser.values()) {
      bucket.sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime());
      interactions.push(...bucket.slice(0, maxToursPerUser));
    }

    return { interactions, sourceCounts };
  }

  async train(
    options: {
      k?: number;
      epochs?: number;
      lr?: number;
      lambda?: number;
      sinceDays?: number;
      maxToursPerUser?: number;
      maxBehaviors?: number;
    } = {},
  ) {
    const k = Math.max(2, Number(options.k || 10));
    const epochs = Math.max(1, Number(options.epochs || 45));
    const lr = Math.max(0.0001, Number(options.lr || 0.025));
    const lambda = Math.max(0, Number(options.lambda || 0.04));
    const maxToursPerUser = Math.max(
      4,
      Number(
        options.maxToursPerUser || process.env.RECO_MAX_TOURS_PER_USER || 25,
      ),
    );
    const maxBehaviors = Math.max(
      1000,
      Number(
        options.maxBehaviors || process.env.RECO_MAX_TRAIN_BEHAVIORS || 50000,
      ),
    );
    const since = new Date();
    since.setDate(since.getDate() - Number(options.sinceDays || 365));

    const rows = (await this.prisma.userBehavior.findMany({
      where: {
        userId: { not: null },
        tourId: { not: null },
        createdAt: { gte: since, lte: new Date() },
      },
      select: {
        userId: true,
        tourId: true,
        action: true,
        score: true,
        meta: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: maxBehaviors,
    })) as unknown as TrainingRow[];

    const aggregated = this.aggregateRows(rows, maxToursPerUser);
    const interactions = aggregated.interactions.map((row) => ({
      userId: row.userId,
      tourId: row.tourId,
      rating: this.normalizeRating(row.value),
    }));

    if (!interactions.length) {
      throw new Error(
        "Không có dữ liệu hợp lệ để train. Hãy chạy npm run seed:recommendations hoặc kiểm tra RECO_*_WEIGHT.",
      );
    }

    const userIds = Array.from(new Set(interactions.map((row) => row.userId)));
    const tourIds = Array.from(new Set(interactions.map((row) => row.tourId)));
    const P: Record<string, number[]> = {};
    const Q: Record<string, number[]> = {};

    for (const userId of userIds)
      P[userId] = this.initialVector(`u:${userId}`, k);
    for (const tourId of tourIds)
      Q[tourId] = this.initialVector(`t:${tourId}`, k);

    const losses: number[] = [];
    for (let epoch = 0; epoch < epochs; epoch += 1) {
      let loss = 0;
      for (const row of interactions) {
        const p = P[row.userId];
        const q = Q[row.tourId];
        const prediction = dot(p, q);
        const error = row.rating - prediction;
        loss += error * error;

        for (let index = 0; index < k; index += 1) {
          const pu = p[index];
          const qt = q[index];
          p[index] += lr * (error * qt - lambda * pu);
          q[index] += lr * (error * pu - lambda * qt);
        }
      }
      losses.push(Number((loss / Math.max(interactions.length, 1)).toFixed(6)));
    }

    for (const userId of userIds) {
      await (this.prisma as any).recommendationUserFactor.upsert({
        where: { userId: BigInt(userId) },
        update: { vector: P[userId] as any, trainedAt: new Date() },
        create: { userId: BigInt(userId), vector: P[userId] as any },
      });
    }

    for (const tourId of tourIds) {
      await (this.prisma as any).recommendationTourFactor.upsert({
        where: { tourId: BigInt(tourId) },
        update: { vector: Q[tourId] as any, trainedAt: new Date() },
        create: { tourId: BigInt(tourId), vector: Q[tourId] as any },
      });
    }

    return {
      message:
        "Đã huấn luyện Matrix Factorization từ dữ liệu thật và persona seed có trọng số.",
      users: userIds.length,
      tours: tourIds.length,
      rawBehaviors: rows.length,
      aggregatedInteractions: interactions.length,
      maxToursPerUser,
      sourceCounts: aggregated.sourceCounts,
      sourceWeights: {
        real: recommendationSourceWeight("real"),
        recommendation_persona_seed_v2: recommendationSourceWeight(
          "recommendation_persona_seed_v2",
        ),
        seed: recommendationSourceWeight("seed"),
        extra_huge_seed: recommendationSourceWeight("extra_huge_seed"),
      },
      k,
      epochs,
      lr,
      lambda,
      losses,
    };
  }

  async predictForUser(userId: bigint) {
    const userFactor = await (
      this.prisma as any
    ).recommendationUserFactor.findUnique({ where: { userId } });
    if (!userFactor?.vector) return {};

    const p = userFactor.vector as number[];
    const tourFactors = await (
      this.prisma as any
    ).recommendationTourFactor.findMany();
    const raw: Record<string, number> = {};

    for (const item of tourFactors as any[]) {
      const q = (item.vector || []) as number[];
      raw[String(item.tourId)] = Math.max(0, dot(p, q));
    }

    return normalizeScoreMap(raw);
  }
}
