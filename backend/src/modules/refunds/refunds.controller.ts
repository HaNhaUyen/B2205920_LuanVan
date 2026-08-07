import {
  Body,
  Controller,
  Get,
  Headers,
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
import { RefundsService } from "./refunds.service";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { ReviewRefundDto } from "./dto/review-refund.dto";
import { IdempotencyService } from "../../common/services/idempotency.service";

@Controller("refunds")
export class RefundsController {
  constructor(
    private readonly service: RefundsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get("bookings/:bookingId/preview")
  preview(
    @CurrentUser() u: { userId: bigint },
    @Param("bookingId") bookingId: string,
  ) {
    return this.service.preview(u.userId, bookingId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser() u: { userId: bigint },
    @Body() dto: CreateRefundDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.idempotency.run({
      userId: u.userId,
      key: idempotencyKey,
      operation: "refund.create",
      payload: dto,
      resourceType: "refund",
      resourceIdSelector: (response: any) => response?.id,
      handler: () => this.service.create(u.userId, dto),
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  mine(@CurrentUser() u: { userId: bigint }) {
    return this.service.mine(u.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/revenue-summary")
  revenueSummary(@Query("months") months?: string) {
    return this.service.revenueSummary(Number(months || 6));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch(":id/review")
  review(
    @CurrentUser() u: { userId: bigint },
    @Param("id") id: string,
    @Body() dto: ReviewRefundDto,
  ) {
    return this.service.review(BigInt(id), u.userId, dto);
  }
}
