import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CollaborativeService } from "./collaborative.service";
import { ContentBasedService } from "./content-based.service";
import { DeepRecommendationService } from "./deep-recommendation.service";
import { MatrixFactorizationService } from "./matrix-factorization.service";
import { HybridScoredTour, RecommendationResult } from "./recommendation.types";
import {
  ACTION_SCORE,
  clampScore,
  normalizeNumber,
  stripText,
  truncateText,
} from "./recommendation.utils";

const HYBRID_WEIGHTS = {
  content: 0.3,
  collaborative: 0.08,
  matrixFactorization: 0.07,
  deepLearning: 0.4,
  business: 0.15,
  exactIntentBonus: 0.08,
};

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collaborative: CollaborativeService,
    private readonly contentBased: ContentBasedService,
    private readonly matrixFactorization: MatrixFactorizationService,
    private readonly deepRecommendation: DeepRecommendationService,
  ) {}

  async track(userId: bigint | undefined, dto: any) {
    const action = this.normalizeAction(dto.action || "view");
    const score = Number(dto.score ?? ACTION_SCORE[action] ?? 1);

    await this.prisma.userBehavior.create({
      data: {
        userId,
        tourId: dto.tourId ? BigInt(dto.tourId) : null,
        action,
        score,
        keyword: truncateText(dto.keyword, 190),
        meta: this.normalizeMeta(dto.meta),
      } as any,
    });

    return { message: "Đã ghi nhận hành vi.", score };
  }

  async recommend(
    userId?: bigint,
    limit = 8,
    debug = false,
  ): Promise<RecommendationResult> {
    const take = Math.min(Math.max(Number(limit || 8), 1), 20);

    if (!userId) return this.popular(take, "new_user_popular");

    const behaviors = await this.loadUserBehaviors(userId);
    if (!behaviors.length)
      return this.popular(take, "cold_start_popular_content_business");

    const [destinations, activeTours] = await Promise.all([
      this.prisma.destination.findMany({ where: { status: "active" } }),
      this.loadActiveTours(),
    ]);

    if (!activeTours.length)
      return this.popular(take, "fallback_no_active_departures");

    const signals = this.contentBased.buildUserSignals(
      behaviors as any[],
      destinations as any[],
    );
    const cfResult = await this.collaborative.recommendByUserCF(userId);
    const mfMap = await this.matrixFactorization.predictForUser(userId);
    const dlMap = await this.deepRecommendation.scoreToursForUser(
      behaviors as any[],
      activeTours as any[],
    );

    const interactedTourIds = new Set(
      (behaviors as any[])
        .filter((behavior) => behavior.tourId)
        .map((behavior) => String(behavior.tourId)),
    );

    const maxBookingCount = Math.max(
      ...activeTours.map((tour: any) => Number(tour.bookings?.length || 0)),
      1,
    );
    const maxFavoriteCount = Math.max(
      ...activeTours.map((tour: any) => Number(tour.favorites?.length || 0)),
      1,
    );

    const scored = (activeTours as any[]).map((tour) => {
      const content = this.contentBased.calcContentScore(tour, signals);
      const exactIntent = this.contentBased.calcExactIntentBonus(tour, signals);
      const destinationPenalty =
        this.contentBased.calcDestinationMismatchPenalty(tour, signals);

      let collaborativeScore = Number(cfResult.scores[String(tour.id)] || 0);
      if (destinationPenalty > 0)
        collaborativeScore = Math.min(collaborativeScore, 35);

      const matrixFactorizationScore = Number(mfMap[String(tour.id)] || 0);
      const deepLearningScore = Number(dlMap[String(tour.id)] || 0);
      const businessScore = this.calcBusinessScore(
        tour,
        maxBookingCount,
        maxFavoriteCount,
      );
      const alreadyInteractedPenalty = interactedTourIds.has(String(tour.id))
        ? 8
        : 0;

      const agreementBonus =
        content.score >= 50 && deepLearningScore >= 50
          ? 10
          : content.score >= 35 && deepLearningScore >= 35
            ? 5
            : 0;

      const communityBonus =
        Math.max(collaborativeScore, matrixFactorizationScore) >= 45
          ? 4
          : Math.max(collaborativeScore, matrixFactorizationScore) >= 25
            ? 2
            : 0;

      const weightedHybrid = clampScore(
        HYBRID_WEIGHTS.content * content.score +
          HYBRID_WEIGHTS.collaborative * collaborativeScore +
          HYBRID_WEIGHTS.matrixFactorization * matrixFactorizationScore +
          HYBRID_WEIGHTS.deepLearning * deepLearningScore +
          HYBRID_WEIGHTS.business * businessScore +
          HYBRID_WEIGHTS.exactIntentBonus * exactIntent.score +
          0.4 * agreementBonus +
          0.4 * communityBonus -
          destinationPenalty -
          alreadyInteractedPenalty,
      );

      const semanticFallback = clampScore(
        0.72 * deepLearningScore +
          0.18 * content.score +
          0.1 * businessScore +
          0.04 * exactIntent.score +
          0.03 * Math.max(collaborativeScore, matrixFactorizationScore) -
          destinationPenalty -
          alreadyInteractedPenalty,
      );

      const finalScore = clampScore(Math.max(weightedHybrid, semanticFallback));

      const reasons = Array.from(
        new Set([...content.reasons, ...exactIntent.reasons]),
      ).slice(0, 4);
      if (collaborativeScore >= 35)
        reasons.push("Người dùng có sở thích giống bạn cũng quan tâm");
      if (matrixFactorizationScore >= 35)
        reasons.push("Phù hợp sở thích tiềm ẩn từ ma trận hành vi");
      if (deepLearningScore >= 35)
        reasons.push("Khớp ngữ nghĩa mô tả/lịch trình tour");
      if (businessScore >= 45)
        reasons.push("Tour đang được quan tâm và có đánh giá tốt");

      return {
        tour,
        score: finalScore,
        contentScore: content.score,
        collaborativeScore,
        matrixFactorizationScore,
        deepLearningScore,
        businessScore,
        exactIntentBonus: exactIntent.score,
        destinationPenalty,
        alreadyInteractedPenalty,
        reasons,
      } satisfies HybridScoredTour;
    });

    const selected = this.applyDiversity(
      scored.sort((a, b) => b.score - a.score),
      take,
    );

    return {
      strategy: "hybrid_cf_cbf_matrix_factorization_deep_learning_business",
      weights: HYBRID_WEIGHTS,
      data: selected.map((item) => ({
        ...item.tour,
        recommendationScore: Number(Math.min(99, item.score).toFixed(2)),
        recommendationReasons: item.reasons,
        remainingSlots: this.getRemainingSlots(item.tour.departures?.[0]),
        bookingCount: item.tour.bookings?.length || 0,
        favoriteCount: item.tour.favorites?.length || 0,
        dynamicIsBestSeller: (item.tour.bookings?.length || 0) >= 5,
        dynamicIsFavorite: (item.tour.favorites?.length || 0) >= 5,
        dynamicIsBestDeal: false,
        recommendationBreakdown: debug
          ? {
              content: Number(item.contentScore.toFixed(2)),
              collaborative: Number(item.collaborativeScore.toFixed(2)),
              matrixFactorization: Number(
                item.matrixFactorizationScore.toFixed(2),
              ),
              deepLearning: Number(item.deepLearningScore.toFixed(2)),
              business: Number(item.businessScore.toFixed(2)),
              exactIntent: Number(item.exactIntentBonus.toFixed(2)),
            }
          : undefined,
      })),
      debug: debug
        ? selected.map((item) => ({
            tourId: String(item.tour.id),
            finalScore: Number(item.score.toFixed(2)),
            contentScore: Number(item.contentScore.toFixed(2)),
            collaborativeScore: Number(item.collaborativeScore.toFixed(2)),
            matrixFactorizationScore: Number(
              item.matrixFactorizationScore.toFixed(2),
            ),
            deepLearningScore: Number(item.deepLearningScore.toFixed(2)),
            businessScore: Number(item.businessScore.toFixed(2)),
            exactIntentBonus: Number(item.exactIntentBonus.toFixed(2)),
            destinationPenalty: Number(item.destinationPenalty.toFixed(2)),
            alreadyInteractedPenalty: Number(
              item.alreadyInteractedPenalty.toFixed(2),
            ),
            reasons: item.reasons,
          }))
        : undefined,
    };
  }

  async trainMatrixFactorization(dto: any = {}) {
    return this.matrixFactorization.train({
      k: Number(dto.k || 10),
      epochs: Number(dto.epochs || 45),
      lr: Number(dto.lr || 0.025),
      lambda: Number(dto.lambda || 0.04),
      sinceDays: Number(dto.sinceDays || 365),
    });
  }

  async rebuildDeepEmbeddings() {
    return this.deepRecommendation.rebuildTourEmbeddings();
  }

  private async loadUserBehaviors(userId: bigint) {
    const since = new Date();
    since.setDate(since.getDate() - 120);
    return this.prisma.userBehavior.findMany({
      where: { userId, createdAt: { gte: since } },
      include: { tour: { include: { destination: true } } },
      orderBy: { createdAt: "desc" },
      take: 250,
    });
  }

  private async loadActiveTours() {
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
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

    return (tours as any[]).filter(
      (tour) => Array.isArray(tour.departures) && tour.departures.length > 0,
    );
  }

  private getRemainingSlots(departure: any) {
    if (!departure) return 0;
    return Math.max(
      0,
      Number(departure.totalSlots || 0) -
        Number(departure.bookedSlots || 0) -
        Number(departure.heldSlots || 0),
    );
  }

  private calcBusinessScore(
    tour: any,
    maxBookingCount: number,
    maxFavoriteCount: number,
  ) {
    const ratings = tour.reviews || [];
    const avgRating = ratings.length
      ? ratings.reduce(
          (sum: number, item: any) => sum + Number(item.rating || 0),
          0,
        ) / ratings.length
      : 0;

    const bookingScore =
      normalizeNumber(tour.bookings?.length || 0, maxBookingCount) * 30;
    const favoriteScore =
      normalizeNumber(tour.favorites?.length || 0, maxFavoriteCount) * 20;
    const ratingScore = normalizeNumber(avgRating, 5) * 20;
    const trendingScore =
      normalizeNumber(tour.bookings?.length || 0, maxBookingCount) * 10;
    const bestDealScore = 0;
    const availableDeparture = (tour.departures || []).find(
      (departure: any) => {
        const available =
          Number(departure.totalSlots || 0) -
          Number(departure.bookedSlots || 0) -
          Number(departure.heldSlots || 0);
        return available > 0;
      },
    );
    const availabilityScore = availableDeparture ? 5 : 0;

    return clampScore(
      bookingScore +
        favoriteScore +
        ratingScore +
        trendingScore +
        bestDealScore +
        availabilityScore,
    );
  }

  private applyDiversity(items: HybridScoredTour[], take: number) {
    const selected: HybridScoredTour[] = [];
    const destinationCount: Record<string, number> = {};
    const themeCount: Record<string, number> = {};

    for (const item of items) {
      const destinationId = String(item.tour.destinationId || "");
      const theme = String(item.tour.tourTheme || "");
      const currentDestinationCount = destinationCount[destinationId] || 0;
      const currentThemeCount = themeCount[theme] || 0;

      if (
        selected.length >= Math.ceil(take * 0.6) &&
        (currentDestinationCount >= 3 || currentThemeCount >= 4)
      )
        continue;
      selected.push(item);
      destinationCount[destinationId] = currentDestinationCount + 1;
      themeCount[theme] = currentThemeCount + 1;
      if (selected.length >= take) break;
    }

    if (selected.length < take) {
      for (const item of items) {
        if (
          selected.some((selectedItem) => selectedItem.tour.id === item.tour.id)
        )
          continue;
        selected.push(item);
        if (selected.length >= take) break;
      }
    }
    return selected;
  }

  private async popular(take: number, strategy: string) {
    const data = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
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
      orderBy: [{ createdAt: "desc" }],
      take,
    });
    return { strategy, data };
  }

  private normalizeAction(action: any) {
    const value = stripText(String(action || "view")).replace(/ /g, "_");
    return ACTION_SCORE[value] !== undefined ? value : "view";
  }

  private normalizeMeta(meta: any) {
    if (!meta || typeof meta !== "object" || Array.isArray(meta))
      return undefined;
    const safe: Record<string, any> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (["object", "function", "undefined"].includes(typeof value)) continue;
      const text = String(value).trim();
      if (!text) continue;
      safe[key] = text.length > 180 ? text.slice(0, 180) : value;
    }
    return Object.keys(safe).length ? safe : undefined;
  }
}
