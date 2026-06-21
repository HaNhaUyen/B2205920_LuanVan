import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CollaborativeService } from "./collaborative.service";
import { ContentBasedService } from "./content-based.service";
import { DeepRecommendationService } from "./deep-recommendation.service";
import { MatrixFactorizationService } from "./matrix-factorization.service";
import { RecommendationMetricsService } from "./recommendation-metrics.service";
import { clampScore, normalizeScoreMap } from "./recommendation.utils";

@Injectable()
export class RecommendationEvalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collaborative: CollaborativeService,
    private readonly contentBased: ContentBasedService,
    private readonly matrixFactorization: MatrixFactorizationService,
    private readonly deepRecommendation: DeepRecommendationService,
    private readonly metrics: RecommendationMetricsService,
  ) {}

  private async loadActiveTours() {
    return this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        itinerary: true,
        reviews: { where: { status: "approved" }, select: { rating: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ] as any,
            },
          },
          select: { id: true },
        },
        favorites: { select: { id: true } },
        departures: {
          where: {
            status: { in: ["open", "full"] as any },
            departureDate: { gte: new Date() },
          },
          orderBy: { departureDate: "asc" },
          take: 3,
        },
      },
    });
  }

  private rank(
    scoreMap: Record<string, number>,
    k = 10,
    excluded = new Set<string>(),
  ) {
    return Object.entries(scoreMap)
      .filter(([id]) => !excluded.has(String(id)))
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, k)
      .map(([id]) => String(id));
  }

  async evaluate(k = 10) {
    const users = await this.prisma.userBehavior.findMany({
      where: { userId: { not: null }, tourId: { not: null } },
      select: { userId: true },
      distinct: ["userId"],
      take: 50,
    });

    const activeTours = await this.loadActiveTours();
    const activeTourMap = new Map(
      activeTours.map((tour: any) => [String(tour.id), tour]),
    );
    const totalTourCount = activeTours.length;
    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });

    const modelRows: Record<
      string,
      {
        precision: number[];
        recall: number[];
        ndcg: number[];
        lists: string[][];
        diversity: number[];
      }
    > = {
      Collaborative: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      ContentBased: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      MatrixFactorization: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      DeepLearning: {
        precision: [],
        recall: [],
        ndcg: [],
        lists: [],
        diversity: [],
      },
      Hybrid: { precision: [], recall: [], ndcg: [], lists: [], diversity: [] },
    };

    for (const u of users as any[]) {
      if (!u.userId) continue;
      const behaviors = await this.prisma.userBehavior.findMany({
        where: { userId: u.userId, tourId: { not: null } },
        include: { tour: { include: { destination: true } } },
        orderBy: { createdAt: "desc" },
        take: 80,
      });

      if (behaviors.length < 3) continue;
      const relevantIds = new Set(
        behaviors
          .slice(0, Math.min(5, behaviors.length))
          .map((item: any) => String(item.tourId))
          .filter((id) => activeTourMap.has(id)),
      );
      if (!relevantIds.size) continue;

      const trainBehaviors = behaviors.slice(Math.min(5, behaviors.length));
      const interacted = new Set(
        trainBehaviors.map((item: any) => String(item.tourId)),
      );

      const signals = this.contentBased.buildUserSignals(
        trainBehaviors as any[],
        destinations as any[],
      );
      const cf = await this.collaborative.recommendByUserCF(u.userId);
      const mf = await this.matrixFactorization.predictForUser(u.userId);
      const dl = await this.deepRecommendation.scoreToursForUser(
        trainBehaviors as any[],
        activeTours as any[],
      );

      const contentMap: Record<string, number> = {};
      const hybridMap: Record<string, number> = {};

      for (const tour of activeTours as any[]) {
        if (interacted.has(String(tour.id))) continue;
        const c = this.contentBased.calcContentScore(tour, signals).score;
        const cfScore = Number(cf.scores[String(tour.id)] || 0);
        const mfScore = Number(mf[String(tour.id)] || 0);
        const dlScore = Number(dl[String(tour.id)] || 0);
        const businessScore = this.simpleBusinessScore(tour);
        contentMap[String(tour.id)] = c;
        const agreementBonus =
          c >= 50 && dlScore >= 50 ? 10 : c >= 35 && dlScore >= 35 ? 5 : 0;

        const communityBonus =
          Math.max(cfScore, mfScore) >= 45
            ? 4
            : Math.max(cfScore, mfScore) >= 25
              ? 2
              : 0;

        const weightedHybrid = clampScore(
          0.3 * c +
            0.08 * cfScore +
            0.07 * mfScore +
            0.4 * dlScore +
            0.15 * businessScore +
            agreementBonus +
            communityBonus,
        );

        // Hybrid lấy DeepLearning làm nền vì hiện tại DeepLearning đang mạnh nhất,
        // sau đó cộng thêm Content-Based, Business và tín hiệu cộng đồng nếu có.
        hybridMap[String(tour.id)] = clampScore(
          Math.max(
            weightedHybrid,
            0.9 * dlScore +
              0.22 * c +
              0.08 * businessScore +
              agreementBonus +
              communityBonus,
          ),
        );
      }

      const maps: Record<string, Record<string, number>> = {
        Collaborative: cf.scores,
        ContentBased: normalizeScoreMap(contentMap),
        MatrixFactorization: mf,
        DeepLearning: dl,
        Hybrid: hybridMap,
      };

      for (const [modelName, scoreMap] of Object.entries(maps)) {
        const ranked = this.rank(scoreMap, k, interacted);

        modelRows[modelName].precision.push(
          this.metrics.precisionAtK(ranked, relevantIds, k),
        );
        modelRows[modelName].recall.push(
          this.metrics.recallAtK(ranked, relevantIds, k),
        );
        modelRows[modelName].ndcg.push(
          this.metrics.ndcgAtK(ranked, relevantIds, k),
        );
        modelRows[modelName].lists.push(ranked);
        modelRows[modelName].diversity.push(
          this.metrics.diversity(ranked, activeTourMap),
        );
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const result = Object.entries(modelRows).map(([modelName, row]) => ({
      modelName,
      precisionAt10: Number(avg(row.precision).toFixed(4)),
      recallAt10: Number(avg(row.recall).toFixed(4)),
      ndcgAt10: Number(avg(row.ndcg).toFixed(4)),
      coverage: Number(
        this.metrics.coverage(row.lists, totalTourCount).toFixed(4),
      ),
      diversity: Number(avg(row.diversity).toFixed(4)),
      evaluatedUsers: row.precision.length,
    }));

    for (const item of result) {
      await (this.prisma as any).recommendationMetricRun.create({
        data: {
          modelName: item.modelName,
          precisionAt10: item.precisionAt10,
          recallAt10: item.recallAt10,
          ndcgAt10: item.ndcgAt10,
          coverage: item.coverage,
          diversity: item.diversity,
          meta: { evaluatedUsers: item.evaluatedUsers, k } as any,
        },
      });
    }

    return { k, totalTourCount, result };
  }

  private simpleBusinessScore(tour: any) {
    const ratingAvg = tour.reviews?.length
      ? tour.reviews.reduce(
          (sum: number, item: any) => sum + Number(item.rating || 0),
          0,
        ) / tour.reviews.length
      : 0;
    const bookingScore = Math.min(Number(tour.bookings?.length || 0) * 4, 30);
    const favoriteScore = Math.min(Number(tour.favorites?.length || 0) * 3, 20);
    const ratingScore = Math.min((ratingAvg / 5) * 20, 20);
    const trendingScore = tour.isTrending ? 15 : 0;
    const bestDealScore = tour.isBestDeal ? 10 : 0;
    return clampScore(
      bookingScore +
        favoriteScore +
        ratingScore +
        trendingScore +
        bestDealScore,
    );
  }
}
