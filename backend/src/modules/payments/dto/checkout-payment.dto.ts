import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CheckoutPaymentGuestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsString()
  @IsIn(["male", "female", "other"])
  gender!: string;

  @IsIn(["adult", "child"])
  guestType!: "adult" | "child";

  @IsString()
  @MaxLength(50)
  idNumber!: string;
}

export class CheckoutPaymentDto {
  @IsInt()
  @Min(1)
  departureId!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pickupPointId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  voucherCode?: string;

  @IsInt()
  @Min(1)
  adultCount!: number;

  @IsInt()
  @Min(0)
  childCount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  contactName!: string;

  @IsEmail()
  @MaxLength(190)
  contactEmail!: string;

  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: "Số điện thoại không hợp lệ.",
  })
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
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
