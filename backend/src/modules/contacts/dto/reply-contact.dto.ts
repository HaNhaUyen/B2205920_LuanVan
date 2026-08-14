import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class ReplyContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(3000)
  replyMessage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @IsIn(["new", "pending", "replied", "closed"])
  status?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactId?: string;
}
