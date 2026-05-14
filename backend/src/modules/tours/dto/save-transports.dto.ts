import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class TransportItemDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsString()
  @MaxLength(50)
  transportType!: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  origin?: string;

  @IsOptional()
  @IsString()
  destinationLabel?: string;

  @IsOptional()
  durationHours?: number;

  @IsOptional()
  price?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SaveTransportsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransportItemDto)
  items!: TransportItemDto[];
}
