import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class DepartureItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id?: number;

  @IsString()
  departureDate!: string;

  @IsString()
  endDate!: string;

  @Type(() => Number)
  @IsNumber()
  adultPrice!: number;

  @Type(() => Number)
  @IsNumber()
  childPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalSlots!: number;

  @IsOptional()
  @IsString()
  status?: "open" | "full" | "closed" | "departed" | "completed" | "cancelled";
}

export class SaveDeparturesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DepartureItemDto)
  items!: DepartureItemDto[];
}
