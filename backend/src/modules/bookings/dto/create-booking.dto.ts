import { Type } from "class-transformer";
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

export class CreateBookingGuestDto {
  @IsString()
  @MaxLength(150)
  fullName!: string;

  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsIn(["adult", "child"])
  guestType!: "adult" | "child";

  @IsOptional()
  @IsString()
  @MaxLength(50)
  idNumber?: string;
}

export class CreateBookingDto {
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
  @Type(() => CreateBookingGuestDto)
  guests!: CreateBookingGuestDto[];
}
