import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  cosineSimilarity,
  normalizeScoreMap,
  stripText,
} from "./recommendation.utils";

type EmbeddingPayload = {
  model?: string;
  dimension?: number;
  embeddings?: number[][];
};

@Injectable()
export class DeepRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly fallbackVectorSize = 128;
  private readonly aiServiceUrl =
    process.env.AI_SERVICE_URL ||
    process.env.VISION_SERVICE_URL ||
    "http://localhost:8000";

  /**
   * Fallback chỉ dùng khi FastAPI embedding bị tắt/lỗi để hệ thống không crash.
   * Khi FastAPI chạy ổn, deep score sẽ dùng Sentence-Transformers thật từ /embeddings/text.
   */
  private hashToken(token: string) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    return hash % this.fallbackVectorSize;
  }

  private buildHashingFallbackEmbedding(text: string) {
    const vector = Array(this.fallbackVectorSize).fill(0);
    const tokens = stripText(text).split(/\s+/).filter(Boolean);
    for (const token of tokens) vector[this.hashToken(token)] += 1;

    const norm =
      Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

    return vector.map((value) => value / norm);
  }

  private async requestTextEmbeddings(texts: string[]) {
    const cleanTexts = texts.map((item) => String(item || "").trim());
    if (!cleanTexts.length) return [];

    const fallbackEnabled =
      String(process.env.EMBEDDING_FALLBACK || "true").toLowerCase() !==
      "false";

    try {
      const response = await fetch(`${this.aiServiceUrl}/embeddings/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: cleanTexts }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API HTTP ${response.status}`);
      }

      const payload = (await response.json()) as EmbeddingPayload;
      const vectors = payload.embeddings || [];

      if (!Array.isArray(vectors) || vectors.length !== cleanTexts.length) {
        throw new Error("Embedding API trả về sai số lượng vector");
      }

      return vectors;
    } catch (error) {
      if (!fallbackEnabled) throw error;

      console.warn(
        "[Recommendation Embedding] FastAPI embedding lỗi, dùng fallback hashing:",
        error instanceof Error ? error.message : error,
      );

      return cleanTexts.map((text) => this.buildHashingFallbackEmbedding(text));
    }
  }

  buildTourText(tour: any) {
    return [
      tour.name,
      tour.shortDescription,
      tour.fullDescription,
      tour.destination?.name,
      tour.destination?.province,
      tour.destination?.region,
      tour.tourTheme,
      tour.tourType,
      `${tour.durationDays || ""} ngày ${tour.durationNights || ""} đêm`,
      ...(tour.itinerary || []).map(
        (item: any) => `${item.title || ""} ${item.content || ""}`,
      ),
    ]
      .filter(Boolean)
      .join(" ");
  }

  async rebuildTourEmbeddings() {
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: { destination: true, itinerary: true },
    });

    const texts = (tours as any[]).map((tour) => this.buildTourText(tour));
    const vectors = await this.requestTextEmbeddings(texts);

    for (let index = 0; index < tours.length; index += 1) {
      const tour: any = tours[index];
      const vector = vectors[index] || [];

      await (this.prisma as any).tourEmbedding.upsert({
        where: { tourId: tour.id },
        update: { textEmbedding: vector as any, updatedAt: new Date() },
        create: { tourId: tour.id, textEmbedding: vector as any },
      });
    }

    return {
      message: "Đã tạo lại embedding nội dung tour bằng Sentence-Transformers.",
      total: tours.length,
      aiServiceUrl: this.aiServiceUrl,
    };
  }

  buildUserSemanticText(behaviors: any[]) {
    return behaviors
      .map((item) => {
        const tour = item.tour || {};
        const meta =
          item.meta && typeof item.meta === "object" ? item.meta : {};

        return [
          item.keyword,
          meta.destination,
          meta.theme,
          meta.travelStyle,
          meta.duration,
          meta.budget,
          tour.name,
          tour.destination?.name,
          tour.tourTheme,
          tour.shortDescription,
          tour.fullDescription,
        ]
          .filter(Boolean)
          .join(" ");
      })
      .filter(Boolean)
      .join(" ");
  }

  async scoreToursForUser(behaviors: any[], activeTours: any[]) {
    const userText = this.buildUserSemanticText(behaviors);
    if (!userText.trim()) return {};

    const [userEmbedding] = await this.requestTextEmbeddings([userText]);
    if (!userEmbedding?.length) return {};

    const embeddings = await (this.prisma as any).tourEmbedding.findMany({
      where: { tourId: { in: activeTours.map((tour: any) => tour.id) } },
    });

    const embeddingMap = new Map<string, number[]>();
    for (const item of embeddings as any[]) {
      embeddingMap.set(String(item.tourId), item.textEmbedding || []);
    }

    const missingTours = activeTours.filter(
      (tour: any) => !embeddingMap.get(String(tour.id))?.length,
    );

    if (missingTours.length) {
      const missingTexts = missingTours.map((tour: any) =>
        this.buildTourText(tour),
      );
      const missingVectors = await this.requestTextEmbeddings(missingTexts);

      for (let index = 0; index < missingTours.length; index += 1) {
        const tour: any = missingTours[index];
        const vector = missingVectors[index] || [];
        embeddingMap.set(String(tour.id), vector);

        await (this.prisma as any).tourEmbedding.upsert({
          where: { tourId: tour.id },
          update: { textEmbedding: vector as any, updatedAt: new Date() },
          create: { tourId: tour.id, textEmbedding: vector as any },
        });
      }
    }

    const raw: Record<string, number> = {};
    for (const tour of activeTours) {
      const vec = embeddingMap.get(String(tour.id)) || [];
      raw[String(tour.id)] =
        Math.max(0, cosineSimilarity(userEmbedding, vec)) * 100;
    }

    return normalizeScoreMap(raw);
  }
}
