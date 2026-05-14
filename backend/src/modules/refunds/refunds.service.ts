// @ts-nocheck
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";

const REFUND_REQUEST_WINDOW_HOURS = 48;
const MIN_DAYS_BEFORE_DEPARTURE = 3;

function escapeHtml(value = "") {
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
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private assertRefundAllowed(booking: any) {
    const now = new Date();
    const bookingStatus = String(booking?.bookingStatus || "").toLowerCase();

    if (!booking) {
      throw new BadRequestException("Không tìm thấy booking của bạn.");
    }

    if (
      ["cancelled", "canceled", "expired", "completed", "refunded"].includes(
        bookingStatus,
      )
    ) {
      throw new BadRequestException(
        "Booking này không còn đủ điều kiện gửi yêu cầu hoàn tiền.",
      );
    }

    if (!["confirmed", "waiting_confirmation"].includes(bookingStatus)) {
      throw new BadRequestException(
        "Chỉ có thể yêu cầu hoàn tiền cho booking đã xác nhận hoặc đã thanh toán.",
      );
    }

    const latestPayment = [...(booking.payments || [])].sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    )[0];
    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();

    // waiting_confirmation có thể là chuyển khoản đang chờ admin đối soát.
    // Còn nếu booking confirmed thì xem như đã đủ điều kiện nghiệp vụ để gửi yêu cầu.
    const hasPaidSignal =
      bookingStatus === "confirmed" ||
      ["paid", "success", "completed", "waiting_confirmation"].includes(
        paymentStatus,
      );

    if (!hasPaidSignal) {
      throw new BadRequestException(
        "Chỉ có thể yêu cầu hoàn tiền sau khi đã thanh toán hoặc booking đã được xác nhận.",
      );
    }

    const createdAt = new Date(booking.createdAt);
    const hoursSinceBooking =
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceBooking > REFUND_REQUEST_WINDOW_HOURS) {
      throw new BadRequestException(
        `Chỉ có thể gửi yêu cầu hoàn tiền trong vòng ${REFUND_REQUEST_WINDOW_HOURS} giờ sau khi đặt tour.`,
      );
    }

    const departureDate = booking.departure?.departureDate
      ? new Date(booking.departure.departureDate)
      : null;

    if (departureDate) {
      const daysBeforeDeparture =
        (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (daysBeforeDeparture < MIN_DAYS_BEFORE_DEPARTURE) {
        throw new BadRequestException(
          `Không thể yêu cầu hoàn tiền khi còn dưới ${MIN_DAYS_BEFORE_DEPARTURE} ngày trước ngày khởi hành.`,
        );
      }
    }
  }

  async create(userId: bigint, dto: any) {
    const bookingId = BigInt(dto.bookingId);
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        tour: true,
        departure: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!booking) {
      throw new BadRequestException("Không tìm thấy booking của bạn.");
    }

    this.assertRefundAllowed(booking);

    const existed = await this.prisma.refundRequest.findFirst({
      where: {
        bookingId,
        status: { in: ["pending", "approved"] },
      },
    });

    if (existed) {
      throw new BadRequestException(
        "Booking này đã có yêu cầu hoàn tiền hoặc đã được duyệt hoàn tiền.",
      );
    }

    const finalAmount = Number(booking.finalAmount || 0);
    const requestedAmount = dto.refundAmount
      ? Math.min(Number(dto.refundAmount), finalAmount)
      : finalAmount;

    if (requestedAmount <= 0) {
      throw new BadRequestException("Số tiền hoàn không hợp lệ.");
    }

    return this.prisma.refundRequest.create({
      data: {
        userId,
        bookingId,
        reason: dto.reason?.trim() || "Khách yêu cầu hoàn tiền",
        refundAmount: requestedAmount,
        status: "pending",
      },
      include: { booking: { include: { tour: true, departure: true } } },
    });
  }

  mine(userId: bigint) {
    return this.prisma.refundRequest.findMany({
      where: { userId },
      include: { booking: { include: { tour: true, departure: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async list(query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { booking: { bookingCode: { contains: search } } },
        { booking: { contactName: { contains: search } } },
        { booking: { contactEmail: { contains: search } } },
        { booking: { tour: { name: { contains: search } } } },
      ];
    }
    const [total, items] = await Promise.all([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({
        where,
        include: {
          booking: { include: { tour: true, departure: true, payments: true } },
          user: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
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

  async review(id: bigint, adminId: bigint, dto: any) {
    const req = await this.prisma.refundRequest.findUnique({
      where: { id },
      include: {
        booking: { include: { tour: true, departure: true } },
        user: true,
      },
    });
    if (!req) throw new BadRequestException("Không tìm thấy yêu cầu.");
    if (req.status !== "pending")
      throw new BadRequestException("Yêu cầu này đã được xử lý.");
    const status = dto.status === "approved" ? "approved" : "rejected";
    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.refundRequest.update({
        where: { id },
        data: {
          status,
          adminNote: dto.adminNote || null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });
      if (status === "approved") {
        const guest =
          Number(req.booking.adultCount || 0) +
          Number(req.booking.childCount || 0);
        const oldStatus = String(req.booking.bookingStatus || "");

        await tx.booking.update({
          where: { id: req.bookingId },
          data: { bookingStatus: "cancelled" },
        });

        const slotField = ["confirmed", "completed"].includes(oldStatus)
          ? "bookedSlots"
          : "heldSlots";

        await tx.tourDeparture
          .update({
            where: { id: req.booking.departureId },
            data: { [slotField]: { decrement: guest } },
          })
          .catch(() => null);

        await tx.payment.updateMany({
          where: {
            bookingId: req.bookingId,
            paymentStatus: { in: ["paid", "waiting_confirmation"] },
          },
          data: { paymentStatus: "refunded" },
        });

        await tx.bookingStatusLog.create({
          data: {
            bookingId: req.bookingId,
            actionType: "refund_approved",
            oldStatus: req.booking.bookingStatus,
            newStatus: "cancelled",
            changedByUserId: adminId,
            source: "admin",
            reason: dto.adminNote || null,
            note: `Duyệt hoàn tiền và trả lại ${guest} slot.`,
          },
        });
      } else {
        await tx.bookingStatusLog.create({
          data: {
            bookingId: req.bookingId,
            actionType: "refund_rejected",
            oldStatus: req.booking.bookingStatus,
            newStatus: req.booking.bookingStatus,
            changedByUserId: adminId,
            source: "admin",
            reason: dto.adminNote || null,
            note: "Không duyệt yêu cầu hoàn tiền.",
          },
        });
      }
      return item;
    });

    const to = req.user?.email || req.booking.contactEmail;
    if (to) {
      try {
        await this.email.sendMail({
          to,
          subject:
            status === "approved"
              ? `Travela đã duyệt hoàn tiền đơn ${req.booking.bookingCode}`
              : `Travela phản hồi yêu cầu hoàn tiền đơn ${req.booking.bookingCode}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>${status === "approved" ? "Yêu cầu hoàn tiền đã được duyệt" : "Yêu cầu hoàn tiền chưa được duyệt"}</h2><p>Đơn hàng: <b>${escapeHtml(req.booking.bookingCode)}</b></p><p>Tour: <b>${escapeHtml(req.booking.tour?.name || "")}</b></p><p>Lý do của bạn: ${escapeHtml(req.reason)}</p><p>Phản hồi từ admin: ${escapeHtml(dto.adminNote || (status === "approved" ? "Travela sẽ xử lý hoàn tiền theo chính sách." : "Yêu cầu chưa đủ điều kiện hoàn tiền."))}</p></div>`,
        });
      } catch (error) {
        await this.prisma.bookingStatusLog
          .create({
            data: {
              bookingId: req.bookingId,
              actionType: "refund_email_failed",
              source: "system",
              reason: String(error?.message || error),
              note: `Không gửi được email phản hồi hoàn tiền đến ${to}`,
            },
          })
          .catch(() => null);
      }
    }
    return updated;
  }
}
