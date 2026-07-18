import {
  Injectable,
  INestApplication,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * PrismaService dùng chung cho toàn bộ backend.
 *
 * Quy ước thời gian:
 * - MySQL session chạy theo UTC+7.
 * - created_at và updated_at để MySQL tự quản lý bằng
 *   CURRENT_TIMESTAMP / ON UPDATE CURRENT_TIMESTAMP.
 * - Các thời điểm gán thủ công dùng vietnamNow().
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private shutdownHooksRegistered = false;

  /**
   * Kết nối Prisma khi NestJS khởi động.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();

    /**
     * Đặt timezone cho session MySQL hiện tại.
     *
     * Lưu ý: Prisma sử dụng connection pool, vì vậy cấu hình timezone
     * cố định trong MySQL vẫn là quan trọng nhất:
     *
     * default-time-zone = "+07:00"
     */
    await this.$executeRawUnsafe("SET SESSION time_zone = '+07:00'");
  }

  /**
   * Ngắt kết nối Prisma khi NestJS dừng.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Tương thích với đoạn gọi trong main.ts:
   *
   * await prisma.enableShutdownHooks(app);
   *
   * Khi tiến trình nhận SIGINT hoặc SIGTERM, ứng dụng NestJS sẽ được
   * đóng đúng cách trước khi Node.js kết thúc.
   */
  async enableShutdownHooks(app: INestApplication): Promise<void> {
    if (this.shutdownHooksRegistered) {
      return;
    }

    this.shutdownHooksRegistered = true;

    let shuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      try {
        console.log(
          `[PrismaService] Nhận tín hiệu ${signal}, đang đóng ứng dụng...`,
        );

        await app.close();
      } catch (error) {
        console.error("[PrismaService] Có lỗi khi đóng ứng dụng:", error);

        process.exitCode = 1;
      }
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  }

  /**
   * Trả về thời điểm hiện tại theo giờ đồng hồ Việt Nam UTC+7
   * để ghi trực tiếp vào cột MySQL DATETIME.
   *
   * Dùng cho các trường thời điểm được gán thủ công:
   * - paidAt
   * - repliedAt
   * - reviewedAt
   * - confirmedAt
   * - completedAt
   * - checkedInAt
   * - resolvedAt
   *
   * Không dùng cho các trường chỉ mang ý nghĩa ngày:
   * - birthDate
   * - dateOfBirth
   * - departureDate
   * - endDate
   * - startDate của voucher
   */
  vietnamNow(): Date {
    return this.toVietnamDateTime(new Date());
  }

  /**
   * Chuyển một thời điểm bất kỳ sang giá trị Date có các thành phần
   * năm/tháng/ngày/giờ tương ứng với Asia/Ho_Chi_Minh.
   *
   * Prisma sẽ ghi các thành phần này trực tiếp vào MySQL DATETIME.
   */
  toVietnamDateTime(value: Date | string | number): Date {
    const input = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(input.getTime())) {
      throw new Error("Giá trị thời gian không hợp lệ.");
    }

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(input);

    const getPart = (type: Intl.DateTimeFormatPartTypes): number => {
      const part = parts.find((item) => item.type === type);
      return Number(part?.value || 0);
    };

    return new Date(
      Date.UTC(
        getPart("year"),
        getPart("month") - 1,
        getPart("day"),
        getPart("hour"),
        getPart("minute"),
        getPart("second"),
      ),
    );
  }
}
