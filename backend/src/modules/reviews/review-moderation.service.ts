import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type ReviewModerationResult = {
  flagged: boolean;
  category: string;
  severity: "none" | "low" | "medium" | "high" | "critical";
  confidence: number;
  reason: string;
};

@Injectable()
export class ReviewModerationService {
  constructor(private readonly configService: ConfigService) {}

  private normalize(value: string) {
    return (
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase()
        // Gom các kiểu cố tình chèn dấu/ký tự để né bộ lọc.
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/(.)\1{2,}/g, "$1$1")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  private ruleScan(comment: string): ReviewModerationResult | null {
    const n = this.normalize(comment);
    if (!n) {
      return {
        flagged: false,
        category: "safe",
        severity: "none",
        confidence: 1,
        reason: "Đánh giá không có nội dung văn bản cần kiểm duyệt.",
      };
    }

    const categories = new Set<string>();
    let severity: ReviewModerationResult["severity"] = "none";
    let confidence = 0;

    const hasThreat = [
      /\b(tao|minh|toi)?\s*(se\s*)?(giet|chem|dam|danh chet|xu)\s*(may|mày|m|no|nguoi)/,
      /\b(giet may|giet m|chem may|dam may|danh chet may|cho may chet|muon giet)\b/,
      /\b(de doa|doa giet|thanh toan may|xu dep may)\b/,
    ].some((r) => r.test(n));

    const hasProfanity = [
      /\b(cho de|do cho|thang cho|con cho|dit me|dmm|dm m|dm|clm|vl|vcl|cc|cac|deo)\b/,
      /\b(dau buoi|lon|loz|dit|du ma|ma may)\b/,
    ].some((r) => r.test(n));

    const hasHarassment = [
      /\b(do ngu|ngu nhu|oc cho|vo hoc|mat day|khon nan|suc vat|rac ruoi|do dien|do khung)\b/,
      /\b(cut di|bien di|cam mom|ngam mom)\b/,
    ].some((r) => r.test(n));

    const hasSexualAbuse = [/\b(hiep dam|cuong hiep|xam hai tinh duc)\b/].some(
      (r) => r.test(n),
    );

    if (hasThreat) {
      categories.add("threat");
      severity = "critical";
      confidence = Math.max(confidence, 0.99);
    }
    if (hasSexualAbuse) {
      categories.add("sexual_abuse");
      severity = severity === "critical" ? severity : "high";
      confidence = Math.max(confidence, 0.98);
    }
    if (hasProfanity) {
      categories.add("profanity");
      if (!["critical", "high"].includes(severity)) severity = "medium";
      confidence = Math.max(confidence, 0.96);
    }
    if (hasHarassment) {
      categories.add("harassment");
      if (!["critical", "high"].includes(severity)) severity = "high";
      confidence = Math.max(confidence, 0.95);
    }

    if (!categories.size) return null;

    const labels: Record<string, string> = {
      threat: "đe dọa bạo lực",
      profanity: "ngôn từ tục tĩu/xúc phạm",
      harassment: "công kích hoặc quấy rối",
      sexual_abuse: "nội dung bạo lực tình dục",
    };

    return {
      flagged: true,
      category: Array.from(categories).join(","),
      severity,
      confidence,
      reason: `Rule-first phát hiện: ${Array.from(categories)
        .map((item) => labels[item] || item)
        .join(", ")}.`,
    };
  }

  private providerConfig(provider: string) {
    const name = String(provider || "groq")
      .trim()
      .toLowerCase();
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

    return {
      name: "groq",
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
        "openai/gpt-oss-120b",
    };
  }

  private parseJson(text: string): ReviewModerationResult | null {
    const raw = String(text || "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      const data = JSON.parse(match[0]);
      const severityValues = ["none", "low", "medium", "high", "critical"];
      const severity = severityValues.includes(String(data?.severity))
        ? String(data.severity)
        : data?.flagged
          ? "medium"
          : "none";
      const confidence = Math.max(
        0,
        Math.min(1, Number(data?.confidence ?? (data?.flagged ? 0.8 : 0.85))),
      );
      const category = Array.isArray(data?.categories)
        ? data.categories.map(String).filter(Boolean).join(",")
        : String(data?.category || (data?.flagged ? "other" : "safe"));

      return {
        flagged: Boolean(data?.flagged),
        category,
        severity: severity as ReviewModerationResult["severity"],
        confidence: Number.isFinite(confidence) ? confidence : 0.8,
        reason: String(
          data?.reason || "AI đã phân loại nội dung đánh giá.",
        ).slice(0, 500),
      };
    } catch {
      return null;
    }
  }

  private async callProvider(
    provider: string,
    comment: string,
  ): Promise<ReviewModerationResult | null> {
    const cfg = this.providerConfig(provider);
    if (!cfg.apiKey) return null;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    };

    if (cfg.name === "openrouter") {
      headers["HTTP-Referer"] =
        this.configService.get<string>("FRONTEND_PUBLIC_URL") ||
        this.configService.get<string>("FRONTEND_URL") ||
        "http://localhost:3000";
      headers["X-Title"] = "Travela Review Moderation";
    }

    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0,
          max_tokens: 220,
          messages: [
            {
              role: "system",
              content:
                "Bạn là bộ phân loại kiểm duyệt đánh giá cho Travela. Chỉ đánh dấu vi phạm khi có đe dọa bạo lực, chửi tục/xúc phạm, quấy rối/công kích, thù ghét, nội dung tình dục/bạo lực nghiêm trọng hoặc spam độc hại. Không được đánh dấu chỉ vì khách chê dịch vụ, cho ít sao, nói tour tệ, nhân viên chưa tốt hoặc phàn nàn gay gắt nhưng không có nội dung vi phạm. Trả về đúng một JSON object, không markdown.",
            },
            {
              role: "user",
              content: JSON.stringify({
                task: "classify_review_moderation",
                review: comment,
                outputSchema: {
                  flagged: "boolean",
                  categories: [
                    "threat",
                    "profanity",
                    "harassment",
                    "hate",
                    "sexual",
                    "spam",
                    "other",
                  ],
                  severity: "none|low|medium|high|critical",
                  confidence: "0..1",
                  reason: "Vietnamese short explanation, max 1 sentence",
                },
              }),
            },
          ],
        }),
      });

      if (!response.ok) return null;
      const payload: any = await response.json();
      const text = payload?.choices?.[0]?.message?.content || "";
      return this.parseJson(text);
    } catch (error) {
      console.warn(`[Review moderation] provider=${cfg.name} failed`, error);
      return null;
    }
  }

  async moderate(comment?: string | null): Promise<ReviewModerationResult> {
    const text = String(comment || "").trim();
    const rule = this.ruleScan(text);

    // Rule-first: trường hợp rõ ràng thì không tốn request AI.
    if (rule?.flagged || !text) return rule!;

    const primary = String(
      this.configService.get<string>("CHATBOT_PROVIDER") ||
        process.env.CHATBOT_PROVIDER ||
        "groq",
    ).toLowerCase();
    const fallback = String(
      this.configService.get<string>("CHATBOT_FALLBACK_PROVIDER") ||
        process.env.CHATBOT_FALLBACK_PROVIDER ||
        "openrouter",
    ).toLowerCase();

    const primaryResult = await this.callProvider(primary, text);
    if (primaryResult) return primaryResult;

    if (fallback && fallback !== primary) {
      const fallbackResult = await this.callProvider(fallback, text);
      if (fallbackResult) return fallbackResult;
    }

    // Provider không khả dụng: review vẫn được đăng, chỉ ghi nhận rule local không phát hiện rõ.
    return {
      flagged: false,
      category: "safe",
      severity: "none",
      confidence: 0.6,
      reason:
        "Rule local chưa phát hiện vi phạm rõ ràng; AI provider hiện không khả dụng.",
    };
  }
}
