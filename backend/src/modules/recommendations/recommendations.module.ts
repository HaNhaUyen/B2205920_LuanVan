import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { RecommendationsController } from "./recommendations.controller";
import { RecommendationsService } from "./recommendations.service";
import { CollaborativeService } from "./collaborative.service";
import { ContentBasedService } from "./content-based.service";
import { MatrixFactorizationService } from "./matrix-factorization.service";
import { DeepRecommendationService } from "./deep-recommendation.service";
import { RecommendationMetricsService } from "./recommendation-metrics.service";
import { RecommendationEvalService } from "./recommendation-eval.service";

@Module({
  imports: [PrismaModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    CollaborativeService,
    ContentBasedService,
    MatrixFactorizationService,
    DeepRecommendationService,
    RecommendationMetricsService,
    RecommendationEvalService,
  ],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
