import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { RedisModule } from "../../redis/redis.module";
import { EmailService } from "../../common/services/email.service";

@Module({
  imports: [RedisModule],
  controllers: [BookingsController],
  providers: [BookingsService, EmailService],
  exports: [BookingsService],
})
export class BookingsModule {}
