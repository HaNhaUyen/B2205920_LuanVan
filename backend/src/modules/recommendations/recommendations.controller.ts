import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RecommendationsService } from "./recommendations.service";
import { RecommendationEvalService } from "./recommendation-eval.service";

@Controller("recommendations")
export class RecommendationsController {
  constructor(
    private readonly service: RecommendationsService,
    private readonly evalService: RecommendationEvalService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(
    @CurrentUser() user?: { userId: bigint },
    @Query("limit") limit = "8",
    @Query("debug") debug?: string,
  ) {
    return this.service.recommend(
      user?.userId,
      Number(limit),
      debug === "1" || debug === "true",
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("behavior")
  track(@CurrentUser() user: { userId: bigint }, @Body() dto: any) {
    return this.service.track(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/train-mf")
  trainMatrixFactorization(@Body() dto: any) {
    return this.service.trainMatrixFactorization(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/rebuild-embeddings")
  rebuildEmbeddings() {
    return this.service.rebuildDeepEmbeddings();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/evaluate")
  evaluate(@Body() dto: any) {
    return this.evalService.evaluate(Number(dto?.k || 10));
  }
}
