import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NotificationTargetRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UpsertNotificationDto } from "./dto/upsert-notification.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildTargetRoleWhere(role: "admin" | "user") {
    const roles: NotificationTargetRole[] = ["all", role];
    return { in: roles };
  }

  private buildUserVisibleWhere(userId: bigint, role: "admin" | "user") {
    return {
      isPublished: true,
      targetRole: this.buildTargetRoleWhere(role),
      OR: [{ targetUserId: null }, { targetUserId: userId }],
    };
  }

  async listForUser(userId: bigint, role: "admin" | "user", limit?: number) {
    const take = limit ? Math.min(Math.max(Number(limit), 1), 50) : undefined;
    const items: any[] = await this.prisma.notification.findMany({
      where: this.buildUserVisibleWhere(userId, role),
      include: {
        reads: {
          where: { userId },
          select: { id: true, readAt: true },
          take: 1,
        },
        createdByUser: { select: { id: true, fullName: true, email: true } },
        targetUser: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      ...(take ? { take } : {}),
    });
    return items.map((item) => ({
      ...item,
      isRead: item.reads.length > 0,
      readAt: item.reads[0]?.readAt || null,
    }));
  }

  async unreadCount(userId: bigint, role: "admin" | "user") {
    const total = await this.prisma.notification.count({
      where: {
        ...this.buildUserVisibleWhere(userId, role),
        reads: { none: { userId } },
      },
    });
    return { total };
  }

  async markAsRead(id: number, userId: bigint, role: "admin" | "user") {
    const notification = await this.prisma.notification.findFirst({
      where: { id: BigInt(id), ...this.buildUserVisibleWhere(userId, role) },
    });
    if (!notification)
      throw new NotFoundException(
        "Thông báo không tồn tại hoặc bạn không có quyền xem.",
      );
    await this.prisma.notificationRead.upsert({
      where: {
        notificationId_userId: { notificationId: notification.id, userId },
      },
      update: { readAt: new Date() },
      create: { notificationId: notification.id, userId, readAt: new Date() },
    });
    return { success: true };
  }

  async adminList(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    targetRole?: string;
    isPublished?: string;
  }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;
    const where: any = {};
    if (query.search)
      where.OR = [
        { title: { contains: query.search } },
        { message: { contains: query.search } },
        { content: { contains: query.search } },
      ];
    if (query.targetRole) where.targetRole = query.targetRole;
    if (query.isPublished === "true") where.isPublished = true;
    if (query.isPublished === "false") where.isPublished = false;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          createdByUser: { select: { id: true, fullName: true, email: true } },
          targetUser: { select: { id: true, fullName: true, email: true } },
          _count: { select: { reads: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminDetail(id: number) {
    const item = await this.prisma.notification.findUnique({
      where: { id: BigInt(id) },
      include: {
        createdByUser: { select: { id: true, fullName: true, email: true } },
        targetUser: { select: { id: true, fullName: true, email: true } },
        reads: {
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { readAt: "desc" },
        },
      },
    });
    if (!item) throw new NotFoundException("Notification not found");
    return item;
  }

  private async ensureTargetUser(dto: UpsertNotificationDto) {
    if (!dto.targetUserId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(dto.targetUserId) },
    });
    if (!user)
      throw new BadRequestException("Người nhận thông báo không tồn tại.");
    return user;
  }

  async adminCreate(dto: UpsertNotificationDto, createdBy?: bigint) {
    await this.ensureTargetUser(dto);
    return this.prisma.notification.create({
      data: {
        title: dto.title.trim(),
        message: dto.message?.trim() || null,
        content: dto.content.trim(),
        targetRole: (dto.targetRole || "user") as any,
        targetUserId: dto.targetUserId ? BigInt(dto.targetUserId) : null,
        isPublished: dto.isPublished ?? true,
        createdBy,
      },
      include: {
        createdByUser: { select: { id: true, fullName: true, email: true } },
        targetUser: { select: { id: true, fullName: true, email: true } },
        _count: { select: { reads: true } },
      },
    });
  }

  async adminUpdate(id: number, dto: UpsertNotificationDto) {
    const existing = await this.prisma.notification.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) throw new NotFoundException("Notification not found");
    await this.ensureTargetUser(dto);
    return this.prisma.notification.update({
      where: { id: BigInt(id) },
      data: {
        title: dto.title.trim(),
        message: dto.message?.trim() || null,
        content: dto.content.trim(),
        targetRole: (dto.targetRole || existing.targetRole) as any,
        targetUserId: dto.targetUserId ? BigInt(dto.targetUserId) : null,
        isPublished: dto.isPublished ?? existing.isPublished,
      },
      include: {
        createdByUser: { select: { id: true, fullName: true, email: true } },
        targetUser: { select: { id: true, fullName: true, email: true } },
        _count: { select: { reads: true } },
      },
    });
  }

  async adminDelete(id: number) {
    const existing = await this.prisma.notification.findUnique({
      where: { id: BigInt(id) },
      include: { _count: { select: { reads: true } } },
    });
    if (!existing) throw new NotFoundException("Notification not found");
    if (existing._count.reads > 0)
      throw new BadRequestException(
        "Thông báo này đã có người xem. Bạn nên sửa hoặc ẩn thông báo thay vì xóa.",
      );
    await this.prisma.notification.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }
}
