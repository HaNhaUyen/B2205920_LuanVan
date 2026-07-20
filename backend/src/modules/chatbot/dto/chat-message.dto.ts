import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class ChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  conversationId?: string;

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsObject()
  memory?: Record<string, any>;

  @IsOptional()
  @IsString()
  @IsIn(["user", "guide", "admin"])
  scope?: "user" | "guide" | "admin";
}
