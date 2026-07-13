import { Module } from "@nestjs/common";
import { TripOperationsController } from "./trip-operations.controller";
import { TripOperationsService } from "./trip-operations.service";

@Module({
  controllers: [TripOperationsController],
  providers: [TripOperationsService],
})
export class TripOperationsModule {}
