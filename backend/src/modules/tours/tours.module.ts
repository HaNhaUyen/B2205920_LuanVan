import { Module } from "@nestjs/common";
import { ToursController } from "./tours.controller";
import { ToursService } from "./tours.service";
import { DepartureMaintenanceService } from "./depature-maintenance.service";

@Module({
  controllers: [ToursController],
  providers: [ToursService, DepartureMaintenanceService],
})
export class ToursModule {}
