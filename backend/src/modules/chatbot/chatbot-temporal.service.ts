import { Injectable } from "@nestjs/common";

export type TemporalParseType =
  | "exact_date"
  | "date_range"
  | "month"
  | "ambiguous_weekday";

export type TemporalParseResult = {
  rawText: string;
  resolvedDate?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  dayOfWeek?: number | null;
  type: TemporalParseType;
  confidence: number;
  isPast?: boolean;
  needsClarification?: boolean;
};

type LocalDate = { year: number; month: number; day: number };

@Injectable()
export class ChatbotTemporalService {
  parseTemporalExpression(
    input: string,
    now = new Date(),
    timezone = process.env.CHATBOT_TIMEZONE || "Asia/Ho_Chi_Minh",
  ): TemporalParseResult | null {
    const text = this.strip(input);
    if (!text) return null;

    const today = this.getLocalDate(now, timezone);
    const debug = process.env.CHATBOT_TEMPORAL_DEBUG === "true";
    const exact = (rawText: string, date: LocalDate, confidence = 0.94) => {
      const iso = this.toIso(date);
      const result: TemporalParseResult = {
        rawText,
        resolvedDate: iso,
        dateFrom: iso,
        dateTo: iso,
        dayOfWeek: this.dayOfWeek(date),
        type: "exact_date",
        confidence,
        isPast: this.compare(date, today) < 0,
      };
      if (debug) console.log("[ChatbotTemporal]", result);
      return result;
    };
    const range = (
      rawText: string,
      from: LocalDate,
      to: LocalDate,
      confidence = 0.9,
      type: TemporalParseType = "date_range",
    ) => {
      const result: TemporalParseResult = {
        rawText,
        resolvedDate: null,
        dateFrom: this.toIso(from),
        dateTo: this.toIso(to),
        dayOfWeek: null,
        type,
        confidence,
        isPast: this.compare(to, today) < 0,
      };
      if (debug) console.log("[ChatbotTemporal]", result);
      return result;
    };

    if (/\bhom nay\b/.test(text)) return exact("hôm nay", today, 0.98);
    if (/\bngay mai\b/.test(text)) {
      return exact("ngày mai", this.addDays(today, 1), 0.98);
    }
    if (/\b(ngay mot|mot kia)\b/.test(text)) {
      return exact("ngày mốt", this.addDays(today, 2), 0.96);
    }
    if (/\bhom qua\b/.test(text)) {
      return exact("hôm qua", this.addDays(today, -1), 0.96);
    }

    const numeric = text.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (numeric) {
      const day = Number(numeric[1]);
      const month = Number(numeric[2]);
      const year = numeric[3]
        ? this.expandYear(Number(numeric[3]))
        : this.resolveYearForMonthDay(today, month, day);
      if (this.isValidDate({ year, month, day })) {
        return exact(numeric[0], { year, month, day }, 0.95);
      }
    }

    const dayInMonth = text.match(
      /\bngay\s+(\d{1,2})\s+thang\s+(nay|sau|toi|toi|(\d{1,2}))\b/,
    );
    if (dayInMonth) {
      const day = Number(dayInMonth[1]);
      let month = today.month;
      let year = today.year;
      if (dayInMonth[2] === "sau" || dayInMonth[2] === "toi") {
        const next = this.addMonths({ year, month, day: 1 }, 1);
        month = next.month;
        year = next.year;
      } else if (dayInMonth[3]) {
        month = Number(dayInMonth[3]);
        year = this.resolveYearForMonthDay(today, month, day);
      }
      if (this.isValidDate({ year, month, day })) {
        return exact(dayInMonth[0], { year, month, day }, 0.94);
      }
    }

    const monthMatch = text.match(/\bthang\s+(\d{1,2})\b/);
    if (monthMatch) {
      const month = Number(monthMatch[1]);
      if (month >= 1 && month <= 12) {
        const year =
          month < today.month ? today.year + 1 : today.year;
        const from = { year, month, day: 1 };
        const to = { year, month, day: this.daysInMonth(year, month) };
        return range(monthMatch[0], from, to, 0.82, "month");
      }
    }

    if (/\bcuoi tuan (nay|tuan nay)\b/.test(text)) {
      const monday = this.startOfIsoWeek(today);
      return range("cuối tuần này", this.addDays(monday, 5), this.addDays(monday, 6));
    }
    if (/\bcuoi tuan (sau|toi)\b/.test(text)) {
      const monday = this.addDays(this.startOfIsoWeek(today), 7);
      return range("cuối tuần sau", this.addDays(monday, 5), this.addDays(monday, 6));
    }
    if (/\bdau tuan sau\b/.test(text)) {
      const monday = this.addDays(this.startOfIsoWeek(today), 7);
      return range("đầu tuần sau", monday, this.addDays(monday, 2), 0.86);
    }
    if (/\bgiua tuan sau\b/.test(text)) {
      const monday = this.addDays(this.startOfIsoWeek(today), 7);
      return range("giữa tuần sau", this.addDays(monday, 2), this.addDays(monday, 4), 0.84);
    }
    if (/\bcuoi thang nay\b/.test(text)) {
      const from = { year: today.year, month: today.month, day: Math.max(today.day, 25) };
      const to = { year: today.year, month: today.month, day: this.daysInMonth(today.year, today.month) };
      return range("cuối tháng này", from, to, 0.82);
    }
    if (/\bdau thang sau\b/.test(text)) {
      const next = this.addMonths({ year: today.year, month: today.month, day: 1 }, 1);
      return range("đầu tháng sau", next, { ...next, day: Math.min(10, this.daysInMonth(next.year, next.month)) }, 0.82);
    }

    const weekday = this.extractWeekday(text);
    if (weekday) {
      if (/\btuan nay\b/.test(text)) {
        const monday = this.startOfIsoWeek(today);
        return exact(weekday.rawText, this.addDays(monday, weekday.iso - 1), 0.95);
      }
      if (/\btuan (sau|toi)\b/.test(text)) {
        const monday = this.addDays(this.startOfIsoWeek(today), 7);
        return exact(weekday.rawText, this.addDays(monday, weekday.iso - 1), 0.95);
      }
      return {
        rawText: weekday.rawText,
        resolvedDate: null,
        dateFrom: null,
        dateTo: null,
        dayOfWeek: weekday.iso,
        type: "ambiguous_weekday",
        confidence: 0.74,
        needsClarification: true,
      };
    }

    return null;
  }

