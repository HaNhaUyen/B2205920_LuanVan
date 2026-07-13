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
import { GuideAvailabilityService } from "./guide-availability.service";

@Controller("operations-v2")
@UseGuards(JwtAuthGuard, RolesGuard)
export class GuideAvailabilityController {
  constructor(private readonly service: GuideAvailabilityService) {}

  @Roles("guide")
  @Get("guides/availability")
  myAvailability(@CurrentUser() user: { userId: bigint }) {
    return this.service.myAvailability(user.userId);
  }

  @Roles("guide")
  @Post("guides/availability")
  createAvailability(
    @CurrentUser() user: { userId: bigint },
    @Body() dto: any,
  ) {
    return this.service.create(user.userId, dto);
  }

  @Roles("guide")
  @Patch("guides/availability/:id")
  updateAvailability(
    @CurrentUser() user: { userId: bigint },
    @Param("id") id: string,
    @Body() dto: any,
  ) {
    return this.service.update(user.userId, BigInt(id), dto);
  }

  @Roles("guide")
  @Delete("guides/availability/:id")
  removeAvailability(
    @CurrentUser() user: { userId: bigint },
    @Param("id") id: string,
  ) {
    return this.service.remove(user.userId, BigInt(id));
  }

  @Roles("admin")
  @Get("admin/guide-availabilities")
  adminList(@Query() query: any) {
    return this.service.adminList(query);
  }

  @Roles("admin")
  @Patch("admin/guide-availabilities/:id/review")
  review(
    @CurrentUser() user: { userId: bigint },
    @Param("id") id: string,
    @Body() dto: any,
  ) {
    return this.service.review(user.userId, BigInt(id), dto);
  }

  @Roles("admin")
  @Post("admin/guide-availabilities/:id/replace-and-approve")
  replaceAndApprove(
    @CurrentUser() user: { userId: bigint },
    @Param("id") id: string,
    @Body() dto: { replacementGuideId: string | number; note?: string },
  ) {
    return this.service.replaceAndApprove(
      user.userId,
      BigInt(id),
      BigInt(dto.replacementGuideId),
      dto.note,
    );
  }
}
