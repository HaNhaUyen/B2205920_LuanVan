import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export type ResolvedLocation = {
  landmarkId: string | null;
  landmark: string | null;
  destinationId: string;
  destination: string;
  province: string;
  confidence: number;
  matchedBy: "landmark" | "destination" | "province";
};

@Injectable()
export class LocationResolverService {
  constructor(private readonly prisma: PrismaService) {}

  normalize(value = "") {
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

  async resolve(message: string): Promise<ResolvedLocation | null> {
    const normalized = this.normalize(message);
    if (!normalized) return null;

    const landmarks = await this.prisma.destinationLandmark.findMany({
      where: { status: "active", destination: { status: "active" } },
      include: { destination: true },
    });

    let best: { row: any; score: number } | null = null;
    for (const row of landmarks as any[]) {
      const aliases = Array.isArray(row.aliases) ? row.aliases : [];
      const candidates = [row.name, row.normalizedName, ...aliases]
        .map((x) => this.normalize(String(x || "")))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      for (const candidate of candidates) {
        if (normalized.includes(candidate)) {
          const score =
            candidate === row.normalizedName
              ? 1
              : Math.min(0.98, 0.82 + candidate.length / 200);
          if (!best || score > best.score) best = { row, score };
        }
      }
    }

    if (best) {
      const row = best.row;
      return {
        landmarkId: row.id.toString(),
        landmark: row.name,
        destinationId: row.destination.id.toString(),
        destination: row.destination.name,
        province: row.destination.province,
        confidence: best.score,
        matchedBy: "landmark",
      };
    }

    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });
    for (const row of destinations as any[]) {
      const name = this.normalize(row.name);
      const province = this.normalize(row.province);
      if (name && normalized.includes(name))
        return {
          landmarkId: null,
          landmark: null,
          destinationId: row.id.toString(),
          destination: row.name,
          province: row.province,
          confidence: 0.95,
          matchedBy: "destination",
        };
      if (province && normalized.includes(province))
        return {
          landmarkId: null,
          landmark: null,
          destinationId: row.id.toString(),
          destination: row.name,
          province: row.province,
          confidence: 0.9,
          matchedBy: "province",
        };
    }
    return null;
  }

  async findTours(location: ResolvedLocation, take = 8) {
    const landmarkNeedle = location.landmark || location.destination;
    const tours = await this.prisma.tour.findMany({
      where: {
        status: "published",
        OR: [
          { destinationId: BigInt(location.destinationId) },
          { name: { contains: landmarkNeedle } },
          { shortDescription: { contains: landmarkNeedle } },
          { fullDescription: { contains: landmarkNeedle } },
          {
            itinerary: {
              some: {
                OR: [
                  { title: { contains: landmarkNeedle } },
                  { locationName: { contains: landmarkNeedle } },
                  { description: { contains: landmarkNeedle } },
                ],
              },
            },
          },
        ],
      },
      include: {
        destination: true,
        itinerary: true,
        media: { orderBy: { displayOrder: "asc" }, take: 1 },
        departures: {
          where: { departureDate: { gte: new Date() }, status: "open" },
          orderBy: { departureDate: "asc" },
          take: 3,
        },
      },
      take: 30,
    });
    const n = this.normalize(landmarkNeedle);
    return (tours as any[])
      .map((t) => {
        const exact = [
          t.name,
          t.shortDescription,
          t.fullDescription,
          ...(t.itinerary || []).flatMap((i: any) => [
            i.title,
            i.locationName,
            i.description,
          ]),
        ].some((v) => this.normalize(v).includes(n));
        return { ...t, _locationScore: exact ? 100 : 30 };
      })
      .sort((a, b) => b._locationScore - a._locationScore)
      .slice(0, take);
  }

  async catalog() {
    const rows = await this.prisma.destination.findMany({
      where: { status: "active" },
      include: { landmarks: { where: { status: "active" } } },
      orderBy: { name: "asc" },
    });
    return rows.map((d: any) => ({
      id: d.id.toString(),
      name: d.name,
      province: d.province,
      country: d.country,
      landmarks: d.landmarks.map((l: any) => ({
        id: l.id.toString(),
        name: l.name,
        aliases: Array.isArray(l.aliases) ? l.aliases : [],
      })),
    }));
  }
}
