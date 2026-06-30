import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";

export type ChatbotIntent =
  | "tour_search"
  | "tour_compare"
  | "follow_up"
  | "tour_policy"
  | "pickup_point"
  | "voucher_check"
  | "booking_create"
  | "booking_change"
  | "booking_status"
  | "refund_create"
  | "personal_recommendation"
  | "small_talk"
  | "general_consulting";

export type NluEntities = {
  destination?: string | null;
  budgetMax?: number | null;
  durationDays?: number | null;
  departureMonth?: string | null;
  partySize?: number | null;
  hotelStars?: number | null;
  tourType?: "group" | "private" | null;
  softNeeds?: string[];
  avoidNeeds?: string[];
  paymentMethod?: "bank_transfer" | null;
  voucherCode?: string | null;
  bookingCode?: string | null;
};

export type NluResult = {
  intent: ChatbotIntent;
  entities: NluEntities;
  confidence: number;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
  raw?: any;
};

const ALLOWED_INTENTS: ChatbotIntent[] = [
  "tour_search",
  "tour_compare",
  "follow_up",
  "tour_policy",
  "pickup_point",
  "voucher_check",
  "booking_create",
  "booking_change",
  "booking_status",
  "refund_create",
  "personal_recommendation",
  "small_talk",
  "general_consulting",
];

function stripText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asNumber(value: any): number | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeIntent(value: any): ChatbotIntent {
  return ALLOWED_INTENTS.includes(value) ? value : "general_consulting";
}

function normalizeSoftNeeds(items: any): string[] {
  const allowed = new Set([
    "family",
    "children",
    "elderly",
    "relaxing",
    "light_schedule",
    "beach",
    "island",
    "cool_weather",
    "photo_spots",
    "nature",
    "food",
    "culture",
    "luxury",
    "budget",
    "romantic",
  ]);

  return Array.isArray(items)
    ? Array.from(
        new Set(
          items
            .map((item) => String(item || "").trim())
            .filter((item) => allowed.has(item)),
        ),
      )
    : [];
}

function normalizePaymentMethod(value: any): "bank_transfer" | null {
  const raw = stripText(String(value || ""));

  if (!raw) return null;

  if (
    /\b(thanh toan|thanh toán|chuyen khoan|chuyển khoản|bank|qr|vietqr|sepay|momo|vi momo|ví momo|vnpay|vn pay|cash|tien mat|tiền mặt|card|the|thẻ|visa|mastercard)\b/.test(
      raw,
    )
  ) {
    return "bank_transfer";
  }

  return null;
}

@Injectable()
export class ChatbotNluService {
  private readonly gemini: GoogleGenAI | null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const enableGemini = this.isEnvEnabled("CHATBOT_ENABLE_GEMINI", false);
    const apiKey = this.configService.get<string>("GEMINI_API_KEY") || "";
    this.model =
      this.configService.get<string>("GEMINI_NLU_MODEL") ||
      this.configService.get<string>("GEMINI_MODEL") ||
      "gemini-2.0-flash";
    this.gemini = enableGemini && apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async analyze(input: {
    message: string;
    memory?: any;
    recentMessages?: Array<{ role: string; content: string }>;
    fallbackIntent: ChatbotIntent;
    fallbackEntities?: NluEntities;
  }): Promise<NluResult> {
    const fallback = this.ruleBasedAnalyze(
      input.message,
      input.fallbackIntent,
      input.fallbackEntities,
    );

    // Nếu rule đã bắt chắc nghiệp vụ booking/voucher/pickup/policy thì trả luôn,
    // tránh tốn quota LLM cho các câu điều hướng rõ ràng.
    if (fallback.confidence >= 0.9) return fallback;

    const prompt = this.buildPrompt(input, fallback);
    const primaryProvider = this.getProviderName("CHATBOT_PROVIDER", "groq");
    const fallbackProvider = this.getProviderName(
      "CHATBOT_FALLBACK_PROVIDER",
      "openrouter",
    );

    const primaryResult = await this.callOpenAICompatibleNlu(
      prompt,
      fallback,
      primaryProvider,
    );
    if (primaryResult) return primaryResult;

    if (fallbackProvider && fallbackProvider !== primaryProvider) {
      const fallbackResult = await this.callOpenAICompatibleNlu(
        prompt,
        fallback,
        fallbackProvider,
      );
      if (fallbackResult) return fallbackResult;
    }

    const geminiResult = await this.callGeminiNlu(prompt, fallback);
    if (geminiResult) return geminiResult;

    return fallback;
  }

