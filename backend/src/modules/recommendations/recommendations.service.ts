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

function normalizedHybridWeights() {
  const raw = {
    content: Number(process.env.RECO_HYBRID_CONTENT_WEIGHT ?? 0.2),
    collaborative: Number(process.env.RECO_HYBRID_COLLABORATIVE_WEIGHT ?? 0.3),
    matrixFactorization: Number(process.env.RECO_HYBRID_MF_WEIGHT ?? 0.1),
    deepLearning: Number(process.env.RECO_HYBRID_SEMANTIC_WEIGHT ?? 0.4),
  };

  const positive = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Number.isFinite(value) ? Math.max(0, value) : 0,
    ]),
  ) as typeof raw;
  const total = Object.values(positive).reduce((sum, value) => sum + value, 0);
  const divisor = total > 0 ? total : 1;

  return {
    content: positive.content / divisor,
    collaborative: positive.collaborative / divisor,
    matrixFactorization: positive.matrixFactorization / divisor,
    deepLearning: positive.deepLearning / divisor,
    business: Number(process.env.RECO_HYBRID_BUSINESS_WEIGHT ?? 0.08),
    exactIntentBonus: Number(
      process.env.RECO_HYBRID_EXACT_INTENT_WEIGHT ?? 0.05,
    ),
    agreementBonus: Number(process.env.RECO_AGREEMENT_BONUS_WEIGHT ?? 0.08),
    communityBonus: Number(process.env.RECO_COMMUNITY_BONUS_WEIGHT ?? 0.07),
  };
}

