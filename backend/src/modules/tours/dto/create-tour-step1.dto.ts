import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateTourStep1Dto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsNumber()
  destinationId!: number;

  @IsString()
  tourType!: 'group' | 'private';

  @IsString()
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
  basePriceAdult!: number;

  @IsNumber()
  basePriceChild!: number;

  @IsInt()
  @Min(1)
  maxCapacityDefault!: number;

  @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  fullDescription?: string;

  @IsOptional()
  @IsBoolean()
  isTrending?: boolean;

  @IsOptional()
  @IsBoolean()
  isBestDeal?: boolean;
}
