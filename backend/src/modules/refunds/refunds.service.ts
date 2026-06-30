// @ts-nocheck
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { ReviewRefundDto } from "./dto/review-refund.dto";

const MIN_DAYS_BEFORE_DEPARTURE = 3;
const MAX_HOURS_AFTER_BOOKING = 48;

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

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAccountNo(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, "")
    .trim();
}

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  private formatCurrency(value: unknown) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  private formatDate(value: unknown) {
    if (!value) return "--";
    const date = new Date(value as any);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString("vi-VN");
  }

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
        "Chỉ có thể yêu cầu hoàn tiền cho booking đã thanh toán hoặc đã được xác nhận.",
      );
    }

    const createdAt = booking.createdAt ? new Date(booking.createdAt) : null;
    if (createdAt) {
      const hoursAfterBooking =
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursAfterBooking > MAX_HOURS_AFTER_BOOKING) {
        throw new BadRequestException(
          `Yêu cầu hoàn tiền chỉ được gửi trong vòng ${MAX_HOURS_AFTER_BOOKING} giờ sau khi đặt tour.`,
        );
      }
    }

    const latestPayment = [...(booking.payments || [])].sort(
      (a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime(),
    )[0];

    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();
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

    const departureDate = booking.departure?.departureDate
      ? new Date(booking.departure.departureDate)
      : null;

    if (!departureDate) {
      throw new BadRequestException(
        "Hệ thống chưa xác định được ngày khởi hành của booking này.",
      );
    }

    if (departureDate.getTime() <= now.getTime()) {
      throw new BadRequestException(
        "Tour đã qua ngày khởi hành nên hệ thống không hỗ trợ tạo yêu cầu hoàn tiền tự động.",
      );
    }

    const daysBeforeDeparture =
      (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (daysBeforeDeparture < MIN_DAYS_BEFORE_DEPARTURE) {
      throw new BadRequestException(
        `Không thể yêu cầu hoàn tiền khi còn dưới ${MIN_DAYS_BEFORE_DEPARTURE} ngày trước ngày khởi hành.`,
      );
    }
  }

  private validateRefundReceiver(dto: CreateRefundDto) {
    const refundBankName = normalizeText(dto.refundBankName);
    const refundAccountNo = normalizeAccountNo(dto.refundAccountNo);
    const refundAccountName = normalizeText(
      dto.refundAccountName,
    ).toUpperCase();
    const refundQrUrl = normalizeText(dto.refundQrUrl);

    if (!refundBankName) {
      throw new BadRequestException("Vui lòng nhập ngân hàng nhận hoàn tiền.");
    }

    if (!refundAccountNo) {
      throw new BadRequestException(
        "Vui lòng nhập số tài khoản nhận hoàn tiền.",
      );
    }

    if (!/^[0-9A-Za-z_.-]{4,50}$/.test(refundAccountNo)) {
      throw new BadRequestException(
        "Số tài khoản không hợp lệ. Vui lòng chỉ nhập số/chữ, không nhập khoảng trắng.",
      );
    }

    if (!refundAccountName) {
      throw new BadRequestException(
        "Vui lòng nhập tên chủ tài khoản nhận hoàn tiền.",
      );
    }

    return {
      refundBankName,
      refundAccountNo,
      refundAccountName,
      refundQrUrl: refundQrUrl || null,
    };
  }

  async create(userId: bigint, dto: CreateRefundDto) {
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
        status: { in: ["pending", "approved"] as any },
      },
    });

    if (existed) {
      throw new BadRequestException(
        "Booking này đã có yêu cầu hoàn tiền hoặc đã được duyệt hoàn tiền.",
      );
    }

    const receiver = this.validateRefundReceiver(dto);
    const finalAmount = Number(booking.finalAmount || 0);
    const requestedAmount = dto.refundAmount
      ? Math.min(Number(dto.refundAmount), finalAmount)
      : finalAmount;

    if (requestedAmount <= 0) {
      throw new BadRequestException("Số tiền hoàn không hợp lệ.");
    }

    const created = await this.prisma.refundRequest.create({
      data: {
        userId,
        bookingId,
        reason: normalizeText(dto.reason) || "Khách yêu cầu hoàn tiền",
        refundAmount: requestedAmount,
        refundBankName: receiver.refundBankName,
        refundAccountNo: receiver.refundAccountNo,
        refundAccountName: receiver.refundAccountName,
        refundQrUrl: receiver.refundQrUrl,
        status: "pending",
      },
      include: { booking: { include: { tour: true, departure: true } } },
    });

    await this.prisma.bookingStatusLog
      .create({
        data: {
          bookingId,
          actionType: "refund_requested",
          oldStatus: booking.bookingStatus,
          newStatus: booking.bookingStatus,
          changedByUserId: userId,
          source: "user",
          reason: normalizeText(dto.reason) || null,
          note: `Khách gửi yêu cầu hoàn tiền về ${receiver.refundBankName} - ${receiver.refundAccountNo} - ${receiver.refundAccountName}.`,
        },
      })
      .catch(() => null);

    return created;
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
    const sortBy = String(query.sortBy || "createdAt");
    const sortOrder =
      String(query.sortOrder || "desc") === "asc" ? "asc" : "desc";

    const where: any = {};
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { refundBankName: { contains: search } },
        { refundAccountNo: { contains: search } },
        { refundAccountName: { contains: search } },
        { booking: { bookingCode: { contains: search } } },
        { booking: { contactName: { contains: search } } },
        { booking: { contactEmail: { contains: search } } },
        { booking: { tour: { name: { contains: search } } } },
      ];
    }

    const orderBy: any =
      sortBy === "status"
        ? { status: sortOrder }
        : sortBy === "amount"
          ? { refundAmount: sortOrder }
          : { createdAt: sortOrder };

    const [total, items] = await Promise.all([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({
        where,
        include: {
          booking: { include: { tour: true, departure: true, payments: true } },
          user: true,
        },
        orderBy,
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

  async review(id: bigint, adminId: bigint, dto: ReviewRefundDto) {
    const req = await this.prisma.refundRequest.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            tour: true,
            departure: true,
            payments: { orderBy: { createdAt: "desc" } },
          },
        },
        user: true,
      },
    });

    if (!req) throw new BadRequestException("Không tìm thấy yêu cầu.");
    if (req.status !== "pending") {
      throw new BadRequestException("Yêu cầu này đã được xử lý.");
    }

    const status = dto.status === "approved" ? "approved" : "rejected";
    const adminNote = normalizeText(dto.adminNote);

    if (status === "rejected" && !adminNote) {
      throw new BadRequestException(
        "Vui lòng nhập lý do từ chối để gửi cho khách.",
      );
    }

    if (status === "approved") {
      if (
        !req.refundBankName ||
        !req.refundAccountNo ||
        !req.refundAccountName
      ) {
        throw new BadRequestException(
          "Yêu cầu này chưa có đủ thông tin tài khoản nhận hoàn tiền.",
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.refundRequest.update({
        where: { id },
        data: {
          status,
          adminNote: adminNote || null,
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
            paymentStatus: { in: ["paid", "waiting_confirmation"] as any },
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
            reason: adminNote || null,
            note: `Duyệt hoàn tiền ${this.formatCurrency(req.refundAmount || req.booking.finalAmount)} về ${req.refundBankName} - ${req.refundAccountNo} - ${req.refundAccountName}. Trả lại ${guest} slot.`,
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
            reason: adminNote || null,
            note: "Không duyệt yêu cầu hoàn tiền.",
          },
        });
      }

      return item;
    });

    await this.sendRefundReviewEmail(req, status, adminNote).catch(
      async (error) => {
        await this.prisma.bookingStatusLog
          .create({
            data: {
              bookingId: req.bookingId,
              actionType: "refund_email_failed",
              source: "system",
              reason: String(error?.message || error),
              note: "Không gửi được email phản hồi hoàn tiền.",
            },
          })
          .catch(() => null);
      },
    );

    return updated;
  }

  private async sendRefundReviewEmail(
    req: any,
    status: "approved" | "rejected",
    adminNote = "",
  ) {
    const to = req.user?.email || req.booking?.contactEmail;
    if (!to) return null;

    const isApproved = status === "approved";
    const subject = isApproved
      ? `Travela đã duyệt hoàn tiền đơn ${req.booking.bookingCode}`
      : `Travela phản hồi yêu cầu hoàn tiền đơn ${req.booking.bookingCode}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2>${isApproved ? "Yêu cầu hoàn tiền đã được duyệt" : "Yêu cầu hoàn tiền chưa được duyệt"}</h2>
        <p>Đơn hàng: <b>${escapeHtml(req.booking.bookingCode)}</b></p>
        <p>Tour: <b>${escapeHtml(req.booking.tour?.name || "")}</b></p>
        <p>Ngày khởi hành: <b>${escapeHtml(this.formatDate(req.booking.departure?.departureDate))}</b></p>
        <p>Số tiền hoàn: <b>${escapeHtml(this.formatCurrency(req.refundAmount || req.booking.finalAmount))}</b></p>
        <p>Lý do của bạn: ${escapeHtml(req.reason)}</p>
        ${
          isApproved
            ? `
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:16px 0">
            <p style="margin:0 0 8px"><b>Thông tin tài khoản nhận hoàn tiền</b></p>
            <p style="margin:4px 0">Ngân hàng: ${escapeHtml(req.refundBankName || "")}</p>
            <p style="margin:4px 0">Số tài khoản: ${escapeHtml(req.refundAccountNo || "")}</p>
            <p style="margin:4px 0">Chủ tài khoản: ${escapeHtml(req.refundAccountName || "")}</p>
          </div>
        `
            : ""
        }
        <p>Phản hồi từ admin: ${escapeHtml(
          adminNote ||
            (isApproved
              ? "Travela sẽ xử lý hoàn tiền theo chính sách."
              : "Yêu cầu chưa đủ điều kiện hoàn tiền."),
        )}</p>
        <p style="color:#64748b;font-size:13px">Email này được gửi tự động từ hệ thống Travela.</p>
      </div>
    `;

    return this.email.sendMail({ to, subject, html });
  }
}
