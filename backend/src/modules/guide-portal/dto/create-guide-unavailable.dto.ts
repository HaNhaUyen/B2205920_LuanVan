import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateGuideUnavailableDto {
  @IsIn(["unavailable", "leave", "training", "personal"])
  availabilityType!: "unavailable" | "leave" | "training" | "personal";

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
