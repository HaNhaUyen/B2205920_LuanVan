// @ts-nocheck
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { AdminUpsertBookingDto } from "./dto/admin-upsert-booking.dto";
import { UpdateBookingDto } from "./dto/update-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";
import { RedisService } from "../../redis/redis.service";
import { EmailService } from "../../common/services/email.service";

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly emailService: EmailService,
  ) {}

  private normalizeUserId(value: any): bigint | undefined {
    if (!value) return undefined;

    if (typeof value === "bigint") return value;

    if (typeof value === "number" && Number.isFinite(value)) {
      return BigInt(value);
    }

    if (typeof value === "string" && value.trim()) {
      return BigInt(value);
    }

    if (typeof value === "object") {
      if (value.userId) return this.normalizeUserId(value.userId);
      if (value.id) return this.normalizeUserId(value.id);
      if (value.sub) return this.normalizeUserId(value.sub);
    }

    return undefined;
  }

  private calcStatusCategory(status: string) {
    if (["confirmed", "completed"].includes(status)) return "booked";
    if (["pending_payment", "waiting_confirmation"].includes(status)) {
      return "held";
    }
    return "none";
  }

  private normalizeEmail(value: string) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  private normalizePhone(value: string) {
    return String(value || "").trim();
  }

  private buildHoldExpireAt() {
    return new Date(Date.now() + 15 * 60 * 1000);
  }

  /**
   * Điểm thưởng khi hoàn thành một booking đã thanh toán.
   * Có thể đổi giá trị này sau mà không phải sửa nhiều nơi.
   */
  private readonly COMPLETED_BOOKING_REWARD_POINTS = 100;

  /**
   * Ngưỡng hạng thành viên dùng thống nhất toàn hệ thống.
   */
  private calculateMemberTier(points: number) {
    const safePoints = Math.max(Number(points || 0), 0);

    if (safePoints >= 4000) return "diamond";
    if (safePoints >= 1500) return "gold";
    if (safePoints >= 500) return "silver";

    return "bronze";
  }

  private isPaidBooking(booking: any) {
    const payments = Array.isArray(booking?.payments) ? booking.payments : [];

    return payments.some((payment: any) =>
      ["paid", "success", "completed"].includes(
        String(payment?.paymentStatus || "").toLowerCase(),
      ),
    );
  }

  private hasTripEnded(booking: any) {
    const rawEndDate =
      booking?.departure?.endDate || booking?.departure?.departureDate;

    if (!rawEndDate) return false;

    const endDate = new Date(rawEndDate);

    if (Number.isNaN(endDate.getTime())) return false;

    endDate.setHours(23, 59, 59, 999);

    return endDate.getTime() < Date.now();
  }

  /**
   * Cấp voucher phù hợp khi người dùng vừa lên hạng.
   * skipDuplicates ngăn cấp trùng voucher đã có.
   */
  private async assignTierVouchersToUser(
    tx: Prisma.TransactionClient,
    userId: bigint,
    memberTier: string,
  ) {
    const today = new Date();

    const vouchers = await tx.voucher.findMany({
      where: {
        memberTier: memberTier as any,
        status: "active",
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: { id: true },
    });

    if (!vouchers.length) return 0;

    const result = await tx.userVoucher.createMany({
      data: vouchers.map((voucher: any) => ({
        userId,
        voucherId: voucher.id,
        status: "available" as any,
      })),
      skipDuplicates: true,
    });

    return Number(result?.count || 0);
  }

  /**
   * Cộng điểm hoàn thành chuyến đi đúng một lần cho mỗi booking.
   *
   * Điều kiện:
   * - booking có userId;
   * - chuyến đi đã kết thúc;
   * - đã thanh toán thành công;
   * - chưa có log actionType = membership_reward.
   */
  private async rewardCompletedBooking(
    tx: Prisma.TransactionClient,
    booking: any,
    changedBy?: bigint,
  ) {
    if (!booking?.userId) {
      return {
        rewarded: false,
        reason: "guest_booking",
      };
    }

    if (!this.hasTripEnded(booking)) {
      return {
        rewarded: false,
        reason: "trip_not_finished",
      };
    }

    if (!this.isPaidBooking(booking)) {
      return {
        rewarded: false,
        reason: "payment_not_paid",
      };
    }

    const existingRewardLog = await tx.bookingStatusLog.findFirst({
      where: {
        bookingId: booking.id,
        actionType: "membership_reward",
      },
      select: { id: true },
    });

    if (existingRewardLog) {
      return {
        rewarded: false,
        reason: "already_rewarded",
      };
    }

    const currentUser = await tx.user.findUnique({
      where: { id: booking.userId },
      select: {
        id: true,
        memberPoints: true,
        memberTier: true,
        role: true,
        status: true,
      },
    });

    if (
      !currentUser ||
      currentUser.role !== "user" ||
      currentUser.status !== "active"
    ) {
      return {
        rewarded: false,
        reason: "user_not_eligible",
      };
    }

    const earnedPoints = this.COMPLETED_BOOKING_REWARD_POINTS;
    const oldTier = String(currentUser.memberTier || "bronze");
    const nextPoints = Number(currentUser.memberPoints || 0) + earnedPoints;
    const nextTier = this.calculateMemberTier(nextPoints);

    const updatedUser = await tx.user.update({
      where: { id: currentUser.id },
      data: {
        memberPoints: nextPoints,
        memberTier: nextTier as any,
      },
      select: {
        id: true,
        memberPoints: true,
        memberTier: true,
      },
    });

    const tierChanged = oldTier !== nextTier;

    if (tierChanged) {
      await this.assignTierVouchersToUser(tx, currentUser.id, nextTier);
    }

    await tx.bookingStatusLog.create({
      data: {
        bookingId: booking.id,
        actionType: "membership_reward",
        oldStatus: booking.bookingStatus,
        newStatus: "completed",
        changedByUserId: changedBy,
        source: changedBy ? "admin" : "system",
        reason: "Reward points after completed paid trip",
        note:
          `Cộng ${earnedPoints} điểm thành viên. ` +
          `Tổng điểm: ${nextPoints}. Hạng: ${nextTier}.`,
      },
    });

    await tx.notification.create({
      data: {
        title: tierChanged
          ? `Hoàn thành chuyến đi · Lên hạng ${nextTier}`
          : "Cộng điểm sau chuyến đi",
        message: `Bạn được cộng ${earnedPoints} điểm thành viên.`,
        content:
          `Booking ${booking.bookingCode} đã hoàn thành. ` +
          `Travela đã cộng ${earnedPoints} điểm thành viên. ` +
          `Tổng điểm hiện tại: ${nextPoints}. ` +
          `Hạng thành viên: ${nextTier}.` +
          (tierChanged
            ? " Voucher phù hợp với hạng mới đã được thêm vào tài khoản nếu còn hiệu lực và còn quota."
            : ""),
        targetRole: "user" as any,
        targetUserId: booking.userId,
        isPublished: true,
        createdBy: changedBy,
      },
    });

    return {
      rewarded: true,
      earnedPoints,
      totalPoints: Number(updatedUser.memberPoints || 0),
      oldTier,
      memberTier: String(updatedUser.memberTier || nextTier),
      tierChanged,
    };
  }

  /**
   * Tự động chuyển booking confirmed đã qua ngày kết thúc sang completed
   * và cộng điểm. Có chống cộng trùng bằng booking_status_logs.
   */
  async syncCompletedBookingsAndRewards(changedBy?: bigint) {
    const now = new Date();

    /*
     * Quét cả:
     * - confirmed: đã qua ngày kết thúc, cần tự chuyển sang completed;
     * - completed: dữ liệu cũ đã hoàn thành nhưng chưa từng được cộng điểm.
     */
    const candidates = await this.prisma.booking.findMany({
      where: {
        bookingStatus: {
          in: ["confirmed", "completed"] as any,
        },
        userId: {
          not: null,
        },
        departure: {
          is: {
            endDate: {
              lt: now,
            },
          },
        },
        payments: {
          some: {
            paymentStatus: {
              in: ["paid", "success", "completed"] as any,
            },
          },
        },
        logs: {
          none: {
            actionType: "membership_reward",
          },
        },
      },
      include: {
        departure: true,
        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },
        tour: true,
      },
      orderBy: {
        id: "asc",
      },
      take: 500,
    });

    let completedCount = 0;
    let rewardedCount = 0;
    const results: any[] = [];

    for (const candidate of candidates) {
      const result = await this.prisma.$transaction(async (tx) => {
        /*
         * Đọc lại bên trong transaction để hạn chế xử lý trùng
         * khi nhiều request đồng thời gọi API đồng bộ.
         */
        const fresh = await tx.booking.findUnique({
          where: {
            id: candidate.id,
          },
          include: {
            departure: true,
            payments: {
              orderBy: {
                createdAt: "desc",
              },
            },
            tour: true,
            logs: {
              where: {
                actionType: "membership_reward",
              },
              take: 1,
            },
          },
        });

        if (!fresh) {
          return {
            bookingId: String(candidate.id),
            completed: false,
            autoCompleted: false,
            rewarded: false,
            reason: "booking_not_found",
          };
        }

        if (fresh.logs?.length) {
          return {
            bookingId: String(fresh.id),
            bookingCode: fresh.bookingCode,
            completed: fresh.bookingStatus === "completed",
            autoCompleted: false,
            rewarded: false,
            reason: "already_rewarded",
          };
        }

        if (!["confirmed", "completed"].includes(String(fresh.bookingStatus))) {
          return {
            bookingId: String(fresh.id),
            bookingCode: fresh.bookingCode,
            completed: false,
            autoCompleted: false,
            rewarded: false,
            reason: "invalid_booking_status",
          };
        }

        if (!this.hasTripEnded(fresh)) {
          return {
            bookingId: String(fresh.id),
            bookingCode: fresh.bookingCode,
            completed: false,
            autoCompleted: false,
            rewarded: false,
            reason: "trip_not_finished",
          };
        }

        if (!this.isPaidBooking(fresh)) {
          return {
            bookingId: String(fresh.id),
            bookingCode: fresh.bookingCode,
            completed: false,
            autoCompleted: false,
            rewarded: false,
            reason: "payment_not_paid",
          };
        }

        let completedBooking = fresh;
        let autoCompleted = false;

        /*
         * Booking confirmed thì tự chuyển completed.
         * Booking đã completed thì giữ nguyên và chỉ cộng bù điểm.
         */
        if (fresh.bookingStatus === "confirmed") {
          completedBooking = await tx.booking.update({
            where: {
              id: fresh.id,
            },
            data: {
              bookingStatus: "completed" as any,
              holdExpiresAt: null,
            },
            include: {
              departure: true,
              payments: {
                orderBy: {
                  createdAt: "desc",
                },
              },
              tour: true,
            },
          });

          await tx.bookingStatusLog.create({
            data: {
              bookingId: completedBooking.id,
              actionType: "auto_complete",
              oldStatus: "confirmed",
              newStatus: "completed",
              changedByUserId: changedBy,
              source: changedBy ? "admin" : "system",
              reason: "Trip end date has passed",
              note: "Tự động hoàn thành booking sau ngày kết thúc chuyến đi.",
            },
          });

          autoCompleted = true;
        }

        const reward = await this.rewardCompletedBooking(
          tx,
          {
            ...completedBooking,
            payments: fresh.payments,
          },
          changedBy,
        );

        return {
          bookingId: String(completedBooking.id),
          bookingCode: completedBooking.bookingCode,
          completed: true,
          autoCompleted,
          ...reward,
        };
      });

      if (result.autoCompleted) {
        completedCount += 1;
      }

      if (result.rewarded) {
        rewardedCount += 1;
      }

      results.push(result);
    }

    return {
      success: true,
      scanned: candidates.length,
      completedCount,
      rewardedCount,
      rewardPointsPerBooking: this.COMPLETED_BOOKING_REWARD_POINTS,
      results,
    };
  }

  private async ensureBookableUser(
    tx: Prisma.TransactionClient,
    rawUserId?: any,
  ) {
    const userId = this.normalizeUserId(rawUserId);

    if (!userId) return null;

    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("Không tìm thấy tài khoản đặt tour.");
    }

    if (user.status !== "active") {
      throw new BadRequestException(
        "Tài khoản hiện không thể tạo booking mới.",
      );
    }

    if (!user.phone || !user.identityNumber) {
      throw new BadRequestException(
        "Vui lòng cập nhật số điện thoại và CCCD trong hồ sơ trước khi đặt tour.",
      );
    }

    return user;
  }

  private async validateDepartureForBooking(
    tx: Prisma.TransactionClient,
    departureId: bigint,
    adultCount: number,
    childCount: number,
  ) {
    const departure = await tx.tourDeparture.findUnique({
      where: { id: departureId },
      include: { tour: true },
    });

    if (!departure) {
      throw new NotFoundException("Không tìm thấy lịch khởi hành.");
    }

    const requestedSlots = Number(adultCount || 0) + Number(childCount || 0);

    if (requestedSlots <= 0) {
      throw new BadRequestException("Số lượng khách không hợp lệ.");
    }

    if (String(departure.status) !== "open") {
      throw new BadRequestException(
        "Lịch khởi hành này đã đóng bán, đã đủ chỗ hoặc không còn khả dụng.",
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (new Date(departure.departureDate).getTime() < today.getTime()) {
      throw new BadRequestException(
        "Lịch khởi hành này đã qua ngày đặt hợp lệ.",
      );
    }

    const availableSlots =
      Number(departure.totalSlots || 0) -
      Number(departure.bookedSlots || 0) -
      Number(departure.heldSlots || 0);

    if (requestedSlots > availableSlots) {
      throw new BadRequestException("Không đủ chỗ cho lịch khởi hành này.");
    }

    if (departure.tour.status !== "published") {
      throw new BadRequestException(
        "Tour hiện chưa sẵn sàng nhận booking từ người dùng.",
      );
    }

    return { departure, requestedSlots };
  }

  private async ensureNoDuplicateActiveBooking(
    tx: Prisma.TransactionClient,
    input: {
      departureId: bigint;
      contactEmail: string;
      contactPhone: string;
      userId?: bigint;
    },
  ) {
    const duplicate = await tx.booking.findFirst({
      where: {
        departureId: input.departureId,
        bookingStatus: {
          in: [
            "pending_payment",
            "waiting_confirmation",
            "confirmed",
            "completed",
          ] as any,
        },
        OR: [
          ...(input.userId ? [{ userId: input.userId }] : []),
          {
            contactEmail: this.normalizeEmail(input.contactEmail),
            contactPhone: this.normalizePhone(input.contactPhone),
          },
        ],
      },
      select: {
        id: true,
        bookingCode: true,
        bookingStatus: true,
      },
    });

    if (duplicate) {
      throw new BadRequestException(
        `Đã tồn tại booking ${duplicate.bookingCode} cho lịch khởi hành này (${duplicate.bookingStatus}). Không thể tạo booking trùng.`,
      );
    }
  }

  private async resolvePickupPoint(
    tx: Prisma.TransactionClient | PrismaService,
    departure: any,
    pickupPointId?: number,
  ) {
    if (!pickupPointId) return null;

    const pickupId = BigInt(pickupPointId);

    // Ưu tiên điểm đón dùng chung của tour hoặc gắn đúng lịch khởi hành.
    let pickup = await tx.tourPickupPoint.findFirst({
      where: {
        id: pickupId,
        status: "active",
        tourId: departure.tourId,
        OR: [{ departureId: departure.id }, { departureId: null }],
      },
    });

    // Tương thích dữ liệu cũ:
    // một số điểm đón đã bị gắn vào lịch khởi hành khác dù vẫn thuộc cùng tour.
    if (!pickup) {
      pickup = await tx.tourPickupPoint.findFirst({
        where: {
          id: pickupId,
          status: "active",
          tourId: departure.tourId,
        },
      });
    }

    if (!pickup) {
      throw new BadRequestException(
        "Điểm đón không tồn tại, đã bị tạm ẩn hoặc không thuộc tour này.",
      );
    }

    return pickup;
  }

  private calculateDiscount(voucher: any, originalAmount: number) {
    if (!voucher) return 0;

    if (voucher.discountType === "fixed") {
      return Math.min(Number(voucher.discountValue || 0), originalAmount);
    }

    const raw = Math.round(
      (originalAmount * Number(voucher.discountValue || 0)) / 100,
    );

    const max = voucher.maxDiscount == null ? raw : Number(voucher.maxDiscount);

    return Math.min(raw, max, originalAmount);
  }

  private async resolveVoucher(
    tx: Prisma.TransactionClient,
    dto: { voucherCode?: string },
    userId: bigint | undefined,
    originalAmount: number,
  ) {
    const code = dto.voucherCode?.trim().toUpperCase();

    if (!code) {
      return { voucher: null, discountAmount: 0 };
    }

    if (!userId) {
      throw new BadRequestException("Bạn cần đăng nhập để sử dụng voucher.");
    }

    const voucher = await tx.voucher.findUnique({
      where: { code },
    });

    if (!voucher || voucher.status !== "active") {
      throw new BadRequestException(
        "Voucher không tồn tại hoặc đã ngừng hoạt động.",
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (
      new Date(voucher.startDate).getTime() > today.getTime() ||
      new Date(voucher.endDate).getTime() < today.getTime()
    ) {
      throw new BadRequestException(
        "Voucher chưa đến hạn sử dụng hoặc đã hết hạn.",
      );
    }

    if (
      Number(voucher.quota || 0) > 0 &&
      Number(voucher.usedCount || 0) >= Number(voucher.quota)
    ) {
      throw new BadRequestException("Voucher đã hết lượt sử dụng.");
    }

    if (originalAmount < Number(voucher.minOrderAmount || 0)) {
      throw new BadRequestException(
        "Đơn hàng chưa đạt giá trị tối thiểu để dùng voucher.",
      );
    }

    const userVoucher = await tx.userVoucher.findUnique({
      where: {
        userId_voucherId: {
          userId,
          voucherId: voucher.id,
        },
      },
    });

    if (!userVoucher || userVoucher.status !== "available") {
      throw new BadRequestException(
        "Voucher này không có trong tài khoản hoặc đã được sử dụng.",
      );
    }

    return {
      voucher,
      discountAmount: this.calculateDiscount(voucher, originalAmount),
    };
  }

  private async markVoucherUsedIfNeeded(
    tx: Prisma.TransactionClient,
    booking: any,
  ) {
    if (!booking?.voucherId || !booking?.userId) return;

    await tx.userVoucher.updateMany({
      where: {
        userId: booking.userId,
        voucherId: booking.voucherId,
        status: "available",
      },
      data: {
        status: "used",
        usedAt: new Date(),
      },
    });

    await tx.voucher
      .update({
        where: { id: booking.voucherId },
        data: {
          usedCount: { increment: 1 },
        },
      })
      .catch(() => null);
  }

  private async createReminderNotification(
    tx: Prisma.TransactionClient,
    booking: any,
    title = "Đặt tour thành công",
  ) {
    if (!booking.userId) return;

    const departureDate = booking.departure?.departureDate
      ? new Date(booking.departure.departureDate).toLocaleDateString("vi-VN")
      : "đang cập nhật";

    const pickupTime = booking.pickupTime
      ? new Date(booking.pickupTime).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Travela sẽ liên hệ";

    await tx.notification
      .create({
        data: {
          title,
          message: `Tour ${booking.tour?.name || ""} của bạn đã được ghi nhận.`,
          content: `Tour ${
            booking.tour?.name || ""
          } khởi hành ngày ${departureDate}. Điểm đón: ${
            booking.pickupName || "Travela sẽ liên hệ xác nhận"
          }. Địa chỉ: ${
            booking.pickupAddress || "Đang cập nhật"
          }. Thời gian đón: ${pickupTime}.`,
          targetRole: "user",
          targetUserId: booking.userId,
          isPublished: true,
        },
      })
      .catch(() => null);
  }

  private async adjustDepartureSlots(
    tx: Prisma.TransactionClient,
    departureId: bigint,
    guestCount: number,
    oldStatus: string,
    newStatus: string,
  ) {
    const oldCat = this.calcStatusCategory(oldStatus);
    const newCat = this.calcStatusCategory(newStatus);

    if (oldCat === newCat) return;

    const data: Record<string, any> = {};

    if (oldCat === "held") {
      data.heldSlots = { decrement: guestCount };
    }

    if (oldCat === "booked") {
      data.bookedSlots = { decrement: guestCount };
    }

    if (newCat === "held") {
      data.heldSlots = { increment: guestCount };
    }

    if (newCat === "booked") {
      data.bookedSlots = { increment: guestCount };
    }

    await tx.tourDeparture.update({
      where: { id: departureId },
      data,
    });
  }

  private assertStatusTransition(oldStatus: string, newStatus: string) {
    const transitionMap: Record<string, string[]> = {
      draft: ["pending_payment", "cancelled"],
      pending_payment: [
        "waiting_confirmation",
        "confirmed",
        "cancelled",
        "expired",
      ],
      waiting_confirmation: ["confirmed", "cancelled", "expired"],
      confirmed: ["completed", "cancelled"],
      cancelled: [],
      expired: [],
      completed: [],
    };

    if (oldStatus === newStatus) return;

    if (!transitionMap[oldStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Không thể chuyển booking từ ${oldStatus} sang ${newStatus}.`,
      );
    }
  }

  private normalizeBookingGuests(dto: CreateBookingDto) {
    const guests = Array.isArray(dto.guests) ? dto.guests : [];
    const expectedTotal =
      Number(dto.adultCount || 0) + Number(dto.childCount || 0);

    if (guests.length !== expectedTotal) {
      throw new BadRequestException(
        `Số lượng thông tin hành khách (${guests.length}) phải bằng tổng số vé đã chọn (${expectedTotal}).`,
      );
    }

    const adultGuests = guests.filter((guest) => guest.guestType === "adult");
    const childGuests = guests.filter((guest) => guest.guestType === "child");

    if (adultGuests.length !== Number(dto.adultCount || 0)) {
      throw new BadRequestException(
        `Bạn đã chọn ${dto.adultCount} vé người lớn, vui lòng nhập đúng ${dto.adultCount} thông tin người lớn.`,
      );
    }

    if (childGuests.length !== Number(dto.childCount || 0)) {
      throw new BadRequestException(
        `Bạn đã chọn ${dto.childCount} vé trẻ em, vui lòng nhập đúng ${dto.childCount} thông tin trẻ em.`,
      );
    }

    return guests.map((guest, index) => {
      const fullName = String(guest.fullName || "").trim();
      if (!fullName) {
        throw new BadRequestException(
          `Hành khách số ${index + 1} chưa có họ tên.`,
        );
      }

      let dateOfBirth: Date | null = null;
      if (guest.dateOfBirth) {
        const parsed = new Date(guest.dateOfBirth);
        if (Number.isNaN(parsed.getTime())) {
          throw new BadRequestException(
            `Ngày sinh của hành khách ${fullName} không hợp lệ.`,
          );
        }
        dateOfBirth = parsed;
      }

      return {
        fullName,
        dateOfBirth,
        gender: guest.gender ? String(guest.gender).trim() : null,
        guestType: guest.guestType,
        idNumber: guest.idNumber ? String(guest.idNumber).trim() : null,
      };
    });
  }

  private buildBookingCreateData(input: any) {
    const {
      dto,
      userId,
      departure,
      pickup,
      voucher,
      originalAmount,
      discountAmount,
      finalAmount,
      bookingCode,
    } = input;

    return {
      bookingCode,
      userId: userId || null,
      tourId: departure.tourId,
      departureId: departure.id,
      voucherId: voucher?.id || null,
      voucherCode:
        voucher?.code || dto.voucherCode?.trim().toUpperCase() || null,
      pickupPointId: pickup?.id || null,
      pickupName: pickup?.name || null,
      pickupAddress: pickup?.address || null,
      pickupTime: pickup?.pickupTime || null,
      pickupNote: pickup?.note || null,
      adultCount: dto.adultCount,
      childCount: dto.childCount,
      originalAmount,
      discountAmount,
      finalAmount,
      bookingStatus: "pending_payment" as any,
      holdExpiresAt: this.buildHoldExpireAt(),
      contactName: dto.contactName.trim(),
      contactEmail: this.normalizeEmail(dto.contactEmail),
      contactPhone: this.normalizePhone(dto.contactPhone),
      note: dto.note?.trim() || null,
    };
  }

  async create(dto: CreateBookingDto, rawUserId?: any) {
    const userId = this.normalizeUserId(rawUserId);
    const departureId = BigInt(dto.departureId);
    const lockKey = `lock:departure:${departureId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 10000);

    if (!lockToken) {
      throw new BadRequestException(
        "Có người đang đặt lịch khởi hành này. Vui lòng thử lại sau vài giây.",
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureBookableUser(tx, userId);

        const { departure, requestedSlots } =
          await this.validateDepartureForBooking(
            tx,
            departureId,
            dto.adultCount,
            dto.childCount,
          );

        const contactEmail = this.normalizeEmail(dto.contactEmail);
        const contactPhone = this.normalizePhone(dto.contactPhone);

        await this.ensureNoDuplicateActiveBooking(tx, {
          departureId: departure.id,
          contactEmail,
          contactPhone,
          userId,
        });

        const originalAmount =
          Number(departure.adultPrice) * dto.adultCount +
          Number(departure.childPrice) * dto.childCount;

        const { voucher, discountAmount } = await this.resolveVoucher(
          tx,
          dto,
          userId,
          originalAmount,
        );

        const pickup = await this.resolvePickupPoint(
          tx,
          departure,
          dto.pickupPointId,
        );

        const finalAmount = Math.max(originalAmount - discountAmount, 0);

        const normalizedGuests = this.normalizeBookingGuests(dto);

        const booking = await tx.booking.create({
          data: this.buildBookingCreateData({
            dto,
            userId,
            departure,
            pickup,
            voucher,
            originalAmount,
            discountAmount,
            finalAmount,
            bookingCode: `BK${Date.now()}`,
          }),
        });

        await tx.bookingGuest.createMany({
          data: normalizedGuests.map((guest) => ({
            bookingId: booking.id,
            ...guest,
          })),
        });

        await tx.tourDeparture.update({
          where: { id: departure.id },
          data: { heldSlots: { increment: requestedSlots } },
        });

        await tx.bookingStatusLog.create({
          data: {
            bookingId: booking.id,
            actionType: "create",
            newStatus: booking.bookingStatus,
            source: userId ? "user" : "guest",
            reason: "Booking created",
          },
        });

        if (userId) {
          await tx.userBehavior.create({
            data: {
              userId,
              tourId: booking.tourId,
              action: "booking",
              score: 8,
              keyword: null,
              meta: {
                source: "booking_create",
                bookingId: booking.id.toString(),
                bookingCode: booking.bookingCode,
                departureId: booking.departureId.toString(),
                adultCount: booking.adultCount,
                childCount: booking.childCount,
                finalAmount: Number(booking.finalAmount),
              } as any,
            },
          });
        }

        return {
          id: booking.id.toString(),
          bookingCode: booking.bookingCode,
          bookingStatus: booking.bookingStatus,
          originalAmount: booking.originalAmount,
          discountAmount: booking.discountAmount,
          finalAmount: booking.finalAmount,
          holdExpiresAt: booking.holdExpiresAt,
          guests: normalizedGuests,
        };
      });
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async adminCreate(dto: AdminUpsertBookingDto, changedBy?: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const userId = dto.userId ? BigInt(dto.userId) : undefined;

      await this.ensureBookableUser(tx, userId);

      const { departure, requestedSlots } =
        await this.validateDepartureForBooking(
          tx,
          BigInt(dto.departureId),
          dto.adultCount,
          dto.childCount,
        );

      const contactEmail = this.normalizeEmail(dto.contactEmail);
      const contactPhone = this.normalizePhone(dto.contactPhone);

      await this.ensureNoDuplicateActiveBooking(tx, {
        departureId: departure.id,
        contactEmail,
        contactPhone,
        userId,
      });

      const originalAmount =
        Number(departure.adultPrice) * dto.adultCount +
        Number(departure.childPrice) * dto.childCount;

      const { voucher, discountAmount } = await this.resolveVoucher(
        tx,
        dto,
        userId,
        originalAmount,
      );

      const pickup = await this.resolvePickupPoint(
        tx,
        departure,
        dto.pickupPointId,
      );

      const finalAmount = Math.max(originalAmount - discountAmount, 0);

      const booking = await tx.booking.create({
        data: this.buildBookingCreateData({
          dto,
          userId,
          departure,
          pickup,
          voucher,
          originalAmount,
          discountAmount,
          finalAmount,
          bookingCode: `ADM${Date.now()}`,
        }),
      });

      await tx.tourDeparture.update({
        where: { id: departure.id },
        data: {
          heldSlots: { increment: requestedSlots },
        },
      });

      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: "create",
          newStatus: "pending_payment",
          changedByUserId: changedBy,
          source: "admin",
          reason: "Admin created booking",
        },
      });

      return booking;
    });
  }

  async findMyBookings(userId: bigint) {
    await this.syncCompletedBookingsAndRewards().catch(() => null);

    const bookings = await this.prisma.booking.findMany({
      where: {
        userId,
        bookingStatus: {
          notIn: ["cancelled", "expired"] as any,
        },
      },

      include: {
        tour: {
          include: {
            destination: true,

            media: {
              where: {
                isCover: true,
              },
              orderBy: [
                {
                  displayOrder: "asc",
                },
                {
                  id: "desc",
                },
              ],
              take: 1,
            },
          },
        },

        departure: true,
        pickupPoint: true,
        voucher: true,

        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },

        refundRequests: {
          orderBy: {
            createdAt: "desc",
          },
        },

        guideAssignments: {
          where: {
            status: {
              in: [
                "assigned",
                "accepted",
                "confirmed",
                "in_progress",
                "issue",
              ] as any,
            },
          },
          include: {
            guide: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    const resolved = await this.attachDepartureGuides(bookings as any[]);

    return resolved.map((booking: any) => this.enrichBooking(booking));
  }

  async cancelMyBooking(id: number, userId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: BigInt(id) },
        include: {
          payments: {
            orderBy: { createdAt: "desc" },
          },
          departure: true,
          tour: true,
        },
      });

      if (!booking || booking.userId !== userId) {
        throw new NotFoundException("Không tìm thấy booking của bạn.");
      }

      if (booking.bookingStatus !== "pending_payment") {
        throw new BadRequestException(
          "Chỉ có thể xóa/hủy booking khi đơn còn ở trạng thái chờ thanh toán.",
        );
      }

      const protectedPayment = booking.payments.find((payment) =>
        ["paid", "waiting_confirmation", "refunded"].includes(
          payment.paymentStatus,
        ),
      );

      if (protectedPayment) {
        throw new BadRequestException(
          "Booking đã có giao dịch thanh toán quan trọng nên không thể xóa/hủy trực tiếp.",
        );
      }

      const guestCount =
        Number(booking.adultCount || 0) + Number(booking.childCount || 0);

      await this.adjustDepartureSlots(
        tx,
        booking.departureId,
        guestCount,
        booking.bookingStatus,
        "cancelled",
      );

      await tx.payment.updateMany({
        where: {
          bookingId: booking.id,
          paymentStatus: "pending",
        },
        data: {
          paymentStatus: "expired" as any,
        },
      });

      const updated = await tx.booking.update({
        where: { id: booking.id },
        data: {
          bookingStatus: "cancelled" as any,
          holdExpiresAt: null,
        },
        include: {
          tour: {
            include: {
              destination: true,
            },
          },
          departure: true,
          pickupPoint: true,
          voucher: true,
          payments: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: "cancel",
          oldStatus: booking.bookingStatus,
          newStatus: "cancelled",
          changedByUserId: userId,
          source: "user",
          reason: "User cancelled unpaid booking from My Tour page",
        },
      });

      return {
        success: true,
        message: "Đã xóa/hủy booking chưa thanh toán.",
        booking: updated,
      };
    });
  }

  private toDateStart(value?: string) {
    if (!value) return undefined;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toDateEnd(value?: string) {
    if (!value) return undefined;
    const date = new Date(`${value}T23:59:59`);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private daysUntil(value?: Date | string | null) {
    if (!value) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const target = new Date(value);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - start.getTime()) / 86400000);
  }

  /**
   * Gắn HDV chính của lịch khởi hành vào từng booking.
   *
   * Nghiệp vụ hiện tại là:
   * một departure -> một trip_operations -> một HDV -> toàn bộ booking cùng lịch.
   * guide_assignments chỉ được giữ làm dữ liệu tương thích cho hệ thống cũ.
   */
  private async attachDepartureGuides(bookings: any[]) {
    const rows = Array.isArray(bookings) ? bookings : [];

    const departureIds = Array.from(
      new Set(
        rows
          .map((booking: any) =>
            String(booking?.departureId || booking?.departure?.id || ""),
          )
          .filter(Boolean),
      ),
    ).map((id) => BigInt(id));

    const operations = departureIds.length
      ? await this.prisma.tripOperation.findMany({
          where: {
            departureId: {
              in: departureIds,
            },
          },
          include: {
            guide: true,
          },
        })
      : [];

    const operationByDepartureId = new Map(
      operations.map((operation: any) => [
        String(operation.departureId),
        operation,
      ]),
    );

    return rows.map((booking: any) => {
      const departureId = String(
        booking?.departureId || booking?.departure?.id || "",
      );
      const tripOperation = operationByDepartureId.get(departureId) || null;

      const legacyAssignment = (booking.guideAssignments || []).find(
        (assignment: any) =>
          [
            "assigned",
            "accepted",
            "confirmed",
            "in_progress",
            "issue",
          ].includes(String(assignment?.status || "")),
      );

      const resolvedGuide =
        tripOperation?.guide || legacyAssignment?.guide || null;

      return {
        ...booking,
        guideId: resolvedGuide?.id || null,
        guideName: resolvedGuide?.fullName || null,
        guidePhone: resolvedGuide?.phone || null,
        guideEmail: resolvedGuide?.email || null,
        guide: resolvedGuide,
        hasGuide: Boolean(resolvedGuide),
        tripOperation: tripOperation
          ? {
              id: tripOperation.id,
              departureId: tripOperation.departureId,
              guideId: tripOperation.guideId,
              operationStatus: tripOperation.operationStatus,
              guide: tripOperation.guide || null,
              primaryGuide: tripOperation.guide || null,
            }
          : null,
      };
    });
  }

  private buildOperationInsight(booking: any) {
    const latestPayment = booking.payments?.[0] || null;
    const legacyActiveGuide = (booking.guideAssignments || []).find(
      (assignment: any) =>
        ["assigned", "accepted", "confirmed", "in_progress", "issue"].includes(
          String(assignment.status || ""),
        ),
    );
    const resolvedGuide =
      booking.guide ||
      booking.tripOperation?.guide ||
      booking.tripOperation?.primaryGuide ||
      legacyActiveGuide?.guide ||
      null;
    const activeGuide = resolvedGuide ? { guide: resolvedGuide } : null;
    const daysUntilDeparture = this.daysUntil(booking.departure?.departureDate);
    const flags: Array<{ code: string; label: string; tone: string }> = [];
    let priorityScore = 0;

    if (booking.bookingStatus === "pending_payment") {
      flags.push({
        code: "WAITING_PAYMENT",
        label: "Chờ thanh toán",
        tone: "warning",
      });
      priorityScore += 25;
    }

    if (latestPayment?.paymentStatus === "waiting_confirmation") {
      flags.push({
        code: "PAYMENT_REVIEW",
        label: "Cần duyệt thanh toán",
        tone: "danger",
      });
      priorityScore += 45;
    }

    if (booking.holdExpiresAt && booking.bookingStatus === "pending_payment") {
      const minutesLeft = Math.round(
        (new Date(booking.holdExpiresAt).getTime() - Date.now()) / 60000,
      );
      if (minutesLeft <= 5) {
        flags.push({
          code: "HOLD_EXPIRING",
          label: "Sắp hết hạn giữ chỗ",
          tone: "danger",
        });
        priorityScore += 35;
      }
    }

    if (
      daysUntilDeparture !== null &&
      daysUntilDeparture >= 0 &&
      daysUntilDeparture <= 7
    ) {
      flags.push({
        code: "UPCOMING",
        label: `Sắp khởi hành ${daysUntilDeparture} ngày`,
        tone: daysUntilDeparture <= 2 ? "danger" : "warning",
      });
      priorityScore += daysUntilDeparture <= 2 ? 35 : 20;
    }

    if (
      daysUntilDeparture !== null &&
      daysUntilDeparture >= 0 &&
      daysUntilDeparture <= 7 &&
      !activeGuide
    ) {
      flags.push({ code: "NO_GUIDE", label: "Chưa có HDV", tone: "danger" });
      priorityScore += 45;
    }

    if (!booking.pickupPointId && !booking.pickupName) {
      flags.push({
        code: "NO_PICKUP",
        label: "Chưa có điểm đón",
        tone: "warning",
      });
      priorityScore += 15;
    }

    if (
      (booking.refundRequests || []).some(
        (item: any) => item.status === "pending",
      )
    ) {
      flags.push({
        code: "REFUND_PENDING",
        label: "Có yêu cầu hoàn tiền",
        tone: "warning",
      });
      priorityScore += 20;
    }

    const guestCount =
      Number(booking.adultCount || 0) + Number(booking.childCount || 0);
    const capacity = booking.departure
      ? Number(booking.departure.totalSlots || 0) -
        Number(booking.departure.bookedSlots || 0) -
        Number(booking.departure.heldSlots || 0)
      : null;

    return {
      priorityScore,
      priorityLevel:
        priorityScore >= 70
          ? "high"
          : priorityScore >= 35
            ? "medium"
            : "normal",
      actionLabel: flags[0]?.label || "Ổn định",
      daysUntilDeparture,
      guestCount,
      remainingSlots: capacity,
      guideStatus: activeGuide ? "assigned" : "unassigned",
      guideName: activeGuide?.guide?.fullName || null,
      paymentStatus: latestPayment?.paymentStatus || "none",
      paymentMethod: latestPayment?.paymentMethod || null,
      flags,
    };
  }

  private enrichBooking(booking: any) {
    const legacyActiveAssignment =
      (booking.guideAssignments || []).find((assignment: any) =>
        ["assigned", "accepted", "confirmed", "in_progress", "issue"].includes(
          String(assignment.status || ""),
        ),
      ) || null;

    const resolvedGuide =
      booking.guide ||
      booking.tripOperation?.guide ||
      booking.tripOperation?.primaryGuide ||
      legacyActiveAssignment?.guide ||
      null;

    const normalized = {
      ...booking,
      guideId: resolvedGuide?.id || booking.guideId || null,
      guideName: resolvedGuide?.fullName || booking.guideName || null,
      guidePhone: resolvedGuide?.phone || booking.guidePhone || null,
      guideEmail: resolvedGuide?.email || booking.guideEmail || null,
      guide: resolvedGuide,
      hasGuide: Boolean(resolvedGuide),
      latestPayment: booking.payments?.[0] || null,
      activeGuideAssignment: legacyActiveAssignment,
    };

    return {
      ...normalized,
      operationInsight: this.buildOperationInsight(normalized),
    };
  }

  private buildAdminIntelligence(items: any[]) {
    const total = items.length;
    const highPriority = items.filter(
      (item) => item.operationInsight?.priorityLevel === "high",
    ).length;
    const noGuide = items.filter(
      (item) => item.operationInsight?.guideStatus === "unassigned",
    ).length;
    const upcoming = items.filter((item) => {
      const days = item.operationInsight?.daysUntilDeparture;
      return days !== null && days !== undefined && days >= 0 && days <= 7;
    }).length;
    const waitingPayment = items.filter(
      (item) => item.bookingStatus === "pending_payment",
    ).length;
    const paymentReview = items.filter(
      (item) => item.operationInsight?.paymentStatus === "waiting_confirmation",
    ).length;

    return {
      totalOnPage: total,
      highPriority,
      noGuide,
      upcoming,
      waitingPayment,
      paymentReview,
      suggestions: [
        highPriority
          ? `Có ${highPriority} booking cần ưu tiên xử lý ngay.`
          : "Không có booking ưu tiên cao trong trang hiện tại.",
        noGuide
          ? `${noGuide} booking chưa phân công hướng dẫn viên.`
          : "Các booking hiển thị đã có hướng dẫn viên hoặc chưa đến hạn cần gán.",
        upcoming
          ? `${upcoming} booking sắp khởi hành trong 7 ngày.`
          : "Không có booking sắp khởi hành trong 7 ngày ở trang này.",
        paymentReview
          ? `${paymentReview} khoản thanh toán cần admin đối soát.`
          : "Không có khoản thanh toán chờ duyệt ở trang này.",
      ],
    };
  }

  async findById(id: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: BigInt(id) },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            memberTier: true,
          },
        },
        tour: {
          include: {
            destination: true,
          },
        },
        departure: true,
        pickupPoint: true,
        voucher: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
        guideAssignments: {
          include: { guide: true },
          orderBy: { createdAt: "desc" },
        },
        refundRequests: {
          orderBy: { createdAt: "desc" },
        },
        guests: true,
        logs: {
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });

    if (!booking) {
      throw new NotFoundException("Không tìm thấy booking.");
    }

    /*
     * Một lịch khởi hành chỉ có một HDV chính qua trip_operations.
     * attachDepartureGuides() sẽ gắn HDV đó vào mọi booking cùng departure,
     * kể cả booking hiện tại không phải booking đại diện trong guide_assignments.
     */
    const [resolvedBooking] = await this.attachDepartureGuides([booking]);

    /*
     * Ưu tiên điểm đón dùng chung hoặc đúng lịch hiện tại.
     * Nếu dữ liệu cũ không có nhóm này thì fallback toàn bộ điểm đón active
     * của tour để admin vẫn có thể cập nhật.
     */
    const exactPickupOptions = await this.prisma.tourPickupPoint.findMany({
      where: {
        tourId: booking.tourId,
        status: "active",
        OR: [{ departureId: booking.departureId }, { departureId: null }],
      },
      orderBy: [{ departureId: "desc" }, { id: "asc" }],
    });

    const fallbackPickupOptions = exactPickupOptions.length
      ? []
      : await this.prisma.tourPickupPoint.findMany({
          where: {
            tourId: booking.tourId,
            status: "active",
          },
          orderBy: [{ departureId: "asc" }, { id: "asc" }],
        });

    // Loại bỏ điểm đón trùng tên + địa chỉ + giờ.
    const pickupMap = new Map<string, any>();

    for (const point of [...exactPickupOptions, ...fallbackPickupOptions]) {
      const key = [
        String(point.name || "")
          .trim()
          .toLowerCase(),
        String(point.address || "")
          .trim()
          .toLowerCase(),
        point.pickupTime ? String(point.pickupTime) : "",
      ].join("|");

      if (!pickupMap.has(key)) {
        pickupMap.set(key, point);
      }
    }

    const pickupOptions = Array.from(pickupMap.values());

    const sameDepartureBookings = await this.prisma.booking.findMany({
      where: {
        tourId: booking.tourId,
        departureId: booking.departureId,
        bookingStatus: {
          in: [
            "pending_payment",
            "waiting_confirmation",
            "confirmed",
            "completed",
          ],
        },
      },
      include: {
        guests: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const departureGuests = sameDepartureBookings.flatMap((item: any) => {
      if (item.guests?.length) {
        return item.guests.map((guest: any) => ({
          ...guest,
          bookingCode: item.bookingCode,
          contactName: item.contactName,
          contactPhone: item.contactPhone,
          contactEmail: item.contactEmail,
        }));
      }

      return [
        {
          id: `booking-${item.id}`,
          bookingCode: item.bookingCode,
          fullName: item.contactName || item.user?.fullName || "Khách hàng",
          guestType: "Người đặt",
          dateOfBirth: null,
          idNumber: "-",
          contactPhone: item.contactPhone,
          contactEmail: item.contactEmail,
        },
      ];
    });

    const enrichedBooking = this.enrichBooking(resolvedBooking);

    /*
     * Frontend cũ đọc activeGuideAssignment.
     * Khi HDV đến từ trip_operations, tạo object tương thích để modal
     * hiển thị đúng HDV thay vì báo "Chưa phân công".
     */
    const activeGuideAssignment =
      enrichedBooking.activeGuideAssignment ||
      (enrichedBooking.guide
        ? {
            id: enrichedBooking.tripOperation?.id || null,
            status:
              enrichedBooking.tripOperation?.operationStatus || "assigned",
            guide: enrichedBooking.guide,
            source: "trip_operation",
          }
        : null);

    const guideTimeline = activeGuideAssignment?.guide
      ? [
          {
            label: "Hướng dẫn viên của lịch khởi hành",
            time:
              enrichedBooking.tripOperation?.updatedAt ||
              booking.updatedAt ||
              booking.createdAt,
            note: `${activeGuideAssignment.guide.fullName} · ${
              activeGuideAssignment.status || "assigned"
            }`,
          },
        ]
      : [];

    return {
      ...enrichedBooking,
      activeGuideAssignment,
      pickupOptions,
      pickupOptionSource: exactPickupOptions.length
        ? "departure_or_shared"
        : fallbackPickupOptions.length
          ? "tour_fallback"
          : "none",
      departureGuests,
      sameDepartureBookings,
      operationTimeline: [
        {
          label: "Tạo booking",
          time: booking.createdAt,
          note: `Mã đơn ${booking.bookingCode}`,
        },
        ...(booking.payments || []).map((payment: any) => ({
          label:
            payment.paymentStatus === "paid"
              ? "Thanh toán thành công"
              : "Tạo giao dịch thanh toán",
          time: payment.paidAt || payment.updatedAt || payment.createdAt,
          note: `${payment.internalTransactionCode} · ${payment.paymentStatus}`,
        })),
        ...guideTimeline,
        ...(booking.logs || []).map((log: any) => ({
          label: log.actionType || "Cập nhật trạng thái",
          time: log.createdAt,
          note: `${log.oldStatus || "-"} → ${log.newStatus || "-"}${
            log.reason ? ` · ${log.reason}` : ""
          }`,
        })),
      ]
        .filter((item: any) => item.time)
        .sort(
          (a: any, b: any) =>
            new Date(b.time).getTime() - new Date(a.time).getTime(),
        )
        .slice(0, 20),
    };
  }

  async adminList(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    paymentStatus?: string;
    tourId?: string;
    destinationId?: string;
    departureFrom?: string;
    departureTo?: string;
    guideStatus?: string;
    urgency?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    // Đồng bộ booking đã kết thúc trước khi trả danh sách quản trị.
    await this.syncCompletedBookingsAndRewards().catch(() => null);

    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;
    const allowedSort: Record<string, string> = {
      createdAt: "createdAt",
      bookingCode: "bookingCode",
      contactName: "contactName",
      finalAmount: "finalAmount",
      totalAmount: "totalAmount",
      bookingStatus: "bookingStatus",
      paymentDueAt: "paymentDueAt",
    };
    const sortBy = allowedSort[String(query.sortBy || "")] || "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

    const where: any = {};

    if (query.search) {
      where.OR = [
        { bookingCode: { contains: query.search } },
        { contactName: { contains: query.search } },
        { contactEmail: { contains: query.search } },
        { contactPhone: { contains: query.search } },
        { pickupName: { contains: query.search } },
        { voucherCode: { contains: query.search } },
      ];
    }

    if (query.status) where.bookingStatus = query.status;
    if (query.tourId) where.tourId = BigInt(query.tourId);

    if (query.destinationId) {
      where.tour = { is: { destinationId: BigInt(query.destinationId) } };
    }

    const departureDateFilter: any = {};
    const from = this.toDateStart(query.departureFrom);
    const to = this.toDateEnd(query.departureTo);
    if (from) departureDateFilter.gte = from;
    if (to) departureDateFilter.lte = to;
    if (Object.keys(departureDateFilter).length) {
      where.departure = { is: { departureDate: departureDateFilter } };
    }

    if (query.paymentStatus) {
      where.payments = { some: { paymentStatus: query.paymentStatus } };
    }

    const include = {
      tour: {
        select: {
          id: true,
          name: true,
          slug: true,
          destination: { select: { id: true, name: true, province: true } },
        },
      },
      user: { select: { id: true, fullName: true, email: true, phone: true } },
      departure: true,
      pickupPoint: true,
      voucher: true,
      payments: { take: 1, orderBy: { createdAt: "desc" as const } },
      guideAssignments: {
        where: {
          status: {
            in: [
              "assigned",
              "accepted",
              "confirmed",
              "in_progress",
              "issue",
            ] as any,
          },
        },
        include: { guide: true },
        take: 1,
        orderBy: { createdAt: "desc" as const },
      },
      refundRequests: { where: { status: "pending" as any }, take: 1 },
    };

    const requiresResolvedGuideFilter = ["assigned", "unassigned"].includes(
      String(query.guideStatus || ""),
    );

    const rawItems = await this.prisma.booking.findMany({
      where,
      ...(requiresResolvedGuideFilter ? {} : { skip, take: pageSize }),
      orderBy: [{ [sortBy]: sortOrder }, { id: "desc" }],
      include,
    });

    const resolvedRawItems = await this.attachDepartureGuides(
      rawItems as any[],
    );

    let resolvedItems = resolvedRawItems.map((item: any) =>
      this.enrichBooking(item),
    );

    if (query.guideStatus === "assigned") {
      resolvedItems = resolvedItems.filter((item: any) => item.hasGuide);
    } else if (query.guideStatus === "unassigned") {
      resolvedItems = resolvedItems.filter((item: any) => !item.hasGuide);
    }

    const total = requiresResolvedGuideFilter
      ? resolvedItems.length
      : await this.prisma.booking.count({ where });

    let items = requiresResolvedGuideFilter
      ? resolvedItems.slice(skip, skip + pageSize)
      : resolvedItems;

    if (query.urgency === "high") {
      items = items.filter(
        (item) => item.operationInsight.priorityLevel === "high",
      );
    } else if (query.urgency === "upcoming") {
      items = items.filter((item) => {
        const days = item.operationInsight.daysUntilDeparture;
        return days !== null && days !== undefined && days >= 0 && days <= 7;
      });
    } else if (query.urgency === "payment_review") {
      items = items.filter(
        (item) =>
          item.operationInsight.paymentStatus === "waiting_confirmation",
      );
    }

    return {
      items,
      intelligence: this.buildAdminIntelligence(items),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminUpdate(id: number, dto: UpdateBookingDto, changedBy?: bigint) {
    const existing = await this.prisma.booking.findUnique({
      where: { id: BigInt(id) },
      include: { departure: true },
    });

    if (!existing) throw new NotFoundException("Không tìm thấy booking.");

    if (
      ["completed", "cancelled", "expired"].includes(existing.bookingStatus)
    ) {
      throw new BadRequestException(
        "Booking đã ở trạng thái cuối, không thể sửa điểm đón.",
      );
    }

    if (!dto.pickupPointId) {
      throw new BadRequestException("Vui lòng chọn điểm đón cần cập nhật.");
    }

    const pickup = await this.resolvePickupPoint(
      this.prisma,
      existing.departure,
      dto.pickupPointId,
    );

    const updated = await this.prisma.booking.update({
      where: { id: BigInt(id) },
      data: {
        pickupPointId: pickup?.id || null,
        pickupName: pickup?.name || null,
        pickupAddress: pickup?.address || null,
        pickupTime: pickup?.pickupTime || null,
        pickupNote: pickup?.note || null,
      },
    });

    await this.prisma.bookingStatusLog.create({
      data: {
        bookingId: updated.id,
        actionType: "update_pickup",
        oldStatus: existing.bookingStatus,
        newStatus: updated.bookingStatus,
        changedByUserId: changedBy,
        source: "admin",
        reason: "Admin cập nhật điểm đón",
        note: `Điểm đón mới: ${updated.pickupName || "Chưa chọn"}`,
      },
    });

    return this.findById(id);
  }

  async adminUpdateStatus(
    id: number,
    dto: UpdateBookingStatusDto,
    changedBy?: bigint,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: BigInt(id) },
        include: {
          payments: {
            orderBy: { createdAt: "desc" },
          },
          departure: true,
          tour: true,
        },
      });

      if (!booking) {
        throw new NotFoundException("Không tìm thấy booking.");
      }

      this.assertStatusTransition(booking.bookingStatus, dto.bookingStatus);

      if (dto.bookingStatus === "confirmed") {
        const latestPayment = booking.payments[0];

        const canAdminConfirmWithoutGateway =
          !latestPayment ||
          ["pending", "waiting_confirmation", "paid"].includes(
            latestPayment.paymentStatus,
          );

        if (!canAdminConfirmWithoutGateway) {
          throw new BadRequestException(
            "Không thể xác nhận booking khi payment gần nhất đang thất bại hoặc hết hạn.",
          );
        }
      }

      if (dto.bookingStatus === "completed") {
        if (!this.hasTripEnded(booking)) {
          throw new BadRequestException(
            "Chưa thể hoàn thành booking vì chuyến đi chưa qua ngày kết thúc.",
          );
        }

        if (!this.isPaidBooking(booking)) {
          throw new BadRequestException(
            "Chưa thể hoàn thành booking vì chưa có giao dịch thanh toán thành công.",
          );
        }
      }

      const guestCount =
        Number(booking.adultCount || 0) + Number(booking.childCount || 0);

      await this.adjustDepartureSlots(
        tx,
        booking.departureId,
        guestCount,
        booking.bookingStatus,
        dto.bookingStatus,
      );

      const updated = await tx.booking.update({
        where: { id: BigInt(id) },
        data: {
          bookingStatus: dto.bookingStatus as any,
          holdExpiresAt: ["pending_payment", "waiting_confirmation"].includes(
            dto.bookingStatus,
          )
            ? (booking.holdExpiresAt ?? this.buildHoldExpireAt())
            : null,
        },
        include: {
          departure: true,
          tour: true,
        },
      });

      if (dto.bookingStatus === "confirmed") {
        await this.markVoucherUsedIfNeeded(tx, updated);

        await this.createReminderNotification(
          tx,
          updated,
          "Booking đã được xác nhận",
        );
      }

      let membershipReward: any = null;

      if (
        dto.bookingStatus === "completed" &&
        booking.bookingStatus !== "completed"
      ) {
        membershipReward = await this.rewardCompletedBooking(
          tx,
          {
            ...updated,
            payments: booking.payments,
          },
          changedBy,
        );
      }

      await tx.bookingStatusLog.create({
        data: {
          bookingId: updated.id,
          actionType: "update_status",
          oldStatus: booking.bookingStatus,
          newStatus: dto.bookingStatus,
          changedByUserId: changedBy,
          source: "admin",
          reason: dto.reason ?? "Admin updated booking status",
        },
      });

      return {
        ...updated,
        membershipReward,
      };
    });
  }

  async adminDelete(id: number, changedBy?: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: BigInt(id) },
        include: {
          payments: true,
          guests: true,
          departure: true,
        },
      });

      if (!booking) {
        throw new NotFoundException("Không tìm thấy booking.");
      }

      const protectedPayment = booking.payments.find((payment) =>
        ["paid", "waiting_confirmation", "refunded"].includes(
          payment.paymentStatus,
        ),
      );

      if (protectedPayment) {
        throw new BadRequestException(
          "Booking này đã có giao dịch thanh toán quan trọng, không thể xóa cứng để tránh mất lịch sử đối soát.",
        );
      }

      if (["confirmed", "completed"].includes(booking.bookingStatus)) {
        throw new BadRequestException(
          "Booking đã xác nhận hoặc hoàn thành thì không được xóa cứng. Hãy dùng trạng thái hủy nếu cần.",
        );
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (
        new Date(booking.departure.departureDate).getTime() <= today.getTime()
      ) {
        throw new BadRequestException(
          "Booking đã đến ngày khởi hành hoặc đã khởi hành, không thể xóa cứng.",
        );
      }

      const guestCount =
        Number(booking.adultCount || 0) + Number(booking.childCount || 0);

      const category = this.calcStatusCategory(booking.bookingStatus);

      if (category === "held") {
        await tx.tourDeparture.update({
          where: { id: booking.departureId },
          data: {
            heldSlots: { decrement: guestCount },
          },
        });
      }

      if (category === "booked") {
        await tx.tourDeparture.update({
          where: { id: booking.departureId },
          data: {
            bookedSlots: { decrement: guestCount },
          },
        });
      }

      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: "other",
          oldStatus: booking.bookingStatus,
          newStatus: "deleted",
          changedByUserId: changedBy,
          source: "admin",
          reason: "Admin deleted booking",
        },
      });

      await tx.booking.delete({
        where: {
          id: booking.id,
        },
      });

      return {
        success: true,
      };
    });
  }

  private startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private endOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private toMoney(value: any) {
    return Number(value || 0);
  }

  private buildRange(mode = "week", dateValue?: string) {
    const base = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
    const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;

    if (mode === "day") {
      return { start: this.startOfDay(safeBase), end: this.endOfDay(safeBase) };
    }

    if (mode === "month") {
      const start = new Date(safeBase.getFullYear(), safeBase.getMonth(), 1);
      const end = new Date(
        safeBase.getFullYear(),
        safeBase.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      return { start, end };
    }

    const day = safeBase.getDay() || 7;
    const start = this.startOfDay(this.addDays(safeBase, 1 - day));
    const end = this.endOfDay(this.addDays(start, 6));
    return { start, end };
  }

  private safePercent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.round((numerator / denominator) * 1000) / 10;
  }

  private async getDepartureChecklist(departure: any) {
    const bookings = departure.bookings || [];
    const confirmedBookings = bookings.filter((b: any) =>
      ["confirmed", "completed", "waiting_confirmation"].includes(
        String(b.bookingStatus),
      ),
    );
    const pendingPayments = bookings.filter(
      (b: any) => String(b.bookingStatus) === "pending_payment",
    );
    const noPickup = confirmedBookings.filter(
      (b: any) => !b.pickupPointId && !b.pickupName,
    );
    const departureGuide =
      departure.guide ||
      departure.tripOperation?.guide ||
      departure.tripOperation?.primaryGuide ||
      null;
    const noGuide = departureGuide ? [] : confirmedBookings;
    const emailReminderSent = bookings.some((b: any) =>
      (b.logs || []).some((log: any) =>
        String(log.actionType || "").startsWith("bulk_"),
      ),
    );

    return {
      totalBookings: bookings.length,
      confirmedBookings: confirmedBookings.length,
      pendingPayments: pendingPayments.length,
      noPickup: noPickup.length,
      noGuide: noGuide.length,
      totalGuests: confirmedBookings.reduce(
        (sum: number, b: any) =>
          sum + Number(b.adultCount || 0) + Number(b.childCount || 0),
        0,
      ),
      checklist: {
        paid: {
          ok: pendingPayments.length === 0,
          label: pendingPayments.length
            ? `${pendingPayments.length} booking chưa thanh toán`
            : "Đã xử lý thanh toán",
        },
        guide: {
          ok: noGuide.length === 0,
          label: noGuide.length
            ? `${noGuide.length} booking chưa có HDV`
            : "Đã phân công HDV",
        },
        pickup: {
          ok: noPickup.length === 0,
          label: noPickup.length
            ? `${noPickup.length} booking thiếu điểm đón`
            : "Đã có điểm đón",
        },
        reminder: {
          ok: emailReminderSent,
          label: emailReminderSent
            ? "Đã ghi nhận nhắc lịch"
            : "Chưa ghi nhận nhắc lịch",
        },
      },
    };
  }

  async adminOperationsDashboard() {
    const todayStart = this.startOfDay();
    const todayEnd = this.endOfDay();
    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1,
    );
    const next7End = this.endOfDay(this.addDays(todayStart, 7));
    const now = new Date();
    const soonHold = new Date(Date.now() + 5 * 60 * 1000);

    const [
      waitingPayment,
      paidToday,
      upcomingDepartures,
      pendingRefunds,
      expiringHolds,
      paidPayments,
      totalPayments,
      todayRevenueAgg,
      monthRevenueAgg,
      noGuideBookings,
    ] = await Promise.all([
      this.prisma.booking.count({
        where: { bookingStatus: "pending_payment" as any },
      }),
      this.prisma.payment.count({
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.tourDeparture.count({
        where: {
          departureDate: { gte: todayStart, lte: next7End },
          status: { in: ["open", "full"] as any },
        },
      }),
      this.prisma.refundRequest.count({ where: { status: "pending" as any } }),
      this.prisma.booking.count({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: soonHold },
        },
      }),
      this.prisma.payment.count({ where: { paymentStatus: "paid" as any } }),
      this.prisma.payment.count(),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid" as any,
          paidAt: { gte: monthStart, lte: todayEnd },
        },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
          departure: { departureDate: { gte: todayStart, lte: next7End } },
          guideAssignments: {
            none: {
              status: {
                in: [
                  "assigned",
                  "accepted",
                  "confirmed",
                  "in_progress",
                  "issue",
                ],
              },
            },
          },
        },
      }),
    ]);

    const alerts = [
      expiringHolds
        ? `⚠ Có ${expiringHolds} booking sắp hết hạn thanh toán`
        : "✅ Không có booking sắp hết hạn thanh toán trong 5 phút tới",
      noGuideBookings
        ? `⚠ Có ${noGuideBookings} tour/booking sắp khởi hành nhưng chưa phân công HDV`
        : "✅ Booking sắp khởi hành đã có HDV hoặc chưa cần gán",
      pendingRefunds
        ? `⚠ Có ${pendingRefunds} yêu cầu hoàn tiền đang chờ duyệt`
        : "✅ Không có yêu cầu hoàn tiền đang chờ duyệt",
    ];

    return {
      cards: {
        waitingPayment,
        paidToday,
        upcomingDepartures,
        noGuideBookings,
        expiringHolds,
        pendingRefunds,
        todayRevenue: this.toMoney(todayRevenueAgg._sum.amount),
        monthRevenue: this.toMoney(monthRevenueAgg._sum.amount),
        paymentSuccessRate: this.safePercent(paidPayments, totalPayments),
      },
      alerts,
    };
  }

  async adminRevenueReport() {
    const paidPayments = await this.prisma.payment.findMany({
      where: { paymentStatus: "paid" as any },
      include: {
        booking: {
          include: { tour: { include: { destination: true } }, voucher: true },
        },
      },
      orderBy: { paidAt: "asc" },
    });
    const allBookings = await this.prisma.booking.findMany({
      include: {
        tour: { include: { destination: true } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const monthly = new Map<string, number>();
    const destinationRevenue = new Map<string, number>();
    const destinationBookings = new Map<string, number>();
    const tourBookings = new Map<
      string,
      {
        name: string;
        destination: string;
        total: number;
        guests: number;
        revenue: number;
      }
    >();
    let voucherUsed = 0;

    for (const payment of paidPayments) {
      const paidAt = payment.paidAt || payment.createdAt;
      const key = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, "0")}`;
      monthly.set(key, (monthly.get(key) || 0) + this.toMoney(payment.amount));
      const destination = payment.booking?.tour?.destination?.name || "Khác";
      destinationRevenue.set(
        destination,
        (destinationRevenue.get(destination) || 0) +
          this.toMoney(payment.amount),
      );
      if (payment.booking?.voucherId) voucherUsed += 1;
    }

    for (const booking of allBookings) {
      const destination = booking.tour?.destination?.name || "Khác";
      destinationBookings.set(
        destination,
        (destinationBookings.get(destination) || 0) + 1,
      );
      const tourId = String(booking.tourId);
      const current = tourBookings.get(tourId) || {
        name: booking.tour?.name || `Tour #${tourId}`,
        destination,
        total: 0,
        guests: 0,
        revenue: 0,
      };
      current.total += 1;
      current.guests +=
        Number(booking.adultCount || 0) + Number(booking.childCount || 0);
      if (["confirmed", "completed"].includes(String(booking.bookingStatus))) {
        current.revenue += this.toMoney(booking.finalAmount);
      }
      tourBookings.set(tourId, current);
    }

    const cancelled = allBookings.filter(
      (b: any) => String(b.bookingStatus) === "cancelled",
    ).length;
    const paymentSuccess = allBookings.filter((b: any) =>
      ["paid", "refunded"].includes(String(b.payments?.[0]?.paymentStatus)),
    ).length;

    const guestsByMonth = new Map<string, number>();
    allBookings.forEach((b: any) => {
      const created = new Date(b.createdAt);
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
      guestsByMonth.set(
        key,
        (guestsByMonth.get(key) || 0) +
          Number(b.adultCount || 0) +
          Number(b.childCount || 0),
      );
    });

    return {
      monthlyRevenue: Array.from(monthly.entries())
        .map(([month, revenue]) => ({ month, revenue }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      topDestinations: Array.from(destinationBookings.entries())
        .map(([destination, total]) => ({ destination, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      topTours: Array.from(tourBookings.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      cancelRate: this.safePercent(cancelled, allBookings.length),
      paymentSuccessRate: this.safePercent(paymentSuccess, allBookings.length),
      voucherUsageRate: this.safePercent(voucherUsed, paidPayments.length),
      revenueByDestination: Array.from(destinationRevenue.entries())
        .map(([destination, revenue]) => ({ destination, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10),
      guestsByMonth: Array.from(guestsByMonth.entries())
        .map(([month, guests]) => ({ month, guests }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  async adminOperationCalendar(query: { mode?: string; date?: string }) {
    const { start, end } = this.buildRange(query.mode, query.date);
    const departures = await this.prisma.tourDeparture.findMany({
      where: { departureDate: { gte: start, lte: end } },
      include: {
        tour: { include: { destination: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ] as any,
            },
          },
          include: {
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
            guideAssignments: {
              include: { guide: true },
              where: { status: { in: ["assigned", "confirmed"] } },
              take: 1,
            },
            logs: { orderBy: { createdAt: "desc" }, take: 5 },
          },
        },
      },
      orderBy: { departureDate: "asc" },
    });

    const departureIds = departures.map((dep: any) => dep.id);
    const operations = departureIds.length
      ? await this.prisma.tripOperation.findMany({
          where: { departureId: { in: departureIds } },
          include: { guide: true },
        })
      : [];
    const operationByDeparture = new Map(
      operations.map((operation: any) => [
        String(operation.departureId),
        operation,
      ]),
    );

    departures.forEach((dep: any) => {
      const operation = operationByDeparture.get(String(dep.id)) || null;
      dep.tripOperation = operation;
      dep.guide = operation?.guide || null;
    });

    return {
      mode: query.mode || "week",
      start,
      end,
      days: departures.reduce((acc: any[], dep: any) => {
        const key = dep.departureDate.toISOString().slice(0, 10);
        let group = acc.find((item) => item.date === key);
        if (!group) {
          group = { date: key, departures: [] };
          acc.push(group);
        }
        const guests = (dep.bookings || []).reduce(
          (sum: number, b: any) =>
            sum + Number(b.adultCount || 0) + Number(b.childCount || 0),
          0,
        );
        const noGuide = dep.guide
          ? 0
          : (dep.bookings || []).filter((b: any) =>
              ["confirmed", "waiting_confirmation"].includes(
                String(b.bookingStatus),
              ),
            ).length;
        group.departures.push({
          id: dep.id,
          tourId: dep.tourId,
          tourName: dep.tour?.name,
          destination: dep.tour?.destination?.name,
          province: dep.tour?.destination?.province,
          departureDate: dep.departureDate,
          endDate: dep.endDate,
          totalSlots: dep.totalSlots,
          bookedSlots: dep.bookedSlots,
          heldSlots: dep.heldSlots,
          guests,
          bookingCount: dep.bookings?.length || 0,
          noGuide,
          guideId: dep.guide?.id || null,
          guideName: dep.guide?.fullName || null,
          status: dep.status,
        });
        return acc;
      }, []),
    };
  }

  async adminPredepartureChecklist(query: { days?: string }) {
    const days = Math.max(Number(query.days || 7), 1);
    const start = this.startOfDay();
    const end = this.endOfDay(this.addDays(start, days));
    const departures = await this.prisma.tourDeparture.findMany({
      where: {
        departureDate: { gte: start, lte: end },
        status: { in: ["open", "full"] as any },
      },
      include: {
        tour: { include: { destination: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ] as any,
            },
          },
          include: {
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
            guideAssignments: {
              include: { guide: true },
              where: { status: { in: ["assigned", "confirmed"] } },
              take: 1,
            },
            logs: { orderBy: { createdAt: "desc" }, take: 5 },
          },
        },
      },
      orderBy: { departureDate: "asc" },
      take: 80,
    });

    const departureIds = departures.map((dep: any) => dep.id);
    const operations = departureIds.length
      ? await this.prisma.tripOperation.findMany({
          where: { departureId: { in: departureIds } },
          include: { guide: true },
        })
      : [];
    const operationByDeparture = new Map(
      operations.map((operation: any) => [
        String(operation.departureId),
        operation,
      ]),
    );

    const items = [];
    for (const dep of departures as any[]) {
      const operation = operationByDeparture.get(String(dep.id)) || null;
      dep.tripOperation = operation;
      dep.guide = operation?.guide || null;
      const checklist = await this.getDepartureChecklist(dep);
      items.push({
        id: dep.id,
        tourName: dep.tour?.name,
        destination: dep.tour?.destination?.name,
        province: dep.tour?.destination?.province,
        departureDate: dep.departureDate,
        endDate: dep.endDate,
        daysUntilDeparture: this.daysUntil(dep.departureDate),
        guideId: dep.guide?.id || null,
        guideName: dep.guide?.fullName || null,
        ...checklist,
      });
    }
    return { days, items };
  }

  private buildBulkMessage(type: string, booking: any, customMessage?: string) {
    const tourName = booking.tour?.name || "tour của quý khách";
    const departureDate = booking.departure
      ? new Date(booking.departure.departureDate).toLocaleDateString("vi-VN")
      : "đang cập nhật";
    const pickup = booking.pickupName
      ? `${booking.pickupName} - ${booking.pickupAddress || ""}`
      : "Travela sẽ liên hệ xác nhận";
    const guide =
      booking.guide?.fullName ||
      booking.tripOperation?.guide?.fullName ||
      booking.tripOperation?.primaryGuide?.fullName ||
      booking.guideAssignments?.[0]?.guide?.fullName ||
      "Travela sẽ cập nhật";
    const templates: any = {
      reminder: `Nhắc lịch: ${tourName} sẽ khởi hành ngày ${departureDate}. Điểm đón: ${pickup}. Vui lòng có mặt trước giờ đón 15 phút.`,
      pickup: `Thông tin điểm đón của ${tourName}: ${pickup}. Ngày khởi hành: ${departureDate}.`,
      itinerary_change:
        customMessage ||
        `Travela thông báo lịch trình ${tourName} có điều chỉnh. Vui lòng theo dõi thông báo mới nhất từ hệ thống.`,
      guide_change: `Thông tin hướng dẫn viên của ${tourName}: ${guide}. Ngày khởi hành: ${departureDate}.`,
    };
    return templates[type] || customMessage || templates.reminder;
  }

  async adminBulkNotify(
    dto: {
      bookingIds?: Array<string | number>;
      departureId?: string | number;
      type?: string;
      channel?: string;
      message?: string;
    },
    adminId?: bigint,
  ) {
    let where: any = {
      bookingStatus: {
        in: ["confirmed", "waiting_confirmation", "completed"] as any,
      },
    };
    if (dto.bookingIds?.length) {
      where.id = { in: dto.bookingIds.map((id) => BigInt(id)) };
    } else if (dto.departureId) {
      where.departureId = BigInt(dto.departureId);
    } else {
      throw new BadRequestException(
        "Vui lòng chọn booking hoặc lịch khởi hành cần gửi thông báo.",
      );
    }

    const bookings = await this.prisma.booking.findMany({
      where,
      include: {
        user: true,
        tour: { include: { destination: true } },
        departure: true,
        guideAssignments: {
          include: { guide: true },
          where: { status: { in: ["assigned", "confirmed"] } },
          take: 1,
        },
      },
      take: 200,
    });

    const resolvedBookings = await this.attachDepartureGuides(
      bookings as any[],
    );

    let notificationCount = 0;
    let emailCount = 0;
    const errors: string[] = [];
    for (const booking of resolvedBookings as any[]) {
      const content = this.buildBulkMessage(
        dto.type || "reminder",
        booking,
        dto.message,
      );
      if (booking.userId) {
        await this.prisma.notification.create({
          data: {
            title:
              dto.type === "pickup"
                ? "Thông tin điểm đón"
                : dto.type === "guide_change"
                  ? "Thông tin hướng dẫn viên"
                  : dto.type === "itinerary_change"
                    ? "Thông báo thay đổi lịch trình"
                    : "Nhắc lịch khởi hành tour",
            message: content.slice(0, 480),
            content,
            targetRole: "user" as any,
            targetUserId: booking.userId,
            isPublished: true,
            createdBy: adminId,
          },
        });
        notificationCount += 1;
      }

      if (
        ["email", "both"].includes(String(dto.channel || "notification")) &&
        booking.contactEmail
      ) {
        try {
          await this.emailService.sendMail({
            to: booking.contactEmail,
            subject: "Travela - Thông báo tour",
            text: content,
            html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Travela</h2><p>${content}</p><p>Mã booking: <strong>${booking.bookingCode}</strong></p></div>`,
          });
          emailCount += 1;
        } catch (err: any) {
          errors.push(
            `${booking.bookingCode}: ${err?.message || "Không gửi được email"}`,
          );
        }
      }

      await this.prisma.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: `bulk_${dto.type || "notify"}`,
          oldStatus: booking.bookingStatus,
          newStatus: booking.bookingStatus,
          changedByUserId: adminId,
          source: "admin",
          reason: "Admin gửi thông báo hàng loạt",
          note: content,
        },
      });
    }

    return {
      success: true,
      totalBookings: bookings.length,
      notificationCount,
      emailCount,
      errors,
    };
  }

  private buildRefundSuggestion(refund: any) {
    const booking = refund.booking;
    const latestPayment = booking?.payments?.[0] || null;
    const createdAt = new Date(booking?.createdAt || refund.createdAt);
    const requestedAt = new Date(refund.createdAt);
    const hoursAfterBooking =
      Math.round(
        ((requestedAt.getTime() - createdAt.getTime()) / 3600000) * 10,
      ) / 10;
    const daysBeforeDeparture = this.daysUntil(
      booking?.departure?.departureDate,
    );
    const bookingStatus = String(booking?.bookingStatus || "");
    const paymentStatus = String(latestPayment?.paymentStatus || "");
    const isWithin48Hours = hoursAfterBooking <= 48;
    const isBefore3Days =
      daysBeforeDeparture !== null && daysBeforeDeparture >= 3;
    const hasPaidSignal =
      ["confirmed", "waiting_confirmation"].includes(bookingStatus) ||
      ["paid", "waiting_confirmation"].includes(paymentStatus);
    const eligible = isWithin48Hours && isBefore3Days && hasPaidSignal;
    const finalAmount = this.toMoney(booking?.finalAmount);
    return {
      refundId: refund.id,
      bookingId: booking?.id,
      bookingCode: booking?.bookingCode,
      customerName: booking?.contactName,
      tourName: booking?.tour?.name,
      destination: booking?.tour?.destination?.name,
      requestedAt: refund.createdAt,
      departureDate: booking?.departure?.departureDate,
      daysBeforeDeparture,
      hoursAfterBooking,
      bookingStatus,
      paymentStatus,
      paidAmount:
        latestPayment &&
        ["paid", "waiting_confirmation", "refunded"].includes(paymentStatus)
          ? this.toMoney(latestPayment.amount)
          : 0,
      finalAmount,
      requestedAmount: this.toMoney(refund.refundAmount || finalAmount),
      suggestedRefundAmount: eligible
        ? Math.min(
            this.toMoney(refund.refundAmount || finalAmount),
            finalAmount,
          )
        : 0,
      eligible,
      decision: eligible
        ? "Đề xuất duyệt"
        : "Đề xuất từ chối/kiểm tra thủ công",
      reasons: [
        isWithin48Hours
          ? "Yêu cầu nằm trong 48 giờ sau khi đặt"
          : "Quá 48 giờ sau khi đặt",
        isBefore3Days
          ? "Còn ít nhất 3 ngày trước khởi hành"
          : "Không còn đủ 3 ngày trước khởi hành",
        hasPaidSignal
          ? "Booking đã thanh toán/đã xác nhận"
          : "Booking chưa đủ tín hiệu thanh toán",
      ],
    };
  }

  async adminRefundSuggestions(query: { status?: string }) {
    const refunds = await this.prisma.refundRequest.findMany({
      where: { status: (query.status || "pending") as any },
      include: {
        booking: {
          include: {
            tour: { include: { destination: true } },
            departure: true,
            payments: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return {
      items: refunds.map((refund: any) => this.buildRefundSuggestion(refund)),
    };
  }
}
