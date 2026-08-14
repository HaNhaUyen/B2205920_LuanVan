import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ForgotPasswordDto {
  @IsString({ message: "Email phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập email." })
  @IsEmail({}, { message: "Vui lòng nhập địa chỉ email hợp lệ." })
  @MaxLength(150, { message: "Email không được vượt quá 150 ký tự." })
  email!: string;
}
