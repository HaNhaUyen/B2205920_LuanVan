import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";

export const DEPARTURE_CANCEL_REASON_TYPES = [
  "weather",
  "natural_disaster",
  "transport",
  "supplier",
  "operational",
  "insufficient_guests",
  "other",
] as const;

export class CancelDepartureDto {
  @IsString()
  @IsIn(DEPARTURE_CANCEL_REASON_TYPES)
  reasonType!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  customerMessage!: string;
}
