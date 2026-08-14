import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
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
  @Min(1)
  id?: number;

  @IsString()
  @IsDateString()
  departureDate!: string;

  @IsString()
  @IsDateString()
  endDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  adultPrice!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  childPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalSlots!: number;

  @IsOptional()
  @IsString()
  @IsIn(["open", "full", "closed", "departed", "completed", "cancelled"])
  status?: "open" | "full" | "closed" | "departed" | "completed" | "cancelled";
}

export class SaveDeparturesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DepartureItemDto)
  items!: DepartureItemDto[];
}
