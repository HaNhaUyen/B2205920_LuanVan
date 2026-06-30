import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ReviewRefundDto {
  @IsIn(["approved", "rejected"], {
    message: "Trạng thái xử lý hoàn tiền không hợp lệ.",
  })
  status!: "approved" | "rejected";

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "Ghi chú tối đa 1000 ký tự." })
  adminNote?: string;
}
