import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class PickupPointItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  departureId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsString()
  @MaxLength(255)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pickupTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;

  @IsOptional()
  @IsIn(["active", "inactive"])
  status?: string;
}

export class SavePickupPointsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickupPointItemDto)
  items!: PickupPointItemDto[];
}
