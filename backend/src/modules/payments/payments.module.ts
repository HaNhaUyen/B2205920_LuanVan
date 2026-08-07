import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { EmailService } from "../../common/services/email.service";
import { RedisModule } from "../../redis/redis.module";
import { DepartureCapacityService } from "../../common/services/departure-capacity.service";
import { IdempotencyService } from "../../common/services/idempotency.service";

@Module({
  imports: [RedisModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    EmailService,
    DepartureCapacityService,
    IdempotencyService,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
