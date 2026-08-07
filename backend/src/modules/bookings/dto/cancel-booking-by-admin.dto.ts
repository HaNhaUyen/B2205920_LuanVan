import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { DEPARTURE_CANCEL_REASON_TYPES } from "./cancel-departure.dto";

export class CancelBookingByAdminDto {
  @IsString()
  @IsIn(DEPARTURE_CANCEL_REASON_TYPES)
  reasonType!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  customerMessage!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  refundRate?: number;
}
