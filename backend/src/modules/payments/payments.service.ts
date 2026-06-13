import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PaymentCallbackDto } from "./dto/payment-callback.dto";
import { EmailService } from "../../common/services/email.service";
import { Prisma } from "@prisma/client";
import { CheckoutPaymentDto } from "./dto/checkout-payment.dto";
import { SepayWebhookDto } from "./dto/sepay-webhook.dto";
import { RedisService } from "../../redis/redis.service";

type SupportedPaymentMethod =
  | "momo"
  | "vnpay"
  | "card"
  | "bank_transfer"
  | "cash";

type CurrentUserLike = {
  userId: bigint;
  email: string;
  role: "admin" | "user";
};

type BookingEmailPayload = {
  bookingCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  bookingStatus: string;
  finalAmount: number;
  adultCount: number;
  childCount: number;
  paymentMethod: string;
  paidAt?: Date | null;
  paidAtLabel: string;
  departureDateLabel: string;
  endDateLabel: string;
  holdExpiresAt?: Date | null;
  holdExpiresAtLabel: string;
  internalTransactionCode?: string | null;
  paymentStatusLabel: string;
  paymentUrl?: string | null;
  qrImageUrl?: string | null;
  note?: string | null;
  tourName: string;
  destinationName: string;
  hotelStars: number | null;
  accommodationSummary: string;
  transportSummary: string;
  pickupName?: string | null;
  pickupAddress?: string | null;
  pickupTimeLabel?: string | null;
  pickupNote?: string | null;
};

