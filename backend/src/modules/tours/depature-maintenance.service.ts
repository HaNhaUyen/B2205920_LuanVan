import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DepartureMaintenanceService {
  private readonly logger = new Logger(DepartureMaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getCutoffDate() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 7);
    return cutoff;
  }

  /**
   * Chạy tự động mỗi ngày lúc 02:05 theo giờ Việt Nam.
   * - Lịch cũ hơn 7 ngày, không có booking: xóa vật lý.
   * - Lịch cũ hơn 7 ngày, đã có booking: chuyển closed để giữ lịch sử.
   */
  @Cron("0 5 2 * * *", { timeZone: "Asia/Ho_Chi_Minh" })
  async runScheduledMaintenance() {
    try {
      const result = await this.runMaintenance();
      this.logger.log(
        `Departure maintenance completed: deleted=${result.deletedCount}, archived=${result.archivedCount}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Departure maintenance failed: ${error?.message || error}`,
        error?.stack,
      );
    }
  }

  async getBookableDeparturesForTours(
    tourIds: Array<bigint | string | number>,
  ) {
    const normalizedTourIds = tourIds
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => BigInt(value));

    if (!normalizedTourIds.length) return new Map<string, any[]>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const departures = await this.prisma.tourDeparture.findMany({
      where: {
        tourId: { in: normalizedTourIds },
        departureDate: { gte: today },
        status: "open",
      },
      include: {
        pickupPoints: {
          where: { status: "active" },
          orderBy: { pickupTime: "asc" },
        },
      },
      orderBy: [{ tourId: "asc" }, { departureDate: "asc" }],
    });

    const grouped = new Map<string, any[]>();

    for (const departure of departures) {
      const remainingSlots = Math.max(
        0,
        Number(departure.totalSlots || 0) -
          Number(departure.bookedSlots || 0) -
          Number(departure.heldSlots || 0),
      );

      if (remainingSlots <= 0) continue;

      const key = String(departure.tourId);
      const current = grouped.get(key) || [];
      current.push(departure);
      grouped.set(key, current);
    }

    return grouped;
  }

  async runMaintenance() {
    const cutoffDate = this.getCutoffDate();

    const expiredDepartures = await this.prisma.tourDeparture.findMany({
      where: {
        departureDate: { lt: cutoffDate },
      },
      select: {
        id: true,
        tourId: true,
        departureDate: true,
        status: true,
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: { departureDate: "asc" },
    });

    let deletedCount = 0;
    let archivedCount = 0;
    let skippedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const departure of expiredDepartures) {
        const bookingCount = Number(departure._count.bookings || 0);

        if (bookingCount > 0) {
          if (
            !["closed", "completed", "cancelled"].includes(departure.status)
          ) {
            await tx.tourDeparture.update({
              where: { id: departure.id },
              data: {
                status: "closed",
                heldSlots: 0,
              },
            });
            archivedCount += 1;
          } else {
            skippedCount += 1;
          }
          continue;
        }

        await tx.tourDeparture.delete({
          where: { id: departure.id },
        });
        deletedCount += 1;
      }
    });

    return {
      success: true,
      cutoffDate,
      scannedCount: expiredDepartures.length,
      deletedCount,
      archivedCount,
      skippedCount,
      message:
        "Đã xóa lịch cũ hơn 7 ngày không có booking và đóng các lịch đã có booking.",
    };
  }
}
