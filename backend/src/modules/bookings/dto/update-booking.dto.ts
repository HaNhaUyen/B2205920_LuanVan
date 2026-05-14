import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateBookingDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
