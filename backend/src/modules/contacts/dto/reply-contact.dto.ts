import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ReplyContactDto {
  @IsString()
  replyMessage!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @IsOptional()
  @IsString()
  contactId?: string;
}
