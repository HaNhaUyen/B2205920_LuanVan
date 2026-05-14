import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
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
}