type PaymentInstructionEmailResult = {
  attempted: boolean;
  sent: boolean;
  error: string | null;
  internalTransactionCode?: string;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly redisService: RedisService,
  ) {}

  private getHoldExpireAt() {
    return new Date(Date.now() + 15 * 60 * 1000);
  }

  private normalizeEmail(value: string) {
    return (value || "").trim().toLowerCase();
  }

  private normalizePhone(value: string) {
    return (value || "").trim();
  }

  private validatePaymentMethod(paymentMethod: SupportedPaymentMethod) {
    if (
      !["momo", "vnpay", "card", "bank_transfer", "cash"].includes(
        paymentMethod,
      )
    ) {
      throw new BadRequestException("Phương thức thanh toán không hợp lệ.");
    }
  }

  private async markVoucherUsedAfterPaid(
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
      data: { status: "used", usedAt: new Date() },
    });

    await tx.voucher
      .update({
        where: { id: booking.voucherId },
        data: { usedCount: { increment: 1 } },
      })
      .catch(() => null);
  }

  private getFrontendUrl() {
    return (process.env.FRONTEND_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
  }

  private mapPaymentMethodLabel(paymentMethod: string) {
    const labels: Record<string, string> = {
      momo: "Ví MoMo",
      vnpay: "VNPay",
      card: "Thẻ ngân hàng",
      bank_transfer: "SePay / MBBank VietQR",
      cash: "Tiền mặt",
    };
    return labels[paymentMethod] || paymentMethod;
  }

  private buildPaymentQrData(input: {
    bookingCode: string;
    internalTransactionCode: string;
    amount: number;
    paymentMethod: string;
    holdExpiresAtLabel: string;
  }) {
    return [
      "TRAVELA",
      input.bookingCode,
      input.internalTransactionCode,
      String(input.amount || 0),
      input.paymentMethod,
      input.holdExpiresAtLabel,
    ].join("|");
  }

  private buildPaymentQrImageUrl(text: string) {
    return `https://quickchart.io/qr?size=280&text=${encodeURIComponent(text)}`;
  }

  private getSepayBankConfig() {
    return {
      bankCode: process.env.SEPAY_BANK_CODE || "MBBank",
      accountNo: process.env.SEPAY_ACCOUNT_NO || "",
      accountName: process.env.SEPAY_ACCOUNT_NAME || "TRAVELA",
      webhookApiKey: process.env.SEPAY_WEBHOOK_API_KEY || "",
      paymentPrefix: process.env.SEPAY_PAYMENT_PREFIX || "DH",
    };
  }

  private generateInternalTransactionCode(suffix = "") {
    const prefix = this.getSepayBankConfig().paymentPrefix;
    return `${prefix}${Date.now()}${suffix}`;
  }

  private buildSepayQrImageUrl(input: { amount: number; description: string }) {
    const config = this.getSepayBankConfig();
    if (!config.accountNo) {
      throw new BadRequestException("Thiếu SEPAY_ACCOUNT_NO trong file .env.");
    }

    const params = new URLSearchParams({
      acc: config.accountNo,
      bank: config.bankCode,
      amount: String(Math.round(Number(input.amount || 0))),
      des: input.description,
      template: "compact",
    });

    return `https://qr.sepay.vn/img?${params.toString()}`;
  }

  private buildPaymentSessionResponse(input: {
    booking: any;
    payment: any;
    paymentMethod: SupportedPaymentMethod;
  }) {
    const amount = Number(
      input.payment.amount || input.booking.finalAmount || 0,
    );
    const transferContent = input.payment.internalTransactionCode;
    const qrImageUrl = this.buildSepayQrImageUrl({
      amount,
      description: transferContent,
    });
    const config = this.getSepayBankConfig();

    return {
      bookingId: input.booking.id.toString(),
      bookingCode: input.booking.bookingCode,
      amount,
      finalAmount: amount,
      paymentId: input.payment.id.toString(),
      internalTransactionCode: transferContent,
      transactionCode: transferContent,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.payment.paymentStatus,
      holdExpiresAt: input.booking.holdExpiresAt,
      expiresAt: input.booking.holdExpiresAt,
      paymentUrl: null,
      sepay: {
        bankCode: config.bankCode,
        accountNo: config.accountNo,
        accountName: config.accountName,
        transferContent,
        qrImageUrl,
      },
      qrImageUrl,
      qrCodeUrl: qrImageUrl,
    };
  }

  private verifySepayAuthorization(authorization?: string) {
    const apiKey = this.getSepayBankConfig().webhookApiKey;
    if (!apiKey) return;

    const expected = `Apikey ${apiKey}`;
    if (authorization !== expected) {
      throw new UnauthorizedException("Webhook SePay không hợp lệ.");
    }
  }

  private findTransactionCodeFromSepay(dto: SepayWebhookDto) {
    const prefix = this.getSepayBankConfig().paymentPrefix || "DH";

    // SePay/MBBank đôi khi trả dto.code bị rút ngắn, ví dụ:
    // code: DH1781254255
    // content: ... DH17812545251471348 ...
    // Vì vậy không được lấy match đầu tiên từ code. Ta quét tất cả field,
    // lấy mã DH dài nhất để khớp với internal_transaction_code trong DB.
    const raw = [dto.content, dto.description, dto.code, dto.referenceCode]
      .filter(Boolean)
      .join(" ");

    const regex = new RegExp(`${prefix}\\d{8,}`, "gi");
    const matches = raw.match(regex) || [];

    if (!matches.length) return null;

    return matches
      .map((item) => item.toUpperCase())
      .sort((a, b) => b.length - a.length)[0];
  }

  private ensureBookingOwnership(booking: any, user?: CurrentUserLike) {
    if (!user || user.role === "admin") return;
    if (booking.userId && String(booking.userId) !== String(user.userId)) {
      throw new ForbiddenException(
        "Bạn không có quyền thanh toán booking này.",
      );
    }
    if (
      !booking.userId &&
      this.normalizeEmail(booking.contactEmail) !==
        this.normalizeEmail(user.email)
    ) {
      throw new ForbiddenException(
        "Booking khách lẻ chỉ được thanh toán bởi đúng email đã đặt tour.",
      );
    }
  }

  private async expireBookingIfNeeded(
    tx: Prisma.TransactionClient,
    booking: any,
    reason = "Phiên thanh toán đã hết hạn.",
  ) {
    if (
      !booking?.holdExpiresAt ||
      !["pending_payment", "waiting_confirmation"].includes(
        booking.bookingStatus,
      ) ||
      new Date(booking.holdExpiresAt).getTime() > Date.now()
    ) {
      return false;
    }

    const guestCount =
      Number(booking.adultCount || 0) + Number(booking.childCount || 0);
    await tx.booking.update({
      where: { id: booking.id },
      data: { bookingStatus: "expired" },
    });

    if (guestCount > 0) {
      await tx.tourDeparture.update({
        where: { id: booking.departureId },
        data: { heldSlots: { decrement: guestCount } },
      });
    }

    await tx.payment.updateMany({
      where: {
        bookingId: booking.id,
        paymentStatus: { in: ["pending", "waiting_confirmation"] },
      },
      data: { paymentStatus: "expired" },
    });

    await tx.bookingStatusLog.create({
      data: {
        bookingId: booking.id,
        actionType: "expire",
        oldStatus: booking.bookingStatus,
        newStatus: "expired",
        source: "scheduler",
        reason,
      },
    });
    return true;
  }

  private async validateCheckoutInput(
    tx: Prisma.TransactionClient,
    dto: CheckoutPaymentDto,
    user?: CurrentUserLike,
  ) {
    const departure = await tx.tourDeparture.findUnique({
      where: { id: BigInt(dto.departureId) },
      include: { tour: true },
    });

    if (!departure)
      throw new NotFoundException("Không tìm thấy lịch khởi hành.");
    if (!["open", "full"].includes(String(departure.status))) {
      throw new BadRequestException(
        "Đợt khởi hành này hiện không nhận thanh toán.",
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(departure.departureDate).getTime() < today.getTime()) {
      throw new BadRequestException(
        "Lịch khởi hành này đã qua ngày đặt hợp lệ.",
      );
    }

    const adultCount = Number(dto.adultCount || 0);
    const childCount = Number(dto.childCount || 0);
    const requestedSlots = adultCount + childCount;
    if (requestedSlots <= 0) {
      throw new BadRequestException("Số lượng khách không hợp lệ.");
    }

    const availableSlots =
      Number(departure.totalSlots) -
      Number(departure.bookedSlots) -
      Number(departure.heldSlots);
    if (requestedSlots > availableSlots) {
      throw new BadRequestException("Số chỗ còn lại không đủ cho booking này.");
    }

    if (user?.userId) {
      const account = await tx.user.findUnique({ where: { id: user.userId } });
      if (!account) throw new NotFoundException("Tài khoản không tồn tại.");
      if (account.status !== "active") {
        throw new BadRequestException(
          "Tài khoản của bạn hiện không thể tạo phiên thanh toán.",
        );
      }
    }

    const normalizedEmail = this.normalizeEmail(dto.contactEmail);
    const normalizedPhone = this.normalizePhone(dto.contactPhone);
    const duplicate = await tx.booking.findFirst({
      where: {
        departureId: departure.id,
        bookingStatus: {
          in: [
            "pending_payment",
            "waiting_confirmation",
            "confirmed",
            "completed",
          ],
        },
        OR: [
          ...(user?.userId ? [{ userId: user.userId }] : []),
          { contactEmail: normalizedEmail, contactPhone: normalizedPhone },
        ],
      },
      select: { id: true, bookingCode: true, bookingStatus: true },
    });

    if (duplicate) {
      throw new BadRequestException(
        `Bạn đã có booking ${duplicate.bookingCode} cho lịch khởi hành này (${duplicate.bookingStatus}). Không thể tạo thêm booking trùng.`,
      );
    }

    return { departure, requestedSlots, normalizedEmail, normalizedPhone };
  }

  async checkout(dto: CheckoutPaymentDto, user?: CurrentUserLike) {
    this.validatePaymentMethod(dto.paymentMethod);

    const departureId = BigInt(dto.departureId);
    const lockKey = `lock:departure:${departureId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, 10000);

    if (!lockToken) {
      throw new BadRequestException(
        "Có người đang đặt lịch khởi hành này. Vui lòng thử lại sau vài giây.",
      );
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const { departure, requestedSlots, normalizedEmail, normalizedPhone } =
          await this.validateCheckoutInput(tx, dto, user);

        const originalAmount =
          Number(departure.adultPrice) * Number(dto.adultCount) +
          Number(departure.childPrice) * Number(dto.childCount);

        const holdExpiresAt = this.getHoldExpireAt();

        const initialBookingStatus = "pending_payment";
        const paymentStatus = "pending";

        const internalTransactionCode = this.generateInternalTransactionCode(
          String(Math.floor(Math.random() * 900 + 100)),
        );

        const booking = await tx.booking.create({
          data: {
            bookingCode: `BK${Date.now()}`,
            userId: user?.userId || null,
            tourId: departure.tourId,
            departureId: departure.id,
            adultCount: Number(dto.adultCount),
            childCount: Number(dto.childCount),
            originalAmount,
            discountAmount: 0,
            finalAmount: originalAmount,
            bookingStatus: initialBookingStatus as any,
            holdExpiresAt,
            contactName: dto.contactName.trim(),
            contactEmail: normalizedEmail,
            contactPhone: normalizedPhone,
            note: dto.note?.trim() || null,
          },
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
            source: user?.userId ? "user" : "guest",
            reason: "Booking created from direct checkout",
          },
        });

        if (user?.userId) {
          await tx.userBehavior.create({
            data: {
              userId: user.userId,
              tourId: booking.tourId,
              action: "booking",
              score: 8,
              keyword: null,
              meta: {
                source: "payment_checkout",
                bookingId: booking.id.toString(),
                bookingCode: booking.bookingCode,
                departureId: booking.departureId.toString(),
                paymentMethod: dto.paymentMethod,
                finalAmount: Number(booking.finalAmount),
              } as any,
            },
          });
        }

        const payment = await tx.payment.create({
          data: {
            bookingId: booking.id,
            paymentMethod: dto.paymentMethod,
            internalTransactionCode,
            amount: booking.finalAmount,
            paymentStatus: paymentStatus as any,
          },
        });

        return {
          booking,
          payment,
          departure,
        };
      });

      return this.buildPaymentSessionResponse({
        booking: result.booking,
        payment: result.payment,
        paymentMethod: dto.paymentMethod,
      });
    } finally {
      await this.redisService.releaseLock(lockKey, lockToken);
    }
  }

  async initiatePayment(
    bookingId: number,
    paymentMethod: SupportedPaymentMethod,
    user?: CurrentUserLike,
  ) {
    this.validatePaymentMethod(paymentMethod);

    const booking = await this.prisma.booking.findUnique({
      where: { id: BigInt(bookingId) },
      include: {
        payments: {
          where: {
            paymentStatus: { in: ["pending", "waiting_confirmation", "paid"] },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!booking) throw new NotFoundException("Booking not found");
    this.ensureBookingOwnership(booking, user);

    await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.booking.findUnique({ where: { id: booking.id } });
      if (fresh) {
        await this.expireBookingIfNeeded(
          tx,
          fresh,
          "Khởi tạo thanh toán khi booking đã quá hạn.",
        );
      }
    });

    const refreshed = await this.prisma.booking.findUnique({
      where: { id: booking.id },
      include: {
        payments: {
          where: {
            paymentStatus: { in: ["pending", "waiting_confirmation", "paid"] },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!refreshed) throw new NotFoundException("Booking not found");

    if (
      !["pending_payment", "waiting_confirmation"].includes(
        refreshed.bookingStatus,
      )
    ) {
      throw new BadRequestException(
        "Booking đã quá hạn hoặc không còn ở trạng thái có thể thanh toán. Vui lòng đặt lại tour để tạo mã thanh toán mới.",
      );
    }

    const paidPayment = refreshed.payments.find(
      (item: any) => item.paymentStatus === "paid",
    );
    if (paidPayment) {
      throw new BadRequestException(
        "Booking này đã được thanh toán thành công.",
      );
    }

    const reusable = refreshed.payments.find(
      (item: any) =>
        item.paymentMethod === paymentMethod &&
        ["pending", "waiting_confirmation"].includes(item.paymentStatus),
    );

    if (reusable) {
      return {
        ...this.buildPaymentSessionResponse({
          booking: refreshed,
          payment: reusable,
          paymentMethod,
        }),
        reused: true,
      };
    }

    const internalTransactionCode = this.generateInternalTransactionCode(
      String(bookingId),
    );

    const payment = await this.prisma.payment.create({
      data: {
        bookingId: refreshed.id,
        paymentMethod,
        internalTransactionCode,
        amount: refreshed.finalAmount,
        paymentStatus: "pending",
      },
    });

    await this.prisma.bookingStatusLog.create({
      data: {
        bookingId: refreshed.id,
        paymentId: payment.id,
        actionType: "payment_init",
        oldStatus: refreshed.bookingStatus,
        newStatus: refreshed.bookingStatus,
        source: user?.userId ? "user" : "system",
        reason: "Payment initiated",
        note: `Method: ${paymentMethod}`,
      },
    });

    return {
      ...this.buildPaymentSessionResponse({
        booking: refreshed,
        payment,
        paymentMethod,
      }),
      reused: false,
    };
  }

  async getStatus(transactionCode: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { internalTransactionCode: transactionCode },
      include: { booking: true },
    });

    if (!payment)
      throw new NotFoundException("Không tìm thấy giao dịch thanh toán.");

    return {
      paymentId: payment.id.toString(),
      bookingId: payment.bookingId.toString(),
      bookingCode: payment.booking?.bookingCode || null,
      bookingStatus: payment.booking?.bookingStatus || null,
      transactionCode: payment.internalTransactionCode,
      internalTransactionCode: payment.internalTransactionCode,
      paymentMethod: payment.paymentMethod,
      paymentStatus: payment.paymentStatus,
      amount: Number(payment.amount || 0),
      paidAt: payment.paidAt,
      holdExpiresAt: payment.booking?.holdExpiresAt || null,
      expiresAt: payment.booking?.holdExpiresAt || null,
    };
  }

  async confirmScan(transactionCode: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { internalTransactionCode: transactionCode },
      include: { booking: true },
    });

    if (!payment)
      throw new NotFoundException("Không tìm thấy giao dịch thanh toán.");

    return {
      success: true,
      message:
        "Thanh toán thật sẽ được xác nhận tự động bằng webhook SePay sau khi tiền vào tài khoản.",
      bookingId: payment.bookingId.toString(),
      bookingCode: payment.booking?.bookingCode || null,
      transactionCode: payment.internalTransactionCode,
      internalTransactionCode: payment.internalTransactionCode,
      paymentStatus: payment.paymentStatus,
    };
  }

  async handleCallback(dto: PaymentCallbackDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { internalTransactionCode: dto.internalTransactionCode },
      include: {
        booking: true,
      },
    });

    if (!payment) throw new NotFoundException("Payment not found");

    const transactionResult = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const booking = await tx.booking.findUnique({
          where: { id: payment.bookingId },
        });

        if (!booking) throw new NotFoundException("Booking not found");

        if (payment.paymentStatus === "paid" && dto.paymentStatus === "paid") {
          return {
            success: true,
            message: "Already processed",
            bookingId: booking.id.toString(),
            shouldSendEmail: false,
          };
        }

        if (
          dto.paymentStatus === "paid" &&
          ["confirmed", "completed"].includes(String(booking.bookingStatus))
        ) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              paymentStatus: "paid",
              gatewayTransactionId: dto.gatewayTransactionId,
              paidAt: payment.paidAt || new Date(),
            },
          });
          return {
            success: true,
            message: "Booking already settled",
            bookingId: booking.id.toString(),
            shouldSendEmail: false,
          };
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            paymentStatus: dto.paymentStatus,
            gatewayTransactionId: dto.gatewayTransactionId,
            paidAt: dto.paymentStatus === "paid" ? new Date() : null,
          },
        });

        const totalGuests =
          Number(booking.adultCount) + Number(booking.childCount);
        const isHeldBooking = [
          "pending_payment",
          "waiting_confirmation",
        ].includes(String(booking.bookingStatus));

        if (dto.paymentStatus === "paid") {
          await tx.booking.update({
            where: { id: booking.id },
            data: { bookingStatus: "confirmed", holdExpiresAt: null },
          });

          await this.markVoucherUsedAfterPaid(tx, booking);

          await tx.tourDeparture.update({
            where: { id: booking.departureId },
            data: {
              ...(isHeldBooking
                ? { heldSlots: { decrement: totalGuests } }
                : {}),
              bookedSlots: { increment: totalGuests },
            },
          });

          await tx.bookingStatusLog.create({
            data: {
              bookingId: booking.id,
              paymentId: payment.id,
              actionType: "payment_success",
              oldStatus: booking.bookingStatus,
              newStatus: "confirmed",
              source: "payment_gateway",
              reason: "Payment success callback",
            },
          });
        } else {
          const newStatus =
            dto.paymentStatus === "expired" ? "expired" : "cancelled";

          await tx.booking.update({
            where: { id: booking.id },
            data: { bookingStatus: newStatus as any, holdExpiresAt: null },
          });

          if (isHeldBooking) {
            await tx.tourDeparture.update({
              where: { id: booking.departureId },
              data: {
                heldSlots: { decrement: totalGuests },
              },
            });
          }

          await tx.bookingStatusLog.create({
            data: {
              bookingId: booking.id,
              paymentId: payment.id,
              actionType:
                dto.paymentStatus === "expired" ? "expire" : "payment_failed",
              oldStatus: booking.bookingStatus,
              newStatus: newStatus,
              source:
                dto.paymentStatus === "expired"
                  ? "scheduler"
                  : "payment_gateway",
              reason: "Payment failed/expired callback",
            },
          });
        }

        return {
          success: true,
          bookingId: booking.id.toString(),
          shouldSendEmail: dto.paymentStatus === "paid",
        };
      },
    );

    if (!transactionResult.shouldSendEmail) {
      return transactionResult;
    }

    await this.applyMembershipAfterPaid(Number(transactionResult.bookingId));
    const email = await this.sendBookingConfirmationEmail(
      Number(transactionResult.bookingId),
    );
    return {
      ...transactionResult,
      email,
    };
  }

  async handleSepayWebhook(dto: SepayWebhookDto, authorization?: string) {
    this.verifySepayAuthorization(authorization);

    if (dto.transferType !== "in") {
      return { success: true, ignored: true, reason: "Not incoming transfer" };
    }

    const config = this.getSepayBankConfig();
    if (
      config.accountNo &&
      String(dto.accountNumber) !== String(config.accountNo)
    ) {
      return {
        success: true,
        ignored: true,
        reason: "Account number mismatch",
      };
    }

    const transactionCode = this.findTransactionCodeFromSepay(dto);
    if (!transactionCode) {
      return { success: true, ignored: true, reason: "No payment code found" };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { internalTransactionCode: transactionCode },
      include: { booking: true },
    });

    if (!payment) {
      return { success: true, ignored: true, reason: "Payment not found" };
    }

    if (payment.paymentStatus === "paid") {
      return { success: true, ignored: true, reason: "Already paid" };
    }

    const expectedAmount = Math.round(Number(payment.amount || 0));
    const actualAmount = Math.round(Number(dto.transferAmount || 0));
    if (actualAmount < expectedAmount) {
      return {
        success: true,
        ignored: true,
        reason: "Transfer amount is lower than expected",
      };
    }

    return this.handleCallback({
      internalTransactionCode: transactionCode,
      gatewayTransactionId: dto.referenceCode || `SEPAY-${dto.id}`,
      paymentStatus: "paid",
    });
  }

  async manualConfirm(paymentId: number, changedByUserId?: bigint) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: BigInt(paymentId) },
      include: { booking: true },
    });

    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.paymentStatus !== "waiting_confirmation") {
      throw new BadRequestException("Payment is not waiting confirmation");
    }

    const result = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            paymentStatus: "paid",
            paidAt: new Date(),
          },
        });

        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { bookingStatus: "confirmed", holdExpiresAt: null },
        });

        await this.markVoucherUsedAfterPaid(tx, payment.booking);

        await tx.tourDeparture.update({
          where: { id: payment.booking.departureId },
          data: {
            heldSlots: {
              decrement:
                payment.booking.adultCount + payment.booking.childCount,
            },
            bookedSlots: {
              increment:
                payment.booking.adultCount + payment.booking.childCount,
            },
          },
        });

        await tx.bookingStatusLog.create({
          data: {
            bookingId: payment.bookingId,
            paymentId: payment.id,
            actionType: "manual_confirm",
            oldStatus: payment.booking.bookingStatus,
            newStatus: "confirmed",
            changedByUserId,
            source: "admin",
            reason: "Manual payment confirmation",
          },
        });

        return { success: true, bookingId: payment.bookingId.toString() };
      },
    );

    await this.applyMembershipAfterPaid(Number(result.bookingId));
    const email = await this.sendBookingConfirmationEmail(
      Number(result.bookingId),
    );
    return {
      ...result,
      email,
    };
  }

  private calculateMemberTier(points: number) {
    if (points >= 15000) return "diamond";
    if (points >= 5000) return "gold";
    if (points >= 1000) return "silver";
    return "bronze";
  }

  private async applyMembershipAfterPaid(bookingId: number) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: BigInt(bookingId) },
      include: { user: true },
    });
    if (!booking?.userId || !booking.user) return null;
    const oldTier = booking.user.memberTier || "bronze";
    const earned = Math.max(
      Math.floor(Number(booking.finalAmount || 0) / 10000),
      0,
    );
    const nextPoints = Number(booking.user.memberPoints || 0) + earned;
    const nextTier = this.calculateMemberTier(nextPoints);
    await this.prisma.user.update({
      where: { id: booking.userId },
      data: { memberPoints: nextPoints, memberTier: nextTier as any },
    });
    if (nextTier !== oldTier) {
      const today = new Date();
      const vouchers = await this.prisma.voucher.findMany({
        where: {
          memberTier: nextTier as any,
          status: "active",
          startDate: { lte: today },
          endDate: { gte: today },
        },
        take: 10,
      });
      for (const voucher of vouchers) {
        const quota = Number(voucher.quota || 0);
        const assigned = await this.prisma.userVoucher.count({
          where: { voucherId: voucher.id },
        });
        if (quota > 0 && assigned >= quota) continue;
        await this.prisma.userVoucher
          .upsert({
            where: {
              userId_voucherId: {
                userId: booking.userId,
                voucherId: voucher.id,
              },
            },
            update: {},
            create: {
              userId: booking.userId,
              voucherId: voucher.id,
              status: "available",
            },
          })
          .catch(() => null);
      }
      await this.prisma.notification
        .create({
          data: {
            title: `Bạn đã lên hạng ${nextTier}`,
            message: "Travela đã cập nhật hạng thành viên và voucher phù hợp.",
            content: `Chúc mừng bạn đã lên hạng ${nextTier}. Các voucher phù hợp đã được thêm vào mục Voucher của tôi nếu còn quota.`,
            targetRole: "user",
          },
        })
        .catch(() => null);
    }
    return { earned, nextPoints, nextTier, oldTier };
  }

  private async sendPaymentInstructionEmail(
    bookingId: number,
    internalTransactionCode: string,
  ): Promise<PaymentInstructionEmailResult> {
    const payload = await this.buildBookingEmailPayload(
      bookingId,
      internalTransactionCode,
    );
    if (!payload || !payload.contactEmail) {
      return {
        attempted: false,
        sent: false,
        error: "Không tìm thấy email của khách hàng.",
        internalTransactionCode,
      };
    }

    try {
      await this.emailService.sendMail({
        to: payload.contactEmail,
        subject: `Travela gửi thông tin thanh toán ${payload.bookingCode}`,
        html: this.buildPaymentInstructionTemplate(payload),
        text: this.buildPaymentInstructionText(payload),
      });
      return {
        attempted: true,
        sent: true,
        error: null,
        internalTransactionCode,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Không gửi được email hướng dẫn thanh toán.";
      return {
        attempted: true,
        sent: false,
        error: message,
        internalTransactionCode,
      };
    }
  }

  private async sendBookingConfirmationEmail(bookingId: number) {
    const payload = await this.buildBookingEmailPayload(bookingId);
    if (!payload || !payload.contactEmail) {
      return {
        attempted: false,
        sent: false,
        error: "Không tìm thấy email của khách hàng.",
      };
    }

    try {
      await this.emailService.sendMail({
        to: payload.contactEmail,
        subject: `Travela xác nhận thanh toán thành công ${payload.bookingCode}`,
        html: this.buildBookingConfirmationTemplate(payload),
        text: this.buildBookingConfirmationText(payload),
      });
      return { attempted: true, sent: true, error: null };
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Không gửi được email xác nhận booking.";
      return { attempted: true, sent: false, error: message };
    }
  }

  private async buildBookingEmailPayload(
    bookingId: number,
    internalTransactionCode?: string,
  ): Promise<BookingEmailPayload | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: BigInt(bookingId) },
      include: {
        tour: {
          include: {
            destination: true,
            accommodations: {
              where: { status: "active" },
              orderBy: [{ starRating: "desc" }, { createdAt: "asc" }],
              take: 3,
            },
            transports: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
              take: 3,
            },
          },
        },
        departure: true,
        pickupPoint: true,
        payments: {
          where: internalTransactionCode
            ? { internalTransactionCode }
            : undefined,
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!booking) return null;

    let payment: (typeof booking.payments)[number] | null =
      booking.payments[0] ?? null;
    if (!payment) {
      payment = await this.prisma.payment.findFirst({
        where: { bookingId: booking.id },
        orderBy: { createdAt: "desc" },
      });
    }
    const accommodationSummary = booking.tour.accommodations.length
      ? booking.tour.accommodations
          .map((item: any) => {
            const stars = item.starRating ? ` · ${item.starRating} sao` : "";
            return `${item.name} (${item.accommodationType}${stars})`;
          })
          .join(", ")
      : "Cập nhật theo lịch trình chi tiết";
    const transportSummary = booking.tour.transports.length
      ? booking.tour.transports
          .map(
            (item: any) =>
              `${item.name} (${item.transportType}${item.provider ? ` · ${item.provider}` : ""})`,
          )
          .join(", ")
      : "Cập nhật theo lịch trình chi tiết";

    const paymentUrl = payment?.internalTransactionCode
      ? `${this.getFrontendUrl()}/mobile-payment/${payment.internalTransactionCode}`
      : `${this.getFrontendUrl()}/mytour`;
    const holdExpiresAtLabel = booking.holdExpiresAt
      ? this.formatDateTime(booking.holdExpiresAt)
      : "Theo trạng thái hiện tại của đơn";
    const qrPayload = payment?.internalTransactionCode
      ? this.buildPaymentQrData({
          bookingCode: booking.bookingCode,
          internalTransactionCode: payment.internalTransactionCode,
          amount: Number(booking.finalAmount),
          paymentMethod: payment.paymentMethod,
          holdExpiresAtLabel,
        })
      : null;

    return {
      bookingCode: booking.bookingCode,
      contactName: booking.contactName,
      contactEmail: booking.contactEmail,
      contactPhone: booking.contactPhone,
      bookingStatus: booking.bookingStatus,
      finalAmount: Number(booking.finalAmount),
      adultCount: booking.adultCount,
      childCount: booking.childCount,
      paymentMethod: payment?.paymentMethod || "bank_transfer",
      paidAt: payment?.paidAt || null,
      paidAtLabel: payment?.paidAt
        ? this.formatDateTime(payment.paidAt)
        : "Đã thanh toán thành công",
      departureDateLabel: this.formatDate(booking.departure.departureDate),
      endDateLabel: this.formatDate(booking.departure.endDate),
      holdExpiresAt: booking.holdExpiresAt || null,
      holdExpiresAtLabel,
      internalTransactionCode:
        payment?.internalTransactionCode || internalTransactionCode || null,
      paymentStatusLabel: payment
        ? this.mapPaymentStatusLabel(payment.paymentStatus)
        : "Chưa tạo phiên thanh toán",
      paymentUrl,
      qrImageUrl: qrPayload ? this.buildPaymentQrImageUrl(qrPayload) : null,
      note: booking.note,
      tourName: booking.tour.name,
      destinationName: booking.tour.destination?.name || "",
      hotelStars: booking.tour.hotelStars,
      accommodationSummary,
      transportSummary,
      pickupName: booking.pickupName || booking.pickupPoint?.name || null,
      pickupAddress:
        booking.pickupAddress || booking.pickupPoint?.address || null,
      pickupTimeLabel: booking.pickupTime
        ? this.formatTime(booking.pickupTime)
        : booking.pickupPoint?.pickupTime
          ? this.formatTime(booking.pickupPoint.pickupTime)
          : null,
      pickupNote: booking.pickupNote || booking.pickupPoint?.note || null,
    };
  }

  private mapPaymentStatusLabel(status: string) {
    const labels: Record<string, string> = {
      pending: "Đang chờ thanh toán",
      waiting_confirmation: "Đã gửi giao dịch, chờ xác nhận",
      paid: "Đã thanh toán thành công",
      failed: "Thanh toán thất bại",
      expired: "Phiên thanh toán đã hết hạn",
      refunded: "Đã hoàn tiền",
    };
    return labels[status] || status;
  }

  private getEmailBrandName() {
    return (process.env.EMAIL_BRAND_NAME || "Travela").trim() || "Travela";
  }

  private getEmailLogoUrl() {
    return (process.env.EMAIL_LOGO_URL || "").trim();
  }

  private getEmailSupportAddress() {
    return (process.env.SMTP_USER || "travela.system@gmail.com").trim();
  }

  private escapeHtml(value?: string | number | null) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private buildEmailStatusPalette(statusLabel: string) {
    const normalized = String(statusLabel || "").toLowerCase();
    if (normalized.includes("thành công")) {
      return {
        chipBg: "#dcfce7",
        chipColor: "#166534",
        boxBg: "#f0fdf4",
        boxBorder: "#86efac",
        softBg: "#ecfdf5",
      };
    }
    if (normalized.includes("thất bại") || normalized.includes("hết hạn")) {
      return {
        chipBg: "#fee2e2",
        chipColor: "#991b1b",
        boxBg: "#fef2f2",
        boxBorder: "#fca5a5",
        softBg: "#fff1f2",
      };
    }
    return {
      chipBg: "#dbeafe",
      chipColor: "#1d4ed8",
      boxBg: "#eff6ff",
      boxBorder: "#93c5fd",
      softBg: "#f8fbff",
    };
  }

  private buildPaymentInstructionTemplate(input: BookingEmailPayload) {
    const brandName = this.escapeHtml(this.getEmailBrandName());
    const logoUrl = this.getEmailLogoUrl();
    const supportEmail = this.escapeHtml(this.getEmailSupportAddress());
    const safeNote = input.note
      ? this.escapeHtml(input.note).replace(/\n/g, "<br />")
      : "Không có";
    const methodLabel = this.escapeHtml(
      this.mapPaymentMethodLabel(input.paymentMethod),
    );
    const palette = this.buildEmailStatusPalette(input.paymentStatusLabel);
    const supportNote =
      input.paymentMethod === "bank_transfer"
        ? "Sau khi khách chuyển khoản hoặc quét QR thành công, admin có thể xác nhận để hệ thống gửi tiếp email thanh toán thành công."
        : "Sau khi thanh toán thành công trên popup mô phỏng, hệ thống sẽ gửi tiếp email xác nhận thanh toán hoàn tất.";
    const logoBlock = logoUrl
      ? `<img src="${this.escapeHtml(logoUrl)}" alt="${brandName}" style="display:block;width:52px;height:52px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,0.25);" />`
      : `<div style="width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#ffffff;border:1px solid rgba(255,255,255,0.28);">${brandName.slice(0, 1)}</div>`;
    const qrHtml = input.qrImageUrl
      ? `<img src="${this.escapeHtml(input.qrImageUrl)}" alt="QR thanh toán ${brandName}" style="display:block;width:220px;height:220px;object-fit:contain;margin:0 auto;" />`
      : `<div style="width:220px;height:220px;border-radius:20px;background:#f8fafc;border:1px dashed #cbd5e1;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-size:14px;padding:18px;box-sizing:border-box;">Mã QR sẽ hiển thị ngay khi hệ thống tạo xong phiên thanh toán.</div>`;

    return `
      <div style="margin:0;padding:0;background:#eef4ff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:760px;margin:0 auto;padding:28px 14px;">
          <div style="background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 58%,#38bdf8 100%);border-radius:28px;padding:28px;box-shadow:0 20px 45px rgba(15,23,42,0.18);overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
              <div style="display:flex;gap:14px;align-items:center;">
                ${logoBlock}
                <div>
                  <div style="font-size:28px;font-weight:800;line-height:1.1;color:#ffffff;">${brandName}</div>
                  <div style="margin-top:6px;color:rgba(255,255,255,0.86);font-size:14px;">Phiếu thanh toán điện tử · Booking ${this.escapeHtml(input.bookingCode)}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${palette.chipBg};color:${palette.chipColor};font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">${this.escapeHtml(input.paymentStatusLabel)}</div>
                <div style="margin-top:10px;color:rgba(255,255,255,0.82);font-size:13px;">Giữ chỗ đến: ${this.escapeHtml(input.holdExpiresAtLabel)}</div>
              </div>
            </div>
            <div style="margin-top:24px;display:grid;grid-template-columns:1.2fr 0.8fr;gap:18px;">
              <div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.16);border-radius:24px;padding:22px;">
                <div style="font-size:15px;color:rgba(255,255,255,0.76);margin-bottom:8px;">Xin chào <strong style="color:#ffffff;">${this.escapeHtml(input.contactName)}</strong>,</div>
                <div style="font-size:28px;font-weight:800;line-height:1.2;color:#ffffff;">Thông tin đơn hàng và mã QR thanh toán đã sẵn sàng</div>
                <div style="margin-top:12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.84);">
                  Hệ thống vừa tạo phiên thanh toán cho tour <strong style="color:#ffffff;">${this.escapeHtml(input.tourName)}</strong>.
                  Bạn có thể mở lại đơn hàng hoặc dùng mã QR để quét thanh toán trên thiết bị khác.
                </div>
                <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
                  <a href="${this.escapeHtml(input.paymentUrl || `${this.getFrontendUrl()}/mytour`)}" style="display:inline-block;background:#ffffff;color:#0f172a;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:999px;">Mở lại trang thanh toán</a>
                  <div style="display:inline-block;background:rgba(255,255,255,0.12);color:#ffffff;padding:12px 16px;border-radius:999px;font-size:13px;">Mã giao dịch: <strong>${this.escapeHtml(input.internalTransactionCode || "Đang tạo")}</strong></div>
                </div>
              </div>
              <div style="background:#ffffff;border-radius:24px;padding:18px;text-align:center;">
                <div style="padding:14px;border-radius:20px;background:#f8fafc;border:1px solid #e2e8f0;">
                  ${qrHtml}
                </div>
                <div style="margin-top:12px;font-size:13px;color:#64748b;">Quét mã QR để mở lại thông tin giao dịch hoặc chuyển khoản đúng nội dung.</div>
              </div>
            </div>
          </div>

          <div style="background:#ffffff;border:1px solid #dbe7ff;border-radius:26px;margin-top:18px;padding:22px;box-shadow:0 16px 34px rgba(15,23,42,0.06);">
            <div style="display:grid;grid-template-columns:1.08fr 0.92fr;gap:18px;">
              <div style="background:${palette.softBg};border:1px solid ${palette.boxBorder};border-radius:22px;padding:18px;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Chi tiết đơn hàng</div>
                <div style="margin-top:14px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr><td style="padding:8px 0;color:#64748b;">Tour</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.tourName)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điểm đến</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.destinationName || "Đang cập nhật")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Mã đơn</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.bookingCode)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Mã giao dịch</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.internalTransactionCode || "Đang tạo")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Phương thức</td><td style="padding:8px 0;text-align:right;font-weight:700;">${methodLabel}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Lịch đi</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.departureDateLabel)} → ${this.escapeHtml(input.endDateLabel)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điểm đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupName || "Travela sẽ liên hệ xác nhận")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Địa chỉ đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupAddress || "Đang cập nhật")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Giờ đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupTimeLabel || "Travela sẽ liên hệ")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Số khách</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.adultCount)} người lớn · ${this.escapeHtml(input.childCount)} trẻ em</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Email nhận</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.contactEmail)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điện thoại</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.contactPhone)}</td></tr>
                  </table>
                </div>

                <div style="margin-top:16px;padding:14px 16px;border-radius:18px;background:#0f172a;color:#ffffff;">
                  <div style="font-size:12px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Tổng thanh toán</div>
                  <div style="margin-top:6px;font-size:30px;font-weight:800;">${this.escapeHtml(this.formatCurrency(input.finalAmount))}</div>
                </div>

                <div style="margin-top:16px;padding:14px 16px;border-radius:18px;background:#fff;border:1px dashed #cbd5e1;">
                  <div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:6px;">Ghi chú của khách</div>
                  <div style="font-size:14px;color:#475569;">${safeNote}</div>
                </div>
              </div>

              <div>
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Hướng dẫn thanh toán</div>
                  <div style="margin-top:12px;display:grid;gap:10px;">
                    <div style="padding:12px 14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Bước 1:</strong> Mở lại trang thanh toán hoặc quét QR ở trên.</div>
                    <div style="padding:12px 14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Bước 2:</strong> Thanh toán đúng số tiền <strong>${this.escapeHtml(this.formatCurrency(input.finalAmount))}</strong>.</div>
                    <div style="padding:12px 14px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;"><strong>Bước 3:</strong> Giữ nguyên mã giao dịch <strong>${this.escapeHtml(input.internalTransactionCode || "Đang tạo")}</strong> để đối soát.</div>
                  </div>
                </div>

                <div style="margin-top:16px;background:${palette.boxBg};border:1px solid ${palette.boxBorder};border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Trạng thái hiện tại</div>
                  <div style="margin-top:10px;display:inline-block;padding:8px 12px;border-radius:999px;background:${palette.chipBg};color:${palette.chipColor};font-size:12px;font-weight:800;">${this.escapeHtml(input.paymentStatusLabel)}</div>
                  <div style="margin-top:12px;font-size:14px;line-height:1.7;color:#334155;">${this.escapeHtml(supportNote)}</div>
                </div>

                <div style="margin-top:16px;background:#fff7ed;border:1px solid #fdba74;border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9a3412;">Lưu ý</div>
                  <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#7c2d12;">
                    Phiếu này giữ vai trò chứng từ điện tử tạm thời trước khi hệ thống xác nhận thanh toán thành công.
                    Nếu bạn đã thanh toán mà đơn chưa cập nhật, vui lòng liên hệ <strong>${supportEmail}</strong> để được hỗ trợ đối soát.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildPaymentInstructionText(input: BookingEmailPayload) {
    return [
      `Travela gửi thông tin thanh toán cho booking ${input.bookingCode}`,
      `Khách hàng: ${input.contactName}`,
      `Tour: ${input.tourName}`,
      `Điểm đến: ${input.destinationName || "Đang cập nhật"}`,
      `Mã giao dịch: ${input.internalTransactionCode || "Đang tạo"}`,
      `Phương thức: ${this.mapPaymentMethodLabel(input.paymentMethod)}`,
      `Trạng thái: ${input.paymentStatusLabel}`,
      `Tổng thanh toán: ${this.formatCurrency(input.finalAmount)}`,
      `Khởi hành: ${input.departureDateLabel} -> ${input.endDateLabel}`,
      `Điểm đón: ${input.pickupName || "Travela sẽ liên hệ xác nhận"}`,
      `Địa chỉ đón: ${input.pickupAddress || "Đang cập nhật"}`,
      `Giờ đón: ${input.pickupTimeLabel || "Travela sẽ liên hệ"}`,
      `Giữ chỗ đến: ${input.holdExpiresAtLabel}`,
      `Trang thanh toán: ${input.paymentUrl || `${this.getFrontendUrl()}/mytour`}`,
    ].join("\n");
  }

  private buildBookingConfirmationTemplate(input: BookingEmailPayload) {
    const brandName = this.escapeHtml(this.getEmailBrandName());
    const logoUrl = this.getEmailLogoUrl();
    const supportEmail = this.escapeHtml(this.getEmailSupportAddress());
    const safeNote = input.note
      ? this.escapeHtml(input.note).replace(/\n/g, "<br />")
      : "Không có";
    const hotelLabel = input.hotelStars
      ? `${input.hotelStars} sao`
      : "Theo chương trình";
    const palette = this.buildEmailStatusPalette("Đã thanh toán thành công");
    const logoBlock = logoUrl
      ? `<img src="${this.escapeHtml(logoUrl)}" alt="${brandName}" style="display:block;width:52px;height:52px;border-radius:16px;object-fit:cover;border:1px solid rgba(255,255,255,0.25);" />`
      : `<div style="width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#ffffff;border:1px solid rgba(255,255,255,0.28);">${brandName.slice(0, 1)}</div>`;

    return `
      <div style="margin:0;padding:0;background:#f4fbf6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
        <div style="max-width:760px;margin:0 auto;padding:28px 14px;">
          <div style="background:linear-gradient(135deg,#14532d 0%,#16a34a 58%,#4ade80 100%);border-radius:28px;padding:28px;box-shadow:0 20px 45px rgba(22,101,52,0.18);overflow:hidden;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;">
              <div style="display:flex;gap:14px;align-items:center;">
                ${logoBlock}
                <div>
                  <div style="font-size:28px;font-weight:800;line-height:1.1;color:#ffffff;">${brandName}</div>
                  <div style="margin-top:6px;color:rgba(255,255,255,0.86);font-size:14px;">Vé / phiếu xác nhận dịch vụ · ${this.escapeHtml(input.bookingCode)}</div>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${palette.chipBg};color:${palette.chipColor};font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">Đã thanh toán thành công</div>
                <div style="margin-top:10px;color:rgba(255,255,255,0.82);font-size:13px;">Xác nhận lúc: ${this.escapeHtml(input.paidAtLabel)}</div>
              </div>
            </div>

            <div style="margin-top:24px;display:grid;grid-template-columns:1.1fr 0.9fr;gap:18px;">
              <div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.16);border-radius:24px;padding:22px;">
                <div style="font-size:15px;color:rgba(255,255,255,0.76);margin-bottom:8px;">Xin chào <strong style="color:#ffffff;">${this.escapeHtml(input.contactName)}</strong>,</div>
                <div style="font-size:28px;font-weight:800;line-height:1.2;color:#ffffff;">Travela đã xác nhận thanh toán thành công cho chuyến đi của bạn</div>
                <div style="margin-top:12px;font-size:15px;line-height:1.7;color:rgba(255,255,255,0.84);">
                  Booking <strong style="color:#ffffff;">${this.escapeHtml(input.bookingCode)}</strong> đã được chốt thành công.
                  Bạn có thể dùng email này như phiếu xác nhận điện tử khi cần tra cứu, hỗ trợ hoặc đối chiếu trước ngày khởi hành.
                </div>
                <div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;">
                  <div style="display:inline-block;background:#ffffff;color:#14532d;padding:12px 16px;border-radius:999px;font-weight:800;">Mã đơn: ${this.escapeHtml(input.bookingCode)}</div>
                  <div style="display:inline-block;background:rgba(255,255,255,0.12);color:#ffffff;padding:12px 16px;border-radius:999px;font-size:13px;">Phương thức: <strong>${this.escapeHtml(this.mapPaymentMethodLabel(input.paymentMethod))}</strong></div>
                </div>
              </div>

              <div style="background:#ffffff;border-radius:24px;padding:18px;">
                <div style="border:2px dashed #86efac;border-radius:22px;padding:18px;background:#f0fdf4;">
                  <div style="font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#166534;">Phiếu xác nhận dịch vụ</div>
                  <div style="margin-top:12px;font-size:24px;font-weight:800;color:#14532d;">${this.escapeHtml(input.tourName)}</div>
                  <div style="margin-top:10px;font-size:14px;color:#166534;">${this.escapeHtml(input.destinationName || "Đang cập nhật")}</div>
                  <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:14px;">
                    <div><div style="color:#64748b;">Khởi hành</div><div style="font-weight:700;color:#0f172a;">${this.escapeHtml(input.departureDateLabel)}</div></div>
                    <div><div style="color:#64748b;">Kết thúc</div><div style="font-weight:700;color:#0f172a;">${this.escapeHtml(input.endDateLabel)}</div></div>
                    <div><div style="color:#64748b;">Khách</div><div style="font-weight:700;color:#0f172a;">${this.escapeHtml(input.adultCount)} NL · ${this.escapeHtml(input.childCount)} TE</div></div>
                    <div><div style="color:#64748b;">Tổng tiền</div><div style="font-weight:700;color:#0f172a;">${this.escapeHtml(this.formatCurrency(input.finalAmount))}</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style="background:#ffffff;border:1px solid #dcfce7;border-radius:26px;margin-top:18px;padding:22px;box-shadow:0 16px 34px rgba(22,101,52,0.06);">
            <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:18px;">
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:22px;padding:18px;">
                <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Chi tiết chuyến đi</div>
                <div style="margin-top:14px;">
                  <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr><td style="padding:8px 0;color:#64748b;">Tour</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.tourName)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điểm đến</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.destinationName || "Đang cập nhật")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Lịch đi</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.departureDateLabel)} → ${this.escapeHtml(input.endDateLabel)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điểm đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupName || "Travela sẽ liên hệ xác nhận")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Địa chỉ đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupAddress || "Đang cập nhật")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Giờ đón</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.pickupTimeLabel || "Travela sẽ liên hệ")}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Phương thức thanh toán</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(this.mapPaymentMethodLabel(input.paymentMethod))}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Khách sạn</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(hotelLabel)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Chỗ ở gợi ý</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.accommodationSummary)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Phương tiện</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.transportSummary)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Email nhận</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.contactEmail)}</td></tr>
                    <tr><td style="padding:8px 0;color:#64748b;">Điện thoại</td><td style="padding:8px 0;text-align:right;font-weight:700;">${this.escapeHtml(input.contactPhone)}</td></tr>
                  </table>
                </div>

                <div style="margin-top:16px;padding:14px 16px;border-radius:18px;background:#0f172a;color:#ffffff;">
                  <div style="font-size:12px;opacity:.75;text-transform:uppercase;letter-spacing:.05em;">Tổng thanh toán đã xác nhận</div>
                  <div style="margin-top:6px;font-size:30px;font-weight:800;">${this.escapeHtml(this.formatCurrency(input.finalAmount))}</div>
                </div>
              </div>

              <div>
                <div style="background:${palette.boxBg};border:1px solid ${palette.boxBorder};border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Trạng thái đơn</div>
                  <div style="margin-top:10px;display:inline-block;padding:8px 12px;border-radius:999px;background:${palette.chipBg};color:${palette.chipColor};font-size:12px;font-weight:800;">Đã thanh toán thành công</div>
                  <div style="margin-top:12px;font-size:14px;line-height:1.7;color:#334155;">
                    Đây là email xác nhận chính thức từ hệ thống. Bạn chỉ cần giữ lại email này hoặc ảnh chụp màn hình khi cần hỗ trợ trước ngày khởi hành.
                  </div>
                </div>

                <div style="margin-top:16px;background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#475569;">Ghi chú booking</div>
                  <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#334155;">${safeNote}</div>
                </div>

                <div style="margin-top:16px;background:#fff7ed;border:1px solid #fdba74;border-radius:22px;padding:18px;">
                  <div style="font-size:13px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#9a3412;">Cần hỗ trợ?</div>
                  <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#7c2d12;">
                    Nếu cần đổi thông tin khách, bổ sung ghi chú hoặc kiểm tra lại dịch vụ, bạn có thể phản hồi email này hoặc liên hệ <strong>${supportEmail}</strong>.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private buildBookingConfirmationText(input: BookingEmailPayload) {
    return [
      `Travela xác nhận booking ${input.bookingCode}`,
      `Khách hàng: ${input.contactName}`,
      `Tour: ${input.tourName}`,
      `Điểm đến: ${input.destinationName || "Đang cập nhật"}`,
      `Khởi hành: ${input.departureDateLabel} -> ${input.endDateLabel}`,
      `Điểm đón: ${input.pickupName || "Travela sẽ liên hệ xác nhận"}`,
      `Địa chỉ đón: ${input.pickupAddress || "Đang cập nhật"}`,
      `Giờ đón: ${input.pickupTimeLabel || "Travela sẽ liên hệ"}`,
      `Số khách: ${input.adultCount} người lớn, ${input.childCount} trẻ em`,
      `Phương thức thanh toán: ${this.mapPaymentMethodLabel(input.paymentMethod)}`,
      `Tổng tiền: ${this.formatCurrency(input.finalAmount)}`,
      `Chỗ ở: ${input.accommodationSummary}`,
      `Phương tiện: ${input.transportSummary}`,
      `Ghi chú: ${input.note || "Không có"}`,
      `Xác nhận lúc: ${input.paidAtLabel}`,
    ].join("\n");
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  }

  private formatTime(value: Date) {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  private formatDateTime(value: Date) {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(value || 0);
  }
}
