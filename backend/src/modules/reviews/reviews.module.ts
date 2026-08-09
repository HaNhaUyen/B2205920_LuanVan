import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";
import { ReviewModerationService } from "./review-moderation.service";

@Module({
  imports: [ConfigModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewModerationService],
})
export class ReviewsModule {}
