import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateGuideUnavailableDto {
  @IsIn(["unavailable", "leave", "training", "personal"])
  availabilityType!: "unavailable" | "leave" | "training" | "personal";

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
