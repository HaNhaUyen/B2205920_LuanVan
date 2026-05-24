import { IsNumber, IsOptional, IsString } from "class-validator";

export class SepayWebhookDto {
  @IsNumber()
  id!: number;

  @IsString()
  gateway!: string;

  @IsString()
  transactionDate!: string;

  @IsString()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  subAccount?: string;

  @IsOptional()
  @IsString()
  code?: string | null;

  @IsString()
  content!: string;

  @IsString()
  transferType!: "in" | "out";

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  transferAmount!: number;

  @IsOptional()
  @IsNumber()
  accumulated?: number;

  @IsOptional()
  @IsString()
  referenceCode?: string;
}
