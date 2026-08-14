import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class TransportItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  supplierId?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name!: string;

  @IsString()
  @IsIn([
    "bus",
    "car",
    "van",
    "plane",
    "train",
    "ship",
    "boat",
    "motorbike",
    "other",
  ])
  transportType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  origin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  destinationLabel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(["active", "inactive"])
  status?: string;
}

export class SaveTransportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransportItemDto)
  items!: TransportItemDto[];
}
