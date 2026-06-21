import { Injectable } from "@nestjs/common";
import { addScore, clampScore, stripText } from "./recommendation.utils";
import { UserSignals } from "./recommendation.types";

@Injectable()
export class ContentBasedService {
  buildUserSignals(behaviors: any[], destinations: any[] = []): UserSignals {
    const tourScore: Record<string, number> = {};
    const destinationScore: Record<string, number> = {};
    const themeScore: Record<string, number> = {};
    const typeScore: Record<string, number> = {};
    const keywordScore: Record<string, number> = {};
    const priceValues: number[] = [];
    const durationValues: number[] = [];

    const destinationLookup = destinations.map((destination) => ({
      id: String(destination.id),
      name: stripText(destination.name || ""),
      province: stripText(destination.province || ""),
      region: stripText(destination.region || ""),
    }));

    for (const behavior of behaviors) {
      const score = Math.max(Number(behavior.score || 1), 0.2);
      const tour = behavior.tour || {};

      if (behavior.tourId) addScore(tourScore, behavior.tourId, score * 1.4);
      if (tour.destinationId)
        addScore(destinationScore, tour.destinationId, score);
      if (tour.tourTheme) addScore(themeScore, tour.tourTheme, score);
      if (tour.tourType) addScore(typeScore, tour.tourType, score * 0.7);

      if (tour.basePriceAdult) priceValues.push(Number(tour.basePriceAdult));
      if (tour.durationDays) durationValues.push(Number(tour.durationDays));

      const keyword = stripText(behavior.keyword || "");
      if (keyword) {
        addScore(keywordScore, keyword, score);
        for (const destination of destinationLookup) {
          const matched =
            (destination.name && keyword.includes(destination.name)) ||
            (destination.province && keyword.includes(destination.province)) ||
            (destination.region && keyword.includes(destination.region));
          if (matched) addScore(destinationScore, destination.id, score * 1.2);
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

    const avgPrice = priceValues.length
      ? priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length
      : null;
    const avgDuration = durationValues.length
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

  calcContentScore(tour: any, signals: UserSignals) {
    let score = 0;
    const reasons: string[] = [];

    const destinationScore = Number(
      signals.destinationScore[String(tour.destinationId)] || 0,
    );
    const themeScore = Number(signals.themeScore[String(tour.tourTheme)] || 0);
    const typeScore = Number(signals.typeScore[String(tour.tourType)] || 0);

    const destinationContribution = Math.min(destinationScore * 1.2, 35);
    const themeContribution = Math.min(themeScore * 1.0, 20);
    const typeContribution = Math.min(typeScore * 0.8, 10);

    score += destinationContribution + themeContribution + typeContribution;

    if (destinationContribution >= 10)
      reasons.push(`Phù hợp điểm đến ${tour.destination?.name || ""}`.trim());
    if (themeContribution >= 8)
      reasons.push(`Phù hợp phong cách ${tour.tourTheme || ""}`.trim());

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

    let keywordScoreTotal = 0;
    for (const [keyword, keywordValue] of Object.entries(
      signals.keywordScore,
    )) {
      const safeKeyword = stripText(keyword);
      if (!safeKeyword) continue;
      if (text.includes(safeKeyword))
        keywordScoreTotal += Math.min(Number(keywordValue) * 0.8, 8);
    }

    const keywordContribution = Math.min(keywordScoreTotal, 20);
    score += keywordContribution;
    if (keywordContribution >= 6)
      reasons.push("Khớp từ khóa/nội dung bạn quan tâm");

    if (signals.avgPrice && tour.basePriceAdult) {
      const tourPrice = Number(tour.basePriceAdult);
      const diffRatio =
        Math.abs(tourPrice - signals.avgPrice) / signals.avgPrice;
      if (diffRatio <= 0.15) {
        score += 8;
        reasons.push("Giá gần ngân sách/lịch sử đặt tour");
      } else if (diffRatio <= 0.3) score += 5;
      else if (diffRatio <= 0.5) score += 2;
    }

    if (signals.avgDuration && tour.durationDays) {
      const diff = Math.abs(Number(tour.durationDays) - signals.avgDuration);
      if (diff <= 0.5) {
        score += 7;
        reasons.push("Thời lượng gần sở thích của bạn");
      } else if (diff <= 1) score += 5;
      else if (diff <= 2) score += 2;
    }

    return { score: clampScore(score), reasons };
  }

  calcExactIntentBonus(tour: any, signals: UserSignals) {
    const keywords = Object.keys(signals.keywordScore || {})
      .map((item) => stripText(item))
      .join(" ");
    const destinationName = stripText(tour.destination?.name || "");
    const tourName = stripText(tour.name || "");
    let bonus = 0;
    const reasons: string[] = [];

    const aliases = [
      { key: "Nha Trang", aliases: ["nha trang", "nha tran"] },
      { key: "Đà Lạt", aliases: ["da lat", "dalat"] },
      { key: "Phú Quốc", aliases: ["phu quoc"] },
      { key: "Cần Thơ", aliases: ["can tho", "mien tay"] },
      { key: "Huế", aliases: ["hue"] },
      { key: "Sa Pa", aliases: ["sa pa", "sapa"] },
      { key: "Hạ Long", aliases: ["ha long"] },
      { key: "Đà Nẵng", aliases: ["da nang", "danang"] },
      { key: "Hội An", aliases: ["hoi an"] },
      { key: "An Giang", aliases: ["an giang"] },
    ];

    for (const item of aliases) {
      const userMentioned = item.aliases.some((alias) =>
        keywords.includes(alias),
      );
      const tourMatched = item.aliases.some(
        (alias) => destinationName.includes(alias) || tourName.includes(alias),
      );
      if (userMentioned && tourMatched) {
        bonus += 55;
        reasons.push(`Đúng điểm đến bạn vừa nhắc: ${item.key}`);
      }
      if (userMentioned && !tourMatched) bonus -= 18;
    }

    if (
      (keywords.includes("2n1d") || keywords.includes("2 ngay 1 dem")) &&
      Number(tour.durationDays) === 2 &&
      Number(tour.durationNights) === 1
    ) {
      bonus += 35;
      reasons.push("Đúng thời lượng 2N1Đ");
    }
    if (
      (keywords.includes("3n2d") || keywords.includes("3 ngay 2 dem")) &&
      Number(tour.durationDays) === 3 &&
      Number(tour.durationNights) === 2
    ) {
      bonus += 25;
      reasons.push("Đúng thời lượng 3N2Đ");
    }

    return { score: clampScore(bonus), reasons };
  }

  calcDestinationMismatchPenalty(tour: any, signals: UserSignals) {
    const entries = Object.entries(signals.destinationScore || {}) as Array<
      [string, number]
    >;
    if (!entries.length) return 0;
    const sorted = entries.sort((a, b) => Number(b[1]) - Number(a[1]));
    const [topDestinationId, topScore] = sorted[0];
    const secondScore = Number(sorted[1]?.[1] || 0);
    const hasStrongMainDestination =
      Number(topScore) >= 25 && Number(topScore) >= secondScore * 1.35;
    if (!hasStrongMainDestination) return 0;
    return String(tour.destinationId || "") === String(topDestinationId)
      ? 0
      : 18;
  }
}
