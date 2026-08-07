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
   * Không xóa vật lý lịch khởi hành cũ.
   *
   * Lịch cũ được giữ lại trong database để bảo toàn lịch sử và báo cáo.
   * Giao diện quản trị sẽ tự ẩn lịch trước tháng hiện tại.
   * Maintenance chỉ chuyển các lịch cũ còn open/full sang closed.
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

    const deletedCount = 0;
    let archivedCount = 0;
    let skippedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const departure of expiredDepartures) {
        /*
         * Không xóa vật lý kể cả lịch chưa có booking.
         * Chỉ đóng lịch cũ nếu nó vẫn còn ở trạng thái có thể bán.
         */
        if (["open", "full"].includes(departure.status)) {
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
        "Đã giữ nguyên toàn bộ lịch khởi hành cũ trong database và chỉ đóng các lịch đã quá hạn còn đang mở.",
    };
  }
}
