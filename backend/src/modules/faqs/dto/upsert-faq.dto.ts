import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpsertFaqDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(5000)
  answer!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string;

  @IsOptional()
  @IsString()
  @IsIn(["active", "inactive"])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
