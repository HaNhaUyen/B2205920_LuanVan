// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function money(value: any) {
  return Number(value || 0);
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
    ] = await Promise.all([
      this.prisma.tour.count(),
      this.prisma.tour.count({ where: { status: 'published' } }),
      this.prisma.booking.count(),
      this.prisma.booking.count({ where: { bookingStatus: { in: ['pending_payment', 'waiting_confirmation'] } } }),
      this.prisma.booking.count({ where: { bookingStatus: { in: ['confirmed', 'completed'] } } }),
      this.prisma.user.count({ where: { role: 'user' } }),
      this.prisma.user.count({ where: { role: 'user', createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      this.prisma.guide.count(),
      this.prisma.guideAssignment.count({ where: { status: { in: ['assigned', 'confirmed'] } } }),
      this.prisma.refundRequest.count(),
      this.prisma.refundRequest.count({ where: { status: 'pending' } }),
      this.prisma.voucher.count(),
      this.prisma.voucher.count({ where: { status: 'active' } }),
      this.prisma.contact.count(),
      this.prisma.contact.count({ where: { status: 'new' } }),
      this.prisma.review.count(),
      this.prisma.review.count({ where: { status: 'pending' } }),
      this.prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentStatus: 'paid' } }),
      this.prisma.payment.count(),
      this.prisma.booking.findMany({
        take: 12,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { fullName: true, email: true, phone: true } },
          tour: { select: { name: true, slug: true } },
          departure: true,
          guideAssignments: { where: { status: { in: ['assigned', 'confirmed'] } }, include: { guide: true }, take: 1, orderBy: { createdAt: 'desc' } },
          payments: { take: 1, orderBy: { createdAt: 'desc' }, select: { paymentStatus: true, paymentMethod: true } },
        },
      }),
      this.prisma.user.findMany({
        take: 12,
        where: { role: 'user' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, fullName: true, email: true, phone: true, identityNumber: true, memberPoints: true, memberTier: true, createdAt: true },
      }),
      this.prisma.user.findMany({
        take: 12,
        where: { role: 'user' },
        orderBy: [{ memberPoints: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, fullName: true, email: true, memberPoints: true, memberTier: true, bookings: { select: { finalAmount: true, bookingStatus: true } } },
      }),
      this.prisma.refundRequest.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { user: true, booking: { include: { tour: true } } },
      }),
      this.prisma.booking.groupBy({ by: ['bookingStatus'], _count: { _all: true } }),
      this.prisma.payment.groupBy({ by: ['paymentStatus'], _count: { _all: true } }),
      this.prisma.refundRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ['tourId'], _count: { _all: true }, orderBy: { _count: { tourId: 'desc' } }, take: 8 }),
      this.prisma.payment.findMany({ where: { paymentStatus: 'paid', paidAt: { not: null } }, select: { amount: true, paidAt: true } }),
      this.prisma.user.groupBy({ by: ['memberTier'], where: { role: 'user' }, _count: { _all: true } }),
    ]);

    const bookingsByStatus = bookingsByStatusRaw.map((item) => ({ status: item.bookingStatus, total: item._count._all }));
    const paymentsByStatus = paymentsByStatusRaw.map((item) => ({ status: item.paymentStatus, total: item._count._all }));
    const refundsByStatus = refundByStatusRaw.map((item) => ({ status: item.status, total: item._count._all }));
    const usersByTier = usersByTierRaw.map((item) => ({ tier: item.memberTier, total: item._count._all }));

    const tourIds = topToursRaw.map((item) => item.tourId);
    const tours = tourIds.length
      ? await this.prisma.tour.findMany({ where: { id: { in: tourIds } }, select: { id: true, name: true, slug: true, basePriceAdult: true } })
      : [];
    const tourMap = new Map(tours.map((tour) => [tour.id.toString(), tour]));
    const topTours = topToursRaw.map((item) => ({
      tourId: item.tourId.toString(),
      tourName: tourMap.get(item.tourId.toString())?.name ?? 'Unknown tour',
      slug: tourMap.get(item.tourId.toString())?.slug ?? '',
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
      if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) || 0) + money(row.amount));
    }
    const monthlyRevenue = Array.from(monthlyMap.entries()).map(([month, revenue]) => ({ month, revenue }));
    const paidCount = paymentsByStatus.find((item) => item.status === 'paid')?.total ?? 0;
    const paymentSuccessRate = allPayments === 0 ? 0 : Number(((paidCount / allPayments) * 100).toFixed(2));

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
      charts: { bookingsByStatus, paymentsByStatus, refundsByStatus, usersByTier, monthlyRevenue },
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
          totalSpent: u.bookings.filter((b) => ['confirmed', 'completed'].includes(b.bookingStatus)).reduce((sum, b) => sum + money(b.finalAmount), 0),
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
        { key: 'overview', label: 'Báo cáo tổng quan' },
        { key: 'bookings', label: 'Báo cáo đặt tour' },
        { key: 'users', label: 'Báo cáo người dùng' },
        { key: 'refunds', label: 'Báo cáo hoàn tiền' },
        { key: 'guides', label: 'Báo cáo hướng dẫn viên' },
        { key: 'vouchers', label: 'Báo cáo voucher' },
      ],
    };
  }
}
