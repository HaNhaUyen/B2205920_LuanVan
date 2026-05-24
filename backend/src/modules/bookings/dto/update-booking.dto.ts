import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

export class UpdateBookingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pickupPointId?: number;
}
