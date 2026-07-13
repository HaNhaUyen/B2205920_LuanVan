import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const ASSIGNMENT_STATUS_VALUES = [
  "assigned",
  "accepted",
  "in_progress",
  "completed",
  "issue",
] as const;

export type AssignmentStatusValue = (typeof ASSIGNMENT_STATUS_VALUES)[number];

export class UpdateAssignmentStatusDto {
  @IsString()
  @IsIn(ASSIGNMENT_STATUS_VALUES)
  status!: AssignmentStatusValue;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
