import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(["all", "admin", "user", "guide"])
  targetRole?: "all" | "admin" | "user" | "guide";

  @IsOptional()
  @IsInt()
  @Min(1)
  targetUserId?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
