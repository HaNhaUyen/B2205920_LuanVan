import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateGuideProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  languages?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
