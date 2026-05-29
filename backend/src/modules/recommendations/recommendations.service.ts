import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const ACTION_SCORE: Record<string, number> = {
  view: 1,
  view_detail: 2,
  search: 2,
  favorite: 4,
  ask_ai: 2,
  image_search: 3,
  compare: 2,
  booking_draft: 5,
  booking: 10,
  review: 6,
  cancel_booking: -3,
  skip_recommendation: -1,
};

function stripText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function truncateText(value: any, maxLength = 190) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function addScore(map: Record<string, number>, key: any, score: number) {
  if (!key) return;
  const safeKey = String(key);
  map[safeKey] = (map[safeKey] || 0) + score;
}

function normalizeNumber(value: any, maxValue: number) {
  const number = Number(value || 0);
  if (!maxValue || maxValue <= 0) return 0;
  return Math.min(number / maxValue, 1);
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(userId: bigint | undefined, dto: any) {
    const action = this.normalizeAction(dto.action || "view");
    const score = Number(dto.score ?? ACTION_SCORE[action] ?? 1);

    await this.prisma.userBehavior.create({
      data: {
        userId,
        tourId: dto.tourId ? BigInt(dto.tourId) : null,
        action,
        score,
        // Cột keyword trong MySQL có độ dài giới hạn. Câu hỏi chatbot dài như
        // “Tôi muốn đi biển, chụp hình đẹp...” có thể làm Prisma lỗi P2000.
        // Chỉ lưu keyword ngắn để tracking không làm vỡ API chatbot.
        keyword: truncateText(dto.keyword, 190),
        meta: this.normalizeMeta(dto.meta),
      } as any,
    });

    return { message: "Đã ghi nhận hành vi.", score };
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

  private recencyWeight(createdAt: Date | string) {
    const daysAgo = Math.max(
      0,
      (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );

    // Trọng số giảm mượt theo thời gian: hôm nay ~1, 30 ngày ~0.25, 90 ngày ~0.10.
    return Math.max(0.1, 1 / (1 + daysAgo * 0.1));
  }

  private calcExactIntentBonus(tour: any, signals: any) {
    const keywords = Object.keys(signals.keywordScore || {})
      .map((item) => stripText(item))
      .join(" ");

    const destinationName = stripText(tour.destination?.name || "");
    const tourName = stripText(tour.name || "");

    let bonus = 0;

    const destinationAliases = [
      { key: "nha trang", aliases: ["nha trang", "nha tran"] },
      { key: "da lat", aliases: ["da lat", "dalat"] },
      { key: "phu quoc", aliases: ["phu quoc"] },
      { key: "can tho", aliases: ["can tho", "mien tay"] },
      { key: "hue", aliases: ["hue"] },
      { key: "sa pa", aliases: ["sa pa", "sapa"] },
      { key: "ha long", aliases: ["ha long"] },
      { key: "da nang", aliases: ["da nang", "danang"] },
      { key: "hoi an", aliases: ["hoi an"] },
      { key: "an giang", aliases: ["an giang"] },
    ];

    for (const item of destinationAliases) {
      const userMentioned = item.aliases.some((alias) =>
        keywords.includes(alias),
      );
      const tourMatched =
        item.aliases.some((alias) => destinationName.includes(alias)) ||
        item.aliases.some((alias) => tourName.includes(alias));

      if (userMentioned && tourMatched) {
        bonus += 55;
      }

      if (userMentioned && !tourMatched) {
        bonus -= 18;
      }
    }

    if (
      (keywords.includes("2n1d") ||
        keywords.includes("2n 1d") ||
        keywords.includes("2 ngay 1 dem") ||
        keywords.includes("2n d")) &&
      Number(tour.durationDays) === 2 &&
      Number(tour.durationNights) === 1
    ) {
      bonus += 35;
    }

    if (
      (keywords.includes("3n2d") ||
        keywords.includes("3n 2d") ||
        keywords.includes("3 ngay 2 dem")) &&
      Number(tour.durationDays) === 3 &&
      Number(tour.durationNights) === 2
    ) {
      bonus += 25;
    }

    return clampScore(bonus);
  }

  private calcDestinationMismatchPenalty(tour: any, signals: any) {
    const entries = Object.entries(signals.destinationScore || {}) as Array<
      [string, number]
    >;

    if (!entries.length) return 0;

    const sorted = entries.sort((a, b) => Number(b[1]) - Number(a[1]));
    const [topDestinationId, topScore] = sorted[0];
    const secondScore = Number(sorted[1]?.[1] || 0);

    const tourDestinationId = String(tour.destinationId || "");

    // Chỉ phạt khi user có điểm đến chính thật sự rõ
    const hasStrongMainDestination =
      Number(topScore) >= 25 && Number(topScore) >= secondScore * 1.35;

    if (!hasStrongMainDestination) return 0;

    // Đúng điểm đến chính thì không phạt
    if (tourDestinationId === String(topDestinationId)) return 0;

    // Lệch điểm đến chính thì phạt
    return 18;
  }

  async recommend(userId?: bigint, limit = 8) {
    const take = Math.min(Math.max(Number(limit || 8), 1), 20);

    if (!userId) {
      return this.popular(take, "new_user_popular");
    }

    const since = new Date();
    since.setDate(since.getDate() - 90);

    const behaviors = await this.prisma.userBehavior.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      include: {
        tour: {
          include: {
            destination: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    if (!behaviors.length) {
      return this.popular(take, "cold_start_popular");
    }

    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });

    const userSignals = this.buildUserSignals(
      behaviors as any[],
      destinations as any[],
    );

    const allTours = await this.prisma.tour.findMany({
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
              ],
            },
          },
          select: { id: true },
        },
        favorites: {
          select: { id: true },
        },
        departures: {
          where: {
            status: { in: ["open", "full"] },
            departureDate: { gte: new Date() },
          },
          orderBy: { departureDate: "asc" },
          take: 3,
        },
      },
    });

    const activeTours = (allTours as any[]).filter((tour) => {
      const hasDeparture =
        Array.isArray(tour.departures) && tour.departures.length > 0;
      return tour.status === "published" && hasDeparture;
    });

    if (!activeTours.length) {
      return this.popular(take, "fallback_no_active_departures");
    }

    const maxBookingCount = Math.max(
      ...activeTours.map((tour) => Number(tour.bookings?.length || 0)),
      1,
    );

    const maxFavoriteCount = Math.max(
      ...activeTours.map((tour) => Number(tour.favorites?.length || 0)),
      1,
    );

    const collaborativeScoreMap = await this.buildCollaborativeScoreMap(
      userId,
      behaviors as any[],
    );

    const interactedTourIds = new Set(
      (behaviors as any[])
        .filter((behavior) => behavior.tourId)
        .map((behavior) => String(behavior.tourId)),
    );

    const scored = activeTours.map((tour) => {
      const contentScore = this.calcContentScore(tour, userSignals);

      let collaborativeScore = Number(
        collaborativeScoreMap[String(tour.id)] || 0,
      );

      const behaviorAffinityScore = this.calcBehaviorAffinityScore(
        tour,
        userSignals,
      );

      const businessScore = this.calcBusinessScore(
        tour,
        maxBookingCount,
        maxFavoriteCount,
      );

      const exactIntentBonus = this.calcExactIntentBonus(tour, userSignals);

      const destinationPenalty = this.calcDestinationMismatchPenalty(
        tour,
        userSignals,
      );

      const alreadyInteractedPenalty = interactedTourIds.has(String(tour.id))
        ? 10
        : 0;

      // Nếu tour lệch điểm đến chính, không cho collaborative kéo quá mạnh
      if (destinationPenalty > 0) {
        collaborativeScore = Math.min(collaborativeScore, 35);
      }

      const finalScore = clampScore(
        0.35 * contentScore +
          0.25 * behaviorAffinityScore +
          0.18 * collaborativeScore +
          0.12 * businessScore +
          0.1 * exactIntentBonus -
          destinationPenalty -
          alreadyInteractedPenalty,
      );

      return {
        tour,
        score: finalScore,
        contentScore,
        collaborativeScore,
        behaviorAffinityScore,
        businessScore,
        exactIntentBonus,
        destinationPenalty,
        alreadyInteractedPenalty,
      };
    });

    const ranked = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const diverse = this.applyDiversity(ranked, take);

    if (!diverse.length) {
      return this.popular(take, "fallback_popular_no_match");
    }

    return {
      strategy: "hybrid_content_collaborative_business_diversity",
      signals: {
        totalBehaviors: behaviors.length,
        topDestinations: Object.entries(userSignals.destinationScore)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        topThemes: Object.entries(userSignals.themeScore)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
        topKeywords: Object.entries(userSignals.keywordScore)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      },
      data: diverse.map((item) => ({
        ...item.tour,
        recommendationScore: Number(item.score.toFixed(2)),
        recommendationBreakdown: {
          content: Number(item.contentScore.toFixed(2)),
          collaborative: Number(item.collaborativeScore.toFixed(2)),
          behavior: Number(item.behaviorAffinityScore.toFixed(2)),
          business: Number(item.businessScore.toFixed(2)),
        },
      })),
    };
  }

  private buildUserSignals(behaviors: any[], destinations: any[]) {
    const tourScore: Record<string, number> = {};
    const destinationScore: Record<string, number> = {};
    const themeScore: Record<string, number> = {};
    const typeScore: Record<string, number> = {};
    const keywordScore: Record<string, number> = {};
    const priceValues: number[] = [];
    const durationValues: number[] = [];

    for (const behavior of behaviors) {
      const baseScore = Number(
        behavior.score || ACTION_SCORE[behavior.action] || 1,
      );

      const recencyWeight = this.recencyWeight(behavior.createdAt);
      const score = baseScore * recencyWeight;
      const tour = behavior.tour;

      if (tour) {
        addScore(tourScore, tour.id, score * 1.2);
        addScore(destinationScore, tour.destinationId, score * 1.8);
        addScore(themeScore, tour.tourTheme, score * 1.4);
        addScore(typeScore, tour.tourType, score);

        if (tour.basePriceAdult) priceValues.push(Number(tour.basePriceAdult));
        if (tour.durationDays) durationValues.push(Number(tour.durationDays));
      }

      const keyword = stripText(behavior.keyword || "");
      if (keyword) {
        addScore(keywordScore, keyword, score);

        for (const dest of destinations) {
          const destName = stripText(dest.name);
          const province = stripText(dest.province || "");

          if (
            keyword.includes(destName) ||
            destName.includes(keyword) ||
            (province && keyword.includes(province))
          ) {
            addScore(destinationScore, dest.id, score * 2.2);
          }
        }

        if (/bien|dao|phu quoc|nha trang|quy nhon|ha long/.test(keyword)) {
          addScore(themeScore, "beach", score * 1.5);
        }

        if (/da lat|sapa|sa pa|san may|nui|trek/.test(keyword)) {
          addScore(themeScore, "mountain", score * 1.5);
        }

        if (/van hoa|pho co|di tich|hoi an|hue/.test(keyword)) {
          addScore(themeScore, "culture", score * 1.5);
        }

        if (/gia dinh|tre em|family/.test(keyword)) {
          addScore(themeScore, "family", score * 1.5);
        }

        if (/mien tay|can tho|an giang|song nuoc/.test(keyword)) {
          addScore(themeScore, "eco", score * 1.5);
        }

        if (/re|gia re|tiet kiem|duoi/.test(keyword)) {
          addScore(keywordScore, "budget", score);
        }

        if (/cao cap|sang|resort|5 sao|bon sao|4 sao/.test(keyword)) {
          addScore(keywordScore, "premium", score);
        }
      }
      const meta =
        behavior.meta && typeof behavior.meta === "object" ? behavior.meta : {};
      const metaText = stripText(
        [
          meta.destination,
          meta.theme,
          meta.travelStyle,
          meta.duration,
          meta.budget,
          meta.source,
        ]
          .filter(Boolean)
          .join(" "),
      );

      if (metaText) {
        addScore(keywordScore, metaText, score * 0.7);
        if (/bien|beach|dao|island/.test(metaText))
          addScore(themeScore, "beach", score);
        if (/nui|mountain|mat me|cool|san may/.test(metaText))
          addScore(themeScore, "mountain", score);
        if (/gia dinh|family|tre em|children/.test(metaText))
          addScore(themeScore, "family", score);
        if (/nghi duong|resort|luxury|cao cap/.test(metaText))
          addScore(themeScore, "luxury", score);
        if (/sinh thai|eco|thien nhien|nature/.test(metaText))
          addScore(themeScore, "eco", score);
      }
    }

    const avgPrice =
      priceValues.length > 0
        ? priceValues.reduce((sum, value) => sum + value, 0) /
          priceValues.length
        : null;

    const avgDuration =
      durationValues.length > 0
        ? durationValues.reduce((sum, value) => sum + value, 0) /
          durationValues.length
        : null;

    return {
      tourScore,
      destinationScore,
      themeScore,
      typeScore,
      keywordScore,
      avgPrice,
      avgDuration,
    };
  }

  private calcBehaviorAffinityScore(tour: any, signals: any) {
    let score = 0;

    score += Math.min(
      Number(signals.tourScore[String(tour.id)] || 0) * 2.5,
      35,
    );
    score += Math.min(
      Number(signals.destinationScore[String(tour.destinationId)] || 0) * 1.1,
      28,
    );
    score += Math.min(
      Number(signals.themeScore[String(tour.tourTheme)] || 0) * 1.0,
      18,
    );
    score += Math.min(
      Number(signals.typeScore[String(tour.tourType)] || 0) * 0.7,
      8,
    );

    return clampScore(score);
  }

  private calcContentScore(tour: any, signals: any) {
    let score = 0;

    const destinationScore = Number(
      signals.destinationScore[String(tour.destinationId)] || 0,
    );

    const themeScore = Number(signals.themeScore[String(tour.tourTheme)] || 0);

    const typeScore = Number(signals.typeScore[String(tour.tourType)] || 0);

    // 1. Điểm đến là tín hiệu quan trọng nhất, nhưng không cho bão hòa quá nhanh
    score += Math.min(destinationScore * 1.2, 35);

    // 2. Chủ đề tour ảnh hưởng vừa phải
    score += Math.min(themeScore * 1.0, 20);

    // 3. Loại tour ảnh hưởng nhẹ
    score += Math.min(typeScore * 0.8, 10);

    const text = stripText(
      [
        tour.name,
        tour.shortDescription,
        tour.fullDescription,
        tour.destination?.name,
        tour.destination?.province,
        tour.tourTheme,
        tour.tourType,
      ]
        .filter(Boolean)
        .join(" "),
    );

    // 4. Keyword chỉ cộng nếu thật sự khớp, và giới hạn tổng điểm keyword
    let keywordScoreTotal = 0;

    for (const [keyword, keywordValue] of Object.entries(
      signals.keywordScore as Record<string, number>,
    )) {
      const safeKeyword = stripText(keyword);
      if (!safeKeyword) continue;

      if (text.includes(safeKeyword)) {
        keywordScoreTotal += Math.min(Number(keywordValue) * 0.8, 8);
      }
    }

    score += Math.min(keywordScoreTotal, 20);

    // 5. Giá gần với hành vi cũ
    if (signals.avgPrice && tour.basePriceAdult) {
      const tourPrice = Number(tour.basePriceAdult);
      const diffRatio =
        Math.abs(tourPrice - signals.avgPrice) / signals.avgPrice;

      if (diffRatio <= 0.15) score += 8;
      else if (diffRatio <= 0.3) score += 5;
      else if (diffRatio <= 0.5) score += 2;
    }

    // 6. Thời lượng gần với hành vi cũ
    if (signals.avgDuration && tour.durationDays) {
      const diff = Math.abs(Number(tour.durationDays) - signals.avgDuration);

      if (diff <= 0.5) score += 7;
      else if (diff <= 1) score += 5;
      else if (diff <= 2) score += 2;
    }

    return clampScore(score);
  }

  private async buildCollaborativeScoreMap(userId: bigint, myBehaviors: any[]) {
    const myTourIds = Array.from(
      new Set(
        myBehaviors
          .filter((behavior) => behavior.tourId)
          .map((behavior) => String(behavior.tourId)),
      ),
    );

    const result: Record<string, number> = {};

    if (!myTourIds.length) return result;

    const similarUserBehaviors = await this.prisma.userBehavior.findMany({
      where: {
        userId: { not: userId },
        tourId: { in: myTourIds.map((id) => BigInt(id)) },
      },
      select: {
        userId: true,
        tourId: true,
        action: true,
        score: true,
      },
      take: 500,
    });

    const similarUserScore: Record<string, number> = {};

    for (const behavior of similarUserBehaviors as any[]) {
      if (!behavior.userId) continue;
      const actionWeight = ACTION_SCORE[behavior.action] || 1;
      addScore(
        similarUserScore,
        behavior.userId,
        Number(behavior.score || actionWeight),
      );
    }

    const topSimilarUserIds = Object.entries(similarUserScore)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([id]) => BigInt(id));

    if (!topSimilarUserIds.length) return result;

    const candidateBehaviors = await this.prisma.userBehavior.findMany({
      where: {
        userId: { in: topSimilarUserIds },
        tourId: { not: null },
      },
      select: {
        userId: true,
        tourId: true,
        action: true,
        score: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const myTourSet = new Set(myTourIds);

    for (const behavior of candidateBehaviors as any[]) {
      if (!behavior.tourId || !behavior.userId) continue;

      const tourId = String(behavior.tourId);

      if (myTourSet.has(tourId)) continue;

      const userSimilarity = Number(
        similarUserScore[String(behavior.userId)] || 0,
      );
      const actionScore = Number(
        behavior.score || ACTION_SCORE[behavior.action] || 1,
      );

      addScore(result, tourId, userSimilarity * actionScore);
    }

    const maxScore = Math.max(...Object.values(result), 1);

    for (const key of Object.keys(result)) {
      result[key] = normalizeNumber(result[key], maxScore) * 100;
    }

    return result;
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

    const trendingScore = tour.isTrending ? 15 : 0;
    const bestDealScore = tour.isBestDeal ? 10 : 0;

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

  private applyDiversity(items: any[], take: number) {
    const selected: any[] = [];
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
      ) {
        continue;
      }

      selected.push(item);
      destinationCount[destinationId] = currentDestinationCount + 1;
      themeCount[theme] = currentThemeCount + 1;

      if (selected.length >= take) break;
    }

    if (selected.length < take) {
      for (const item of items) {
        if (
          selected.some((selectedItem) => selectedItem.tour.id === item.tour.id)
        ) {
          continue;
        }

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
              ],
            },
          },
          select: { id: true },
        },
        favorites: {
          select: { id: true },
        },
        departures: {
          where: {
            status: { in: ["open", "full"] },
            departureDate: { gte: new Date() },
          },
          orderBy: { departureDate: "asc" },
          take: 3,
        },
      },
      orderBy: [
        { isTrending: "desc" },
        { isBestDeal: "desc" },
        { createdAt: "desc" },
      ],
      take,
    });

    return { strategy, data };
  }
}
