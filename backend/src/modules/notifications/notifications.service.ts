import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { NotificationTargetRole } from "@prisma/client";
import { EmailService } from "../../common/services/email.service";
import { PrismaService } from "../../prisma/prisma.service";
import { UpsertNotificationDto } from "./dto/upsert-notification.dto";

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateText(value?: Date | string | null) {
  if (!value) return "đang cập nhật";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "đang cập nhật";
  return d.toLocaleDateString("vi-VN");
}

function toTimeText(value?: Date | string | null) {
  if (!value) return "Travela sẽ liên hệ";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Travela sẽ liên hệ";
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (s) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[s] || s;
  });
}

function normalizeIdList(value: any): bigint[] {
  const arr = Array.isArray(value) ? value : [];
  const result: bigint[] = [];
  for (const item of arr) {
    const n = Number(item);
    if (Number.isFinite(n) && n > 0) result.push(BigInt(n));
  }
  return Array.from(new Set(result.map(String))).map((id) => BigInt(id));
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

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
    if (!notification) {
      throw new NotFoundException(
        "Thông báo không tồn tại hoặc bạn không có quyền xem.",
      );
    }
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
    if (query.search) {
      where.OR = [
        { title: { contains: query.search } },
        { message: { contains: query.search } },
        { content: { contains: query.search } },
      ];
    }
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
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
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
    if (existing._count.reads > 0) {
      throw new BadRequestException(
        "Thông báo này đã có người xem. Bạn nên sửa hoặc ẩn thông báo thay vì xóa.",
      );
    }
    await this.prisma.notification.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }

  private mapBulkTarget(departure: any) {
    const bookings = departure.bookings || [];
    const totalGuests = bookings.reduce(
      (sum: number, b: any) =>
        sum + Number(b.adultCount || 0) + Number(b.childCount || 0),
      0,
    );
    const paidBookings = bookings.filter((b: any) =>
      (b.payments || []).some((p: any) => p.paymentStatus === "paid"),
    );
    const unpaidBookings = bookings.filter(
      (b: any) =>
        !(b.payments || []).some((p: any) => p.paymentStatus === "paid"),
    );
    const missingGuideBookings = bookings.filter(
      (b: any) => !(b.guideAssignments || []).length,
    );
    const missingPickupBookings = bookings.filter((b: any) => !b.pickupPointId);

    const guideNames = Array.from(
      new Set(
        bookings
          .flatMap((b: any) => b.guideAssignments || [])
          .map((ga: any) => ga.guide?.fullName)
          .filter(Boolean),
      ),
    );

    return {
      departureId: departure.id,
      tourId: departure.tourId,
      tourName: departure.tour?.name,
      destinationId: departure.tour?.destination?.id,
      destinationName: departure.tour?.destination?.name,
      destinationProvince: departure.tour?.destination?.province,
      departureDate: departure.departureDate,
      endDate: departure.endDate,
      totalSlots: departure.totalSlots,
      bookedSlots: departure.bookedSlots,
      heldSlots: departure.heldSlots,
      remainingSlots:
        Number(departure.totalSlots || 0) -
        Number(departure.bookedSlots || 0) -
        Number(departure.heldSlots || 0),
      bookingCount: bookings.length,
      paidCount: paidBookings.length,
      unpaidCount: unpaidBookings.length,
      missingGuideCount: missingGuideBookings.length,
      missingPickupCount: missingPickupBookings.length,
      totalGuests,
      guideNames,
      checklist: {
        hasAllPaid: unpaidBookings.length === 0,
        hasAllGuides: missingGuideBookings.length === 0,
        hasAllPickupPoints: missingPickupBookings.length === 0,
        hasBookings: bookings.length > 0,
      },
      bookings: bookings.map((b: any) => ({
        id: b.id,
        bookingCode: b.bookingCode,
        bookingStatus: b.bookingStatus,
        contactName: b.contactName,
        contactEmail: b.contactEmail,
        contactPhone: b.contactPhone,
        adultCount: b.adultCount,
        childCount: b.childCount,
        finalAmount: b.finalAmount,
        pickupName: b.pickupName,
        pickupAddress: b.pickupAddress,
        pickupTime: b.pickupTime,
        user: b.user,
        paymentStatus: b.payments?.[0]?.paymentStatus || null,
        guideNames: (b.guideAssignments || [])
          .map((ga: any) => ga.guide?.fullName)
          .filter(Boolean),
      })),
    };
  }

  async bulkTargets(query: any = {}) {
    const days = Math.min(Math.max(Number(query.days || 7), 1), 60);
    const today = startOfDay();
    const toDate = endOfDay(addDays(today, days));
    const search = String(query.search || "").trim();
    const destinationId = Number(query.destinationId || 0);
    const onlyMissingGuide = query.onlyMissingGuide === "true";
    const onlyUnpaid = query.onlyUnpaid === "true";

    const where: any = {
      departureDate: { gte: today, lte: toDate },
      status: { in: ["open", "full", "closed"] },
      bookings: {
        some: {
          bookingStatus: {
            in: ["pending_payment", "waiting_confirmation", "confirmed"],
          },
        },
      },
    };

    if (destinationId) where.tour = { destinationId: BigInt(destinationId) };
    if (search) {
      where.OR = [
        { tour: { name: { contains: search } } },
        { tour: { destination: { name: { contains: search } } } },
        { bookings: { some: { bookingCode: { contains: search } } } },
        { bookings: { some: { contactName: { contains: search } } } },
        { bookings: { some: { contactPhone: { contains: search } } } },
      ];
    }

    const departures = await this.prisma.tourDeparture.findMany({
      where,
      orderBy: [{ departureDate: "asc" }, { id: "asc" }],
      take: 120,
      include: {
        tour: { include: { destination: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: ["pending_payment", "waiting_confirmation", "confirmed"],
            },
          },
          include: {
            user: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
            guideAssignments: { include: { guide: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    let items = departures.map((d) => this.mapBulkTarget(d));
    if (onlyMissingGuide)
      items = items.filter((item) => item.missingGuideCount > 0);
    if (onlyUnpaid) items = items.filter((item) => item.unpaidCount > 0);

    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
      select: { id: true, name: true, province: true },
      orderBy: { name: "asc" },
    });

    return {
      items,
      destinations,
      summary: {
        totalDepartures: items.length,
        totalBookings: items.reduce((s, i) => s + i.bookingCount, 0),
        totalGuests: items.reduce((s, i) => s + i.totalGuests, 0),
        missingGuide: items.reduce((s, i) => s + i.missingGuideCount, 0),
        unpaid: items.reduce((s, i) => s + i.unpaidCount, 0),
      },
    };
  }

  private buildBulkMessage(type: string, departure: any, custom: any = {}) {
    const tourName = departure.tour?.name || "tour của Travela";
    const destination = departure.tour?.destination?.name || "điểm đến";
    const departureDate = toDateText(departure.departureDate);
    const endDate = toDateText(departure.endDate);

    const firstBooking = departure.bookings?.[0];
    const pickupName =
      firstBooking?.pickupName || "Travela sẽ liên hệ xác nhận";
    const pickupAddress = firstBooking?.pickupAddress || "đang cập nhật";
    const pickupTime = toTimeText(firstBooking?.pickupTime);
    const guideNames = Array.from(
      new Set(
        (departure.bookings || [])
          .flatMap((b: any) => b.guideAssignments || [])
          .map((ga: any) => ga.guide?.fullName)
          .filter(Boolean),
      ),
    ).join(", ");

    if (type === "pickup_info") {
      return {
        title: custom.title || `Thông tin điểm đón tour ${tourName}`,
        message:
          custom.message ||
          `Cập nhật điểm đón cho tour khởi hành ngày ${departureDate}.`,
        content:
          custom.content ||
          `Travela thông báo thông tin điểm đón tour ${tourName} (${destination}) khởi hành ngày ${departureDate}. Điểm đón: ${pickupName}. Địa chỉ: ${pickupAddress}. Thời gian đón: ${pickupTime}. Quý khách vui lòng có mặt trước giờ đón 15 phút.`,
      };
    }

    if (type === "itinerary_change") {
      return {
        title: custom.title || `Cập nhật lịch trình tour ${tourName}`,
        message:
          custom.message ||
          `Travela có cập nhật lịch trình tour ${departureDate}.`,
        content:
          custom.content ||
          `Travela thông báo tour ${tourName} (${destination}) khởi hành ngày ${departureDate} có điều chỉnh lịch trình. Nội dung chi tiết sẽ được nhân viên Travela liên hệ xác nhận. Rất mong quý khách thông cảm và theo dõi thông báo mới nhất.`,
      };
    }

    if (type === "guide_change") {
      return {
        title: custom.title || `Cập nhật hướng dẫn viên tour ${tourName}`,
        message: custom.message || `Thông tin hướng dẫn viên đã được cập nhật.`,
        content:
          custom.content ||
          `Travela thông báo hướng dẫn viên phụ trách tour ${tourName} (${destination}) khởi hành ngày ${departureDate}: ${guideNames || "Travela sẽ cập nhật trong thời gian sớm nhất"}. Quý khách vui lòng theo dõi thông báo và liên hệ Travela nếu cần hỗ trợ.`,
      };
    }

    if (type === "custom") {
      return {
        title: custom.title || `Thông báo từ Travela`,
        message: custom.message || "Travela gửi thông báo đến quý khách.",
        content: custom.content || "Travela gửi thông báo đến quý khách.",
      };
    }

    return {
      title: custom.title || `Nhắc lịch khởi hành tour ${tourName}`,
      message: custom.message || `Tour sẽ khởi hành ngày ${departureDate}.`,
      content:
        custom.content ||
        `Travela nhắc lịch tour ${tourName} (${destination}) sẽ khởi hành ngày ${departureDate} và kết thúc ngày ${endDate}. Điểm đón: ${pickupName}. Địa chỉ: ${pickupAddress}. Thời gian đón: ${pickupTime}. Quý khách vui lòng kiểm tra email, chuẩn bị giấy tờ tùy thân và có mặt trước giờ đón 15 phút.`,
    };
  }

  private buildBulkEmailHtml(message: { title: string; content: string }) {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="color:#2563eb;margin-bottom:12px">${escapeHtml(message.title)}</h2>
        <p>${escapeHtml(message.content).replace(/\n/g, "<br />")}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="font-size:13px;color:#64748b">Email được gửi tự động từ hệ thống Travela.</p>
      </div>
    `;
  }

  async bulkSend(dto: any, adminId?: bigint) {
    const departureId = Number(dto.departureId || 0);
    if (!departureId) throw new BadRequestException("Cần chọn lịch khởi hành.");

    const channels =
      Array.isArray(dto.channels) && dto.channels.length
        ? dto.channels
        : ["notification"];
    const sendNotification =
      channels.includes("notification") || channels.includes("both");
    const sendEmail = channels.includes("email") || channels.includes("both");

    const selectedBookingIds = normalizeIdList(dto.bookingIds);

    const departure = await this.prisma.tourDeparture.findUnique({
      where: { id: BigInt(departureId) },
      include: {
        tour: { include: { destination: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: ["pending_payment", "waiting_confirmation", "confirmed"],
            },
            ...(selectedBookingIds.length
              ? { id: { in: selectedBookingIds } }
              : {}),
          },
          include: {
            user: {
              select: { id: true, fullName: true, email: true, phone: true },
            },
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
            guideAssignments: { include: { guide: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!departure)
      throw new NotFoundException("Không tìm thấy lịch khởi hành.");

    const bookings = (departure.bookings || []).filter(
      (b: any) => b.userId && b.user?.email,
    );
    if (!bookings.length) {
      throw new BadRequestException(
        "Không có booking hợp lệ để gửi thông báo/email.",
      );
    }

    const message = this.buildBulkMessage(
      String(dto.type || "reminder"),
      departure,
      {
        title: dto.title,
        message: dto.message,
        content: dto.content,
      },
    );

    let notificationCount = 0;
    if (sendNotification) {
      await this.prisma.notification.createMany({
        data: bookings.map((b: any) => ({
          title: message.title,
          message: message.message,
          content: message.content,
          targetRole: "user",
          targetUserId: b.userId,
          isPublished: true,
          createdBy: adminId,
        })),
      });
      notificationCount = bookings.length;
    }

    let emailSuccess = 0;
    let emailFailed = 0;
    const emailErrors: Array<{
      bookingCode: string;
      email: string;
      error: string;
    }> = [];

    if (sendEmail) {
      const html = this.buildBulkEmailHtml(message);

      for (const booking of bookings) {
        const recipientEmail =
          booking.user?.email || booking.contactEmail || "";

        if (!recipientEmail) {
          emailFailed += 1;
          emailErrors.push({
            bookingCode: booking.bookingCode,
            email: "",
            error: "Booking không có email người nhận.",
          });
          continue;
        }

        try {
          await this.email.sendMail({
            to: recipientEmail,
            subject: message.title,
            html,
            text: message.content,
          });

          emailSuccess += 1;
        } catch (error: any) {
          emailFailed += 1;
          emailErrors.push({
            bookingCode: booking.bookingCode,
            email: recipientEmail,
            error: error?.message || "Không gửi được email",
          });
        }
      }
    }

    return {
      success: true,
      target: this.mapBulkTarget(departure),
      message,
      counts: {
        bookings: bookings.length,
        notificationCreated: notificationCount,
        emailSuccess,
        emailFailed,
      },
      emailErrors,
    };
  }
}
