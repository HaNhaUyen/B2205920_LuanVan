import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'blocked'])
  status?: 'active' | 'inactive' | 'blocked';

  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
