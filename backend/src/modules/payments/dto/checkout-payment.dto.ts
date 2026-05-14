import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CheckoutPaymentDto {
  @IsInt()
  departureId!: number;

  @IsOptional()
  @IsInt()
  pickupPointId?: number;

  @IsOptional()
  @IsString()
  voucherCode?: string;

  @IsInt()
  @Min(1)
  adultCount!: number;

  @IsInt()
  @Min(0)
  childCount!: number;

  @IsString()
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  contactPhone!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsEnum(["momo", "vnpay", "card", "bank_transfer", "cash"])
  paymentMethod!: "momo" | "vnpay" | "card" | "bank_transfer" | "cash";
}
