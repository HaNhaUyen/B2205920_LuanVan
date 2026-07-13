import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { GuideAvailabilityController } from "./guide-availability.controller";
import { GuideAvailabilityService } from "./guide-availability.service";

@Module({
  imports: [PrismaModule],
  controllers: [GuideAvailabilityController],
  providers: [GuideAvailabilityService],
  exports: [GuideAvailabilityService],
})
export class GuideAvailabilityModule {}
