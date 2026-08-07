import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import { EmailService } from "../../common/services/email.service";
import { DepartureCapacityService } from "../../common/services/departure-capacity.service";
import { IdempotencyService } from "../../common/services/idempotency.service";

@Module({
  imports: [PrismaModule],
  controllers: [RefundsController],
  providers: [
    RefundsService,
    EmailService,
    DepartureCapacityService,
    IdempotencyService,
  ],
  exports: [RefundsService],
})
export class RefundsModule {}
