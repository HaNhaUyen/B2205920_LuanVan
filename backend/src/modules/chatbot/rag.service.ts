import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

type RetrieveOptions = {
  topK?: number;
  intent?: string;
  memory?: {
    destination?: string | null;
    budgetMax?: number | null;
    durationDays?: number | null;
    departureMonth?: string | null;
    hotelStars?: number | null;
    tourType?: string | null;
    softNeeds?: string[];
    avoidNeeds?: string[];
  };
};

export type RagHit = {
  id: string;
  sourceType: string;
  sourceId: string | null;
  title: string;
  content: string;
  similarity: number;
  metadata: any;
};

function stripText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cosineSimilarity(a: number[], b: number[]) {
  const len = Math.min(a.length, b.length);
  if (!len) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function asVector(value: any): number[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter(Number.isFinite)
        : [];
    } catch {
      return [];
    }
  }
  return [];
}

@Injectable()
export class RagService {
  private readonly aiServiceUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.aiServiceUrl = String(
      this.configService.get<string>("AI_SERVICE_URL") ||
        process.env.AI_SERVICE_URL ||
        "http://127.0.0.1:8000",
    ).replace(/\/$/, "");
    this.requestTimeoutMs = Math.max(
      1000,
      Number(
        this.configService.get<string>("AI_EMBEDDING_TIMEOUT_MS") ||
          process.env.AI_EMBEDDING_TIMEOUT_MS ||
          15000,
      ),
    );
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const clean = texts
      .map((text) =>
        String(text || "")
          .trim()
          .slice(0, 6000),
      )
      .filter(Boolean);
    if (!clean.length) return [];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const response = await fetch(`${this.aiServiceUrl}/embeddings/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: clean }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.warn(
          `[RAG embedding] AI Service trả ${response.status}: ${body.slice(0, 300)}`,
        );
        return [];
      }
      const payload: any = await response.json();
      const embeddings = Array.isArray(payload?.embeddings)
        ? payload.embeddings
        : [];
      return embeddings.map((row: any) => asVector(row));
    } catch (error: any) {
      console.warn(
        "[RAG embedding] Không gọi được AI Service, chuyển sang keyword retrieval:",
        error?.message || error,
      );
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  async embedText(text: string): Promise<number[]> {
    const vectors = await this.embedTexts([text]);
    return vectors[0] || [];
  }

  async retrieve(
    query: string,
    options: RetrieveOptions = {},
  ): Promise<RagHit[]> {
    const topK = Math.min(Math.max(Number(options.topK || 6), 1), 12);
    const queryVector = await this.embedText(query).catch(() => []);
    if (!queryVector.length) return this.keywordRetrieve(query, options, topK);

    const docs = await (this.prisma as any).ragDocument.findMany({
      where: { status: "active" },
      take: 1200,
      orderBy: { updatedAt: "desc" },
    });

    const normalizedQuery = stripText(query);
    return docs
      .map((doc: any) => {
        const docVector = asVector(doc.embedding);
        if (!docVector.length || docVector.length !== queryVector.length)
          return null;
        const score =
          cosineSimilarity(queryVector, docVector) +
          this.constraintBoost(doc.metadata, options, normalizedQuery) +
          this.keywordBoost(normalizedQuery, doc.title, doc.content) +
          this.sourceTypeBoost(doc.sourceType, options.intent);
        return {
          id: String(doc.id),
          sourceType: doc.sourceType,
          sourceId: doc.sourceId ? String(doc.sourceId) : null,
          title: doc.title,
          content: String(doc.content || "").slice(0, 1200),
          similarity: Number(score.toFixed(4)),
          metadata: doc.metadata || {},
        } satisfies RagHit;
      })
      .filter(Boolean)
      .sort((a: RagHit, b: RagHit) => b.similarity - a.similarity)
      .slice(0, topK) as RagHit[];
  }

  private async keywordRetrieve(
    query: string,
    options: RetrieveOptions,
    topK: number,
  ) {
    const normalizedQuery = stripText(query);
    const docs = await (this.prisma as any).ragDocument.findMany({
      where: { status: "active" },
      take: 500,
      orderBy: { updatedAt: "desc" },
    });
    return docs
      .map(
        (doc: any) =>
          ({
            id: String(doc.id),
            sourceType: doc.sourceType,
            sourceId: doc.sourceId ? String(doc.sourceId) : null,
            title: doc.title,
            content: String(doc.content || "").slice(0, 1200),
            similarity: Number(
              (
                this.keywordBoost(normalizedQuery, doc.title, doc.content) +
                this.constraintBoost(doc.metadata, options, normalizedQuery) +
                this.sourceTypeBoost(doc.sourceType, options.intent)
              ).toFixed(4),
            ),
            metadata: doc.metadata || {},
          }) satisfies RagHit,
      )
      .filter((item: RagHit) => item.similarity > 0)
      .sort((a: RagHit, b: RagHit) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  private keywordBoost(normalizedQuery: string, title = "", content = "") {
    const stopWords = new Set([
      "toi",
      "minh",
      "muon",
      "can",
      "tim",
      "tour",
      "du",
      "lich",
      "di",
      "cho",
      "co",
      "khong",
      "gia",
      "ngay",
      "dem",
      "nguoi",
    ]);
    const text = stripText(`${title} ${content}`);
    const words = normalizedQuery
      .split(/\s+/)
      .filter((word) => word.length >= 2 && !stopWords.has(word));
    let score = 0;
    for (const word of words) if (text.includes(word)) score += 0.025;
    return Math.min(score, 0.25);
  }

  private constraintBoost(
    metadata: any,
    options: RetrieveOptions,
    normalizedQuery: string,
  ) {
    if (!metadata) return 0;
    let score = 0;
    const memory = options.memory || {};
    const destination = stripText(
      metadata.destination || metadata.province || "",
    );
    const theme = stripText(metadata.theme || "");
    const section = stripText(metadata.section || "");
    const title = stripText(metadata.title || "");
    const searchable = `${destination} ${title} ${theme} ${section}`;
    const requestedDestination = stripText(memory.destination || "");
    if (requestedDestination && destination.includes(requestedDestination))
      score += 0.18;
    if (memory.durationDays && Number(metadata.durationDays)) {
      const diff = Math.abs(
        Number(metadata.durationDays) - Number(memory.durationDays),
      );
      if (diff === 0) score += 0.12;
      else if (diff === 1) score += 0.05;
    }
    if (memory.budgetMax && Number(metadata.priceAdult)) {
      const price = Number(metadata.priceAdult);
      if (price <= Number(memory.budgetMax)) score += 0.16;
      else if (price <= Number(memory.budgetMax) * 1.15) score += 0.06;
      else score -= 0.08;
    }
    if (
      /\b(bien|dao|tam bien|nghi bien)\b/.test(normalizedQuery) &&
      /phu quoc|nha trang|ha long|quy nhon|da nang|bien|dao/.test(searchable)
    )
      score += 0.14;
    if (
      /\b(nui|san may|mat me|sapa|sa pa|da lat|moc chau)\b/.test(
        normalizedQuery,
      ) &&
      /da lat|sa pa|sapa|moc chau|ha giang|nui|mountain/.test(searchable)
    )
      score += 0.14;
    if (
      /\b(gia dinh|tre em|family|ca nha)\b/.test(normalizedQuery) &&
      /family|gia dinh/.test(`${theme} ${title}`)
    )
      score += 0.1;
    const softNeeds = new Set((memory.softNeeds || []).map(stripText));
    if (softNeeds.has("family") && /family|gia dinh/.test(searchable))
      score += 0.08;
    if (
      (softNeeds.has("children") || softNeeds.has("elderly")) &&
      /family|gia dinh|nhe nhang|relax/.test(searchable)
    )
      score += 0.08;
    if (
      (softNeeds.has("relaxing") || softNeeds.has("light_schedule")) &&
      /resort|nghi duong|relax|family|eco|nhe nhang/.test(searchable)
    )
      score += 0.09;
    if (
      (softNeeds.has("beach") || softNeeds.has("island")) &&
      /phu quoc|nha trang|ha long|quy nhon|da nang|bien|dao/.test(searchable)
    )
      score += 0.1;
    if (
      softNeeds.has("photo_spots") &&
      /check|canh dep|view|pho co|vinh|bien|doi|san may/.test(searchable)
    )
      score += 0.08;
    if (
      softNeeds.has("cool_weather") &&
      /da lat|sa pa|sapa|moc chau|mat me|san may|nui/.test(searchable)
    )
      score += 0.09;
    if (
      softNeeds.has("food") &&
      /am thuc|dac san|hai san|cho noi/.test(searchable)
    )
      score += 0.07;
    if (
      softNeeds.has("culture") &&
      /van hoa|lich su|pho co|hue|hoi an|di tich/.test(searchable)
    )
      score += 0.07;
    if (
      softNeeds.has("luxury") &&
      /luxury|premium|resort|cao cap|5 sao|4 sao/.test(searchable)
    )
      score += 0.07;
    if (
      (memory.avoidNeeds || []).some((item) =>
        /trekking|too_tired/.test(stripText(item)),
      ) &&
      /trekking|leo nui|adventure|mao hiem|di bo nhieu/.test(searchable)
    )
      score -= 0.12;
    if (
      /\b(lich trinh|ngay 1|ngay 2|di dau|co met|nhe nhang)\b/.test(
        normalizedQuery,
      ) &&
      section === "itinerary"
    )
      score += 0.14;
    if (
      /\b(khach san|luu tru|tien nghi|may sao|resort)\b/.test(
        normalizedQuery,
      ) &&
      section === "accommodation"
    )
      score += 0.14;
    if (
      /\b(phuong tien|di bang gi|xe|may bay|tau)\b/.test(normalizedQuery) &&
      section === "transport"
    )
      score += 0.14;
    if (
      /\b(chinh sach|huy|hoan tien|bao gom|khong bao gom)\b/.test(
        normalizedQuery,
      ) &&
      section === "policy"
    )
      score += 0.14;
    return score;
  }

  private sourceTypeBoost(sourceType: string, intent?: string) {
    const source = String(sourceType || "");
    if (intent === "tour_policy" && /policy|faq/.test(source)) return 0.16;
    if (intent === "pickup_point" && /pickup/.test(source)) return 0.16;
    if (intent === "voucher_check" && /voucher/.test(source)) return 0.16;
    if (
      intent === "follow_up" &&
      /itinerary|accommodation|transport|review|tour/.test(source)
    )
      return 0.08;
    return 0;
  }
}
