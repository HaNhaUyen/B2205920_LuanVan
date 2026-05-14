import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminUpsertReviewDto } from './dto/admin-upsert-review.dto';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('reviews/tour/:tourId')
  findByTour(@Param('tourId') tourId: string, @CurrentUser() user?: { userId: bigint }) {
    return this.reviewsService.findByTour(Number(tourId), user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('reviews')
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: { userId: bigint }) {
    return this.reviewsService.create(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('admin/reviews')
  adminList(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('search') search?: string, @Query('status') status?: string, @Query('tourId') tourId?: string) {
    return this.reviewsService.adminList({ page, pageSize, search, status, tourId });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('admin/reviews/:id/reply')
  adminReply(@Param('id') id: string, @Body() dto: AdminUpsertReviewDto) {
    return this.reviewsService.adminReply(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete('admin/reviews/:id')
  adminDelete(@Param('id') id: string) {
    return this.reviewsService.adminDelete(Number(id));
  }
}
