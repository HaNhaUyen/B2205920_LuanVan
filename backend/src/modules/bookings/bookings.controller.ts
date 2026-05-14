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
  ) {
    return this.bookingsService.adminList({
      page,
      pageSize,
      search,
      status,
      paymentStatus,
      tourId,
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
  @Delete("admin/bookings/:id")
  adminDelete(
    @Param("id") id: string,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.bookingsService.adminDelete(Number(id), user.userId);
  }
}
