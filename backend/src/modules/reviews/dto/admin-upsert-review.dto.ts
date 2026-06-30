import { IsOptional, IsString } from "class-validator";

export class AdminUpsertReviewDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  adminReply?: string;
}
