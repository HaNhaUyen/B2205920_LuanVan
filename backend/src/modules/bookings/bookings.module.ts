import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { BookingCompletionScheduler } from "./booking-completion.scheduler";
import { RedisModule } from "../../redis/redis.module";
import { EmailService } from "../../common/services/email.service";
import { DepartureCapacityService } from "../../common/services/departure-capacity.service";
import { IdempotencyService } from "../../common/services/idempotency.service";

@Module({
  imports: [RedisModule],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingCompletionScheduler,
    EmailService,
    DepartureCapacityService,
    IdempotencyService,
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
