import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { GuidesService } from "./guides.service";

@Controller("guides")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class GuidesController {
  constructor(private readonly service: GuidesService) {}

  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Get("available")
  available(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.service.available(startDate, endDate);
  }

  @Get("calendar")
  allCalendar(@Query("month") month?: string) {
    return this.service.allCalendar(month);
  }

  @Get(":id/calendar")
  calendar(@Param("id") id: string) {
    return this.service.calendar(BigInt(id));
  }

  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Patch(":id/toggle-lock")
  toggleLock(@Param("id") id: string) {
    return this.service.toggleLock(BigInt(id));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.service.update(BigInt(id), dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(BigInt(id));
  }

  @Post("assign")
  assign(@Body() dto: any) {
    return this.service.assign(dto);
  }
}
