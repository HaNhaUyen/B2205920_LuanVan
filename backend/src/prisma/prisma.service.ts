import {
  Injectable,
  INestApplication,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private shutdownHooksRegistered = false;

  async onModuleInit(): Promise<void> {
    await this.$connect();

    // Toàn bộ thời điểm trong hệ thống lưu theo UTC.
    await this.$executeRawUnsafe("SET SESSION time_zone = '+00:00'");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    if (this.shutdownHooksRegistered) return;

    this.shutdownHooksRegistered = true;
    let shuttingDown = false;

    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) return;
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

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  }

  /**
   * Trả về thời điểm hiện tại.
   * Date của JavaScript luôn đại diện cho một thời điểm tuyệt đối.
   */
  vietnamNow(): Date {
    return new Date();
  }

  toVietnamDateTime(value: Date | string | number): Date {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error("Giá trị thời gian không hợp lệ.");
    }

    return date;
  }
}
