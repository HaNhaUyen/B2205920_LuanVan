import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { BookingsService } from "./bookings.service";

@Injectable()
export class BookingCompletionScheduler implements OnModuleInit {
  private readonly logger = new Logger(BookingCompletionScheduler.name);

  private running = false;

  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * Khi backend vừa khởi động, chạy một lần sau 3 giây.
   * Nhờ vậy các booking đã qua ngày từ trước sẽ được cộng bù điểm
   * mà không cần đợi đến lần cron kế tiếp.
   */
  onModuleInit() {
    setTimeout(() => {
      void this.runSync("startup");
    }, 3000);
  }

  /**
   * Tự động quét mỗi 5 phút:
   * confirmed + đã thanh toán + đã qua ngày kết thúc
   * -> completed -> cộng 100 điểm đúng một lần.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: "sync-completed-bookings-and-rewards",
    timeZone: "Asia/Ho_Chi_Minh",
  })
  async handleCron() {
    await this.runSync("cron");
  }

  private async runSync(source: "startup" | "cron") {
    if (this.running) {
      this.logger.warn(
        `Bỏ qua lần chạy ${source} vì tác vụ trước chưa hoàn tất.`,
      );
      return;
    }

    this.running = true;

    try {
      const result =
        await this.bookingsService.syncCompletedBookingsAndRewards();

      this.logger.log(
        [
          `Nguồn=${source}`,
          `quét=${result.scanned}`,
          `hoàn thành=${result.completedCount}`,
          `cộng điểm=${result.rewardedCount}`,
        ].join(" | "),
      );

      if (result.results?.length) {
        this.logger.debug(JSON.stringify(result.results));
      }
    } catch (error: any) {
      this.logger.error(
        `Đồng bộ booking hoàn thành thất bại (${source}): ${
          error?.message || error
        }`,
        error?.stack,
      );
    } finally {
      this.running = false;
    }
  }
}