  strip(value: string) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\/\-\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  dateRangeForVietnamDay(isoDate: string) {
    const start = new Date(`${isoDate}T00:00:00+07:00`);
    return {
      gte: start,
      lt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private extractWeekday(text: string) {
    const match = text.match(/\b(thu\s*([2-7])|t([2-7])|chu nhat|cn)\b/);
    if (!match) return null;
    const rawText = match[0];
    if (rawText === "chu nhat" || rawText === "cn") return { rawText, iso: 7 };
    const value = Number(match[2] || match[3]);
    return { rawText, iso: value === 7 ? 6 : value - 1 };
  }

  private getLocalDate(date: Date, timezone: string): LocalDate {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day") };
  }

  private toIso(date: LocalDate) {
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  private dayOfWeek(date: LocalDate) {
    const js = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
    return js === 0 ? 7 : js;
  }

  private startOfIsoWeek(date: LocalDate) {
    return this.addDays(date, -(this.dayOfWeek(date) - 1));
  }

  private addDays(date: LocalDate, days: number): LocalDate {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  private addMonths(date: LocalDate, months: number): LocalDate {
    const d = new Date(Date.UTC(date.year, date.month - 1 + months, 1, 12));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: 1 };
  }

  private compare(a: LocalDate, b: LocalDate) {
    return this.toIso(a).localeCompare(this.toIso(b));
  }

  private resolveYearForMonthDay(today: LocalDate, month: number, day: number) {
    const currentYearDate = { year: today.year, month, day };
    return this.compare(currentYearDate, today) < 0 ? today.year + 1 : today.year;
  }

  private expandYear(year: number) {
    return year < 100 ? 2000 + year : year;
  }

  private isValidDate(date: LocalDate) {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day, 12));
    return (
      d.getUTCFullYear() === date.year &&
      d.getUTCMonth() + 1 === date.month &&
      d.getUTCDate() === date.day
    );
  }

  private daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  }
}
