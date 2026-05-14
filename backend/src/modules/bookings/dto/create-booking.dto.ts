import { IsEmail, IsInt, IsOptional, IsString, Min } from "class-validator";

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
}
