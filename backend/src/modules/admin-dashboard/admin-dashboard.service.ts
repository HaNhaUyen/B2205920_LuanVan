// @ts-nocheck
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: any) {
  return Number(value || 0);
}

function toId(value: any) {
  return value === null || value === undefined ? null : String(value);
}

function pct(part: number, total: number) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(base: Date, months: number) {
  return new Date(base.getFullYear(), base.getMonth() + months, 1);
}

function dateOrUndefined(value: any) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function contains(text: any, patterns: RegExp[]) {
  const value = String(text || "").toLowerCase();
  return patterns.some((p) => p.test(value));
}

function customerSegmentFromSignals(signals: string[]) {
  const text = signals.join(" ").toLowerCase();
  const labels = [];
  if (
    contains(text, [
      /bien|biển|dao|đảo|phu quoc|phú quốc|nha trang|quy nhon|quy nhơn|da nang|đà nẵng/,
    ])
  )
    labels.push("Thích biển/đảo");
  if (contains(text, [/gia dinh|gia đình|family|tre nho|trẻ nhỏ|kid|children/]))
    labels.push("Du lịch gia đình");
  if (
    contains(text, [
      /nghi duong|nghỉ dưỡng|resort|khach san|khách sạn|relax|thu gian|thư giãn/,
    ])
  )
    labels.push("Nghỉ dưỡng");
  if (
    contains(text, [
      /voucher|giam gia|giảm giá|sale|khuyen mai|khuyến mãi|deal|re|rẻ/,
    ])
  )
    labels.push("Săn khuyến mãi");
  if (
    contains(text, [
      /anh|ảnh|hinh|hình|checkin|check-in|song ao|sống ảo|chup hinh|chụp hình/,
    ])
  )
    labels.push("Thích chụp ảnh");
  return labels.length ? labels.join(", ") : "Chưa đủ dữ liệu hành vi";
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [
      totalTours,
      publishedTours,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      totalUsers,
      newUsers,
      totalGuides,
      busyGuides,
      totalRefunds,
      pendingRefunds,
      totalVouchers,
      activeVouchers,
      totalContacts,
      newContacts,
      totalReviews,
      pendingReviews,
      paidPayments,
      allPayments,
      recentBookings,
      recentUsers,
      topUsers,
      recentRefunds,
      bookingsByStatusRaw,
      paymentsByStatusRaw,
      refundByStatusRaw,
      topToursRaw,
      paidPaymentRows,
      usersByTierRaw,
      smartInsights,
    ] = await Promise.all([
      this.prisma.tour.count(),
      this.prisma.tour.count({ where: { status: "published" as any } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({
        where: {
          bookingStatus: {
            in: ["pending_payment", "waiting_confirmation"] as any,
          },
        },
      }),
      this.prisma.booking.count({
        where: { bookingStatus: { in: ["confirmed", "completed"] as any } },
      }),
      this.prisma.user.count({ where: { role: "user" as any } }),
      this.prisma.user.count({
        where: {
          role: "user" as any,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.guide.count(),
      this.prisma.guideAssignment.count({
        where: { status: { in: ["assigned", "confirmed"] } },
      }),
      this.prisma.refundRequest.count(),
      this.prisma.refundRequest.count({ where: { status: "pending" as any } }),
      this.prisma.voucher.count(),
      this.prisma.voucher.count({ where: { status: "active" } }),
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { status: "new" } }),
      this.prisma.review.count(),
      this.prisma.review.count({ where: { status: "pending" as any } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { paymentStatus: "paid" as any },
      }),
      this.prisma.payment.count(),
      this.prisma.booking.findMany({
        take: 12,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { fullName: true, email: true, phone: true } },
          tour: { select: { name: true, slug: true } },
          departure: true,
          guideAssignments: {
            where: { status: { in: ["assigned", "confirmed"] } },
            include: { guide: true },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          payments: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { paymentStatus: true, paymentMethod: true },
          },
        },
      }),
      this.prisma.user.findMany({
        take: 12,
        where: { role: "user" as any },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          identityNumber: true,
          memberPoints: true,
          memberTier: true,
          createdAt: true,
        },
      }),
      this.prisma.user.findMany({
        take: 12,
        where: { role: "user" as any },
        orderBy: [{ memberPoints: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          fullName: true,
          email: true,
          memberPoints: true,
          memberTier: true,
          bookings: { select: { finalAmount: true, bookingStatus: true } },
        },
      }),
      this.prisma.refundRequest.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: { user: true, booking: { include: { tour: true } } },
      }),
      this.prisma.booking.groupBy({
        by: ["bookingStatus"],
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ["paymentStatus"],
        _count: { _all: true },
      }),
      this.prisma.refundRequest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.prisma.booking.groupBy({
        by: ["tourId"],
        _count: { _all: true },
        orderBy: { _count: { tourId: "desc" } },
        take: 8,
      }),
      this.prisma.payment.findMany({
        where: { paymentStatus: "paid" as any, paidAt: { not: null } },
        select: { amount: true, paidAt: true, bookingId: true },
      }),
      this.prisma.user.groupBy({
        by: ["memberTier"],
        where: { role: "user" as any },
        _count: { _all: true },
      }),
      this.getSmartInsights(),
    ]);

    const bookingsByStatus = bookingsByStatusRaw.map((item) => ({
      status: item.bookingStatus,
      total: item._count._all,
    }));
    const paymentsByStatus = paymentsByStatusRaw.map((item) => ({
      status: item.paymentStatus,
      total: item._count._all,
    }));
    const refundsByStatus = refundByStatusRaw.map((item) => ({
      status: item.status,
      total: item._count._all,
    }));
    const usersByTier = usersByTierRaw.map((item) => ({
      tier: item.memberTier,
      total: item._count._all,
    }));

    const tourIds = topToursRaw.map((item) => item.tourId);
    const tours = tourIds.length
      ? await this.prisma.tour.findMany({
          where: { id: { in: tourIds } },
          select: { id: true, name: true, slug: true, basePriceAdult: true },
        })
      : [];
    const tourMap = new Map(tours.map((tour) => [tour.id.toString(), tour]));
    const topTours = topToursRaw.map((item) => ({
      tourId: item.tourId.toString(),
      tourName: tourMap.get(item.tourId.toString())?.name ?? "Unknown tour",
      slug: tourMap.get(item.tourId.toString())?.slug ?? "",
      price: money(tourMap.get(item.tourId.toString())?.basePriceAdult),
      totalBookings: item._count._all,
    }));

    const monthlyMap = new Map<string, number>();
    const today = new Date();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthlyMap.set(monthKey(d), 0);
    }
    for (const row of paidPaymentRows) {
      const key = monthKey(new Date(row.paidAt));
      if (monthlyMap.has(key))
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + money(row.amount));
    }
    const currentMonthKey = monthKey(today);
    const previousMonthDate = new Date(
      today.getFullYear(),
      today.getMonth() - 1,
      1,
    );
    const previousMonthKey = monthKey(previousMonthDate);

    const monthlyRevenue = Array.from(monthlyMap.entries()).map(
      ([month, revenue]) => ({
        month,
        revenue,
        isCurrentMonth: month === currentMonthKey,
      }),
    );

    const currentMonthRows = paidPaymentRows.filter(
      (row) => monthKey(new Date(row.paidAt)) === currentMonthKey,
    );
    const previousMonthRows = paidPaymentRows.filter(
      (row) => monthKey(new Date(row.paidAt)) === previousMonthKey,
    );

    const currentMonthRevenue = currentMonthRows.reduce(
      (sum, row) => sum + money(row.amount),
      0,
    );
    const previousMonthRevenue = previousMonthRows.reduce(
      (sum, row) => sum + money(row.amount),
      0,
    );

    const paidBookingIds = new Set(
      currentMonthRows
        .map((row) => toId(row.bookingId))
        .filter((value): value is string => Boolean(value)),
    );
    const paidBookings = paidBookingIds.size;
    const averageOrderValue = paidBookings
      ? Math.round(currentMonthRevenue / paidBookings)
      : 0;
    const growthRate = previousMonthRevenue
      ? Number(
          (
            ((currentMonthRevenue - previousMonthRevenue) /
              previousMonthRevenue) *
            100
          ).toFixed(2),
        )
      : null;

    const daysInMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    ).getDate();
    const daysElapsed = today.getDate();
    const remainingDays = Math.max(daysInMonth - daysElapsed, 0);

    const revenueDetails = {
      month: currentMonthKey,
      monthLabel: `tháng ${today.getMonth() + 1}/${today.getFullYear()}`,
      currentMonthRevenue,
      previousMonthRevenue,
      paidBookings,
      paidTransactions: currentMonthRows.length,
      averageOrderValue,
      growthRate,
      daysElapsed,
      daysInMonth,
      remainingDays,
    };

    const paidCount =
      paymentsByStatus.find((item) => item.status === "paid")?.total ?? 0;
    const paymentSuccessRate =
      allPayments === 0
        ? 0
        : Number(((paidCount / allPayments) * 100).toFixed(2));

    return {
      summary: {
        totalTours,
        publishedTours,
        totalBookings,
        pendingBookings,
        confirmedBookings,
        totalUsers,
        newUsers,
        totalGuides,
        busyGuides,
        totalRefunds,
        pendingRefunds,
        totalVouchers,
        activeVouchers,
        totalRevenue: money(paidPayments._sum.amount),
        totalContacts,
        newContacts,
        totalReviews,
        pendingReviews,
        paymentSuccessRate,
      },
      revenueDetails,
      smartInsights,
      charts: {
        bookingsByStatus,
        paymentsByStatus,
        refundsByStatus,
        usersByTier,
        monthlyRevenue,
      },
      topTours,
      recent: {
        bookings: recentBookings.map((item) => ({
          id: item.id.toString(),
          bookingCode: item.bookingCode,
          bookingStatus: item.bookingStatus,
          contactName: item.contactName,
          contactEmail: item.contactEmail,
          contactPhone: item.contactPhone,
          finalAmount: money(item.finalAmount),
          adultCount: item.adultCount,
          childCount: item.childCount,
          createdAt: item.createdAt,
          departureDate: item.departure?.departureDate,
          endDate: item.departure?.endDate,
          tourName: item.tour?.name,
          paymentStatus: item.payments[0]?.paymentStatus ?? null,
          paymentMethod: item.payments[0]?.paymentMethod ?? null,
          guideName: item.guideAssignments[0]?.guide?.fullName ?? null,
        })),
        users: recentUsers.map((u) => ({ ...u, id: u.id.toString() })),
        topUsers: topUsers.map((u) => ({
          id: u.id.toString(),
          fullName: u.fullName,
          email: u.email,
          memberPoints: u.memberPoints,
          memberTier: u.memberTier,
          totalSpent: u.bookings
            .filter((b) => ["confirmed", "completed"].includes(b.bookingStatus))
            .reduce((sum, b) => sum + money(b.finalAmount), 0),
          totalBookings: u.bookings.length,
        })),
        refunds: recentRefunds.map((r) => ({
          id: r.id.toString(),
          status: r.status,
          reason: r.reason,
          refundAmount: money(r.refundAmount),
          createdAt: r.createdAt,
          bookingCode: r.booking?.bookingCode,
          tourName: r.booking?.tour?.name,
          userName: r.user?.fullName || r.booking?.contactName,
          userEmail: r.user?.email || r.booking?.contactEmail,
        })),
      },
      reports: [
        { key: "overview", label: "Báo cáo tổng quan" },
        { key: "bookings", label: "Báo cáo đặt tour" },
        { key: "tours", label: "Báo cáo tour" },
        { key: "destinations", label: "Báo cáo điểm đến" },
        { key: "users", label: "Báo cáo người dùng" },
        { key: "refunds", label: "Báo cáo hoàn tiền" },
        { key: "guides", label: "Báo cáo hướng dẫn viên" },
        { key: "vouchers", label: "Báo cáo voucher" },
        { key: "reviews", label: "Báo cáo đánh giá" },
        { key: "contacts", label: "Báo cáo liên hệ" },
      ],
    };
  }

  async getSmartInsights() {
    const now = new Date();
    const today = startOfToday();
    const next30Minutes = new Date(now.getTime() + 30 * 60 * 1000);
    const next7Days = addDays(today, 7);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = addMonths(thisMonth, 1);
    const lastMonth = addMonths(thisMonth, -1);
    const last30Days = addDays(today, -30);

    const [
      expiringHolds,
      expiredHolds,
      waitingConfirmations,
      pendingRefunds,
      noGuideBookings,
      lowCapacityDepartures,
      revenueThisMonth,
      revenueLastMonth,
      tourRows,
      recentBehaviorRows,
      pendingPayments,
    ] = await Promise.all([
      this.prisma.booking.findMany({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: next30Minutes },
        },
        take: 8,
        orderBy: { holdExpiresAt: "asc" },
        include: {
          tour: true,
          departure: true,
          payments: { take: 1, orderBy: { createdAt: "desc" } },
        },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { lt: now },
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
      this.prisma.tourDeparture.findMany({
        where: {
          status: "open" as any,
          departureDate: { gte: today, lte: addDays(today, 45) },
        },
        take: 12,
        orderBy: { departureDate: "asc" },
        include: { tour: { include: { destination: true } } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: thisMonth, lt: nextMonth },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: lastMonth, lt: thisMonth },
        },
      }),
      this.prisma.tour.findMany({
        where: { status: "published" as any },
        include: {
          destination: true,
          bookings: {
            where: { createdAt: { gte: last30Days } },
            select: { id: true, bookingStatus: true, finalAmount: true },
          },
          behaviors: {
            where: { createdAt: { gte: last30Days } },
            select: { action: true, score: true },
          },
          reviews: {
            where: { status: "approved" as any },
            select: { rating: true },
          },
        },
      }),
      this.prisma.userBehavior.findMany({
        where: { createdAt: { gte: last30Days }, userId: { not: null } },
        take: 1000,
        orderBy: { createdAt: "desc" },
        include: {
          tour: { include: { destination: true } },
          user: { select: { id: true, memberTier: true } },
        },
      }),
      this.prisma.booking.count({
        where: { bookingStatus: "pending_payment" as any },
      }),
    ]);

    const lowCapacity = lowCapacityDepartures
      .map((d) => {
        const remaining =
          Number(d.totalSlots || 0) -
          Number(d.bookedSlots || 0) -
          Number(d.heldSlots || 0);
        const ratio = Number(d.totalSlots || 0)
          ? remaining / Number(d.totalSlots || 1)
          : 1;
        return { ...d, remaining, ratio };
      })
      .filter((d) => d.remaining > 0 && (d.remaining <= 5 || d.ratio <= 0.2));

    const revenueNow = money((revenueThisMonth as any)?._sum?.amount);
    const revenuePrev = money((revenueLastMonth as any)?._sum?.amount);
    const revenueChangePct = revenuePrev
      ? Number((((revenueNow - revenuePrev) / revenuePrev) * 100).toFixed(2))
      : null;

    const tourPerformance = tourRows.map((tour: any) => {
      const views = (tour.behaviors || []).filter((b: any) =>
        ["view", "view_detail", "search_click"].includes(String(b.action)),
      ).length;
      const favorites = (tour.behaviors || []).filter((b: any) =>
        ["favorite", "add_favorite"].includes(String(b.action)),
      ).length;
      const bookingCount = (tour.bookings || []).filter((b: any) =>
        [
          "confirmed",
          "completed",
          "waiting_confirmation",
          "pending_payment",
        ].includes(String(b.bookingStatus)),
      ).length;
      const paidRevenue = (tour.bookings || [])
        .filter((b: any) =>
          ["confirmed", "completed", "waiting_confirmation"].includes(
            String(b.bookingStatus),
          ),
        )
        .reduce((sum: number, b: any) => sum + money(b.finalAmount), 0);
      const conversionRate = views
        ? pct(bookingCount, views)
        : bookingCount
          ? 100
          : 0;
      const avgRating = (tour.reviews || []).length
        ? Number(
            (
              (tour.reviews || []).reduce(
                (s: number, r: any) => s + Number(r.rating || 0),
                0,
              ) / tour.reviews.length
            ).toFixed(2),
          )
        : 0;
      let recommendation = "Theo dõi thêm";
      let type = "normal";
      if (bookingCount >= 5 || paidRevenue >= 30000000) {
        recommendation = "Tour bán tốt, nên tiếp tục đẩy nổi bật";
        type = "hot";
      }
      if (views >= 10 && bookingCount === 0) {
        recommendation =
          "Lượt xem cao nhưng chưa có đặt tour, nên kiểm tra giá/lịch trình/voucher";
        type = "discount";
      }
      if (views <= 1 && bookingCount === 0) {
        recommendation =
          "Tour ít quan tâm, cân nhắc ẩn hoặc tối ưu hình ảnh/nội dung";
        type = "hide";
      }
      return {
        tourId: String(tour.id),
        tourName: tour.name,
        destination: tour.destination?.name,
        views,
        favorites,
        bookingCount,
        paidRevenue,
        conversionRate,
        avgRating,
        recommendation,
        type,
      };
    });

    const topTours = [...tourPerformance]
      .sort(
        (a, b) =>
          b.bookingCount - a.bookingCount || b.paidRevenue - a.paidRevenue,
      )
      .slice(0, 5);
    const weakTours = tourPerformance
      .filter((t) => t.type === "discount" || t.type === "hide")
      .slice(0, 8);

    const segmentCounter = new Map<string, number>();
    for (const row of recentBehaviorRows as any[]) {
      const signals = [
        row.action,
        row.keyword,
        row.tour?.tourTheme,
        row.tour?.name,
        row.tour?.destination?.name,
      ];
      const segment = customerSegmentFromSignals(signals);
      segmentCounter.set(segment, (segmentCounter.get(segment) || 0) + 1);
    }
    const customerSegments = Array.from(segmentCounter.entries())
      .map(([segment, total]) => ({ segment, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    const alerts = [
      ...expiringHolds.map((b: any) => ({
        type: "booking_expiring",
        severity: "danger",
        title: `Booking ${b.bookingCode} sắp hết hạn giữ chỗ`,
        message: `${b.tour?.name || "Tour"} hết hạn lúc ${b.holdExpiresAt ? new Date(b.holdExpiresAt).toLocaleString("vi-VN") : "không rõ"}.`,
        action:
          "Nhắc khách thanh toán hoặc kiểm tra giao dịch ngân hàng/SePay.",
      })),
      expiredHolds > 0
        ? {
            type: "booking_expired",
            severity: "warning",
            title: `${expiredHolds} booking đã quá hạn giữ chỗ`,
            message: "Nên chạy xử lý hết hạn hoặc kiểm tra các đơn còn treo.",
            action: "Kiểm tra booking quá hạn.",
          }
        : null,
      waitingConfirmations > 0
        ? {
            type: "payment_review",
            severity: "warning",
            title: `${waitingConfirmations} booking chờ xác nhận`,
            message:
              "Có thể là khách đã thanh toán nhưng cần admin/SePay xác nhận.",
            action: "Đối soát thanh toán và cập nhật trạng thái.",
          }
        : null,
      pendingRefunds > 0
        ? {
            type: "refund_pending",
            severity: "danger",
            title: `${pendingRefunds} yêu cầu hoàn tiền đang chờ xử lý`,
            message: "Hoàn tiền tồn đọng ảnh hưởng trải nghiệm khách hàng.",
            action: "Ưu tiên duyệt/từ chối kèm lý do rõ ràng.",
          }
        : null,
      noGuideBookings > 0
        ? {
            type: "missing_guide",
            severity: "warning",
            title: `${noGuideBookings} booking chưa có hướng dẫn viên`,
            message:
              "Các booking đã xác nhận cần được phân công HDV trước ngày khởi hành.",
            action: "Vào mục Hướng dẫn viên để phân công.",
          }
        : null,
      ...lowCapacity.slice(0, 5).map((d: any) => ({
        type: "low_capacity",
        severity: "info",
        title: `Tour gần hết chỗ: ${d.tour?.name || "Tour"}`,
        message: `Lịch ${new Date(d.departureDate).toLocaleDateString("vi-VN")} còn khoảng ${d.remaining} chỗ.`,
        action: "Có thể gắn nhãn nổi bật hoặc tăng hiển thị để chốt chỗ cuối.",
      })),
      revenueChangePct !== null && revenueChangePct < -15
        ? {
            type: "revenue_drop",
            severity: "danger",
            title: `Doanh thu tháng này giảm ${Math.abs(revenueChangePct)}%`,
            message: `Tháng này: ${revenueNow.toLocaleString("vi-VN")}đ, tháng trước: ${revenuePrev.toLocaleString("vi-VN")}đ.`,
            action: "Kiểm tra tour yếu, voucher và booking pending_payment.",
          }
        : null,
    ].filter(Boolean);

    const suggestions = [
      pendingPayments > 0
        ? `Có ${pendingPayments} booking đang chờ thanh toán, nên ưu tiên nhắc khách trước khi hết hạn giữ chỗ.`
        : "Booking chờ thanh toán đang ổn định.",
      pendingRefunds > 0
        ? `Có ${pendingRefunds} refund pending, nên xử lý để giảm tồn đọng chăm sóc khách hàng.`
        : "Không có refund pending nghiêm trọng.",
      weakTours.length
        ? `Có ${weakTours.length} tour cần tối ưu: kiểm tra giá, ảnh, lịch khởi hành hoặc voucher.`
        : "Hiệu suất tour chưa phát hiện bất thường lớn.",
      customerSegments.length
        ? `Nhóm hành vi nổi bật: ${customerSegments
            .slice(0, 3)
            .map((x) => x.segment)
            .join(" | ")}.`
        : "Chưa đủ dữ liệu hành vi để phân nhóm khách hàng.",
    ];

    return {
      generatedAt: new Date(),
      counters: {
        expiringHolds: expiringHolds.length,
        expiredHolds,
        waitingConfirmations,
        pendingRefunds,
        noGuideBookings,
        lowCapacityDepartures: lowCapacity.length,
        revenueThisMonth: revenueNow,
        revenueLastMonth: revenuePrev,
        revenueChangePct,
      },
      alerts,
      suggestions,
      tourPerformance: {
        topTours,
        weakTours,
      },
      customerSegments,
    };
  }

  async getReport(type: string, query: Record<string, any> = {}) {
    const key = String(type || "overview").toLowerCase();
    const generatedAt = new Date();
    const smartInsights = await this.getSmartInsights();

    if (key === "overview" || key === "dashboard") {
      const overview = await this.getOverview();
      return {
        type: "overview",
        title: "Báo cáo tổng quan hệ thống Travela",
        generatedAt,
        summary: overview.summary,
        insights: smartInsights.alerts,
        data: [overview.summary],
      };
    }

    if (key === "tours") return this.reportTours(generatedAt, smartInsights);
    if (key === "bookings")
      return this.reportBookings(query, generatedAt, smartInsights);
    if (key === "vouchers")
      return this.reportVouchers(generatedAt, smartInsights);
    if (key === "users")
      return this.reportUsers(query, generatedAt, smartInsights);
    if (key === "refunds")
      return this.reportRefunds(query, generatedAt, smartInsights);
    if (key === "guides") return this.reportGuides(generatedAt, smartInsights);
    if (key === "destinations")
      return this.reportDestinations(generatedAt, smartInsights);
    if (key === "payments")
      return this.reportPayments(generatedAt, smartInsights);
    if (key === "reviews")
      return this.reportReviews(query, generatedAt, smartInsights);
    if (key === "contacts")
      return this.reportContacts(query, generatedAt, smartInsights);

    return {
      type: key,
      title: `Báo cáo ${key}`,
      generatedAt,
      summary: { message: "Loại báo cáo chưa được hỗ trợ." },
      insights: smartInsights.alerts,
      data: [],
    };
  }

  private async reportTours(generatedAt: Date, smartInsights: any) {
    const tours = await this.prisma.tour.findMany({
      include: {
        destination: true,
        departures: true,
        bookings: true,
        behaviors: true,
        reviews: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = tours.map((tour: any) => {
      const bookings = tour.bookings || [];
      const paidBookings = bookings.filter((b: any) =>
        ["confirmed", "completed", "waiting_confirmation"].includes(
          String(b.bookingStatus),
        ),
      );
      const views = (tour.behaviors || []).filter((b: any) =>
        ["view", "view_detail", "search_click"].includes(String(b.action)),
      ).length;
      const favorites = (tour.behaviors || []).filter((b: any) =>
        ["favorite", "add_favorite"].includes(String(b.action)),
      ).length;
      const avgRating = (tour.reviews || []).length
        ? Number(
            (
              (tour.reviews || []).reduce(
                (s: number, r: any) => s + Number(r.rating || 0),
                0,
              ) / tour.reviews.length
            ).toFixed(2),
          )
        : 0;
      const revenue = paidBookings.reduce(
        (sum: number, b: any) => sum + money(b.finalAmount),
        0,
      );
      const openDepartures = (tour.departures || []).filter(
        (d: any) => d.status === "open",
      );
      const minRemainingSlots = openDepartures.length
        ? Math.min(
            ...openDepartures.map(
              (d: any) =>
                Number(d.totalSlots || 0) -
                Number(d.bookedSlots || 0) -
                Number(d.heldSlots || 0),
            ),
          )
        : 0;
      const conversionRate = pct(bookings.length, Math.max(views, 1));
      let smartSuggestion = "Theo dõi thêm";
      if (revenue >= 30000000 || bookings.length >= 5)
        smartSuggestion = "Tour bán tốt, nên tiếp tục đẩy nổi bật";
      else if (views >= 10 && bookings.length === 0)
        smartSuggestion =
          "Lượt xem cao nhưng chưa có booking, nên kiểm tra giá/voucher/lịch trình";
      else if (views <= 1 && bookings.length === 0)
        smartSuggestion = "Ít tương tác, cân nhắc ẩn hoặc tối ưu nội dung";
      else if (minRemainingSlots > 0 && minRemainingSlots <= 5)
        smartSuggestion = "Gần hết chỗ, nên đẩy thông báo khan hiếm";
      return {
        id: toId(tour.id),
        code: tour.code,
        name: tour.name,
        destination: tour.destination?.name || "",
        province: tour.destination?.province || "",
        tourTheme: tour.tourTheme,
        duration: `${tour.durationDays}N${tour.durationNights}Đ`,
        status: tour.status,
        basePriceAdult: money(tour.basePriceAdult),
        totalDepartures: (tour.departures || []).length,
        openDepartures: openDepartures.length,
        minRemainingSlots,
        totalBookings: bookings.length,
        paidBookings: paidBookings.length,
        revenue,
        views,
        favorites,
        conversionRate,
        avgRating,
        smartSuggestion,
        createdAt: tour.createdAt,
      };
    });

    return {
      type: "tours",
      title: "Báo cáo quản lý tour",
      generatedAt,
      summary: {
        totalTours: rows.length,
        publishedTours: rows.filter((x) => x.status === "published").length,
        totalBookings: rows.reduce((s, x) => s + x.totalBookings, 0),
        totalRevenue: rows.reduce((s, x) => s + x.revenue, 0),
        weakTours: rows.filter((x) =>
          /kiểm tra|ẩn|tối ưu/.test(x.smartSuggestion),
        ).length,
      },
      insights:
        smartInsights.tourPerformance?.weakTours || smartInsights.alerts,
      data: rows,
    };
  }

  private buildBookingWhere(query: Record<string, any>) {
    const where: any = {};
    if (query.status) where.bookingStatus = query.status;
    if (query.tourId) where.tourId = BigInt(query.tourId);
    if (query.destinationId)
      where.tour = { destinationId: BigInt(query.destinationId) };
    const from = dateOrUndefined(query.departureFrom);
    const to = dateOrUndefined(query.departureTo);
    if (from || to)
      where.departure = {
        departureDate: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: to } : {}),
        },
      };
    if (query.search) {
      const search = String(query.search);
      where.OR = [
        { bookingCode: { contains: search } },
        { contactName: { contains: search } },
        { contactEmail: { contains: search } },
        { contactPhone: { contains: search } },
        { tour: { name: { contains: search } } },
      ];
    }
    return where;
  }

  private async reportBookings(
    query: Record<string, any>,
    generatedAt: Date,
    smartInsights: any,
  ) {
    const where = this.buildBookingWhere(query);
    const bookings = await this.prisma.booking.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        tour: { include: { destination: true } },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        guideAssignments: { include: { guide: true } },
      },
    });
    const rows = bookings.map((b: any) => {
      const payment = b.payments?.[0];
      const now = new Date();
      const holdMs = b.holdExpiresAt
        ? new Date(b.holdExpiresAt).getTime() - now.getTime()
        : null;
      const daysToDeparture = b.departure?.departureDate
        ? Math.ceil(
            (new Date(b.departure.departureDate).getTime() - now.getTime()) /
              864e5,
          )
        : null;
      const riskFlags = [];
      if (
        b.bookingStatus === "pending_payment" &&
        holdMs !== null &&
        holdMs <= 30 * 60 * 1000 &&
        holdMs > 0
      )
        riskFlags.push("Sắp hết hạn giữ chỗ");
      if (
        b.bookingStatus === "pending_payment" &&
        holdMs !== null &&
        holdMs < 0
      )
        riskFlags.push("Quá hạn giữ chỗ");
      if (
        ["confirmed", "waiting_confirmation"].includes(
          String(b.bookingStatus),
        ) &&
        !(b.guideAssignments || []).length
      )
        riskFlags.push("Chưa có HDV");
      if (b.bookingStatus === "waiting_confirmation")
        riskFlags.push("Cần xác nhận thanh toán");
      if (
        daysToDeparture !== null &&
        daysToDeparture <= 7 &&
        ["pending_payment", "waiting_confirmation"].includes(
          String(b.bookingStatus),
        )
      )
        riskFlags.push("Sắp khởi hành nhưng chưa ổn định");
      return {
        id: toId(b.id),
        bookingCode: b.bookingCode,
        customer: b.contactName,
        email: b.contactEmail,
        phone: b.contactPhone,
        tour: b.tour?.name || "",
        destination: b.tour?.destination?.name || "",
        departureDate: b.departure?.departureDate || "",
        endDate: b.departure?.endDate || "",
        adultCount: b.adultCount,
        childCount: b.childCount,
        bookingStatus: b.bookingStatus,
        paymentStatus: payment?.paymentStatus || "",
        paymentMethod: payment?.paymentMethod || "",
        finalAmount: money(b.finalAmount),
        voucherCode: b.voucherCode || "",
        guide: (b.guideAssignments || [])
          .map((x: any) => x.guide?.fullName)
          .filter(Boolean)
          .join(", "),
        pickup: b.pickupName || "",
        holdExpiresAt: b.holdExpiresAt || "",
        daysToDeparture,
        smartRisk: riskFlags.join(", ") || "Ổn định",
        createdAt: b.createdAt,
      };
    });
    return {
      type: "bookings",
      title: "Báo cáo booking điều hành",
      generatedAt,
      summary: {
        totalBookings: rows.length,
        pendingPayment: rows.filter(
          (x) => x.bookingStatus === "pending_payment",
        ).length,
        waitingConfirmation: rows.filter(
          (x) => x.bookingStatus === "waiting_confirmation",
        ).length,
        confirmed: rows.filter((x) =>
          ["confirmed", "completed"].includes(x.bookingStatus),
        ).length,
        cancelled: rows.filter((x) => x.bookingStatus === "cancelled").length,
        totalRevenue: rows
          .filter((x) =>
            ["paid", "waiting_confirmation"].includes(x.paymentStatus),
          )
          .reduce((s, x) => s + x.finalAmount, 0),
        riskBookings: rows.filter((x) => x.smartRisk !== "Ổn định").length,
      },
      insights: smartInsights.alerts.filter(
        (x: any) =>
          String(x.type || "").includes("booking") ||
          ["payment_review", "missing_guide"].includes(x.type),
      ),
      data: rows,
    };
  }

  private async reportVouchers(generatedAt: Date, smartInsights: any) {
    const vouchers = await this.prisma.voucher.findMany({
      include: { userVouchers: true, bookings: true },
      orderBy: { createdAt: "desc" },
    });
    const rows = vouchers.map((v: any) => {
      const bookings = v.bookings || [];
      const revenue = bookings
        .filter((b: any) =>
          ["confirmed", "completed", "waiting_confirmation"].includes(
            String(b.bookingStatus),
          ),
        )
        .reduce((s: number, b: any) => s + money(b.finalAmount), 0);
      const usageRate = v.quota
        ? pct(Number(v.usedCount || 0), Number(v.quota || 0))
        : pct(
            (v.userVouchers || []).filter((uv: any) => uv.status === "used")
              .length,
            Math.max((v.userVouchers || []).length, 1),
          );
      const suggestion =
        usageRate >= 70
          ? "Voucher hiệu quả, có thể duy trì/mở rộng"
          : usageRate <= 10
            ? "Hiệu quả thấp, nên kiểm tra điều kiện áp dụng hoặc truyền thông"
            : "Theo dõi thêm";
      return {
        id: toId(v.id),
        code: v.code,
        name: v.name,
        memberTier: v.memberTier,
        discountType: v.discountType,
        discountValue: money(v.discountValue),
        maxDiscount: money(v.maxDiscount),
        minOrderAmount: money(v.minOrderAmount),
        quota: v.quota,
        usedCount: v.usedCount,
        assignedUsers: (v.userVouchers || []).length,
        availableUsers: (v.userVouchers || []).filter(
          (uv: any) => uv.status === "available",
        ).length,
        usedUsers: (v.userVouchers || []).filter(
          (uv: any) => uv.status === "used",
        ).length,
        bookingCount: bookings.length,
        revenue,
        usageRate,
        status: v.status,
        startDate: v.startDate,
        endDate: v.endDate,
        smartSuggestion: suggestion,
      };
    });
    return {
      type: "vouchers",
      title: "Báo cáo hiệu quả voucher",
      generatedAt,
      summary: {
        totalVouchers: rows.length,
        activeVouchers: rows.filter((x) => x.status === "active").length,
        totalUsed: rows.reduce((s, x) => s + Number(x.usedCount || 0), 0),
        totalRevenue: rows.reduce((s, x) => s + x.revenue, 0),
        weakVouchers: rows.filter((x) => /thấp/.test(x.smartSuggestion)).length,
      },
      insights: rows
        .filter((x) => /thấp|hiệu quả/.test(x.smartSuggestion))
        .slice(0, 10),
      data: rows,
    };
  }

  private async reportUsers(
    query: Record<string, any>,
    generatedAt: Date,
    smartInsights: any,
  ) {
    const where: any = { role: "user" as any };
    if (query.status) where.status = query.status;
    if (query.search) {
      const search = String(query.search);
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: {
        bookings: { include: { tour: { include: { destination: true } } } },
        behaviors: {
          take: 30,
          orderBy: { createdAt: "desc" },
          include: { tour: { include: { destination: true } } },
        },
        favoriteTours: {
          include: { tour: { include: { destination: true } } },
        },
        userVouchers: true,
      },
    });
    const rows = users.map((u: any) => {
      const signals = [
        ...(u.bookings || []).map(
          (b: any) =>
            `${b.tour?.name || ""} ${b.tour?.tourTheme || ""} ${b.tour?.destination?.name || ""} ${b.voucherCode || ""}`,
        ),
        ...(u.behaviors || []).map(
          (b: any) =>
            `${b.action || ""} ${b.keyword || ""} ${b.tour?.name || ""} ${b.tour?.tourTheme || ""} ${b.tour?.destination?.name || ""}`,
        ),
        ...(u.favoriteTours || []).map(
          (f: any) =>
            `${f.tour?.name || ""} ${f.tour?.tourTheme || ""} ${f.tour?.destination?.name || ""}`,
        ),
      ];
      const paidBookings = (u.bookings || []).filter((b: any) =>
        ["confirmed", "completed", "waiting_confirmation"].includes(
          String(b.bookingStatus),
        ),
      );
      return {
        id: toId(u.id),
        fullName: u.fullName,
        email: u.email,
        phone: u.phone || "",
        memberTier: u.memberTier,
        memberPoints: u.memberPoints,
        status: u.status,
        totalBookings: (u.bookings || []).length,
        paidBookings: paidBookings.length,
        totalSpent: paidBookings.reduce(
          (sum: number, b: any) => sum + money(b.finalAmount),
          0,
        ),
        favoriteCount: (u.favoriteTours || []).length,
        behaviorCount: (u.behaviors || []).length,
        availableVouchers: (u.userVouchers || []).filter(
          (x: any) => x.status === "available",
        ).length,
        usedVouchers: (u.userVouchers || []).filter(
          (x: any) => x.status === "used",
        ).length,
        smartSegment: customerSegmentFromSignals(signals),
        createdAt: u.createdAt,
      };
    });
    const segmentCounts = rows.reduce((acc: any, row) => {
      acc[row.smartSegment] = (acc[row.smartSegment] || 0) + 1;
      return acc;
    }, {});
    return {
      type: "users",
      title: "Báo cáo người dùng và phân nhóm hành vi",
      generatedAt,
      summary: {
        totalUsers: rows.length,
        activeUsers: rows.filter((x) => x.status === "active").length,
        totalSpent: rows.reduce((s, x) => s + x.totalSpent, 0),
        behaviorReadyUsers: rows.filter(
          (x) => x.smartSegment !== "Chưa đủ dữ liệu hành vi",
        ).length,
        segments: segmentCounts,
      },
      insights: smartInsights.customerSegments,
      data: rows,
    };
  }

  private async reportRefunds(
    query: Record<string, any>,
    generatedAt: Date,
    smartInsights: any,
  ) {
    const where: any = {};
    if (query.status && query.status !== "all") where.status = query.status;
    const rowsRaw = await this.prisma.refundRequest.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        booking: {
          include: {
            tour: true,
            departure: true,
            payments: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
      },
    });
    const rows = rowsRaw.map((r: any) => ({
      id: toId(r.id),
      bookingCode: r.booking?.bookingCode || "",
      customer: r.user?.fullName || r.booking?.contactName || "",
      email: r.user?.email || r.booking?.contactEmail || "",
      tour: r.booking?.tour?.name || "",
      departureDate: r.booking?.departure?.departureDate || "",
      reason: r.reason,
      refundAmount: money(r.refundAmount || r.booking?.finalAmount),
      bookingAmount: money(r.booking?.finalAmount),
      status: r.status,
      adminNote: r.adminNote || "",
      reviewedAt: r.reviewedAt || "",
      createdAt: r.createdAt,
    }));
    return {
      type: "refunds",
      title: "Báo cáo hoàn tiền",
      generatedAt,
      summary: {
        totalRefunds: rows.length,
        pending: rows.filter((x) => x.status === "pending").length,
        approved: rows.filter((x) => x.status === "approved").length,
        rejected: rows.filter((x) => x.status === "rejected").length,
        totalRefundAmount: rows.reduce((s, x) => s + x.refundAmount, 0),
      },
      insights: smartInsights.alerts.filter(
        (x: any) => x.type === "refund_pending",
      ),
      data: rows,
    };
  }

  private async reportGuides(generatedAt: Date, smartInsights: any) {
    const guides = await this.prisma.guide.findMany({
      include: {
        assignments: {
          include: { booking: { include: { tour: true, departure: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const rows = guides.map((g: any) => {
      const activeAssignments = (g.assignments || []).filter((a: any) =>
        ["assigned", "confirmed"].includes(String(a.status)),
      );
      return {
        id: toId(g.id),
        fullName: g.fullName,
        phone: g.phone,
        email: g.email || "",
        languages: g.languages || "",
        experienceYears: g.experienceYears,
        status: g.status,
        totalAssignments: (g.assignments || []).length,
        activeAssignments: activeAssignments.length,
        smartLoad:
          activeAssignments.length >= 5
            ? "Tải cao"
            : activeAssignments.length === 0
              ? "Đang rảnh"
              : "Bình thường",
        createdAt: g.createdAt,
      };
    });
    return {
      type: "guides",
      title: "Báo cáo hướng dẫn viên",
      generatedAt,
      summary: {
        totalGuides: rows.length,
        activeGuides: rows.filter((x) => x.status === "active").length,
        busyGuides: rows.filter((x) => x.activeAssignments > 0).length,
        freeGuides: rows.filter((x) => x.activeAssignments === 0).length,
      },
      insights: smartInsights.alerts.filter(
        (x: any) => x.type === "missing_guide",
      ),
      data: rows,
    };
  }

  private async reportDestinations(generatedAt: Date, smartInsights: any) {
    const destinations = await this.prisma.destination.findMany({
      include: { tours: { include: { bookings: true, behaviors: true } } },
      orderBy: { createdAt: "desc" },
    });
    const rows = destinations.map((d: any) => {
      const bookings = (d.tours || []).flatMap((t: any) => t.bookings || []);
      const behaviors = (d.tours || []).flatMap((t: any) => t.behaviors || []);
      const revenue = bookings
        .filter((b: any) =>
          ["confirmed", "completed", "waiting_confirmation"].includes(
            String(b.bookingStatus),
          ),
        )
        .reduce((s: number, b: any) => s + money(b.finalAmount), 0);
      return {
        id: toId(d.id),
        name: d.name,
        province: d.province,
        country: d.country,
        status: d.status,
        totalTours: (d.tours || []).length,
        publishedTours: (d.tours || []).filter(
          (t: any) => t.status === "published",
        ).length,
        totalBookings: bookings.length,
        behaviorCount: behaviors.length,
        revenue,
        smartSuggestion:
          bookings.length >= 5
            ? "Điểm đến có nhu cầu tốt"
            : behaviors.length >= 10 && bookings.length === 0
              ? "Nhiều tương tác nhưng ít booking, nên tối ưu tour/voucher"
              : "Theo dõi thêm",
        createdAt: d.createdAt,
      };
    });
    return {
      type: "destinations",
      title: "Báo cáo điểm đến",
      generatedAt,
      summary: {
        totalDestinations: rows.length,
        activeDestinations: rows.filter((x) => x.status === "active").length,
        totalTours: rows.reduce((s, x) => s + x.totalTours, 0),
        totalBookings: rows.reduce((s, x) => s + x.totalBookings, 0),
        totalRevenue: rows.reduce((s, x) => s + x.revenue, 0),
      },
      insights: rows
        .filter((x) => x.smartSuggestion !== "Theo dõi thêm")
        .slice(0, 10),
      data: rows,
    };
  }

  private async reportPayments(generatedAt: Date, smartInsights: any) {
    const payments = await this.prisma.payment.findMany({
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { booking: { include: { tour: true } } },
    });
    const rows = payments.map((p: any) => ({
      id: toId(p.id),
      bookingCode: p.booking?.bookingCode || "",
      tour: p.booking?.tour?.name || "",
      method: p.paymentMethod,
      status: p.paymentStatus,
      amount: money(p.amount),
      internalTransactionCode: p.internalTransactionCode,
      gatewayTransactionId: p.gatewayTransactionId || "",
      paidAt: p.paidAt || "",
      createdAt: p.createdAt,
    }));
    return {
      type: "payments",
      title: "Báo cáo thanh toán",
      generatedAt,
      summary: {
        totalPayments: rows.length,
        paidPayments: rows.filter((x) => x.status === "paid").length,
        pendingPayments: rows.filter((x) => x.status === "pending").length,
        totalPaidAmount: rows
          .filter((x) => x.status === "paid")
          .reduce((s, x) => s + x.amount, 0),
        successRate: pct(
          rows.filter((x) => x.status === "paid").length,
          rows.length,
        ),
      },
      insights: smartInsights.alerts.filter(
        (x: any) => x.type === "payment_review",
      ),
      data: rows,
    };
  }

  private async reportReviews(
    query: Record<string, any>,
    generatedAt: Date,
    smartInsights: any,
  ) {
    const where: any = {};
    if (query.status) where.status = query.status;
    const reviews = await this.prisma.review.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { tour: true, user: true },
    });
    const rows = reviews.map((r: any) => ({
      id: toId(r.id),
      tour: r.tour?.name || "",
      customer: r.user?.fullName || "Khách vãng lai",
      email: r.user?.email || "",
      rating: r.rating,
      comment: r.comment || "",
      adminReply: r.adminReply || "",
      status: r.status,
      createdAt: r.createdAt,
    }));
    return {
      type: "reviews",
      title: "Báo cáo đánh giá",
      generatedAt,
      summary: {
        totalReviews: rows.length,
        pending: rows.filter((x) => x.status === "pending").length,
        approved: rows.filter((x) => x.status === "approved").length,
        averageRating: rows.length
          ? Number(
              (
                rows.reduce((s, x) => s + Number(x.rating || 0), 0) /
                rows.length
              ).toFixed(2),
            )
          : 0,
      },
      insights: [],
      data: rows,
    };
  }

  private async reportContacts(
    query: Record<string, any>,
    generatedAt: Date,
    smartInsights: any,
  ) {
    const where: any = {};
    if (query.status) where.status = query.status;
    const contacts = await this.prisma.contact.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: "desc" },
      include: { user: true, handler: true },
    });
    const rows = contacts.map((c: any) => ({
      id: toId(c.id),
      fullName: c.fullName,
      email: c.email,
      phone: c.phone || "",
      subject: c.subject,
      message: c.message,
      status: c.status,
      handledBy: c.handler?.fullName || "",
      adminReply: c.adminReply || "",
      repliedAt: c.repliedAt || "",
      replyEmailSentAt: c.replyEmailSentAt || "",
      replyEmailError: c.replyEmailError || "",
      createdAt: c.createdAt,
    }));
    return {
      type: "contacts",
      title: "Báo cáo liên hệ",
      generatedAt,
      summary: {
        totalContacts: rows.length,
        newContacts: rows.filter((x) => x.status === "new").length,
        resolvedContacts: rows.filter((x) => x.status === "resolved").length,
        emailErrors: rows.filter((x) => x.replyEmailError).length,
      },
      insights: [],
      data: rows,
    };
  }
}
