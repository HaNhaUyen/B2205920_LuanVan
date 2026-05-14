import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertDestinationDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsString()
  @MaxLength(100)
  province!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @IsOptional()
  @IsString()
  @IsIn(["active", "inactive"])
  status?: string;
}
