import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/dashboard")
export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  @Get("overview")
  getOverview() {
    return this.adminDashboardService.getOverview();
  }

  @Get("smart-insights")
  getSmartInsights() {
    return this.adminDashboardService.getSmartInsights();
  }

  @Get("reports/:type")
  getReport(@Param("type") type: string, @Query() query: Record<string, any>) {
    return this.adminDashboardService.getReport(type, query || {});
  }
}
