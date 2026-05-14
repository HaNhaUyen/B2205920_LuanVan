import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DepartureItemDto {
  @IsString()
  departureDate!: string;

  @IsString()
  endDate!: string;

  @IsNumber()
  adultPrice!: number;

  @IsNumber()
  childPrice!: number;

  @IsInt()
  @Min(1)
  totalSlots!: number;

  @IsOptional()
  @IsString()
  status?: 'open' | 'full' | 'closed' | 'departed' | 'completed' | 'cancelled';
}

export class SaveDeparturesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DepartureItemDto)
  items!: DepartureItemDto[];
}
