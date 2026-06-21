import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  ACTION_SCORE,
  dot,
  normalizeScoreMap,
  recencyWeight,
} from "./recommendation.utils";

@Injectable()
export class MatrixFactorizationService {
  constructor(private readonly prisma: PrismaService) {}

  private randomVector(k: number) {
    return Array.from({ length: k }, () => (Math.random() - 0.5) * 0.1);
  }

  private normalizeRating(value: number) {
    // Đưa implicit score về khoảng 0..1 để SGD ổn định hơn.
    return Math.max(0, Math.min(value / 12, 1));
  }

  async train(
    options: {
      k?: number;
      epochs?: number;
      lr?: number;
      lambda?: number;
      sinceDays?: number;
    } = {},
  ) {
    const k = Number(options.k || 10);
    const epochs = Number(options.epochs || 45);
    const lr = Number(options.lr || 0.025);
    const lambda = Number(options.lambda || 0.04);
    const since = new Date();
    since.setDate(since.getDate() - Number(options.sinceDays || 365));

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
      take: 10000,
    });

    const interactions = (rows as any[])
      .filter((row) => row.userId && row.tourId)
      .map((row) => ({
        userId: String(row.userId),
        tourId: String(row.tourId),
        rating: this.normalizeRating(
          Number(row.score || ACTION_SCORE[row.action] || 1) *
            recencyWeight(row.createdAt),
        ),
      }));

    const userIds = Array.from(new Set(interactions.map((row) => row.userId)));
    const tourIds = Array.from(new Set(interactions.map((row) => row.tourId)));
    const P: Record<string, number[]> = {};
    const Q: Record<string, number[]> = {};

    for (const u of userIds) P[u] = this.randomVector(k);
    for (const t of tourIds) Q[t] = this.randomVector(k);

    const losses: number[] = [];
    for (let epoch = 0; epoch < epochs; epoch += 1) {
      let loss = 0;
      for (const row of interactions) {
        const p = P[row.userId];
        const q = Q[row.tourId];
        const pred = dot(p, q);
        const err = row.rating - pred;
        loss += err * err;

        for (let i = 0; i < k; i += 1) {
          const pu = p[i];
          const qt = q[i];
          p[i] += lr * (err * qt - lambda * pu);
          q[i] += lr * (err * pu - lambda * qt);
        }
      }
      losses.push(Number((loss / Math.max(interactions.length, 1)).toFixed(6)));
    }

    for (const u of userIds) {
      await (this.prisma as any).recommendationUserFactor.upsert({
        where: { userId: BigInt(u) },
        update: { vector: P[u] as any, trainedAt: new Date() },
        create: { userId: BigInt(u), vector: P[u] as any },
      });
    }

    for (const t of tourIds) {
      await (this.prisma as any).recommendationTourFactor.upsert({
        where: { tourId: BigInt(t) },
        update: { vector: Q[t] as any, trainedAt: new Date() },
        create: { tourId: BigInt(t), vector: Q[t] as any },
      });
    }

    return {
      message: "Đã huấn luyện Matrix Factorization.",
      users: userIds.length,
      tours: tourIds.length,
      interactions: interactions.length,
      k,
      epochs,
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
