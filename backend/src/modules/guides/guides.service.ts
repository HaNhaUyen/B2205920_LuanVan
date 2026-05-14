// @ts-nocheck
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";

function htmlEscape(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[s],
  );
}

@Injectable()
export class GuidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async list(query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();
    const where: any = {};

    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { identityNumber: { contains: search } },
        { languages: { contains: search } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.guide.count({ where }),
      this.prisma.guide.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          assignments: {
            where: { status: { in: ["assigned", "confirmed"] } },
            include: { booking: true, tour: true },
            orderBy: { startDate: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
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

  create(dto: any) {
    return this.prisma.guide.create({
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email || null,
        identityNumber: dto.identityNumber || null,
        languages: dto.languages || null,
        experienceYears: Number(dto.experienceYears || 0),
        status: dto.status || "active",
        note: dto.note || null,
      },
    });
  }

  update(id: bigint, dto: any) {
    return this.prisma.guide.update({
      where: { id },
      data: {
        ...dto,
        experienceYears:
          dto.experienceYears == null ? undefined : Number(dto.experienceYears),
      },
    });
  }

  async toggleLock(id: bigint) {
    const guide = await this.prisma.guide.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!guide) {
      throw new NotFoundException("Không tìm thấy hướng dẫn viên.");
    }

    const nextStatus = guide.status === "locked" ? "active" : "locked";

    return this.prisma.guide.update({
      where: { id },
      data: {
        status: nextStatus,
      },
    });
  }

  async remove(id: bigint) {
    const guide = await this.prisma.guide.findUnique({
      where: { id },
      include: { _count: { select: { assignments: true } } },
    });
    if (!guide) throw new NotFoundException("Guide not found");
    if (guide._count.assignments > 0) {
      return this.prisma.guide.update({
        where: { id },
        data: { status: "locked" },
      });
    }
    await this.prisma.guide.delete({ where: { id } });
    return { success: true };
  }

  calendar(id: bigint) {
    return this.prisma.guideAssignment.findMany({
      where: { guideId: id, status: { in: ["assigned", "confirmed"] } },
      include: { booking: true, tour: true, guide: true },
      orderBy: { startDate: "asc" },
    });
  }

  async allCalendar(month?: string) {
    const where: any = { status: { in: ["assigned", "confirmed"] } };
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0);
      where.NOT = [{ endDate: { lt: start } }, { startDate: { gt: end } }];
    }
    return this.prisma.guideAssignment.findMany({
      where,
      include: { guide: true, booking: true, tour: true },
      orderBy: { startDate: "asc" },
    });
  }

  async available(startDate: string, endDate: string) {
    if (!startDate || !endDate)
      return this.prisma.guide.findMany({
        where: { status: "active" },
        orderBy: { fullName: "asc" },
      });
    const start = new Date(startDate);
    const end = new Date(endDate);
    const busy = await this.prisma.guideAssignment.findMany({
      where: {
        status: { in: ["assigned", "confirmed"] },
        NOT: [{ endDate: { lt: start } }, { startDate: { gt: end } }],
      },
      select: { guideId: true },
    });
    return this.prisma.guide.findMany({
      where: { status: "active", id: { notIn: busy.map((x) => x.guideId) } },
      orderBy: { fullName: "asc" },
    });
  }

  async assign(dto: any) {
    const bookingId = BigInt(dto.bookingId);
    const guideId = BigInt(dto.guideId);
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        departure: true,
        tour: true,
        user: true,
        guideAssignments: {
          include: { guide: true },
          where: { status: { in: ["assigned", "confirmed"] } },
        },
      },
    });
    if (!booking) throw new BadRequestException("Không tìm thấy booking.");
    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
    });
    if (!guide || guide.status !== "active")
      throw new BadRequestException("Hướng dẫn viên không khả dụng.");
    const overlap = await this.prisma.guideAssignment.findFirst({
      where: {
        guideId,
        status: { in: ["assigned", "confirmed"] },
        bookingId: { not: booking.id },
        NOT: [
          { endDate: { lt: booking.departure.departureDate } },
          { startDate: { gt: booking.departure.endDate } },
        ],
      },
      include: { booking: true, tour: true },
    });
    if (overlap)
      throw new BadRequestException(
        `Hướng dẫn viên đã bận tour ${overlap.tour?.name || ""} trong thời gian này.`,
      );

    const previousGuide = booking.guideAssignments[0]?.guide;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.guideAssignment.updateMany({
        where: {
          bookingId: booking.id,
          status: { in: ["assigned", "confirmed"] },
        },
        data: { status: "replaced", note: dto.note || "Đã đổi hướng dẫn viên" },
      });
      const assignment = await tx.guideAssignment.create({
        data: {
          guideId,
          bookingId: booking.id,
          tourId: booking.tourId,
          startDate: booking.departure.departureDate,
          endDate: booking.departure.endDate,
          status: "assigned",
          note: dto.note || null,
        },
        include: { guide: true, booking: true, tour: true },
      });
      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: previousGuide ? "change_guide" : "assign_guide",
          oldStatus: previousGuide?.fullName || null,
          newStatus: guide.fullName,
          source: "admin",
          reason: dto.note || null,
          note: previousGuide
            ? `Đổi HDV từ ${previousGuide.fullName} sang ${guide.fullName}`
            : `Chỉ định HDV ${guide.fullName}`,
        },
      });
      return assignment;
    });

    const customerEmail = booking.user?.email || booking.contactEmail;
    if (customerEmail) {
      try {
        await this.email.sendMail({
          to: customerEmail,
          subject: previousGuide
            ? `Travela cập nhật hướng dẫn viên cho đơn ${booking.bookingCode}`
            : `Travela đã chỉ định hướng dẫn viên cho đơn ${booking.bookingCode}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Thông báo hướng dẫn viên</h2><p>Xin chào ${htmlEscape(booking.contactName)},</p><p>Đơn <b>${htmlEscape(booking.bookingCode)}</b> - tour <b>${htmlEscape(booking.tour.name)}</b> đã được ${previousGuide ? "cập nhật" : "chỉ định"} hướng dẫn viên.</p><ul><li>Hướng dẫn viên: <b>${htmlEscape(guide.fullName)}</b></li><li>Số điện thoại HDV: ${htmlEscape(guide.phone)}</li><li>Thời gian tour: ${new Date(booking.departure.departureDate).toLocaleDateString("vi-VN")} - ${new Date(booking.departure.endDate).toLocaleDateString("vi-VN")}</li></ul>${dto.note ? `<p>Ghi chú: ${htmlEscape(dto.note)}</p>` : ""}<p>Travela chúc quý khách có chuyến đi vui vẻ.</p></div>`,
        });
      } catch (error) {
        await this.prisma.bookingStatusLog
          .create({
            data: {
              bookingId: booking.id,
              actionType: "guide_email_failed",
              source: "system",
              reason: String(error?.message || error),
              note: `Không gửi được email thông báo HDV đến ${customerEmail}`,
            },
          })
          .catch(() => null);
      }
    }

    return created;
  }
}
