import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateTourStep1Dto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  slug?: string;

  @IsNumber()
  @IsInt()
  @Min(1)
  destinationId!: number;

  @IsString()
  @IsIn(["group", "private"])
  tourType!: "group" | "private";

  @IsString()
  @IsNotEmpty()
  @IsIn([
    "beach",
    "mountain",
    "city",
    "culture",
    "adventure",
    "eco",
    "family",
    "luxury",
    "other",
  ])
  tourTheme!: string;

  @IsInt()
  @Min(1)
  durationDays!: number;

  @IsInt()
  @Min(0)
  durationNights!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  hotelStars?: number;

  @IsNumber()
  @Min(0)
  basePriceAdult!: number;

  @IsNumber()
  @Min(0)
  basePriceChild!: number;

  @IsInt()
  @Min(1)
  maxCapacityDefault!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  fullDescription?: string;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsOptional()
  @IsBoolean()
  isBestDeal?: boolean;
}
