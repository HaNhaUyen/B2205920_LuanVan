import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  // Cho phép nhập email hoặc tên hiển thị. Frontend vẫn gửi field này là identifier.
  @IsOptional()
  @IsString()
  @MaxLength(190)
  identifier?: string;

  // Tương thích dữ liệu cũ: nếu frontend cũ gửi email thì service vẫn đọc được.
  @IsOptional()
  @IsString()
  @MaxLength(190)
  email?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
