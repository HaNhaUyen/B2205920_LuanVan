import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpsertNotificationDto {
  @IsString()
  @MaxLength(220)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(["all", "admin", "user"])
  targetRole?: "all" | "admin" | "user";

  @IsOptional()
  @IsInt()
  targetUserId?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
