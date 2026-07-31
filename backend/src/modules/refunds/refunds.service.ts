// @ts-nocheck
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";
import { CreateRefundDto } from "./dto/create-refund.dto";
import { ReviewRefundDto } from "./dto/review-refund.dto";

const BUSINESS_TIME_ZONE = "Asia/Ho_Chi_Minh";
const HOURS_24 = 24;
const DAYS_3 = 3;
const DAYS_7 = 7;

type RefundPolicyPreview = {
  eligible: boolean;
  blockedReason: string | null;
  message: string;
  policyCode: string;
  policyLabel: string;
  refundRate: number;
  refundAmount: number;
  paidAmount: number;
  paidAt: Date | null;
  departureDate: Date;
  hoursAfterPayment: number;
  hoursBeforeDeparture: number;
  daysBeforeDeparture: number;
  holidayName: string | null;
  nextBusinessDate: string | null;
};

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

  private getLocalDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    }).formatToParts(date);

    const get = (type: string) =>
      parts.find((item) => item.type === type)?.value || "";

    return {
      dateKey: `${get("year")}-${get("month")}-${get("day")}`,
      weekday: get("weekday"),
    };
  }

  private isWeekend(date: Date) {
    const weekday = this.getLocalDateParts(date).weekday;
    return weekday === "Sat" || weekday === "Sun";
  }

  private async findHoliday(date: Date) {
    const { dateKey } = this.getLocalDateParts(date);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
        SELECT id, holiday_date AS holidayDate, holiday_name AS holidayName
        FROM system_holidays
        WHERE holiday_date = ?
          AND status = 'active'
        LIMIT 1
      `,
      dateKey,
    );

    return rows?.[0] || null;
  }

  private async findNextBusinessDate(from: Date) {
    const cursor = new Date(from);

    for (let offset = 1; offset <= 20; offset += 1) {
      cursor.setDate(cursor.getDate() + 1);

      if (this.isWeekend(cursor)) continue;

      const holiday = await this.findHoliday(cursor);
      if (!holiday) return this.getLocalDateParts(cursor).dateKey;
    }

    return null;
  }

  private getLatestPaidPayment(booking: any) {
    const payments = Array.isArray(booking?.payments)
      ? [...booking.payments]
      : [];

    return (
      payments
        .filter((item: any) =>
          ["paid", "waiting_confirmation"].includes(
            String(item?.paymentStatus || "").toLowerCase(),
          ),
        )
        .sort(
          (first: any, second: any) =>
            new Date(
              second.paidAt || second.updatedAt || second.createdAt || 0,
            ).getTime() -
            new Date(
              first.paidAt || first.updatedAt || first.createdAt || 0,
            ).getTime(),
        )[0] || null
    );
  }

  /**
   * Thứ tự ưu tiên chính sách:
   * 1. Cuối tuần/ngày lễ: không tiếp nhận yêu cầu.
   * 2. Trong 24 giờ trước khởi hành hoặc đã khởi hành: không hoàn.
   * 3. Trong 24 giờ kể từ lúc thanh toán: hoàn 70%.
   * 4. Còn từ 7 ngày: hoàn 50%.
   * 5. Còn từ 3 đến dưới 7 ngày: hoàn 30%.
   * 6. Còn dưới 3 ngày: không hoàn.
   */
  private async calculateRefundPolicy(
    booking: any,
    now = new Date(),
  ): Promise<RefundPolicyPreview> {
    if (!booking) {
      throw new BadRequestException("Không tìm thấy booking của bạn.");
    }

    const bookingStatus = String(booking.bookingStatus || "").toLowerCase();

    if (
      ["cancelled", "canceled", "expired", "completed", "refunded"].includes(
        bookingStatus,
      )
    ) {
      throw new BadRequestException(
        "Booking này không còn đủ điều kiện gửi yêu cầu hủy vé.",
      );
    }

    if (!["confirmed", "waiting_confirmation"].includes(bookingStatus)) {
      throw new BadRequestException(
        "Chỉ có thể hủy vé đối với booking đã thanh toán hoặc đã được xác nhận.",
      );
    }

    const latestPayment = this.getLatestPaidPayment(booking);
    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();

    if (
      bookingStatus !== "confirmed" &&
      !["paid", "waiting_confirmation"].includes(paymentStatus)
    ) {
      throw new BadRequestException(
        "Booking chưa có tín hiệu thanh toán hợp lệ để yêu cầu hủy vé.",
      );
    }

    const departureDate = booking.departure?.departureDate
      ? new Date(booking.departure.departureDate)
      : null;

    if (!departureDate || Number.isNaN(departureDate.getTime())) {
      throw new BadRequestException(
        "Hệ thống chưa xác định được ngày khởi hành của booking.",
      );
    }

    const paidAtSource =
      latestPayment?.paidAt ||
      latestPayment?.updatedAt ||
      latestPayment?.createdAt ||
      booking.createdAt;

    const paidAt = paidAtSource ? new Date(paidAtSource) : null;
    const hoursAfterPayment =
      paidAt && !Number.isNaN(paidAt.getTime())
        ? Math.max(0, (now.getTime() - paidAt.getTime()) / (60 * 60 * 1000))
        : Number.POSITIVE_INFINITY;

    const hoursBeforeDeparture =
      (departureDate.getTime() - now.getTime()) / (60 * 60 * 1000);
    const daysBeforeDeparture = hoursBeforeDeparture / 24;
    const paidAmount = Number(
      booking.finalAmount || latestPayment?.amount || 0,
    );

    if (paidAmount <= 0) {
      throw new BadRequestException(
        "Giá trị thanh toán của booking không hợp lệ.",
      );
    }

    if (this.isWeekend(now)) {
      const nextBusinessDate = await this.findNextBusinessDate(now);

      return {
        eligible: false,
        blockedReason: "WEEKEND",
        message:
          "Travela không tiếp nhận yêu cầu hủy tour vào thứ Bảy hoặc Chủ nhật." +
          (nextBusinessDate
            ? ` Vui lòng gửi lại vào ngày làm việc ${nextBusinessDate}.`
            : " Vui lòng gửi lại vào ngày làm việc tiếp theo."),
        policyCode: "BLOCKED_WEEKEND",
        policyLabel: "Không tiếp nhận yêu cầu vào cuối tuần",
        refundRate: 0,
        refundAmount: 0,
        paidAmount,
        paidAt,
        departureDate,
        hoursAfterPayment,
        hoursBeforeDeparture,
        daysBeforeDeparture,
        holidayName: null,
        nextBusinessDate,
      };
    }

    const holiday = await this.findHoliday(now);

    if (holiday) {
      const nextBusinessDate = await this.findNextBusinessDate(now);

      return {
        eligible: false,
        blockedReason: "HOLIDAY",
        message:
          `Hôm nay là ngày nghỉ lễ ${holiday.holidayName}. ` +
          "Travela chưa tiếp nhận yêu cầu hủy tour." +
          (nextBusinessDate
            ? ` Vui lòng gửi lại vào ngày làm việc ${nextBusinessDate}.`
            : " Vui lòng gửi lại vào ngày làm việc tiếp theo."),
        policyCode: "BLOCKED_HOLIDAY",
        policyLabel: `Không tiếp nhận trong ngày lễ ${holiday.holidayName}`,
        refundRate: 0,
        refundAmount: 0,
        paidAmount,
        paidAt,
        departureDate,
        hoursAfterPayment,
        hoursBeforeDeparture,
        daysBeforeDeparture,
        holidayName: holiday.holidayName,
        nextBusinessDate,
      };
    }

    let refundRate = 0;
    let policyCode = "NO_REFUND";
    let policyLabel = "Không đủ điều kiện hoàn tiền";

    if (hoursBeforeDeparture <= HOURS_24) {
      refundRate = 0;
      policyCode = "NO_REFUND_WITHIN_24H_DEPARTURE";
      policyLabel =
        "Không hoàn tiền trong vòng 24 giờ trước khởi hành hoặc sau khi tour đã khởi hành";
    } else if (hoursAfterPayment <= HOURS_24) {
      refundRate = 70;
      policyCode = "WITHIN_24H_AFTER_PAYMENT";
      policyLabel = "Hủy trong vòng 24 giờ kể từ lúc thanh toán: hoàn 70%";
    } else if (daysBeforeDeparture >= DAYS_7) {
      refundRate = 50;
      policyCode = "AT_LEAST_7_DAYS";
      policyLabel =
        "Hủy sau 24 giờ thanh toán và còn ít nhất 7 ngày trước khởi hành: hoàn 50%";
    } else if (daysBeforeDeparture >= DAYS_3) {
      refundRate = 30;
      policyCode = "FROM_3_TO_UNDER_7_DAYS";
      policyLabel =
        "Hủy còn từ 3 ngày đến dưới 7 ngày trước khởi hành: hoàn 30%";
    } else {
      refundRate = 0;
      policyCode = "NO_REFUND_UNDER_3_DAYS";
      policyLabel = "Còn dưới 3 ngày trước khởi hành: không hoàn tiền";
    }

    const refundAmount = Math.round(paidAmount * (refundRate / 100));

    return {
      eligible: refundRate > 0,
      blockedReason: refundRate > 0 ? null : policyCode,
      message:
        refundRate > 0
          ? `Booking đủ điều kiện hủy vé. ${policyLabel}.`
          : policyLabel,
      policyCode,
      policyLabel,
      refundRate,
      refundAmount,
      paidAmount,
      paidAt,
      departureDate,
      hoursAfterPayment,
      hoursBeforeDeparture,
      daysBeforeDeparture,
      holidayName: null,
      nextBusinessDate: null,
    };
  }

  private async loadPolicyMetadata(ids: Array<bigint | number | string>) {
    if (!ids.length) return new Map<string, any>();

    const placeholders = ids.map(() => "?").join(",");
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
        SELECT
          id,
          refund_rate AS refundRate,
          policy_code AS policyCode,
          policy_label AS policyLabel,
          days_before_departure AS daysBeforeDeparture,
          hours_after_payment AS hoursAfterPayment,
          refunded_at AS refundedAt
        FROM refund_requests
        WHERE id IN (${placeholders})
      `,
      ...ids.map(String),
    );

    return new Map(
      rows.map((item) => [
        String(item.id),
        {
          refundRate: Number(item.refundRate || 0),
          policyCode: item.policyCode || null,
          policyLabel: item.policyLabel || null,
          daysBeforeDeparture:
            item.daysBeforeDeparture === null
              ? null
              : Number(item.daysBeforeDeparture),
          hoursAfterPayment:
            item.hoursAfterPayment === null
              ? null
              : Number(item.hoursAfterPayment),
          refundedAt: item.refundedAt || null,
        },
      ]),
    );
  }

  /**
   * Doanh thu thuần dùng cho dashboard.
   *
   * Giao dịch đã hoàn vẫn được tính vào doanh thu gộp của tháng thanh toán,
   * sau đó khoản hoàn được trừ tại tháng admin xác nhận đã chuyển tiền.
   */
  async revenueSummary(months = 6) {
    const safeMonths = Math.min(Math.max(Number(months || 6), 1), 24);
    const now = new Date();
    const startCurrentMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const startNextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );
    const startPreviousMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
      0,
      0,
      0,
      0,
    );

    const [currentRows, previousRows, seriesRows, totalRows] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<any[]>(
          `
            SELECT
              COALESCE((
                SELECT SUM(amount)
                FROM payments
                WHERE payment_status IN ('paid', 'refunded')
                  AND paid_at >= ?
                  AND paid_at < ?
              ), 0) AS grossRevenue,
              COALESCE((
                SELECT SUM(amount)
                FROM revenue_adjustments
                WHERE adjustment_type = 'refund'
                  AND occurred_at >= ?
                  AND occurred_at < ?
              ), 0) AS refundAmount
          `,
          startCurrentMonth,
          startNextMonth,
          startCurrentMonth,
          startNextMonth,
        ),
        this.prisma.$queryRawUnsafe<any[]>(
          `
            SELECT
              COALESCE((
                SELECT SUM(amount)
                FROM payments
                WHERE payment_status IN ('paid', 'refunded')
                  AND paid_at >= ?
                  AND paid_at < ?
              ), 0) AS grossRevenue,
              COALESCE((
                SELECT SUM(amount)
                FROM revenue_adjustments
                WHERE adjustment_type = 'refund'
                  AND occurred_at >= ?
                  AND occurred_at < ?
              ), 0) AS refundAmount
          `,
          startPreviousMonth,
          startCurrentMonth,
          startPreviousMonth,
          startCurrentMonth,
        ),
        this.prisma.$queryRawUnsafe<any[]>(
          `
            SELECT
              months.monthKey,
              COALESCE(gross.grossRevenue, 0) AS grossRevenue,
              COALESCE(refunds.refundAmount, 0) AS refundAmount,
              COALESCE(gross.grossRevenue, 0)
                - COALESCE(refunds.refundAmount, 0) AS netRevenue
            FROM (
              SELECT DATE_FORMAT(paid_at, '%Y-%m') AS monthKey
              FROM payments
              WHERE payment_status IN ('paid', 'refunded')
                AND paid_at IS NOT NULL
              UNION
              SELECT DATE_FORMAT(occurred_at, '%Y-%m') AS monthKey
              FROM revenue_adjustments
              WHERE adjustment_type = 'refund'
            ) months
            LEFT JOIN (
              SELECT
                DATE_FORMAT(paid_at, '%Y-%m') AS monthKey,
                SUM(amount) AS grossRevenue
              FROM payments
              WHERE payment_status IN ('paid', 'refunded')
                AND paid_at IS NOT NULL
              GROUP BY DATE_FORMAT(paid_at, '%Y-%m')
            ) gross ON gross.monthKey = months.monthKey
            LEFT JOIN (
              SELECT
                DATE_FORMAT(occurred_at, '%Y-%m') AS monthKey,
                SUM(amount) AS refundAmount
              FROM revenue_adjustments
              WHERE adjustment_type = 'refund'
              GROUP BY DATE_FORMAT(occurred_at, '%Y-%m')
            ) refunds ON refunds.monthKey = months.monthKey
            ORDER BY months.monthKey DESC
            LIMIT ?
          `,
          safeMonths,
        ),
        this.prisma.$queryRawUnsafe<any[]>(
          `
            SELECT
              COALESCE((
                SELECT SUM(amount)
                FROM payments
                WHERE payment_status IN ('paid', 'refunded')
                  AND paid_at IS NOT NULL
              ), 0) AS grossRevenue,
              COALESCE((
                SELECT SUM(amount)
                FROM revenue_adjustments
                WHERE adjustment_type = 'refund'
              ), 0) AS refundAmount
          `,
        ),
      ]);

    const currentGross = Number(currentRows?.[0]?.grossRevenue || 0);
    const currentRefund = Number(currentRows?.[0]?.refundAmount || 0);
    const currentNet = currentGross - currentRefund;

    const previousGross = Number(previousRows?.[0]?.grossRevenue || 0);
    const previousRefund = Number(previousRows?.[0]?.refundAmount || 0);
    const previousNet = previousGross - previousRefund;

    const growthRate =
      previousNet > 0
        ? ((currentNet - previousNet) / previousNet) * 100
        : currentNet > 0
          ? 100
          : 0;

    const totalGross = Number(totalRows?.[0]?.grossRevenue || 0);
    const totalRefund = Number(totalRows?.[0]?.refundAmount || 0);

    return {
      summary: {
        grossRevenue: currentGross,
        refundAmount: currentRefund,
        netRevenue: currentNet,
        previousMonthNetRevenue: previousNet,
        growthRate: Number(growthRate.toFixed(2)),
        totalGrossRevenue: totalGross,
        totalRefundAmount: totalRefund,
        totalNetRevenue: totalGross - totalRefund,
      },
      monthlyRevenue: [...(seriesRows || [])].reverse().map((row: any) => ({
        month: String(row.monthKey || ""),
        grossRevenue: Number(row.grossRevenue || 0),
        refundAmount: Number(row.refundAmount || 0),
        revenue: Number(row.netRevenue || 0),
        netRevenue: Number(row.netRevenue || 0),
        isCurrentMonth:
          String(row.monthKey || "") ===
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      })),
    };
  }

  async preview(userId: bigint, bookingIdInput: string | number | bigint) {
    const bookingId = BigInt(bookingIdInput);

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, userId },
      include: {
        tour: true,
        departure: true,
        payments: { orderBy: { createdAt: "desc" } },
        refundRequests: {
          where: { status: { in: ["pending", "approved"] as any } },
          take: 1,
        },
      },
    });

    if (!booking) {
      throw new BadRequestException("Không tìm thấy booking của bạn.");
    }

    if (booking.refundRequests?.length) {
      return {
        eligible: false,
        blockedReason: "EXISTING_REQUEST",
        message:
          "Booking đã có yêu cầu hủy vé/hoàn tiền đang xử lý hoặc đã được xác nhận.",
        bookingId: booking.id.toString(),
        bookingCode: booking.bookingCode,
      };
    }

    const policy = await this.calculateRefundPolicy(booking);

    return {
      ...policy,
      bookingId: booking.id.toString(),
      bookingCode: booking.bookingCode,
      tourName: booking.tour?.name || "",
      departureDate: policy.departureDate,
      paidAt: policy.paidAt,
    };
  }

  private async assertRefundAllowed(booking: any) {
    const policy = await this.calculateRefundPolicy(booking);

    if (!policy.eligible) {
      throw new BadRequestException(policy.message);
    }

    return policy;
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

    const policy = await this.assertRefundAllowed(booking);

    const existed = await this.prisma.refundRequest.findFirst({
      where: {
        bookingId,
        status: { in: ["pending", "approved"] as any },
      },
    });

    if (existed) {
      throw new BadRequestException(
        "Booking này đã có yêu cầu hủy vé hoặc đã được xác nhận hoàn tiền.",
      );
    }

    const receiver = this.validateRefundReceiver(dto);

    /*
     * Không nhận refundAmount từ frontend.
     * Backend luôn tính số tiền theo chính sách để chống sửa request.
     */
    const created = await this.prisma.refundRequest.create({
      data: {
        userId,
        bookingId,
        reason: normalizeText(dto.reason) || "Khách yêu cầu hủy vé",
        refundAmount: policy.refundAmount,
        refundBankName: receiver.refundBankName,
        refundAccountNo: receiver.refundAccountNo,
        refundAccountName: receiver.refundAccountName,
        refundQrUrl: receiver.refundQrUrl,
        status: "pending",
      },
      include: {
        booking: {
          include: {
            tour: true,
            departure: true,
          },
        },
      },
    });

    await this.prisma.$executeRawUnsafe(
      `
        UPDATE refund_requests
        SET
          refund_rate = ?,
          policy_code = ?,
          policy_label = ?,
          days_before_departure = ?,
          hours_after_payment = ?
        WHERE id = ?
      `,
      policy.refundRate,
      policy.policyCode,
      policy.policyLabel,
      Number(policy.daysBeforeDeparture.toFixed(4)),
      Number(policy.hoursAfterPayment.toFixed(4)),
      created.id.toString(),
    );

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
          note:
            `Khách gửi yêu cầu hủy vé. Chính sách: ${policy.policyLabel}. ` +
            `Tỷ lệ hoàn ${policy.refundRate}%, số tiền ${this.formatCurrency(
              policy.refundAmount,
            )}. Nhận về ${receiver.refundBankName} - ` +
            `${receiver.refundAccountNo} - ${receiver.refundAccountName}.`,
        },
      })
      .catch(() => null);

    return {
      ...created,
      refundRate: policy.refundRate,
      policyCode: policy.policyCode,
      policyLabel: policy.policyLabel,
      daysBeforeDeparture: policy.daysBeforeDeparture,
      hoursAfterPayment: policy.hoursAfterPayment,
      refundedAt: null,
    };
  }

  async mine(userId: bigint) {
    const items = await this.prisma.refundRequest.findMany({
      where: { userId },
      include: {
        booking: {
          include: {
            tour: true,
            departure: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const metadata = await this.loadPolicyMetadata(
      items.map((item) => item.id),
    );

    return items.map((item) => ({
      ...item,
      ...(metadata.get(String(item.id)) || {}),
    }));
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

    const metadata = await this.loadPolicyMetadata(
      items.map((item) => item.id),
    );

    return {
      items: items.map((item) => ({
        ...item,
        ...(metadata.get(String(item.id)) || {}),
      })),
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

        const departure = await tx.tourDeparture.findUnique({
          where: { id: req.booking.departureId },
        });

        if (departure) {
          const currentSlots = Number(
            slotField === "bookedSlots"
              ? departure.bookedSlots
              : departure.heldSlots,
          );

          await tx.tourDeparture.update({
            where: { id: req.booking.departureId },
            data: {
              [slotField]: Math.max(0, currentSlots - guest),
            },
          });
        }

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

    if (status === "approved") {
      const refundedAt = new Date();

      await this.prisma.$executeRawUnsafe(
        `
          UPDATE refund_requests
          SET refunded_at = ?
          WHERE id = ?
        `,
        refundedAt,
        id.toString(),
      );

      /*
       * Bảng revenue_adjustments ghi nhận khoản hoàn theo đúng tháng admin
       * xác nhận đã chuyển tiền. Dashboard lấy doanh thu thuần:
       * gross revenue - refund adjustments.
       */
      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO revenue_adjustments (
            booking_id,
            refund_request_id,
            adjustment_type,
            amount,
            occurred_at,
            note
          )
          VALUES (?, ?, 'refund', ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            occurred_at = VALUES(occurred_at),
            note = VALUES(note)
        `,
        req.bookingId.toString(),
        id.toString(),
        Number(req.refundAmount || 0),
        refundedAt,
        adminNote || "Admin xác nhận đã hoàn tiền cho khách.",
      );
    }

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
      ? `Travela đã xác nhận hoàn tiền đơn ${req.booking.bookingCode}`
      : `Travela phản hồi yêu cầu hoàn tiền đơn ${req.booking.bookingCode}`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2>${isApproved ? "Travela đã xác nhận chuyển khoản hoàn tiền" : "Yêu cầu hoàn tiền chưa được duyệt"}</h2>
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
