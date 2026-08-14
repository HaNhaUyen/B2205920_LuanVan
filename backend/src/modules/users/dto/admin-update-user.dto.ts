import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString({ message: "Họ tên phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Họ tên không được để trống." })
  @MinLength(2, { message: "Họ tên phải có ít nhất 2 ký tự." })
  @MaxLength(150, { message: "Họ tên tối đa 150 ký tự." })
  fullName?: string;

  @IsOptional()
  @IsNotEmpty({ message: "Email không được để trống." })
  @IsEmail({}, { message: "Email không đúng định dạng." })
  @MaxLength(190, { message: "Email tối đa 190 ký tự." })
  email?: string;

  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    return String(value).trim();
  })
  @IsOptional()
  @IsString({ message: "Số điện thoại phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Số điện thoại không được để trống." })
  @Matches(/^0\d{9}$/, {
    message: "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
  })
  phone?: string;

  @IsOptional()
  @IsIn(["active", "inactive", "blocked"], {
    message: "Trạng thái người dùng không hợp lệ.",
  })
  status?: "active" | "inactive" | "blocked";

  @IsOptional()
  @IsString({ message: "Mật khẩu mới phải là chuỗi ký tự." })
  @MinLength(6, { message: "Mật khẩu mới phải có ít nhất 6 ký tự." })
  @MaxLength(72, { message: "Mật khẩu mới tối đa 72 ký tự." })
  newPassword?: string;

  @IsOptional()
  @IsString({ message: "Đường dẫn ảnh đại diện phải là chuỗi ký tự." })
  @MaxLength(1000, { message: "Đường dẫn ảnh đại diện tối đa 1000 ký tự." })
  avatarUrl?: string;
}
