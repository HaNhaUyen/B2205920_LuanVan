import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class ResetPasswordDto {
  @IsString({ message: "Email phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập email." })
  @IsEmail({}, { message: "Vui lòng nhập địa chỉ email hợp lệ." })
  @MaxLength(150, { message: "Email không được vượt quá 150 ký tự." })
  email!: string;

  @IsString({ message: "Mã xác nhận phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập mã xác nhận." })
  @Length(6, 6, { message: "Mã xác nhận phải gồm đúng 6 chữ số." })
  @Matches(/^\d{6}$/, { message: "Mã xác nhận chỉ được gồm 6 chữ số." })
  otp!: string;

  @IsString({ message: "Mật khẩu mới phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập mật khẩu mới." })
  @MinLength(6, { message: "Mật khẩu mới phải có ít nhất 6 ký tự." })
  @MaxLength(72, { message: "Mật khẩu mới không được vượt quá 72 ký tự." })
  newPassword!: string;

  @IsString({ message: "Mật khẩu xác nhận phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập lại mật khẩu mới." })
  @MinLength(6, { message: "Mật khẩu xác nhận phải có ít nhất 6 ký tự." })
  @MaxLength(72, { message: "Mật khẩu xác nhận không được vượt quá 72 ký tự." })
  confirmPassword!: string;
}
