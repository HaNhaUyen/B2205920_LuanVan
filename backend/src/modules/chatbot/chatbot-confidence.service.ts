import { Injectable } from "@nestjs/common";
import type { RagHit } from "./rag.service";
import type { NluResult } from "./chatbot-nlu.service";

type ConfidenceInput = {
  intent: string;
  nlu?: NluResult | null;
  tours?: any[];
  ragHits?: RagHit[];
  vouchers?: any[];
  bookings?: any[];
  pickupPoints?: any[];
  bookingCheckout?: any;
  memory?: any;
};

export type AnswerConfidence = {
  score: number;
  level: "low" | "medium" | "high";
  shouldAnswer: boolean;
  reasons: string[];
};

@Injectable()
export class ChatbotConfidenceService {
  evaluate(input: ConfidenceInput): AnswerConfidence {
    const reasons: string[] = [];
    let score = 0.25;

    const nluScore = Number(input.nlu?.confidence || 0);
    if (nluScore >= 0.75) {
      score += 0.25;
      reasons.push("NLU rõ intent/entity");
    } else if (nluScore >= 0.5) {
      score += 0.14;
      reasons.push("NLU ở mức tạm đủ");
    } else {
      reasons.push("NLU chưa chắc intent");
    }

    const bestRag = Math.max(
      0,
      ...(input.ragHits || []).map((h) => Number(h.similarity || 0)),
    );
    if (bestRag >= 0.45) {
      score += 0.28;
      reasons.push("RAG có tài liệu liên quan cao");
    } else if (bestRag >= 0.25) {
      score += 0.16;
      reasons.push("RAG có tài liệu liên quan vừa");
    }

    if ((input.tours || []).length) {
      score += 0.22;
      reasons.push("Có tour nghiệp vụ phù hợp");
    }
    if (
      (input.vouchers || []).length ||
      (input.bookings || []).length ||
      (input.pickupPoints || []).length ||
      input.bookingCheckout
    ) {
      score += 0.2;
      reasons.push("Có dữ liệu nghiệp vụ trực tiếp");
    }

    if (
      ["small_talk", "booking_create", "booking_change"].includes(input.intent)
    ) {
      score += 0.2;
      reasons.push("Intent có thể xử lý bằng rule/flow nội bộ");
    }

    const needsData = [
      "tour_search",
      "tour_compare",
      "follow_up",
      "tour_policy",
      "pickup_point",
      "voucher_check",
      "booking_status",
      "personal_recommendation",
    ].includes(input.intent);

    const hasAnyData = Boolean(
      (input.tours || []).length ||
      (input.ragHits || []).length ||
      (input.vouchers || []).length ||
      (input.bookings || []).length ||
      (input.pickupPoints || []).length,
    );

    if (needsData && !hasAnyData) {
      score -= 0.22;
      reasons.push("Intent cần dữ liệu nhưng context đang rỗng");
    }

    score = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    const level = score >= 0.72 ? "high" : score >= 0.48 ? "medium" : "low";

    return {
      score,
      level,
      shouldAnswer:
        score >= 0.42 ||
        ["small_talk", "booking_create", "booking_change"].includes(
          input.intent,
        ),
      reasons,
    };
  }

  buildLowConfidenceAnswer(input: ConfidenceInput) {
    const parts = [
      "Mình chưa đủ dữ liệu chắc chắn để trả lời chính xác câu này.",
    ];

    if (["tour_search", "personal_recommendation"].includes(input.intent)) {
      parts.push(
        "Bạn cho mình thêm điểm đến, ngân sách hoặc số ngày muốn đi để mình lọc tour đúng hơn nha.",
      );
    } else if (input.intent === "follow_up") {
      parts.push(
        "Bạn nói rõ tên tour hoặc chọn lại tour muốn hỏi, mình sẽ kiểm tra lịch trình/khách sạn/chính sách theo đúng tour đó.",
      );
    } else if (input.intent === "booking_status") {
      parts.push(
        "Bạn gửi mã booking dạng BK... hoặc đăng nhập tài khoản để mình kiểm tra đúng đơn.",
      );
    } else {
      parts.push(
        "Bạn mô tả thêm một chút nhu cầu hoặc tên tour/mã booking liên quan nha.",
      );
    }

    return parts.join(" ");
  }
}
