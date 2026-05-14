import { IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

export class AdminUpsertContactDto {
  @IsOptional()
  @IsInt()
  userId?: number;

  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  subject!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  handledBy?: number;

  @IsOptional()
  @IsString()
  adminReply?: string;
}
