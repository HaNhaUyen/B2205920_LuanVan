import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertFaqDto {
  @IsString()
  question!: string;

  @IsString()
  answer!: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
