import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async myFavorites(userId: bigint) {
    const items = await this.prisma.favoriteTour.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        tour: {
          include: {
            destination: true,
            media: { where: { isCover: true }, take: 1 },
            departures: {
              where: { status: { in: ["open", "full"] } },
              orderBy: { departureDate: "asc" },
              take: 3,
            },
            reviews: {
              where: { status: "approved" },
              select: { rating: true },
            },
          },
        },
      },
    });

    return items.map((item) => ({
      ...item.tour,
      id: item.tour.id,
      tourId: item.tour.id,
      favoriteId: item.id,
    }));
  }

  async add(userId: bigint, tourId: number) {
    const safeTourId = BigInt(tourId);

    const tour = await this.prisma.tour.findUnique({
      where: { id: safeTourId },
    });

    if (!tour || tour.status !== "published") {
      throw new NotFoundException("Tour not found");
    }

    const exists = await this.prisma.favoriteTour.findFirst({
      where: { userId, tourId: safeTourId },
    });

    if (exists) return { ...exists, alreadyExists: true };

    const created = await this.prisma.favoriteTour.create({
      data: { userId, tourId: safeTourId },
    });

    await this.prisma.userBehavior.create({
      data: {
        userId,
        tourId: safeTourId,
        action: "favorite",
        score: 4,
        keyword: tour.tourTheme || tour.code || tour.name || null,
        meta: {
          source: "favorites_service",
          tourName: tour.name,
          theme: tour.tourTheme,
          type: tour.tourType,
          destinationId: tour.destinationId?.toString() || null,
        } as any,
      },
    });

    return created;
  }

  async remove(userId: bigint, tourId: number) {
    const safeTourId = BigInt(tourId);

    const existing = await this.prisma.favoriteTour.findFirst({
      where: {
        userId,
        tourId: safeTourId,
      },
    });

    if (!existing) {
      return { success: true };
    }

    await this.prisma.favoriteTour.delete({
      where: { id: existing.id },
    });

    return { success: true };
  }
}
