import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, Min } from "class-validator";

export class CreateRefundDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookingId!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
