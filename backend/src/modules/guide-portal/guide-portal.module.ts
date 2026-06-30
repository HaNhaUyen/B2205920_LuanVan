import { Module } from "@nestjs/common";
import { GuidePortalController } from "./guide-portal.controller";
import { GuidePortalService } from "./guide-portal.service";

@Module({
  controllers: [GuidePortalController],
  providers: [GuidePortalService],
  exports: [GuidePortalService],
})
export class GuidePortalModule {}
