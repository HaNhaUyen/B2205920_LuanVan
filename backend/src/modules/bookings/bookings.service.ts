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

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

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

  private async ensureBookableUser(
    tx: Prisma.TransactionClient,
    userId?: bigint,
  ) {
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

    if (!["open", "full"].includes(String(departure.status))) {
      throw new BadRequestException(
        "Lịch khởi hành này hiện không cho phép đặt chỗ.",
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
    tx: Prisma.TransactionClient,
    departure: any,
    pickupPointId?: number,
  ) {
    if (!pickupPointId) return null;

    const pickup = await tx.tourPickupPoint.findFirst({
      where: {
        id: BigInt(pickupPointId),
        status: "active",
        tourId: departure.tourId,
        OR: [{ departureId: departure.id }, { departureId: null }],
      },
    });

    if (!pickup) {
      throw new BadRequestException(
        "Điểm đón không hợp lệ cho lịch khởi hành này.",
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

  async create(dto: CreateBookingDto, userId?: bigint) {
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

  findMyBookings(userId: bigint) {
    return this.prisma.booking.findMany({
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
              where: { isCover: true },
              take: 1,
            },
          },
        },
        departure: true,
        pickupPoint: true,
        voucher: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
        refundRequests: {
          orderBy: { createdAt: "desc" },
        },
        guideAssignments: {
          where: {
            status: { in: ["assigned", "confirmed"] as any },
          },
          include: {
            guide: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
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

  async findById(id: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: BigInt(id) },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
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
          include: {
            guide: true,
          },
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

    return booking;
  }

  async adminList(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    paymentStatus?: string;
    tourId?: string;
  }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

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

    if (query.status) {
      where.bookingStatus = query.status;
    }

    if (query.tourId) {
      where.tourId = BigInt(query.tourId);
    }

    if (query.paymentStatus) {
      where.payments = {
        some: {
          paymentStatus: query.paymentStatus,
        },
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          tour: {
            select: {
              id: true,
              name: true,
              slug: true,
              destination: {
                select: {
                  id: true,
                  name: true,
                  province: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          departure: true,
          pickupPoint: true,
          voucher: true,
          payments: {
            take: 1,
            orderBy: { createdAt: "desc" },
          },
          guideAssignments: {
            where: {
              status: { in: ["assigned", "confirmed"] as any },
            },
            include: {
              guide: true,
            },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      }),
      this.prisma.booking.count({ where }),
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

  async adminUpdate(id: number, dto: UpdateBookingDto, changedBy?: bigint) {
    const existing = await this.prisma.booking.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) {
      throw new NotFoundException("Không tìm thấy booking.");
    }

    if (
      ["completed", "cancelled", "expired"].includes(existing.bookingStatus)
    ) {
      throw new BadRequestException(
        "Booking đã chốt trạng thái cuối, không nên sửa thông tin liên hệ trực tiếp nữa.",
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: BigInt(id) },
      data: {
        contactName: dto.contactName?.trim() || existing.contactName,
        contactEmail: dto.contactEmail
          ? this.normalizeEmail(dto.contactEmail)
          : existing.contactEmail,
        contactPhone: dto.contactPhone
          ? this.normalizePhone(dto.contactPhone)
          : existing.contactPhone,
        note: dto.note !== undefined ? dto.note?.trim() || null : existing.note,
      },
    });

    await this.prisma.bookingStatusLog.create({
      data: {
        bookingId: updated.id,
        actionType: "other",
        oldStatus: existing.bookingStatus,
        newStatus: updated.bookingStatus,
        changedByUserId: changedBy,
        source: "admin",
        reason: "Booking info updated",
      },
    });

    return updated;
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

      return updated;
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
}
