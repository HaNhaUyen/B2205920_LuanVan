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
import { BookingsService } from "./bookings.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminUpsertBookingDto } from "./dto/admin-upsert-booking.dto";
import { UpdateBookingDto } from "./dto/update-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";

@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post("bookings")
  create(
    @Body() dto: CreateBookingDto,
    @CurrentUser() user?: { userId: bigint },
  ) {
    return this.bookingsService.create(dto, user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("bookings/me")
  findMine(@CurrentUser() user: { userId: bigint }) {
    return this.bookingsService.findMyBookings(user.userId);
  }

  @Get("bookings/:id")
  findById(@Param("id") id: string) {
    return this.bookingsService.findById(Number(id));
  }

  @UseGuards(JwtAuthGuard)
  @Patch("bookings/:id/cancel")
  cancelMine(@Param("id") id: string, @CurrentUser() user: { userId: bigint }) {
    return this.bookingsService.cancelMyBooking(Number(id), user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/bookings")
  adminList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("paymentStatus") paymentStatus?: string,
    @Query("tourId") tourId?: string,
    @Query("destinationId") destinationId?: string,
    @Query("departureFrom") departureFrom?: string,
    @Query("departureTo") departureTo?: string,
    @Query("guideStatus") guideStatus?: string,
    @Query("urgency") urgency?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortOrder") sortOrder?: string,
  ) {
    return this.bookingsService.adminList({
      page,
      pageSize,
      search,
      status,
      paymentStatus,
      tourId,
      destinationId,
      departureFrom,
      departureTo,
      guideStatus,
      urgency,
      sortBy,
      sortOrder,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/bookings")
  adminCreate(
    @Body() dto: AdminUpsertBookingDto,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminCreate(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/bookings/:id")
  adminDetail(@Param("id") id: string) {
    return this.bookingsService.findById(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/bookings/:id")
  adminUpdate(
    @Param("id") id: string,
    @Body() dto: UpdateBookingDto,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminUpdate(Number(id), dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/bookings/:id/status")
  adminUpdateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateBookingStatusDto,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminUpdateStatus(Number(id), dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/operations/sync-completed-bookings")
  syncCompletedBookings(@CurrentUser() user: { userId: bigint }) {
    return this.bookingsService.syncCompletedBookingsAndRewards(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/operations/dashboard")
  adminOperationsDashboard() {
    return this.bookingsService.adminOperationsDashboard();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/operations/revenue-report")
  adminRevenueReport() {
    return this.bookingsService.adminRevenueReport();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/operations/calendar")
  adminOperationCalendar(
    @Query("mode") mode?: string,
    @Query("date") date?: string,
  ) {
    return this.bookingsService.adminOperationCalendar({ mode, date });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/operations/predeparture")
  adminPredepartureChecklist(@Query("days") days?: string) {
    return this.bookingsService.adminPredepartureChecklist({ days });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/operations/bulk-notify")
  adminBulkNotify(
    @Body()
    dto: {
      bookingIds?: Array<string | number>;
      departureId?: string | number;
      type?: string;
      channel?: string;
      message?: string;
    },
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminBulkNotify(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/operations/refund-suggestions")
  adminRefundSuggestions(@Query("status") status?: string) {
    return this.bookingsService.adminRefundSuggestions({ status });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/bookings/:id")
  adminDelete(
    @Param("id") id: string,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminDelete(Number(id), user.userId);
  }
}