  private getProviderName(key: string, fallback = "groq") {
    return String(
      this.configService.get<string>(key) || process.env[key] || fallback,
    )
      .trim()
      .toLowerCase();
  }

  private isEnvEnabled(key: string, defaultValue = false) {
    const raw = this.configService.get<string>(key) ?? process.env[key];
    if (raw === undefined || raw === null || raw === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
  }

  private getOpenAIProviderConfig(provider: string) {
    const name = String(provider || "groq").toLowerCase();

    if (name === "openrouter") {
      return {
        name,
        apiKey:
          this.configService.get<string>("OPENROUTER_API_KEY") ||
          process.env.OPENROUTER_API_KEY ||
          "",
        baseUrl: (
          this.configService.get<string>("OPENROUTER_BASE_URL") ||
          process.env.OPENROUTER_BASE_URL ||
          "https://openrouter.ai/api/v1"
        ).replace(/\/$/, ""),
        model:
          this.configService.get<string>("OPENROUTER_MODEL") ||
          process.env.OPENROUTER_MODEL ||
          "openrouter/free",
      };
    }

    if (name === "groq") {
      return {
        name,
        apiKey:
          this.configService.get<string>("GROQ_API_KEY") ||
          process.env.GROQ_API_KEY ||
          this.configService.get<string>("CHATBOT_API_KEY") ||
          process.env.CHATBOT_API_KEY ||
          "",
        baseUrl: (
          this.configService.get<string>("GROQ_BASE_URL") ||
          process.env.GROQ_BASE_URL ||
          "https://api.groq.com/openai/v1"
        ).replace(/\/$/, ""),
        model:
          this.configService.get<string>("GROQ_MODEL") ||
          process.env.GROQ_MODEL ||
          this.configService.get<string>("CHATBOT_MODEL") ||
          process.env.CHATBOT_MODEL ||
          "openai/gpt-oss-20b",
      };
    }

    return {
      name: "custom",
      apiKey:
        this.configService.get<string>("CHATBOT_API_KEY") ||
        process.env.CHATBOT_API_KEY ||
        "",
      baseUrl: (
        this.configService.get<string>("CHATBOT_BASE_URL") ||
        process.env.CHATBOT_BASE_URL ||
        "https://api.groq.com/openai/v1"
      ).replace(/\/$/, ""),
      model:
        this.configService.get<string>("CHATBOT_MODEL") ||
        process.env.CHATBOT_MODEL ||
        "openai/gpt-oss-20b",
    };
  }

  private acceptLlmResult(result: NluResult, fallback: NluResult) {
    if (fallback.confidence >= 0.78 && result.intent !== fallback.intent) {
      return fallback;
    }

    if (result.confidence < 0.55 && fallback.confidence >= result.confidence) {
      return fallback;
    }

    return result;
  }

  private async callOpenAICompatibleNlu(
    prompt: string,
    fallback: NluResult,
    provider = "groq",
  ): Promise<NluResult | null> {
    const cfg = this.getOpenAIProviderConfig(provider);
    if (!cfg.apiKey) {
      console.warn(`[Chatbot NLU] Missing API key for provider=${cfg.name}`);
      return null;
    }

    try {
      console.log(
        `[Chatbot NLU] Calling provider=${cfg.name}, model=${cfg.model}`,
      );
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      };

      if (cfg.name === "openrouter") {
        headers["HTTP-Referer"] =
          this.configService.get<string>("FRONTEND_PUBLIC_URL") ||
          this.configService.get<string>("FRONTEND_URL") ||
          "http://localhost:3000";
        headers["X-Title"] = "Travela Chatbot NLU";
      }

      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            {
              role: "system",
              content:
                "Bạn là NLU engine. Chỉ trả về JSON hợp lệ theo schema trong prompt. Không markdown.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          top_p: 0.8,
          max_tokens: 700,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `[Chatbot NLU error] provider=${cfg.name}`,
          response.status,
          body,
        );
        return null;
      }

      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content || "";
      const parsed = this.safeJsonParse(text);
      if (!parsed) return null;

      return this.acceptLlmResult(
        this.normalizeResult(parsed, fallback),
        fallback,
      );
    } catch (error: any) {
      console.error(
        `[Chatbot NLU exception] provider=${cfg.name}`,
        error?.message || error,
      );
      return null;
    }
  }

  private async callGeminiNlu(
    prompt: string,
    fallback: NluResult,
  ): Promise<NluResult | null> {
    if (!this.gemini) return null;

    try {
      console.log("[Chatbot NLU] Calling Gemini model:", this.model);
      const response = await this.gemini.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          temperature: 0.1,
          topP: 0.8,
          maxOutputTokens: 700,
          responseMimeType: "application/json",
        },
      });

      const parsed = this.safeJsonParse(response.text || "");
      if (!parsed) return null;

      return this.acceptLlmResult(
        this.normalizeResult(parsed, fallback),
        fallback,
      );
    } catch (error: any) {
      console.error("[Chatbot NLU Gemini error]", error?.message || error);
      return null;
    }
  }

  private buildPrompt(
    input: {
      message: string;
      memory?: any;
      recentMessages?: Array<{ role: string; content: string }>;
      fallbackIntent: ChatbotIntent;
      fallbackEntities?: NluEntities;
    },
    fallback: NluResult,
  ) {
    return `
Bạn là bộ phân tích NLU cho chatbot tour du lịch Travela.
Chỉ trả về JSON hợp lệ, không markdown.

Các intent hợp lệ:
${ALLOWED_INTENTS.join(", ")}

Chuẩn hóa softNeeds về các mã sau nếu người dùng có nhu cầu mềm:
- family: gia đình/cả nhà
- children: trẻ nhỏ/trẻ em/em bé
- elderly: người lớn tuổi/ba mẹ
- relaxing: nghỉ dưỡng/thư giãn
- light_schedule: nhẹ nhàng/không quá mệt/ít di chuyển
- beach: biển/tắm biển/hải sản
- island: đảo
- cool_weather: mát mẻ/se lạnh/săn mây
- photo_spots: chụp hình/sống ảo/check-in/cảnh đẹp
- nature: thiên nhiên/sinh thái/sông nước
- food: ẩm thực/đặc sản
- culture: văn hóa/lịch sử/phố cổ
- luxury: cao cấp/resort/khách sạn tốt
- budget: giá rẻ/tiết kiệm
- romantic: cặp đôi/trăng mật

JSON schema cần trả:
{
  "intent": "tour_search",
  "entities": {
    "destination": "Phú Quốc hoặc null",
    "budgetMax": 5000000,
    "durationDays": 3,
    "departureMonth": "2026-06 hoặc null",
    "partySize": 4,
    "hotelStars": 4,
    "tourType": "group/private/null",
    "softNeeds": ["family", "children", "relaxing"],
    "avoidNeeds": ["trekking", "too_tired"],
    "paymentMethod": "bank_transfer/null",
    "voucherCode": null,
    "bookingCode": null
  },
  "confidence": 0.0,
  "needsClarification": false,
  "clarificationQuestion": null
}

Quy tắc:
- Nếu câu hỏi là "tour này", "tour đó", "khách sạn mấy sao", "lịch trình có mệt không" và memory có tour trước đó => intent follow_up.
- Nếu người dùng muốn tìm/gợi ý tour theo nhu cầu mềm => tour_search hoặc personal_recommendation.
- Nếu hỏi hoàn tiền/hủy/đổi lịch/chính sách => tour_policy.
- Nếu hỏi điểm đón/giờ đón => pickup_point.
- Nếu hỏi mã giảm giá/voucher => voucher_check.
- Nếu muốn đặt/chốt/thanh toán tour => booking_create. Các câu như “đặt tour số 2”, “chốt tour đầu”, “lấy tour này”, “ok đặt luôn” cũng là booking_create.
- Nếu đang trong luồng booking, các câu ngắn như “chọn 1”, “không”, “bỏ qua”, “momo”, “vnpay”, “xác nhận” vẫn thuộc booking_create.
- Confidence >= 0.85 khi intent rõ và trích được ít nhất 1 entity quan trọng.
- Confidence 0.60-0.84 khi intent rõ nhưng entity còn thiếu.
- Confidence < 0.55 khi câu quá mơ hồ hoặc có thể hiểu nhiều hướng.
- Không tự bịa destination, budget, duration, voucherCode, bookingCode nếu người dùng không nhắc.
- Với nhu cầu mềm như “đi biển”, “chụp hình đẹp”, “không quá mệt”, phải đưa vào softNeeds để backend rerank chính xác.
- Với câu có phủ định như “không muốn lịch trình quá mệt”, thêm avoidNeeds tương ứng: ["too_tired", "too_many_moves"].

Fallback rule đang đoán:
${JSON.stringify(fallback)}

Memory hiện tại:
${JSON.stringify(input.memory || {})}

Tin nhắn gần đây:
${JSON.stringify((input.recentMessages || []).slice(-6))}

Câu người dùng:
${input.message}
`;
  }

  private safeJsonParse(text: string) {
    try {
      return JSON.parse(text);
    } catch {
      const match = String(text || "").match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  private normalizeResult(parsed: any, fallback: NluResult): NluResult {
    const entities =
      parsed?.entities && typeof parsed.entities === "object"
        ? parsed.entities
        : {};

    return {
      intent: normalizeIntent(parsed?.intent),
      confidence: Math.min(
        1,
        Math.max(0, Number(parsed?.confidence ?? fallback.confidence ?? 0.5)),
      ),
      needsClarification: Boolean(parsed?.needsClarification),
      clarificationQuestion:
        typeof parsed?.clarificationQuestion === "string"
          ? parsed.clarificationQuestion
          : null,
      raw: parsed,
      entities: {
        destination:
          typeof entities.destination === "string"
            ? entities.destination
            : (fallback.entities.destination ?? null),
        budgetMax:
          asNumber(entities.budgetMax) ?? fallback.entities.budgetMax ?? null,
        durationDays:
          asNumber(entities.durationDays) ??
          fallback.entities.durationDays ??
          null,
        departureMonth:
          typeof entities.departureMonth === "string"
            ? entities.departureMonth
            : (fallback.entities.departureMonth ?? null),
        partySize:
          asNumber(entities.partySize) ?? fallback.entities.partySize ?? null,
        hotelStars:
          asNumber(entities.hotelStars) ?? fallback.entities.hotelStars ?? null,
        tourType:
          entities.tourType === "group" || entities.tourType === "private"
            ? entities.tourType
            : (fallback.entities.tourType ?? null),
        softNeeds: normalizeSoftNeeds(
          Array.isArray(entities.softNeeds)
            ? entities.softNeeds
            : fallback.entities.softNeeds || [],
        ),
        avoidNeeds: Array.isArray(entities.avoidNeeds)
          ? entities.avoidNeeds.map(String).filter(Boolean)
          : fallback.entities.avoidNeeds || [],
        paymentMethod:
          normalizePaymentMethod(entities.paymentMethod) ||
          normalizePaymentMethod(fallback.entities.paymentMethod) ||
          null,
        voucherCode:
          typeof entities.voucherCode === "string"
            ? entities.voucherCode.toUpperCase()
            : (fallback.entities.voucherCode ?? null),
        bookingCode:
          typeof entities.bookingCode === "string"
            ? entities.bookingCode.toUpperCase()
            : (fallback.entities.bookingCode ?? null),
      },
    };
  }

  private ruleBasedAnalyze(
    message: string,
    fallbackIntent: ChatbotIntent,
    fallbackEntities: NluEntities = {},
  ): NluResult {
    const normalized = stripText(message);
    const softNeeds = new Set<string>(fallbackEntities.softNeeds || []);

    if (/\b(gia dinh|ca nha|ba me|bo me)\b/.test(normalized))
      softNeeds.add("family");
    if (/\b(tre nho|tre em|em be|be)\b/.test(normalized))
      softNeeds.add("children");
    if (/\b(nguoi lon tuoi|ong ba|ba me lon tuoi)\b/.test(normalized))
      softNeeds.add("elderly");
    if (/\b(nghi duong|thu gian|resort|chill)\b/.test(normalized))
      softNeeds.add("relaxing");
    if (/\b(nhe nhang|khong met|it di chuyen|khong qua met)\b/.test(normalized))
      softNeeds.add("light_schedule");
    if (/\b(bien|tam bien|hai san|nghi bien)\b/.test(normalized))
      softNeeds.add("beach");
    if (/\b(dao|bien dao)\b/.test(normalized)) softNeeds.add("island");
    if (/\b(chup hinh|song ao|check in|canh dep|view dep)\b/.test(normalized))
      softNeeds.add("photo_spots");
    if (/\b(mat me|se lanh|san may|khong khi trong lanh)\b/.test(normalized))
      softNeeds.add("cool_weather");
    if (/\b(am thuc|dac san|an ngon)\b/.test(normalized)) softNeeds.add("food");
    if (/\b(van hoa|lich su|pho co|di tich)\b/.test(normalized))
      softNeeds.add("culture");
    if (/\b(cao cap|sang|khach san tot|4 sao|5 sao|luxury)\b/.test(normalized))
      softNeeds.add("luxury");

    let inferredIntent: ChatbotIntent = fallbackIntent;
    let confidence = 0.58;

    if (
      /\b(diem don|don o dau|don tai dau|cho don|gio don|pickup|xe don)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "pickup_point";
      confidence = 0.9;
    } else if (
      /\b(chinh sach|huy|hoan tien|refund|cancel|doi lich|doi tour|phi huy)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "tour_policy";
      confidence = 0.9;
    } else if (
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "voucher_check";
      confidence = 0.88;
    } else if (
      /\b(dat tour|dat cho|giu cho|chot tour|toi muon dat|muon dat tour|book tour|booking tour|dat luon|chot luon|lay tour nay|lay tour do|tour so|tour thu)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "booking_create";
      confidence = 0.88;
    } else if (
      /\b(lich khoi hanh|khoi hanh nao|ngay khoi hanh|con lich|lich gan nhat)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "follow_up";
      confidence = 0.82;
    } else if (
      softNeeds.size ||
      /\b(muon di|toi muon di|minh muon di|co tour nao|goi y tour|tim tour|du lich|ngan sach|gia duoi|ngay.*dem)\b/.test(
        normalized,
      )
    ) {
      inferredIntent = "tour_search";
      confidence = 0.82;
    }

    return {
      intent: inferredIntent,
      entities: {
        ...fallbackEntities,
        softNeeds: Array.from(softNeeds),
      },
      confidence,
      needsClarification: false,
      clarificationQuestion: null,
    };
  }
}
