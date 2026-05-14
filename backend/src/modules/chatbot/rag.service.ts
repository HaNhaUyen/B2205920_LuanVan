import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
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
  private readonly gemini: GoogleGenAI | null;
  private readonly embeddingModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>("GEMINI_API_KEY");
    this.embeddingModel =
      this.configService.get<string>("GEMINI_EMBEDDING_MODEL") ||
      "gemini-embedding-001";
    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.gemini) return [];

    const clean = String(text || "").slice(0, 6000);
    if (!clean.trim()) return [];

    const response: any = await this.gemini.models.embedContent({
      model: this.embeddingModel,
      contents: clean,
    });

    const values =
      response?.embeddings?.[0]?.values ||
      response?.embedding?.values ||
      response?.embeddings?.[0]?.value ||
      [];

    return Array.isArray(values)
      ? values.map(Number).filter(Number.isFinite)
      : [];
  }

  async retrieve(
    query: string,
    options: RetrieveOptions = {},
  ): Promise<RagHit[]> {
    const topK = Math.min(Math.max(Number(options.topK || 6), 1), 12);
    const queryVector = await this.embedText(query).catch(() => []);

    if (!queryVector.length) {
      return this.keywordRetrieve(query, options, topK);
    }

    const docs = await (this.prisma as any).ragDocument.findMany({
      where: {
        status: "active",
      },
      take: 1200,
      orderBy: { updatedAt: "desc" },
    });

    const normalizedQuery = stripText(query);
    const scored = docs
      .map((doc: any) => {
        const docVector = asVector(doc.embedding);
        if (!docVector.length) return null;

        const semantic = cosineSimilarity(queryVector, docVector);
        const constraintBoost = this.constraintBoost(
          doc.metadata,
          options,
          normalizedQuery,
        );
        const keywordBoost = this.keywordBoost(
          normalizedQuery,
          doc.title,
          doc.content,
        );
        const score =
          semantic +
          constraintBoost +
          keywordBoost +
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
      .slice(0, topK);

    return scored as RagHit[];
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
      .map((doc: any) => {
        const score =
          this.keywordBoost(normalizedQuery, doc.title, doc.content) +
          this.constraintBoost(doc.metadata, options, normalizedQuery) +
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
      "tam",
      "ngay",
      "dem",
      "nguoi",
    ]);

    const text = stripText(`${title} ${content}`);
    const words = normalizedQuery
      .split(/\s+/)
      .filter((word) => word.length >= 2 && !stopWords.has(word));

    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score += 0.025;
    }

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
    const title = stripText(metadata.title || "");

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
      /\b(bien|dao|bien dao|tam bien|di bien|nghi bien)\b/.test(normalizedQuery)
    ) {
      if (
        /phu quoc|nha trang|ha long|quy nhon|con dao|vung tau|bien|dao/.test(
          `${destination} ${title} ${theme}`,
        )
      ) {
        score += 0.14;
      }
    }

    if (
      /\b(nui|san may|mat me|sapa|sa pa|da lat|moc chau)\b/.test(
        normalizedQuery,
      )
    ) {
      if (
        /da lat|sa pa|sapa|moc chau|ha giang|nui|mountain/.test(
          `${destination} ${title} ${theme}`,
        )
      ) {
        score += 0.14;
      }
    }

    if (/\b(gia dinh|tre em|family|ca nha)\b/.test(normalizedQuery)) {
      if (/family|gia dinh/.test(`${theme} ${title}`)) score += 0.1;
    }

    if (/\b(re nhat|gia re|tiet kiem|duoi|khong qua)\b/.test(normalizedQuery)) {
      if (Number(metadata.priceAdult))
        score += Math.max(0, 0.12 - Number(metadata.priceAdult) / 100_000_000);
    }

    return score;
  }
  private sourceTypeBoost(sourceType: string, intent?: string) {
    if (intent === "tour_search") {
      if (sourceType === "tour") return 0.12;
      if (sourceType === "pickup_point") return 0.03;
      if (sourceType === "faq") return 0.02;
    }

    if (intent === "tour_policy") {
      if (sourceType === "faq") return 0.12;
      if (sourceType === "tour") return 0.08;
    }

    if (intent === "pickup_point") {
      if (sourceType === "pickup_point") return 0.15;
      if (sourceType === "tour") return 0.05;
    }

    if (intent === "tour_compare") {
      if (sourceType === "tour") return 0.12;
      if (sourceType === "faq") return 0.03;
    }

    if (intent === "general_consulting" || intent === "follow_up") {
      if (sourceType === "tour") return 0.08;
      if (sourceType === "faq") return 0.06;
      if (sourceType === "pickup_point") return 0.04;
    }

    if (intent === "personal_recommendation") {
      if (sourceType === "tour") return 0.1;
    }

    return 0;
  }
}
