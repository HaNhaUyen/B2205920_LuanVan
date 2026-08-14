import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class AdminUpsertReviewDto {
  @IsOptional()
  @IsString()
  @IsIn(["pending", "approved", "hidden", "rejected"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminReply?: string;
}
