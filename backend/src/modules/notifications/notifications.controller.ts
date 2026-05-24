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
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UpsertNotificationDto } from "./dto/upsert-notification.dto";
import { NotificationsService } from "./notifications.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("notifications/me")
  myNotifications(
    @CurrentUser() user: { userId: bigint; role: "admin" | "user" },
    @Query("limit") limit?: string,
  ) {
    return this.notificationsService.listForUser(
      user.userId,
      user.role,
      limit ? Number(limit) : undefined,
    );
  }

  @Get("notifications/me/unread-count")
  myUnreadCount(
    @CurrentUser() user: { userId: bigint; role: "admin" | "user" },
  ) {
    return this.notificationsService.unreadCount(user.userId, user.role);
  }

  @Post("notifications/:id/read")
  markAsRead(
    @Param("id") id: string,
    @CurrentUser() user: { userId: bigint; role: "admin" | "user" },
  ) {
    return this.notificationsService.markAsRead(
      Number(id),
      user.userId,
      user.role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/notifications")
  adminList(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("search") search?: string,
    @Query("targetRole") targetRole?: string,
    @Query("isPublished") isPublished?: string,
  ) {
    return this.notificationsService.adminList({
      page,
      pageSize,
      search,
      targetRole,
      isPublished,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/notifications/bulk-targets")
  bulkTargets(
    @Query("days") days?: string,
    @Query("search") search?: string,
    @Query("destinationId") destinationId?: string,
    @Query("onlyMissingGuide") onlyMissingGuide?: string,
    @Query("onlyUnpaid") onlyUnpaid?: string,
  ) {
    return this.notificationsService.bulkTargets({
      days,
      search,
      destinationId,
      onlyMissingGuide,
      onlyUnpaid,
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/notifications/bulk-send")
  bulkSend(@Body() dto: any, @CurrentUser() user: { userId: bigint }) {
    return this.notificationsService.bulkSend(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/notifications/:id")
  adminDetail(@Param("id") id: string) {
    return this.notificationsService.adminDetail(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/notifications")
  adminCreate(
    @Body() dto: UpsertNotificationDto,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.notificationsService.adminCreate(dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/notifications/:id")
  adminUpdate(@Param("id") id: string, @Body() dto: UpsertNotificationDto) {
    return this.notificationsService.adminUpdate(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/notifications/:id")
  adminDelete(@Param("id") id: string) {
    return this.notificationsService.adminDelete(Number(id));
  }
}
