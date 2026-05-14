import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { EmailService } from "../../common/services/email.service";
import { RedisModule } from "../../redis/redis.module";

@Module({
  imports: [RedisModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, EmailService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
