import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RecommendationsService } from "./recommendations.service";

@Controller("recommendations")
export class RecommendationsController {
  constructor(private readonly service: RecommendationsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@CurrentUser() user?: { userId: bigint }, @Query("limit") limit = "8") {
    return this.service.recommend(user?.userId, Number(limit));
  }

  @UseGuards(JwtAuthGuard)
  @Post("behavior")
  track(@CurrentUser() user: { userId: bigint }, @Body() dto: any) {
    return this.service.track(user.userId, dto);
  }
}
