import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class AccommodationItemDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @MaxLength(50)
  accommodationType!: string;

  @IsOptional()
  @IsInt()
  starRating?: number;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  pricePerNight?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  amenities?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SaveAccommodationsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccommodationItemDto)
  items!: AccommodationItemDto[];
}
