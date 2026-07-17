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
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GuidesService } from "./guides.service";

@Controller("guides")
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuidesController {
  constructor(private readonly service: GuidesService) {}

  @Roles("guide")
  @Get("me/schedule")
  mySchedule(
    @CurrentUser() user: { userId: bigint },
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.service.mySchedule(user.userId, { from, to });
  }

  @Roles("guide")
  @Get("me/schedule/today")
  myToday(@CurrentUser() user: { userId: bigint }) {
    return this.service.myToday(user.userId);
  }

  @Roles("guide")
  @Get("me/assignments/:id")
  myAssignmentDetail(
    @CurrentUser() user: { userId: bigint },
    @Param("id") id: string,
  ) {
    return this.service.myAssignmentDetail(user.userId, BigInt(id));
  }

  @Roles("admin")
  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @Roles("admin")
  @Get("assignable-departures")
  assignableDepartures() {
    return this.service.assignableDepartures();
  }

  @Roles("admin")
  @Get("available")
  available(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.service.available(startDate, endDate);
  }

  @Roles("admin")
  @Get("calendar")
  allCalendar(@Query("month") month?: string) {
    return this.service.allCalendar(month);
  }

  @Roles("admin")
  @Get(":id/credentials")
  credentials(@Param("id") id: string) {
    return this.service.getGuideCredentials(BigInt(id));
  }

  @Roles("admin")
  @Patch("credentials/:credentialId/review")
  reviewCredential(
    @CurrentUser() user: { userId: bigint },
    @Param("credentialId") credentialId: string,
    @Body() dto: { status: "approved" | "rejected"; reviewNote?: string },
  ) {
    return this.service.reviewGuideCredential(
      user.userId,
      BigInt(credentialId),
      dto,
    );
  }

  @Roles("admin")
  @Get(":id/calendar")
  calendar(@Param("id") id: string) {
    return this.service.calendar(BigInt(id));
  }

  @Roles("admin")
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Roles("admin")
  @Patch(":id/toggle-lock")
  toggleLock(@Param("id") id: string) {
    return this.service.toggleLock(BigInt(id));
  }

  @Roles("admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.service.update(BigInt(id), dto);
  }

  @Roles("admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(BigInt(id));
  }

  @Roles("admin")
  @Post("assign")
  assign(@CurrentUser() user: { userId: bigint }, @Body() dto: any) {
    return this.service.assign({ ...dto, changedBy: user.userId });
  }
}
