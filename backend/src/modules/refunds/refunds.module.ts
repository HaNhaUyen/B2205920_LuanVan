import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";
import { EmailService } from "../../common/services/email.service";

@Module({
  imports: [PrismaModule],
  controllers: [RefundsController],
  providers: [RefundsService, EmailService],
  exports: [RefundsService],
})
export class RefundsModule {}
