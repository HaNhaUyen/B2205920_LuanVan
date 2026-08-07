import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CheckoutPaymentGuestDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsString()
  dateOfBirth!: string;

  @IsString()
  @MaxLength(20)
  gender!: string;

  @IsIn(["adult", "child"])
  guestType!: "adult" | "child";

  @IsString()
  @MaxLength(50)
  idNumber!: string;
}

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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentGuestDto)
  guests!: CheckoutPaymentGuestDto[];

  @IsOptional()
  @IsIn(["bank_transfer"])
  paymentMethod?: "bank_transfer" = "bank_transfer";
}
