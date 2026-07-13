import { Module } from "@nestjs/common";
import { TravelCompanionsController } from "./travel-companions.controller";
import { TravelCompanionsService } from "./travel-companions.service";

@Module({
  controllers: [TravelCompanionsController],
  providers: [TravelCompanionsService],
})
export class TravelCompanionsModule {}
