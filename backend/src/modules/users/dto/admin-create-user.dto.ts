import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminCreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'blocked'])
  status?: 'active' | 'inactive' | 'blocked';

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
