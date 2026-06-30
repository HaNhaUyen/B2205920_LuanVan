import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";

export class CreateRefundDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookingId!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  refundBankName?: string;

  @IsOptional()
  @IsString()
  refundAccountNo?: string;

  @IsOptional()
  @IsString()
  refundAccountName?: string;

  @IsOptional()
  @IsString()
  refundQrUrl?: string;
}
