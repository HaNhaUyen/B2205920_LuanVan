import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentCallbackDto } from "./dto/payment-callback.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OptionalJwtAuthGuard } from "../../common/guards/optional-jwt-auth.guard";
import { CheckoutPaymentDto } from "./dto/checkout-payment.dto";

type PaymentMethod = "momo" | "vnpay" | "card" | "bank_transfer" | "cash";

type CheckoutOrBookingBody = Partial<CheckoutPaymentDto> & {
  bookingId?: string | number;
  booking_id?: string | number;
  paymentMethod?: PaymentMethod;
  payment_method?: PaymentMethod;
};

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post("checkout")
  checkout(
    @Body() dto: CheckoutOrBookingBody,
    @CurrentUser()
    user?: { userId: bigint; email: string; role: "admin" | "user" },
  ) {
    const bookingId = dto.bookingId ?? dto.booking_id;
    const paymentMethod = dto.paymentMethod ?? dto.payment_method ?? "momo";

    if (bookingId !== undefined && bookingId !== null && bookingId !== "") {
      return this.paymentsService.initiatePayment(
        Number(bookingId),
        paymentMethod,
        user,
      );
    }

    return this.paymentsService.checkout(
      {
        ...dto,
        paymentMethod,
      } as CheckoutPaymentDto,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post("initiate/:bookingId")
  initiate(
    @Param("bookingId") bookingId: string,
    @Body("paymentMethod")
    paymentMethod: PaymentMethod = "momo",
    @CurrentUser()
    user?: { userId: bigint; email: string; role: "admin" | "user" },
  ) {
    return this.paymentsService.initiatePayment(
      Number(bookingId),
      paymentMethod,
      user,
    );
  }

  @Get("status/:transactionCode")
  status(@Param("transactionCode") transactionCode: string) {
    return this.paymentsService.getStatus(transactionCode);
  }

  @Post("confirm-scan/:transactionCode")
  confirmScan(@Param("transactionCode") transactionCode: string) {
    return this.paymentsService.confirmScan(transactionCode);
  }

  @Post("callback")
  callback(@Body() dto: PaymentCallbackDto) {
    return this.paymentsService.handleCallback(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("manual-confirm/:paymentId")
  manualConfirm(
    @Param("paymentId") paymentId: string,
    @CurrentUser() user: { userId: bigint },
  ) {
    return this.paymentsService.manualConfirm(Number(paymentId), user.userId);
  }
}
