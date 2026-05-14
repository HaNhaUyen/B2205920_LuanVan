import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminUpsertReviewDto {
  @IsOptional()
  @IsInt()
  tourId?: number;

  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsInt()
  bookingId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  adminReply?: string;

  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'hidden'])
  status?: 'pending' | 'approved' | 'rejected' | 'hidden';
}
