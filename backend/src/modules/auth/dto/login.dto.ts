import { IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  // Cho phép nhập email hoặc tên hiển thị. Frontend vẫn gửi field này là identifier.
  @IsOptional()
  @IsString()
  identifier?: string;

  // Tương thích dữ liệu cũ: nếu frontend cũ gửi email thì service vẫn đọc được.
  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