const HYBRID_WEIGHTS = normalizedHybridWeights();
const VALID_SELLER_BOOKING_STATUSES = [
  "waiting_confirmation",
  "confirmed",
  "completed",
] as const;
const PAID_PAYMENT_STATUSES = ["paid"] as const;
const BEST_SELLER_THRESHOLD = 5;
const FAVORITE_THRESHOLD = 5;

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

    // Chỉ loại các tour có tín hiệu cam kết mạnh. Những tour người dùng mới xem,
    // tìm kiếm, yêu thích hoặc được chatbot tư vấn vẫn phải được giữ lại để hồ sơ
    // sở thích gần đây có thể tác động trực tiếp đến kết quả gợi ý.
    const stronglyInteractedTourIds = new Set(
      (behaviors as any[])
        .filter((behavior) => behavior.tourId)
        .filter((behavior) =>
          ["booking", "review"].includes(
            String(behavior.action || "").toLowerCase(),
          ),
        )
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

    const candidateTours = (activeTours as any[]).filter(
      (tour) => !stronglyInteractedTourIds.has(String(tour.id)),
    );

    // Nếu người dùng đã đặt/đánh giá toàn bộ tour đang hoạt động thì vẫn fallback
    // về toàn bộ danh sách để API không trả rỗng.
    const safeCandidateTours = candidateTours.length
      ? candidateTours
      : (activeTours as any[]);

    const scored = safeCandidateTours.map((tour) => {
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
      // Chỉ giảm nhẹ tour đã xem/tìm/yêu thích thay vì loại hoàn toàn.
      // Tour đã booking/review chỉ xuất hiện trong trường hợp fallback không còn ứng viên.
      const alreadyInteractedPenalty = stronglyInteractedTourIds.has(
        String(tour.id),
      )
        ? 12
        : interactedTourIds.has(String(tour.id))
          ? 2
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

      // Điểm lõi phải dùng đúng bốn trọng số được chọn trên validation.
      // Không dùng Math.max với một semantic fallback khác vì điều đó làm
      // trọng số Hybrid đã đánh giá không còn quyết định thứ hạng production.
      const personalizedCore = clampScore(
        HYBRID_WEIGHTS.content * content.score +
          HYBRID_WEIGHTS.collaborative * collaborativeScore +
          HYBRID_WEIGHTS.matrixFactorization * matrixFactorizationScore +
          HYBRID_WEIGHTS.deepLearning * deepLearningScore,
      );

      // Các tín hiệu hiệu chỉnh được cấu hình bằng biến môi trường và giữ ở mức nhỏ.
      // Mục tiêu là hỗ trợ thứ hạng, không lấn át bốn nhánh cá nhân hóa lõi.
      const finalScore = clampScore(
        personalizedCore +
          HYBRID_WEIGHTS.business * businessScore +
          HYBRID_WEIGHTS.exactIntentBonus * exactIntent.score +
          HYBRID_WEIGHTS.agreementBonus * agreementBonus +
          HYBRID_WEIGHTS.communityBonus * communityBonus -
          destinationPenalty -
          alreadyInteractedPenalty,
      );

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

    const sortedScored = scored.sort((a, b) => b.score - a.score);
    const selected = this.applyDiversity(sortedScored, take);
    const topDestinationSignals = Object.entries(signals.destinationScore || {})
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 10)
      .map(([destinationId, score]) => {
        const destination = (destinations as any[]).find(
          (item) => String(item.id) === String(destinationId),
        );
        return {
          destinationId: String(destinationId),
          name: destination?.name || null,
          province: destination?.province || null,
          score: Number(Number(score).toFixed(2)),
        };
      });
    const toDebugScore = (item: HybridScoredTour) => ({
      tourId: String(item.tour.id),
      tourName: item.tour.name,
      destinationId: String(item.tour.destinationId || ""),
      destinationName: item.tour.destination?.name || null,
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
    });

    if (debug) {
      console.log("[recommendations.debug]", {
        userId: String(userId),
        behaviorCount: behaviors.length,
        activeTourCount: activeTours.length,
        candidateTourCount: safeCandidateTours.length,
        excludedByBookingOrReviewCount: stronglyInteractedTourIds.size,
        topDestinationSignals,
        top20BeforeDiversity: sortedScored.slice(0, 20).map(toDebugScore),
        selectedAfterDiversity: selected.map(toDebugScore),
      });
    }

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
        dynamicIsBestSeller:
          (item.tour.bookings?.length || 0) >= BEST_SELLER_THRESHOLD,
        dynamicIsFavorite:
          (item.tour.favorites?.length || 0) >= FAVORITE_THRESHOLD,
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
        ? {
            userId: String(userId),
            behaviorCount: behaviors.length,
            activeTourCount: activeTours.length,
            candidateTourCount: safeCandidateTours.length,
            excludedByBookingOrReviewCount: stronglyInteractedTourIds.size,
            excludedByBookingOrReviewTourIds: [...stronglyInteractedTourIds],
            topDestinationSignals,
            top20BeforeDiversity: sortedScored.slice(0, 20).map(toDebugScore),
            selectedAfterDiversity: selected.map(toDebugScore),
          }
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
                ...VALID_SELLER_BOOKING_STATUSES,
              ] as any,
            },
            payments: {
              some: {
                paymentStatus: { in: [...PAID_PAYMENT_STATUSES] as any },
              },
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

    // Điểm nghiệp vụ đồng thời chứa tín hiệu xu hướng ở mức nhỏ.
    // Trending không phải một nhánh Hybrid độc lập để tránh cộng trùng
    // độ phổ biến với Collaborative Filtering và CommunityBonus.
    const bookingScore =
      normalizeNumber(tour.bookings?.length || 0, maxBookingCount) * 30;
    const favoriteScore =
      normalizeNumber(tour.favorites?.length || 0, maxFavoriteCount) * 20;
    const ratingScore = normalizeNumber(avgRating, 5) * 25;
    const trendingScore =
      (Boolean(tour.isTrending) ? 10 : 0) +
      normalizeNumber(tour.bookings?.length || 0, maxBookingCount) * 5;
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
        availabilityScore,
    );
  }

  private applyDiversity(items: HybridScoredTour[], take: number) {
    const selected: HybridScoredTour[] = [];
    const selectedIds = new Set<string>();
    const destinationCount: Record<string, number> = {};
    const themeCount: Record<string, number> = {};

    const maxPerDestination = Math.max(
      1,
      Number(process.env.RECO_MAX_PER_DESTINATION || 2),
    );
    const maxPerTheme = Math.max(
      1,
      Number(process.env.RECO_MAX_PER_THEME || 3),
    );

    const trySelect = (
      item: HybridScoredTour,
      destinationLimit: number,
      themeLimit: number,
    ) => {
      const tourId = String(item.tour.id);
      if (selectedIds.has(tourId)) return false;

      const destinationId = String(item.tour.destinationId || "unknown");
      const theme = String(item.tour.tourTheme || "unknown");

      if ((destinationCount[destinationId] || 0) >= destinationLimit)
        return false;
      if ((themeCount[theme] || 0) >= themeLimit) return false;

      selected.push(item);
      selectedIds.add(tourId);
      destinationCount[destinationId] =
        (destinationCount[destinationId] || 0) + 1;
      themeCount[theme] = (themeCount[theme] || 0) + 1;
      return true;
    };

    // Vòng 1 chỉ dùng khoảng một nửa số vị trí để phủ nhiều điểm đến.
    // Không để bước đa dạng hóa lấn át hoàn toàn thứ hạng cá nhân hóa.
    const diversitySlots = Math.max(1, Math.ceil(take / 2));
    for (const item of items) {
      trySelect(item, 1, Math.min(2, maxPerTheme));
      if (selected.length >= diversitySlots) break;
    }

    // Vòng 2: giữ thứ tự điểm và cho phép tối đa RECO_MAX_PER_DESTINATION.
    for (const item of items) {
      trySelect(item, maxPerDestination, maxPerTheme);
      if (selected.length >= take) return selected;
    }

    // Vòng 3: chỉ dùng khi dữ liệu không đủ đa dạng để trả đủ số lượng.
    for (const item of items) {
      const tourId = String(item.tour.id);
      if (selectedIds.has(tourId)) continue;
      selected.push(item);
      selectedIds.add(tourId);
      if (selected.length >= take) break;
    }

    return selected;
  }

  private applyPlainTourDiversity(tours: any[], take: number) {
    const selected: any[] = [];
    const selectedIds = new Set<string>();
    const destinationCount: Record<string, number> = {};
    const maxPerDestination = Math.max(
      1,
      Number(process.env.RECO_MAX_PER_DESTINATION || 2),
    );

    const addWithLimit = (tour: any, limit: number) => {
      const tourId = String(tour.id);
      if (selectedIds.has(tourId)) return;
      const destinationId = String(tour.destinationId || "unknown");
      if ((destinationCount[destinationId] || 0) >= limit) return;

      selected.push(tour);
      selectedIds.add(tourId);
      destinationCount[destinationId] =
        (destinationCount[destinationId] || 0) + 1;
    };

    for (const tour of tours) {
      addWithLimit(tour, 1);
      if (selected.length >= take) return selected;
    }

    for (const tour of tours) {
      addWithLimit(tour, maxPerDestination);
      if (selected.length >= take) return selected;
    }

    for (const tour of tours) {
      if (selectedIds.has(String(tour.id))) continue;
      selected.push(tour);
      if (selected.length >= take) break;
    }

    return selected;
  }

  private async popular(take: number, strategy: string) {
    const candidates = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        reviews: { where: { status: "approved" }, select: { rating: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                ...VALID_SELLER_BOOKING_STATUSES,
              ] as any,
            },
            payments: {
              some: {
                paymentStatus: { in: [...PAID_PAYMENT_STATUSES] as any },
              },
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
      take: Math.min(Math.max(take * 5, 20), 100),
    });

    const activeCandidates = (candidates as any[]).filter(
      (tour) => Array.isArray(tour.departures) && tour.departures.length > 0,
    );
    const data = this.applyPlainTourDiversity(activeCandidates, take);

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
