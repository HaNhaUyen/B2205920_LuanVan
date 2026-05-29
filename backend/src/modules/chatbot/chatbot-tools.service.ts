// @ts-nocheck
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

type AuthUser = {
  userId?: bigint;
  fullName?: string;
  email?: string;
  role?: "admin" | "user" | string;
} | null;

const REFUND_WINDOW_HOURS = 48;
const MIN_DAYS_BEFORE_DEPARTURE = 3;

@Injectable()
export class ChatbotToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async tryAnswer(input: {
    message: string;
    user: AuthUser;
    intent?: string | null;
  }): Promise<string | null> {
    const message = String(input.message || "").trim();
    const normalized = this.stripText(message);

    if (!message) return null;

    // Admin tool phải chạy rất sớm và bắt theo câu hỏi vận hành cụ thể.
    // Nếu không, những câu như "Booking nào sắp hết hạn giữ chỗ?" dễ bị memory booking flow hiểu nhầm.
    if (this.isAdminOpsQuestion(normalized)) {
      if (String(input.user?.role || "").toLowerCase() !== "admin") {
        return [
          "Phần hỏi đáp quản lý chỉ dành cho tài khoản admin.",
          "Nếu bạn là admin, hãy đăng nhập bằng tài khoản quản trị rồi hỏi lại các câu như: “Hôm nay có gì cần xử lý?”, “Có bao nhiêu booking chờ thanh toán?”, “Tour nào sắp khởi hành trong 7 ngày?”.",
        ].join("\n");
      }

      return this.answerAdminOperations(message);
    }

    if (this.isSepayQuestion(normalized)) {
      return this.answerSepayPayment(message, input.user);
    }

    if (this.isRefundQuestion(normalized)) {
      return this.answerRefundAssistant(message, input.user);
    }

    return null;
  }

  private isSepayQuestion(normalized: string) {
    return /\b(sepay|vietqr|mbbank|mb bank|qr mb|qr ngan hang|ma dh|ma thanh toan|chuyen khoan|da chuyen tien|da thanh toan|sao chua xac nhan|chua xac nhan|sai noi dung|chuyen sai|thanh toan bang ngan hang|thanh toan qr)\b/.test(
      normalized,
    );
  }

  private isRefundQuestion(normalized: string) {
    return /\b(hoan tien|hoan lai tien|refund|huy tour|huy don|huy booking|lay lai tien|duoc hoan|co hoan duoc khong|muc hoan|hoan bao nhieu|80|50|phi huy)\b/.test(
      normalized,
    );
  }

  private isAdminOpsQuestion(normalized: string) {
    // Bắt thật rộng các câu hỏi vận hành để không bị rơi sang luồng tìm tour.
    // Ví dụ: "Tỷ lệ thanh toán thành công hiện tại thế nào?", "Điểm đến nào được đặt nhiều nhất?"
    const adminPatterns = [
      /\b(admin|quan ly|van hanh|dashboard|bao cao|thong ke|dieu hanh)\b/,
      /\bdoanh thu\b/,
      /\bti le\b/,
      /\b(thanh toan thanh cong|payment success|success rate)\b/,
      /\b(ti le thanh toan|ti le huy|ti le su dung voucher|ti le voucher)\b/,
      /\btop\b.*\b(tour|diem den|destination)\b/,
      /\b(tour ban chay|tour nao ban chay|tour nao duoc dat nhieu)\b/,
      /\b(diem den nao|diem den duoc dat|diem den dat nhieu|dat nhieu nhat|duoc dat nhieu nhat)\b/,
      /\bbooking\b.*\b(cho thanh toan|dang cho thanh toan|can xu ly|sap het han|het han|giu cho|chua co hdv|chua co huong dan vien)\b/,
      /\b(co bao nhieu|bao nhieu)\b.*\bbooking\b/,
      /\bbooking nao\b.*\b(sap het han|het han|giu cho|chua co hdv|chua co huong dan vien|cho thanh toan|dang cho thanh toan)\b/,
      /\btour nao\b.*\b(sap khoi hanh|khoi hanh|chua co hdv|chua co huong dan vien)\b/,
      /\b(sap khoi hanh|khoi hanh trong 7 ngay|7 ngay toi|tuan toi)\b/,
      /\b(hdv|huong dan vien)\b.*\b(chua co|thieu|phan cong)\b/,
      /\b(yeu cau hoan tien|hoan tien)\b.*\b(cho duyet|dang cho|can xu ly|pending)\b/,
      /\bhom nay co gi\b/,
      /\bcan xu ly\b/,
      /\b(tour yeu|tour e|tour it dat|tour nen giam gia|tour nen an|tour kem hieu qua|tour can toi uu)\b/,
      /\b(voucher nao|ma giam gia nao|voucher hieu qua|voucher kem|voucher it dung|hieu qua voucher)\b/,
      /\b(phan nhom khach|nhom khach|hanh vi nguoi dung|khach thich bien|khach gia dinh|khach san khuyen mai)\b/,
      /\b(canh bao thong minh|insight|van de can xu ly|hom nay can xu ly gi)\b/,
    ];

    return adminPatterns.some((pattern) => pattern.test(normalized));
  }

  private getAdminQuestionType(normalized: string) {
    if (
      /\bbooking\b.*\b(cho thanh toan|dang cho thanh toan)\b|\b(co bao nhieu|bao nhieu)\b.*\bbooking\b.*\b(cho thanh toan|dang cho thanh toan)\b/.test(
        normalized,
      )
    ) {
      return "pending_payments";
    }

    if (
      /\bbooking\b.*\b(sap het han|het han|giu cho)\b|\b(sap het han thanh toan|sap het han giu cho)\b/.test(
        normalized,
      )
    ) {
      return "expiring_holds";
    }

    if (
      /\btour nao\b.*\b(sap khoi hanh|khoi hanh|7 ngay)\b|\b(sap khoi hanh|khoi hanh trong 7 ngay|7 ngay toi|tuan toi)\b/.test(
        normalized,
      )
    ) {
      return "upcoming_tours";
    }

    if (
      /\b(chua co hdv|chua co huong dan vien|thieu hdv|thieu huong dan vien)\b|\bbooking nao\b.*\b(hdv|huong dan vien)\b/.test(
        normalized,
      )
    ) {
      return "missing_guides";
    }

    if (
      /\b(yeu cau hoan tien|hoan tien)\b.*\b(cho duyet|dang cho|can xu ly|pending)\b/.test(
        normalized,
      )
    ) {
      return "pending_refunds";
    }

    if (/\bdoanh thu\b.*\bhom nay\b/.test(normalized)) return "revenue_today";
    if (/\bdoanh thu\b.*\b(thang nay|thang)\b/.test(normalized))
      return "revenue_month";
    if (
      /\b(ti le thanh toan|thanh toan thanh cong|payment success|success rate)\b|\bti le\b.*\bthanh toan\b/.test(
        normalized,
      )
    )
      return "payment_rate";
    if (/\bti le\b.*\bhuy\b|\bti le huy booking\b/.test(normalized))
      return "cancel_rate";
    if (
      /\bti le\b.*\bvoucher\b|\bsu dung voucher\b|\bti le su dung voucher\b/.test(
        normalized,
      )
    )
      return "voucher_rate";
    if (
      /\btop\b.*\btour\b|\btour ban chay\b|\btour nao\b.*\b(dat nhieu|ban chay)\b/.test(
        normalized,
      )
    )
      return "top_tours";
    if (
      /\btop\b.*\bdiem den\b|\bdiem den nao\b.*\b(nhieu nhat|dat nhieu|duoc dat)\b|\bdiem den\b.*\b(dat nhieu|duoc dat nhieu|nhieu nhat)\b/.test(
        normalized,
      )
    )
      return "top_destinations";

    if (
      /\b(tour nao dang yeu|tour dang yeu|tour yeu|tour e|tour it dat|tour kem hieu qua|tour can toi uu|tour nao nen an|tour nen an)\b/.test(
        normalized,
      )
    )
      return "weak_tours";

    if (
      /\b(tour nao nen giam gia|tour nen giam gia|nen giam gia tour nao|tour can giam gia|giam gia tour nao)\b/.test(
        normalized,
      )
    )
      return "discount_candidates";

    if (
      /\b(voucher nao|ma giam gia nao|voucher hieu qua|voucher kem|voucher it dung|hieu qua voucher|voucher nao hieu qua|voucher nao it duoc dung)\b/.test(
        normalized,
      )
    )
      return "voucher_effectiveness";

    if (
      /\b(phan nhom khach|nhom khach|hanh vi nguoi dung|khach thich bien|khach gia dinh|khach san khuyen mai|khach san khuyến mãi)\b/.test(
        normalized,
      )
    )
      return "customer_segments";

    if (
      /\b(canh bao thong minh|insight|van de can xu ly|hom nay can xu ly gi|hom nay co gi|can xu ly)\b/.test(
        normalized,
      )
    )
      return "smart_alerts";

    return "overview";
  }

  private async answerSepayPayment(message: string, user: AuthUser) {
    const normalized = this.stripText(message);
    const transactionCode = this.extractPaymentCode(message);
    const bookingCode = this.extractBookingCode(message);

    if (
      /\b(ma dh|ma thanh toan|dh la gi|noi dung chuyen khoan)\b/.test(
        normalized,
      )
    ) {
      return [
        "Mã DH là mã thanh toán duy nhất của từng booking trên Travela.",
        "Khi hệ thống tạo thanh toán SePay/MBBank, mã này được đưa vào nội dung chuyển khoản, ví dụ: DH177961036862143.",
        "Bạn cần chuyển đúng số tiền và giữ nguyên nội dung DH... để SePay tự đối soát và xác nhận booking.",
      ].join("\n");
    }

    if (
      /\b(sai noi dung|chuyen sai|nhap sai|quen ghi|ghi sai ma)\b/.test(
        normalized,
      )
    ) {
      return [
        "Nếu chuyển khoản sai nội dung DH..., hệ thống có thể không tự xác nhận được booking.",
        "Bạn không nên tạo thêm nhiều booking mới ngay. Hãy giữ lại ảnh/chứng từ giao dịch và liên hệ admin để đối soát thủ công theo số tiền, thời gian chuyển khoản và tài khoản nhận.",
        "Admin có thể kiểm tra giao dịch SePay/ngân hàng rồi cập nhật trạng thái booking nếu giao dịch hợp lệ.",
      ].join("\n");
    }

    if (transactionCode || bookingCode) {
      const paymentInfo = await this.findPaymentInfo({
        transactionCode,
        bookingCode,
        user,
      });

      if (!paymentInfo) {
        return [
          "Mình chưa tìm thấy thanh toán tương ứng trong tài khoản hiện tại.",
          "Bạn kiểm tra lại mã booking BK... hoặc mã thanh toán DH... Nếu vừa chuyển khoản, có thể đợi thêm vài giây để SePay gửi webhook về hệ thống.",
        ].join("\n");
      }

      return this.formatPaymentStatusAnswer(paymentInfo);
    }

    if (
      /\b(da chuyen tien|da thanh toan|sao chua xac nhan|chua xac nhan|kiem tra thanh toan)\b/.test(
        normalized,
      )
    ) {
      return [
        "Nếu bạn đã chuyển khoản qua QR MBBank nhưng booking chưa xác nhận, bạn kiểm tra 3 điểm sau:",
        "1. Số tiền chuyển phải đúng bằng số tiền trên QR.",
        "2. Nội dung chuyển khoản phải giữ nguyên mã DH...",
        "3. SePay cần vài giây để gửi webhook về hệ thống.",
        "Bạn gửi mình mã booking BK... hoặc mã thanh toán DH... để mình kiểm tra trạng thái cụ thể.",
      ].join("\n");
    }

    return [
      "Travela đang hỗ trợ thanh toán qua SePay/MBBank bằng VietQR.",
      "Khi đặt tour, hệ thống sẽ tạo QR có sẵn số tài khoản, số tiền và nội dung DH... Bạn chỉ cần quét bằng app ngân hàng và xác nhận chuyển khoản.",
      "Sau khi SePay nhận giao dịch tiền vào, hệ thống sẽ tự cập nhật payment = paid và booking = confirmed.",
    ].join("\n");
  }

  private async answerRefundAssistant(message: string, user: AuthUser) {
    const bookingCode = this.extractBookingCode(message);

    if (!bookingCode) {
      return [
        "Chính sách hoàn tiền Travela:",
        `- Khách có thể gửi yêu cầu hoàn tiền trong vòng ${REFUND_WINDOW_HOURS} giờ sau khi đặt tour.`,
        `- Chỉ hỗ trợ hoàn tiền khi còn ít nhất ${MIN_DAYS_BEFORE_DEPARTURE} ngày trước ngày khởi hành.`,
        "- Booking cần ở trạng thái đã thanh toán hoặc đã xác nhận.",
        "- Admin kiểm tra và duyệt trước khi cập nhật trạng thái.",
        "- Mức đề xuất: còn từ 7 ngày trở lên có thể đề xuất hoàn 80%; còn từ 3 đến dưới 7 ngày có thể đề xuất hoàn 50%; dưới 3 ngày không đủ điều kiện.",
        "Bạn gửi mã booking dạng BK... để mình kiểm tra cụ thể cho đơn của bạn.",
      ].join("\n");
    }

    if (!user?.userId) {
      return [
        `Mình thấy bạn hỏi hoàn tiền cho booking ${bookingCode}.`,
        "Bạn cần đăng nhập đúng tài khoản đã đặt tour để mình kiểm tra điều kiện cụ thể.",
      ].join("\n");
    }

    const result = await this.calculateRefundSuggestion(bookingCode, user);
    if (!result.found)
      return `Mình chưa tìm thấy booking ${bookingCode} trong tài khoản hiện tại.`;

    return [
      `Mình đã kiểm tra booking ${bookingCode}.`,
      "",
      result.eligible
        ? "✅ Booking này có thể gửi yêu cầu hoàn tiền."
        : "❌ Booking này chưa đủ điều kiện hoàn tiền.",
      `Lý do: ${result.reason}`,
      "",
      `Ngày đặt: ${this.formatDateTime(result.createdAt)}`,
      `Ngày khởi hành: ${this.formatDate(result.departureDate)}`,
      `Số giờ từ lúc đặt: ${result.hoursSinceBooking.toFixed(1)} giờ`,
      `Số ngày còn lại trước khởi hành: ${result.daysBeforeDeparture.toFixed(1)} ngày`,
      `Trạng thái booking: ${result.bookingStatus}`,
      `Trạng thái thanh toán: ${result.paymentStatus || "chưa có"}`,
      `Số tiền đã thanh toán/giá trị đơn: ${this.formatCurrency(result.paidAmount || result.finalAmount)}`,
      `Mức hoàn đề xuất: ${result.suggestedPercent}%`,
      `Số tiền hoàn đề xuất: ${this.formatCurrency(result.suggestedAmount)}`,
      "",
      "Lưu ý: đây là mức đề xuất theo quy tắc hệ thống. Yêu cầu hoàn tiền vẫn cần admin kiểm tra và duyệt trước khi cập nhật trạng thái.",
    ].join("\n");
  }

  private async answerAdminOperations(message: string) {
    const normalized = this.stripText(message);
    const type = this.getAdminQuestionType(normalized);

    switch (type) {
      case "pending_payments":
        return this.answerPendingPayments();
      case "expiring_holds":
        return this.answerExpiringHolds();
      case "upcoming_tours":
        return this.answerUpcomingTours();
      case "missing_guides":
        return this.answerMissingGuides();
      case "pending_refunds":
        return this.answerPendingRefunds();
      case "revenue_today":
        return this.answerRevenue("today");
      case "revenue_month":
        return this.answerRevenue("month");
      case "payment_rate":
        return this.answerPaymentRate();
      case "cancel_rate":
        return this.answerCancelRate();
      case "voucher_rate":
        return this.answerVoucherRate();
      case "top_tours":
        return this.answerTopTours();
      case "top_destinations":
        return this.answerTopDestinations();
      case "weak_tours":
        return this.answerWeakTours();
      case "discount_candidates":
        return this.answerDiscountCandidates();
      case "voucher_effectiveness":
        return this.answerVoucherEffectiveness();
      case "customer_segments":
        return this.answerCustomerSegments();
      case "smart_alerts":
        return this.answerSmartAlerts();
      default:
        return this.answerAdminOverview();
    }
  }

  private getAdminRanges() {
    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const next7Days = new Date(now);
    next7Days.setDate(next7Days.getDate() + 7);
    const next30Minutes = new Date(now.getTime() + 30 * 60 * 1000);
    return {
      now,
      startToday,
      endToday,
      startMonth,
      nextMonth,
      next7Days,
      next30Minutes,
    };
  }

  private async answerPendingPayments() {
    const count = await this.prisma.booking.count({
      where: { bookingStatus: "pending_payment" as any },
    });
    const items = await this.prisma.booking.findMany({
      where: { bookingStatus: "pending_payment" as any },
      include: {
        user: true,
        tour: { include: { destination: true } },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return [
      `Hiện có ${count} booking đang chờ thanh toán.`,
      "",
      items.length
        ? "Các booking mới nhất:"
        : "Không có booking chờ thanh toán.",
      ...items.map((b: any, i: number) => {
        const payment = b.payments?.[0];
        return `${i + 1}. ${b.bookingCode} - ${b.user?.fullName || b.contactName || "Khách"} - ${b.tour?.name || "Tour"} (${b.tour?.destination?.name || "không rõ"}) - ${this.formatCurrency(b.finalAmount)} - hạn giữ chỗ: ${this.formatDateTime(b.holdExpiresAt)} - mã TT: ${payment?.internalTransactionCode || "chưa có"}`;
      }),
      "",
      "Gợi ý: ưu tiên nhắc các booking có thời gian giữ chỗ sắp hết hoặc giá trị đơn cao.",
    ].join("\n");
  }

  private async answerExpiringHolds() {
    const { now, next30Minutes } = this.getAdminRanges();
    const items = await this.prisma.booking.findMany({
      where: {
        bookingStatus: "pending_payment" as any,
        holdExpiresAt: { gte: now, lte: next30Minutes },
      },
      include: {
        user: true,
        tour: { include: { destination: true } },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { holdExpiresAt: "asc" },
      take: 10,
    });

    if (!items.length)
      return "✅ Không có booking nào sắp hết hạn giữ chỗ/thanh toán trong 30 phút tới.";

    return [
      `⚠ Có ${items.length} booking sắp hết hạn giữ chỗ trong 30 phút tới:`,
      ...items.map(
        (b: any, i: number) =>
          `${i + 1}. ${b.bookingCode} - ${b.user?.fullName || b.contactName || "Khách"} - ${b.tour?.name || "Tour"} - ${this.formatCurrency(b.finalAmount)} - hết hạn: ${this.formatDateTime(b.holdExpiresAt)} - mã TT: ${b.payments?.[0]?.internalTransactionCode || "chưa có"}`,
      ),
      "",
      "Gợi ý: admin nên nhắc khách thanh toán hoặc kiểm tra giao dịch SePay nếu khách báo đã chuyển khoản.",
    ].join("\n");
  }

  private async answerUpcomingTours() {
    const { startToday, next7Days } = this.getAdminRanges();
    const departures = await this.prisma.tourDeparture.findMany({
      where: { departureDate: { gte: startToday, lte: next7Days } },
      include: {
        tour: { include: { destination: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                "confirmed",
                "waiting_confirmation",
                "pending_payment",
              ] as any,
            },
          },
          include: { guideAssignments: true },
        },
      },
      orderBy: { departureDate: "asc" },
      take: 12,
    });

    if (!departures.length)
      return "Trong 7 ngày tới chưa có lịch khởi hành nào cần theo dõi.";

    return [
      `Có ${departures.length} lịch khởi hành trong 7 ngày tới:`,
      ...departures.map((d: any, i: number) => {
        const bookings = d.bookings || [];
        const passengers = bookings.reduce(
          (sum: number, b: any) =>
            sum + Number(b.adultCount || 0) + Number(b.childCount || 0),
          0,
        );
        const missingGuide = bookings.filter(
          (b: any) => !b.guideAssignments?.length,
        ).length;
        const pendingPayment = bookings.filter(
          (b: any) => b.bookingStatus === "pending_payment",
        ).length;
        return `${i + 1}. ${d.tour?.name || "Tour"} - ${d.tour?.destination?.name || "không rõ"} - đi ${this.formatDate(d.departureDate)}, về ${this.formatDate(d.endDate)} - ${bookings.length} booking/${passengers} khách - thiếu HDV: ${missingGuide} - chờ thanh toán: ${pendingPayment}`;
      }),
      "",
    ].join("\n");
  }

  private async answerMissingGuides() {
    const items = await this.prisma.booking.findMany({
      where: {
        bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
        guideAssignments: { none: {} },
      },
      include: {
        user: true,
        tour: { include: { destination: true } },
        departure: true,
      },
      orderBy: [{ departure: { departureDate: "asc" } }, { createdAt: "desc" }],
      take: 10,
    });
    const count = await this.prisma.booking.count({
      where: {
        bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
        guideAssignments: { none: {} },
      },
    });

    if (!count)
      return "✅ Hiện không có booking đã xác nhận/chờ xác nhận nào thiếu hướng dẫn viên.";

    return [
      `⚠ Có ${count} booking đã xác nhận/chờ xác nhận nhưng chưa phân công hướng dẫn viên.`,
      "Các booking cần ưu tiên:",
      ...items.map(
        (b: any, i: number) =>
          `${i + 1}. ${b.bookingCode} - ${b.tour?.name || "Tour"} (${b.tour?.destination?.name || "không rõ"}) - khởi hành ${this.formatDate(b.departure?.departureDate)} - ${Number(b.adultCount || 0) + Number(b.childCount || 0)} khách - khách: ${b.user?.fullName || b.contactName || "không rõ"}`,
      ),
      "",
      "Gợi ý: ưu tiên phân công HDV cho các tour khởi hành gần nhất và kiểm tra trùng lịch HDV trước khi lưu.",
    ].join("\n");
  }

  private async answerPendingRefunds() {
    const count = await this.prisma.refundRequest.count({
      where: { status: "pending" as any },
    });
    const items = await this.prisma.refundRequest.findMany({
      where: { status: "pending" as any },
      include: {
        booking: {
          include: {
            tour: { include: { destination: true } },
            departure: true,
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
        user: true,
      },
      orderBy: { createdAt: "asc" },
      take: 8,
    });

    if (!count) return "✅ Không có yêu cầu hoàn tiền nào đang chờ duyệt.";

    return [
      `⚠ Có ${count} yêu cầu hoàn tiền đang chờ duyệt.`,
      "Các yêu cầu cần xem trước:",
      ...items.map((r: any, i: number) => {
        const b = r.booking;
        const days = b?.departure?.departureDate
          ? (
              (new Date(b.departure.departureDate).getTime() - Date.now()) /
              864e5
            ).toFixed(1)
          : "?";
        const paid = Number(b?.payments?.[0]?.amount || b?.finalAmount || 0);
        const percent = Number(days) >= 7 ? 80 : Number(days) >= 3 ? 50 : 0;
        return `${i + 1}. ${b?.bookingCode || "Booking"} - ${b?.tour?.name || "Tour"} - khởi hành ${this.formatDate(b?.departure?.departureDate)} - còn ${days} ngày - trạng thái ${b?.bookingStatus || "?"} - đề xuất ${percent}% (${this.formatCurrency(Math.round((paid * percent) / 100))})`;
      }),
      "",
      "Quy tắc: yêu cầu trong 48 giờ sau đặt, còn ít nhất 3 ngày trước khởi hành, booking đã thanh toán/xác nhận và admin duyệt trước khi cập nhật.",
    ].join("\n");
  }

  private async answerRevenue(mode: "today" | "month") {
    const { startToday, endToday, startMonth, nextMonth } =
      this.getAdminRanges();
    const where =
      mode === "today"
        ? {
            paymentStatus: "paid" as any,
            paidAt: { gte: startToday, lt: endToday },
          }
        : {
            paymentStatus: "paid" as any,
            paidAt: { gte: startMonth, lt: nextMonth },
          };
    const [sum, count] = await Promise.all([
      this.prisma.payment.aggregate({ _sum: { amount: true }, where }),
      this.prisma.payment.count({ where }),
    ]);
    const amount = Number((sum as any)?._sum?.amount || 0);
    return `${mode === "today" ? "Doanh thu hôm nay" : "Doanh thu tháng này"}: ${this.formatCurrency(amount)} từ ${count} giao dịch đã thanh toán.`;
  }

  private async answerPaymentRate() {
    const [paid, total] = await Promise.all([
      this.prisma.payment.count({ where: { paymentStatus: "paid" as any } }),
      this.prisma.payment.count(),
    ]);
    const rate = total ? Math.round((paid / total) * 1000) / 10 : 0;
    return `Tỷ lệ thanh toán thành công hiện tại: ${rate}% (${paid}/${total} payment ở trạng thái paid).`;
  }

  private async answerCancelRate() {
    const [cancelled, total] = await Promise.all([
      this.prisma.booking.count({
        where: { bookingStatus: "cancelled" as any },
      }),
      this.prisma.booking.count(),
    ]);
    const rate = total ? Math.round((cancelled / total) * 1000) / 10 : 0;
    return `Tỷ lệ hủy booking hiện tại: ${rate}% (${cancelled}/${total} booking đã hủy).`;
  }

  private async answerVoucherRate() {
    const [withVoucher, total] = await Promise.all([
      this.prisma.booking.count({ where: { voucherId: { not: null } } }),
      this.prisma.booking.count(),
    ]);
    const rate = total ? Math.round((withVoucher / total) * 1000) / 10 : 0;
    return `Tỷ lệ sử dụng voucher hiện tại: ${rate}% (${withVoucher}/${total} booking có voucher).`;
  }

  private async answerTopTours() {
    const topTours = await this.prisma.booking.groupBy({
      by: ["tourId"],
      _count: { _all: true },
      where: {
        bookingStatus: {
          in: ["confirmed", "completed", "waiting_confirmation"] as any,
        },
      },
      orderBy: { _count: { tourId: "desc" } },
      take: 5,
    });
    const tours = topTours.length
      ? await this.prisma.tour.findMany({
          where: { id: { in: topTours.map((x: any) => x.tourId) } },
          include: { destination: true },
        })
      : [];
    const map = new Map(tours.map((t: any) => [String(t.id), t]));
    return [
      "Top tour bán chạy:",
      ...(topTours.length
        ? topTours.map((x: any, i: number) => {
            const t = map.get(String(x.tourId));
            return `${i + 1}. ${t?.name || `Tour #${x.tourId}`} - ${t?.destination?.name || "không rõ"} - ${x._count?._all || 0} booking`;
          })
        : ["Chưa có dữ liệu."]),
    ].join("\n");
  }

  private async answerTopDestinations() {
    const rows = await this.prisma.booking.findMany({
      where: {
        bookingStatus: {
          in: ["confirmed", "completed", "waiting_confirmation"] as any,
        },
      },
      include: { tour: { include: { destination: true } } },
      take: 1000,
    });
    const counter = new Map<string, number>();
    for (const b of rows as any[]) {
      const name = b.tour?.destination?.name || "Không rõ";
      counter.set(name, (counter.get(name) || 0) + 1);
    }
    const top = Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return [
      "Top điểm đến được đặt nhiều:",
      ...(top.length
        ? top.map(([name, count], i) => `${i + 1}. ${name} - ${count} booking`)
        : ["Chưa có dữ liệu."]),
    ].join("\n");
  }

  private async answerWeakTours() {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" as any },
      take: 80,
      include: {
        destination: true,
        bookings: { where: { createdAt: { gte: last30Days } } },
        behaviors: { where: { createdAt: { gte: last30Days } } },
      },
    });
    const rows = tours
      .map((t: any) => {
        const views = (t.behaviors || []).filter((b: any) =>
          ["view", "view_detail", "search_click"].includes(String(b.action)),
        ).length;
        const bookings = (t.bookings || []).length;
        const conversion = views
          ? Math.round((bookings / views) * 1000) / 10
          : 0;
        let reason = "Theo dõi thêm";
        if (views >= 10 && bookings === 0)
          reason =
            "Lượt xem cao nhưng chưa có booking, nên giảm giá/đổi ảnh/kiểm tra lịch trình";
        else if (views <= 1 && bookings === 0)
          reason = "Ít tương tác, cân nhắc ẩn tạm hoặc tối ưu SEO/hình ảnh";
        else if (conversion < 5 && views >= 10)
          reason = "Tỷ lệ chuyển đổi thấp, nên kiểm tra giá và voucher";
        return { tour: t, views, bookings, conversion, reason };
      })
      .filter((x: any) => x.reason !== "Theo dõi thêm")
      .sort((a: any, b: any) => b.views - a.views)
      .slice(0, 8);

    if (!rows.length)
      return "Chưa phát hiện tour yếu rõ ràng trong 30 ngày gần nhất.";
    return [
      "Các tour nên tối ưu trong 30 ngày gần nhất:",
      ...rows.map(
        (x: any, i: number) =>
          `${i + 1}. ${x.tour.name} (${x.tour.destination?.name || "không rõ"}) - ${x.views} lượt xem, ${x.bookings} booking, chuyển đổi ${x.conversion}% → ${x.reason}`,
      ),
      "",
      "Gợi ý: ưu tiên xử lý tour có lượt xem cao nhưng booking thấp trước, vì đây là nhóm có nhu cầu nhưng chưa chuyển đổi.",
    ].join("\n");
  }

  private async answerDiscountCandidates() {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" as any },
      take: 100,
      include: {
        destination: true,
        bookings: { where: { createdAt: { gte: last30Days } } },
        behaviors: { where: { createdAt: { gte: last30Days } } },
        reviews: true,
      },
    });

    const rows = tours
      .map((t: any) => {
        const behaviors = t.behaviors || [];
        const views = behaviors.filter((b: any) =>
          ["view", "view_detail", "search_click", "ask_ai"].includes(
            String(b.action),
          ),
        ).length;
        const favorites = behaviors.filter(
          (b: any) => String(b.action) === "favorite",
        ).length;
        const bookings = (t.bookings || []).filter((b: any) =>
          [
            "confirmed",
            "completed",
            "waiting_confirmation",
            "pending_payment",
          ].includes(String(b.bookingStatus)),
        ).length;
        const conversion = views
          ? Math.round((bookings / views) * 1000) / 10
          : 0;
        const avgRating = (t.reviews || []).length
          ? Math.round(
              ((t.reviews || []).reduce(
                (sum: number, r: any) => sum + Number(r.rating || 0),
                0,
              ) /
                (t.reviews || []).length) *
                10,
            ) / 10
          : 0;

        let priority = 0;
        const reasons: string[] = [];
        if (views >= 10 && bookings === 0) {
          priority += 4;
          reasons.push("lượt xem cao nhưng chưa có booking");
        }
        if (views >= 10 && conversion < 5) {
          priority += 3;
          reasons.push(`tỷ lệ chuyển đổi thấp ${conversion}%`);
        }
        if (favorites >= 2 && bookings === 0) {
          priority += 2;
          reasons.push("có yêu thích nhưng chưa chuyển thành đặt tour");
        }
        if (avgRating > 0 && avgRating < 3.5) {
          priority += 1;
          reasons.push(`đánh giá trung bình thấp ${avgRating}/5`);
        }

        return {
          tour: t,
          views,
          bookings,
          favorites,
          conversion,
          avgRating,
          priority,
          reasons,
        };
      })
      .filter((x: any) => x.priority > 0)
      .sort((a: any, b: any) => b.priority - a.priority || b.views - a.views)
      .slice(0, 8);

    if (!rows.length) {
      return [
        "Chưa có tour nào đủ tín hiệu rõ ràng để đề xuất giảm giá trong 30 ngày gần nhất.",
        "Gợi ý: tiếp tục theo dõi các tour có lượt xem cao nhưng tỷ lệ đặt thấp.",
      ].join("\n");
    }

    return [
      "Các tour nên cân nhắc giảm giá/tạo ưu đãi trong 30 ngày gần nhất:",
      ...rows.map(
        (x: any, i: number) =>
          `${i + 1}. ${x.tour.name} (${x.tour.destination?.name || "không rõ"}) - ${x.views} lượt xem, ${x.favorites} yêu thích, ${x.bookings} booking, chuyển đổi ${x.conversion}%, đánh giá ${x.avgRating || "chưa có"} → ${x.reasons.join(", ")}.`,
      ),
      "",
      "Gợi ý hành động: ưu tiên voucher 5–10% cho tour có lượt xem/yêu thích cao nhưng chưa đặt; nếu tour ít lượt xem thì nên tối ưu ảnh, tiêu đề và SEO trước khi giảm giá.",
    ].join("\n");
  }

  private async answerVoucherEffectiveness() {
    const vouchers = await this.prisma.voucher.findMany({
      where: { status: "active" },
      take: 20,
      include: { userVouchers: true, bookings: true },
      orderBy: { usedCount: "desc" },
    });
    if (!vouchers.length) return "Hiện chưa có voucher active để đánh giá.";
    const rows = vouchers.map((v: any) => {
      const assigned = (v.userVouchers || []).length;
      const usedUsers = (v.userVouchers || []).filter(
        (x: any) => x.status === "used",
      ).length;
      const usage = Number(v.quota || 0)
        ? Math.round((Number(v.usedCount || 0) / Number(v.quota || 1)) * 1000) /
          10
        : assigned
          ? Math.round((usedUsers / assigned) * 1000) / 10
          : 0;
      const revenue = (v.bookings || [])
        .filter((b: any) =>
          ["confirmed", "completed", "waiting_confirmation"].includes(
            String(b.bookingStatus),
          ),
        )
        .reduce((sum: number, b: any) => sum + Number(b.finalAmount || 0), 0);
      return { v, assigned, usedUsers, usage, revenue };
    });
    const best = [...rows]
      .sort((a, b) => b.usage - a.usage || b.revenue - a.revenue)
      .slice(0, 5);
    const weak = rows.filter((x) => x.usage <= 10).slice(0, 5);
    return [
      "Đánh giá hiệu quả voucher:",
      "Voucher hiệu quả:",
      ...best.map(
        (x: any, i: number) =>
          `${i + 1}. ${x.v.code} - dùng ${x.v.usedCount || 0} lượt, tỷ lệ ${x.usage}%, doanh thu liên quan ${this.formatCurrency(x.revenue)}`,
      ),
      "",
      weak.length
        ? "Voucher hiệu quả thấp:"
        : "Không có voucher hiệu quả thấp rõ ràng.",
      ...weak.map(
        (x: any, i: number) =>
          `${i + 1}. ${x.v.code} - tỷ lệ ${x.usage}% → nên kiểm tra điều kiện áp dụng, thời hạn hoặc mức giảm.`,
      ),
    ].join("\n");
  }

  private async answerCustomerSegments() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.userBehavior.findMany({
      where: { createdAt: { gte: since }, userId: { not: null } },
      take: 1000,
      include: { tour: { include: { destination: true } } },
      orderBy: { createdAt: "desc" },
    });
    const counter = new Map<string, number>();
    const detect = (text: string) => {
      const t = String(text || "").toLowerCase();
      if (
        /bien|biển|dao|đảo|phu quoc|phú quốc|nha trang|quy nhon|quy nhơn|da nang|đà nẵng/.test(
          t,
        )
      )
        return "Thích biển/đảo";
      if (/gia dinh|gia đình|family|tre nho|trẻ nhỏ/.test(t))
        return "Du lịch gia đình";
      if (/nghi duong|nghỉ dưỡng|resort|relax|thu gian|thư giãn/.test(t))
        return "Nghỉ dưỡng";
      if (/voucher|giam gia|giảm giá|khuyen mai|khuyến mãi|deal/.test(t))
        return "Săn khuyến mãi";
      if (/checkin|check-in|chup hinh|chụp hình|song ao|sống ảo/.test(t))
        return "Thích chụp ảnh";
      return "Chưa rõ sở thích";
    };
    for (const r of rows as any[]) {
      const segment = detect(
        `${r.action || ""} ${r.keyword || ""} ${r.tour?.tourTheme || ""} ${r.tour?.name || ""} ${r.tour?.destination?.name || ""}`,
      );
      counter.set(segment, (counter.get(segment) || 0) + 1);
    }
    const top = Array.from(counter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (!top.length) return "Chưa đủ dữ liệu hành vi để phân nhóm khách hàng.";
    return [
      "Phân nhóm khách hàng theo hành vi 30 ngày gần nhất:",
      ...top.map(
        ([name, count], i) => `${i + 1}. ${name}: ${count} tín hiệu hành vi`,
      ),
      "",
      "Ứng dụng: dùng nhóm này để cá nhân hóa gợi ý tour, voucher và nội dung chatbot cho từng khách.",
    ].join("\n");
  }

  private async answerSmartAlerts() {
    const now = new Date();
    const next30 = new Date(now.getTime() + 30 * 60 * 1000);
    const [expiring, waiting, refunds, noGuide] = await Promise.all([
      this.prisma.booking.count({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: next30 },
        },
      }),
      this.prisma.booking.count({
        where: { bookingStatus: "waiting_confirmation" as any },
      }),
      this.prisma.refundRequest.count({ where: { status: "pending" as any } }),
      this.prisma.booking.count({
        where: {
          bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
          guideAssignments: { none: {} },
        },
      }),
    ]);
    const alerts = [
      expiring
        ? `⚠ ${expiring} booking sắp hết hạn giữ chỗ trong 30 phút.`
        : "✅ Không có booking sắp hết hạn giữ chỗ trong 30 phút.",
      waiting
        ? `⚠ ${waiting} booking đang chờ xác nhận thanh toán.`
        : "✅ Không có booking chờ xác nhận thanh toán.",
      refunds
        ? `⚠ ${refunds} yêu cầu hoàn tiền đang chờ duyệt.`
        : "✅ Không có refund pending.",
      noGuide
        ? `⚠ ${noGuide} booking đã xác nhận/chờ xác nhận nhưng chưa có HDV.`
        : "✅ Booking đã xác nhận hiện không thiếu HDV.",
    ];
    return [
      "Cảnh báo thông minh hiện tại:",
      ...alerts,
      "",
      "Ưu tiên xử lý: booking sắp hết hạn → thanh toán chờ xác nhận → refund pending → phân công HDV.",
    ].join("\n");
  }

  private async answerAdminOverview() {
    const {
      now,
      startToday,
      endToday,
      startMonth,
      nextMonth,
      next7Days,
      next30Minutes,
    } = this.getAdminRanges();

    const [
      pendingPayment,
      paidToday,
      upcomingBookings,
      bookingsWithoutGuide,
      expiringHolds,
      pendingRefunds,
      paidPayments,
      totalPayments,
      cancelledBookings,
      totalBookings,
      voucherBookings,
      revenueTodayRows,
      revenueMonthRows,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: { bookingStatus: "pending_payment" as any },
      }),
      this.prisma.payment.count({
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: startToday, lt: endToday },
        },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: {
            in: ["confirmed", "waiting_confirmation", "pending_payment"] as any,
          },
          departure: { departureDate: { gte: startToday, lte: next7Days } },
        },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
          guideAssignments: { none: {} },
        },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: next30Minutes },
        },
      }),
      this.prisma.refundRequest.count({ where: { status: "pending" as any } }),
      this.prisma.payment.count({ where: { paymentStatus: "paid" as any } }),
      this.prisma.payment.count(),
      this.prisma.booking.count({
        where: { bookingStatus: "cancelled" as any },
      }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { voucherId: { not: null } } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: startToday, lt: endToday },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: startMonth, lt: nextMonth },
        },
      }),
    ]);

    const revenueToday = Number((revenueTodayRows as any)?._sum?.amount || 0);
    const revenueMonth = Number((revenueMonthRows as any)?._sum?.amount || 0);
    const paymentSuccessRate = totalPayments
      ? Math.round((paidPayments / totalPayments) * 1000) / 10
      : 0;
    const cancelRate = totalBookings
      ? Math.round((cancelledBookings / totalBookings) * 1000) / 10
      : 0;
    const voucherUsageRate = totalBookings
      ? Math.round((voucherBookings / totalBookings) * 1000) / 10
      : 0;

    const warnings = [
      expiringHolds > 0
        ? `⚠ Có ${expiringHolds} booking sắp hết hạn thanh toán trong 30 phút.`
        : "✅ Không có booking sắp hết hạn thanh toán trong 30 phút.",
      bookingsWithoutGuide > 0
        ? `⚠ Có ${bookingsWithoutGuide} booking đã xác nhận/chờ xác nhận nhưng chưa phân công HDV.`
        : "✅ Các booking đã xác nhận hiện không thiếu HDV.",
      pendingRefunds > 0
        ? `⚠ Có ${pendingRefunds} yêu cầu hoàn tiền đang chờ duyệt.`
        : "✅ Không có yêu cầu hoàn tiền đang chờ duyệt.",
    ];

    return [
      "Báo cáo nhanh cho admin Travela:",
      "",
      `- Booking chờ thanh toán: ${pendingPayment}`,
      `- Booking đã thanh toán hôm nay: ${paidToday}`,
      `- Booking/tour sắp khởi hành trong 7 ngày: ${upcomingBookings}`,
      `- Booking chưa có hướng dẫn viên: ${bookingsWithoutGuide}`,
      `- Booking sắp hết hạn giữ chỗ: ${expiringHolds}`,
      `- Yêu cầu hoàn tiền đang chờ xử lý: ${pendingRefunds}`,
      `- Doanh thu hôm nay: ${this.formatCurrency(revenueToday)}`,
      `- Doanh thu tháng này: ${this.formatCurrency(revenueMonth)}`,
      `- Tỷ lệ thanh toán thành công: ${paymentSuccessRate}%`,
      `- Tỷ lệ hủy booking: ${cancelRate}%`,
      `- Tỷ lệ sử dụng voucher: ${voucherUsageRate}%`,
      "",
      warnings.join("\n"),
      "",
      "Bạn có thể hỏi chi tiết hơn, ví dụ: “Có bao nhiêu booking đang chờ thanh toán?”, “Booking nào sắp hết hạn giữ chỗ?”, “Tour nào sắp khởi hành trong 7 ngày tới?”, “Có booking nào chưa có hướng dẫn viên không?”.",
    ].join("\n");
  }

  private async findPaymentInfo(input: {
    transactionCode?: string | null;
    bookingCode?: string | null;
    user: AuthUser;
  }) {
    const isAdmin = String(input.user?.role || "").toLowerCase() === "admin";
    const userId = input.user?.userId;
    const where: any = input.transactionCode
      ? { internalTransactionCode: input.transactionCode }
      : { booking: { bookingCode: input.bookingCode } };

    const payment = await this.prisma.payment.findFirst({
      where,
      include: {
        booking: {
          include: {
            user: true,
            tour: { include: { destination: true } },
            departure: true,
            refundRequests: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!payment) return null;
    if (
      !isAdmin &&
      userId &&
      payment.booking?.userId &&
      payment.booking.userId !== userId
    )
      return null;
    if (!isAdmin && !userId) return null;
    return payment;
  }

  private formatPaymentStatusAnswer(payment: any) {
    const booking = payment.booking;
    const paid = String(payment.paymentStatus || "").toLowerCase() === "paid";

    return [
      `Mình đã kiểm tra thanh toán ${payment.internalTransactionCode}.`,
      "",
      `Booking: ${booking?.bookingCode || "không rõ"}`,
      `Tour: ${booking?.tour?.name || "không rõ"}`,
      `Điểm đến: ${booking?.tour?.destination?.name || "không rõ"}`,
      `Ngày khởi hành: ${this.formatDate(booking?.departure?.departureDate)}`,
      `Số tiền cần thanh toán: ${this.formatCurrency(payment.amount)}`,
      `Trạng thái payment: ${payment.paymentStatus}`,
      `Trạng thái booking: ${booking?.bookingStatus || "không rõ"}`,
      payment.paidAt
        ? `Thời gian thanh toán: ${this.formatDateTime(payment.paidAt)}`
        : "",
      "",
      paid
        ? "✅ Thanh toán đã được xác nhận. Booking sẽ/đã chuyển sang trạng thái confirmed."
        : "⏳ Thanh toán chưa được xác nhận. Nếu bạn vừa chuyển khoản, hãy kiểm tra đúng số tiền và đúng nội dung DH..., sau đó đợi SePay gửi webhook về hệ thống.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private async calculateRefundSuggestion(bookingCode: string, user: AuthUser) {
    const isAdmin = String(user?.role || "").toLowerCase() === "admin";
    const where: any = { bookingCode };
    if (!isAdmin) where.userId = user?.userId;

    const booking = await this.prisma.booking.findFirst({
      where,
      include: {
        tour: true,
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        refundRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!booking) return { found: false };

    const now = new Date();
    const createdAt = new Date(booking.createdAt);
    const departureDate = booking.departure?.departureDate
      ? new Date(booking.departure.departureDate)
      : null;
    const hoursSinceBooking = (now.getTime() - createdAt.getTime()) / 36e5;
    const daysBeforeDeparture = departureDate
      ? (departureDate.getTime() - now.getTime()) / 864e5
      : 0;
    const latestPayment = booking.payments?.[0];
    const bookingStatus = String(booking.bookingStatus || "").toLowerCase();
    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();
    const latestRefund = booking.refundRequests?.[0];
    const hasPaidSignal =
      ["confirmed", "waiting_confirmation"].includes(bookingStatus) ||
      ["paid", "success", "completed", "waiting_confirmation"].includes(
        paymentStatus,
      );

    let eligible = true;
    let reason =
      "Đủ điều kiện theo thời gian đặt, ngày khởi hành và trạng thái thanh toán.";
    if (
      latestRefund &&
      ["pending", "approved"].includes(
        String(latestRefund.status).toLowerCase(),
      )
    ) {
      eligible = false;
      reason = "Booking đã có yêu cầu hoàn tiền đang xử lý hoặc đã được duyệt.";
    } else if (hoursSinceBooking > REFUND_WINDOW_HOURS) {
      eligible = false;
      reason = `Đã quá ${REFUND_WINDOW_HOURS} giờ kể từ lúc đặt tour.`;
    } else if (daysBeforeDeparture < MIN_DAYS_BEFORE_DEPARTURE) {
      eligible = false;
      reason = `Còn dưới ${MIN_DAYS_BEFORE_DEPARTURE} ngày trước ngày khởi hành.`;
    } else if (!hasPaidSignal) {
      eligible = false;
      reason = "Booking chưa ở trạng thái đã thanh toán hoặc đã xác nhận.";
    }

    const suggestedPercent = eligible
      ? daysBeforeDeparture >= 7
        ? 80
        : daysBeforeDeparture >= 3
          ? 50
          : 0
      : 0;
    const paidAmount = Number(latestPayment?.amount || 0);
    const finalAmount = Number(booking.finalAmount || 0);
    const baseAmount = paidAmount || finalAmount;

    return {
      found: true,
      eligible,
      reason,
      createdAt,
      departureDate,
      hoursSinceBooking,
      daysBeforeDeparture,
      bookingStatus: booking.bookingStatus,
      paymentStatus: latestPayment?.paymentStatus || null,
      paidAmount,
      finalAmount,
      suggestedPercent,
      suggestedAmount: Math.round((baseAmount * suggestedPercent) / 100),
    };
  }

  private extractPaymentCode(message: string) {
    const match = String(message || "")
      .toUpperCase()
      .match(/\bDH\d{5,}\b/);
    return match?.[0] || null;
  }

  private extractBookingCode(message: string) {
    const match = String(message || "")
      .toUpperCase()
      .match(/\bBK[A-Z0-9]{5,}\b/);
    return match?.[0] || null;
  }

  private stripText(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private formatCurrency(value: any) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  private formatDate(value: any) {
    if (!value) return "đang cập nhật";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "đang cập nhật";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  private formatDateTime(value: any) {
    if (!value) return "đang cập nhật";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "đang cập nhật";
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
}
