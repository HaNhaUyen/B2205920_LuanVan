import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(72)
  currentPassword?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  newPassword!: string;
}
