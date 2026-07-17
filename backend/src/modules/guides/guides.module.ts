import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuidesController } from "./guides.controller";
import { GuidesService } from "./guides.service";
import { EmailService } from "../../common/services/email.service";

@Module({
  imports: [PrismaModule],
  controllers: [GuidesController],
  providers: [GuidesService, EmailService],
})
export class GuidesModule {}
