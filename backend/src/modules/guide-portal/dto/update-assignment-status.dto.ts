import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateAssignmentStatusDto {
  @IsIn(["assigned", "accepted", "in_progress", "completed", "issue"])
  status!: "assigned" | "accepted" | "in_progress" | "completed" | "issue";

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
