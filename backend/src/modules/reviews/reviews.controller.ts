import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ReviewsService } from "./reviews.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminUpsertReviewDto } from "./dto/admin-upsert-review.dto";

function reviewImageFilename(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) {
  const safeExt = extname(file.originalname || "").toLowerCase() || ".jpg";
  const unique = `review-${Date.now()}-${Math.round(
    Math.random() * 1e9,
  )}${safeExt}`;
  cb(null, unique);
}

function getCurrentUserId(user: any) {
  return BigInt(user?.userId || user?.id);
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get("reviews/tour/:tourId")
  findByTour(
    @Param("tourId") tourId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("rating") rating?: string,
    @Query("hasMedia") hasMedia?: string,
    @CurrentUser() user?: any,
  ) {
    return this.reviewsService.findByTour(Number(tourId), {
      page,
      pageSize,
      rating,
      hasMedia,
      userId: user?.userId ? BigInt(user.userId) : undefined,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("reviews/tour/:tourId/eligible-bookings")
  eligibleBookings(@Param("tourId") tourId: string, @CurrentUser() user: any) {
    return this.reviewsService.findEligibleBookingsForReview(
      Number(tourId),
      getCurrentUserId(user),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("reviews")
  @UseInterceptors(
    FilesInterceptor("images", 5, {
      storage: diskStorage({
        destination: "./uploads/reviews",
        filename: reviewImageFilename,
      }),
      limits: {
        files: 5,
        fileSize: 8 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype?.startsWith("image/")) {
          cb(new Error("Chỉ được tải lên file hình ảnh."), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  create(
    @Body() dto: CreateReviewDto,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @CurrentUser() user: any,
  ) {
    return this.reviewsService.create(dto, getCurrentUserId(user), files || []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/reviews")
  adminList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("tourId") tourId?: string,
    @Query("rating") rating?: string,
    @Query("hasMedia") hasMedia?: string,
  ) {
    return this.reviewsService.adminList({
      page,
      pageSize,
      search,
      status,
      tourId,
      rating,
      hasMedia,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/reviews/:id/reply")
  adminReply(@Param("id") id: string, @Body() dto: AdminUpsertReviewDto) {
    return this.reviewsService.adminReply(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/reviews/:id")
  adminDelete(@Param("id") id: string) {
    return this.reviewsService.adminDelete(Number(id));
  }
}
