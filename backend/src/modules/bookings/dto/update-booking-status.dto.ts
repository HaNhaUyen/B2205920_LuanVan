import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateBookingStatusDto {
  @IsString()
  @IsIn([
    "draft",
    "pending_payment",
    "waiting_confirmation",
    "confirmed",
    "cancelled",
    "expired",
    "completed",
  ])
  bookingStatus!:
    | "draft"
    | "pending_payment"
    | "waiting_confirmation"
    | "confirmed"
    | "cancelled"
    | "expired"
    | "completed";

  @IsOptional()
  @IsString()
  reason?: string;
}
