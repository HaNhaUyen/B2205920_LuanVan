import { Type } from "class-transformer";
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

export class CreateBookingGuestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @IsIn(["male", "female", "other"])
  gender?: string;

  @IsIn(["adult", "child"])
  guestType!: "adult" | "child";

  @IsOptional()
  @IsString()
  @IsIn(["id_card", "passport", "birth_certificate"])
  idType?: "id_card" | "passport" | "birth_certificate";

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;
}

export class CreateBookingDto {
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
  @Type(() => CreateBookingGuestDto)
  guests!: CreateBookingGuestDto[];
}
