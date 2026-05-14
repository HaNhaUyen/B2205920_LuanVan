import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(150) fullName?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) identityNumber?: string;
  @IsOptional() @IsString() birthDate?: string;
}
