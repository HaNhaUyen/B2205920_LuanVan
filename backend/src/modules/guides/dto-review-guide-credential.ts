import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewGuideCredentialDto {
  @IsIn(["approved", "rejected"])
  status!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}
