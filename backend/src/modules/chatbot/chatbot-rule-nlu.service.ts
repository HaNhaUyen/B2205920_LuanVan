import { Injectable } from "@nestjs/common";
import {
  ChatbotTemporalService,
  TemporalParseResult,
} from "./chatbot-temporal.service";

export type SlotSource = "rule" | "temporal" | "memory";

export type SlotValue<T> = {
  rawText: string;
  normalizedValue: T;
  confidence: number;
  source: SlotSource;
};

export type MultiIntentNluResult = {
  primaryIntent: string;
  secondaryIntents: string[];
  slots: {
    destination?: SlotValue<string>;
    durationDays?: SlotValue<number>;
    durationNights?: SlotValue<number>;
    adultCount?: SlotValue<number>;
    childCount?: SlotValue<number>;
    departureDate?: SlotValue<string>;
    dateRange?: SlotValue<{ from: string; to: string }>;
    departureProvince?: SlotValue<string>;
    temporal?: TemporalParseResult;
  };
  sortPreference?:
    | "price_asc"
    | "price_desc"
    | "departure_date_asc"
    | "remaining_slots_desc"
    | "relevance";
  filters?: {
    destinationMatch?: "exact" | "fuzzy";
  };
  confidence: number;
  needsClarification?: string[];
};

@Injectable()
export class ChatbotRuleNluService {
  constructor(private readonly temporalService: ChatbotTemporalService) {}

  analyze(message: string, now = new Date()): MultiIntentNluResult {
    const normalized = this.strip(message);
    const secondary = new Set<string>();
    const slots: MultiIntentNluResult["slots"] = {};
    let sortPreference: MultiIntentNluResult["sortPreference"] = "relevance";
    let forcedPrimaryIntent: string | null = null;

    const wantsBooking =
      /\b(dat|book|giu cho|giu ve|chot|mua)\b/.test(normalized) &&
      /\b(tour|lich|chuyen|ve)\b/.test(normalized);
    const wantsSearch =
      /\b(tim|kiem|goi y|tu van|muon di|di dau|co tour|tour)\b/.test(
        normalized,
      );
    const asksCheapest =
      /\b(re nhat|gia thap nhat|tour re|tour nao re nhat|tour co gia thap nhat|chi phi thap nhat|gia re nhat|gia uu dai nhat|gia tot nhat)\b/.test(
        normalized,
      );

    if (asksCheapest) {
      forcedPrimaryIntent = "ask_cheapest_tour";
      sortPreference = "price_asc";
      secondary.add("search_tour");
    }

    const temporal = this.temporalService.parseTemporalExpression(message, now);
    if (temporal) {
      slots.temporal = temporal;
      if (temporal.resolvedDate) {
        slots.departureDate = {
          rawText: temporal.rawText,
          normalizedValue: temporal.resolvedDate,
          confidence: temporal.confidence,
          source: "temporal",
        };
        secondary.add("select_departure");
      } else if (temporal.dateFrom && temporal.dateTo) {
        slots.dateRange = {
          rawText: temporal.rawText,
          normalizedValue: {
            from: temporal.dateFrom,
            to: temporal.dateTo,
          },
          confidence: temporal.confidence,
          source: "temporal",
        };
        secondary.add("tour_availability");
      }
    }

    const duration = this.extractDuration(normalized);
    if (duration.days) {
      slots.durationDays = {
        rawText: duration.rawText,
        normalizedValue: duration.days,
        confidence: 0.93,
        source: "rule",
      };
    }
    if (duration.nights !== null) {
      slots.durationNights = {
        rawText: duration.rawText,
        normalizedValue: duration.nights,
        confidence: 0.9,
        source: "rule",
      };
    }

    const guests = this.extractGuests(normalized);
    if (guests.adultCount !== null) {
      slots.adultCount = {
        rawText: guests.rawText,
        normalizedValue: guests.adultCount,
        confidence: 0.86,
        source: "rule",
      };
    }
    if (guests.childCount !== null) {
      slots.childCount = {
        rawText: guests.rawText,
        normalizedValue: guests.childCount,
        confidence: 0.86,
        source: "rule",
      };
    }

    const departureProvince = this.extractDepartureProvince(normalized);
    if (departureProvince) {
      slots.departureProvince = {
        rawText: departureProvince.rawText,
        normalizedValue: departureProvince.value,
        confidence: 0.84,
        source: "rule",
      };
    }

    if (/\b(con cho|het cho|lich nao|ngay nao|khoi hanh)\b/.test(normalized)) {
      secondary.add("tour_availability");
    }
    if (/\b(gia|bao nhieu tien|chi phi|re nhat|gia re)\b/.test(normalized)) {
      secondary.add(
        /\b(re nhat|gia re nhat)\b/.test(normalized)
          ? "ask_cheapest_tour"
          : "tour_price",
      );
    }
    if (/\b(cuoi tuan|thu\s*7|t7|chu nhat|cn)\b/.test(normalized)) {
      secondary.add("ask_weekend_tour");
    }

    const primaryIntent =
      forcedPrimaryIntent ||
      (wantsBooking
        ? "book_tour"
        : wantsSearch || secondary.size
          ? "search_tour"
          : "general");

    const needsClarification: string[] = [];
    if (temporal?.needsClarification) {
      needsClarification.push("departureDate");
    }

    const slotCount = Object.keys(slots).length;
    return {
      primaryIntent,
      secondaryIntents: Array.from(secondary),
      slots,
      sortPreference,
      confidence:
        primaryIntent === "general"
          ? 0.5
          : Math.min(0.98, 0.72 + slotCount * 0.05),
      needsClarification: needsClarification.length
        ? needsClarification
        : undefined,
    };
  }

  strip(value: string) {
    return this.temporalService.strip(value);
  }

  private extractDuration(text: string) {
    const compact = text.replace(/\s+/g, "");
    const compactMatch = compact.match(/\b(\d+)n(\d+)(d|dem)\b/);
    if (compactMatch) {
      return {
        rawText: compactMatch[0],
        days: Number(compactMatch[1]),
        nights: Number(compactMatch[2]),
      };
    }

    const match = text.match(
      /\b(\d+|mot|hai|ba|bon|nam)\s*ngay(?:\s*(\d+|mot|hai|ba|bon|nam)\s*dem)?\b/,
    );
    if (!match) return { rawText: "", days: null, nights: null };
    return {
      rawText: match[0],
      days: this.toNumber(match[1]),
      nights: match[2] ? this.toNumber(match[2]) : null,
    };
  }

  private extractGuests(text: string) {
    const adult = text.match(/\b(\d+)\s*(nguoi lon|nl|khach|nguoi)\b/);
    const child = text.match(/\b(\d+)\s*(tre em|te|be|em be)\b/);
    return {
      rawText: [adult?.[0], child?.[0]].filter(Boolean).join(", "),
      adultCount: adult ? Number(adult[1]) : null,
      childCount: child ? Number(child[1]) : null,
    };
  }

  private extractDepartureProvince(text: string) {
    const match = text.match(
      /\b(di tu|xuat phat tu|khoi hanh tu)\s+(tp hcm|tphcm|sai gon|sai gon|can tho|ha noi|da nang)\b/,
    );
    if (!match) return null;
    const value = match[2]
      .replace("tphcm", "TP.HCM")
      .replace("tp hcm", "TP.HCM");
    return { rawText: match[0], value };
  }

  private toNumber(value: string) {
    const map: Record<string, number> = {
      mot: 1,
      hai: 2,
      ba: 3,
      bon: 4,
      nam: 5,
    };
    return map[value] ?? Number(value);
  }
}
