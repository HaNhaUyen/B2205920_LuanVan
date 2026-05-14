import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ItineraryItemDto {
  @IsInt()
  @Min(1)
  dayNumber!: number;

  @IsInt()
  @Min(1)
  itemOrder!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  locationName?: string;
}

export class SaveItineraryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItineraryItemDto)
  items!: ItineraryItemDto[];
}
