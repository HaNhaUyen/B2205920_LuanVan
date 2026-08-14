import { Type } from "class-transformer";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateRefundDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookingId!: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;
}
