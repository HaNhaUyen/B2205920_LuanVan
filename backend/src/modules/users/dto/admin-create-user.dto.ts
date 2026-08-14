import { IsNotEmpty, IsOptional, IsString, IsIn } from "class-validator";

export class AdminCreateUserDto {
  @IsString({ message: "Họ tên phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập họ tên." })
  fullName!: string;

  @IsString({ message: "Email phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập email." })
  email!: string;

  @IsString({ message: "Số điện thoại phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập số điện thoại." })
  phone!: string;

  @IsString({ message: "Mật khẩu phải là chuỗi ký tự." })
  @IsNotEmpty({ message: "Vui lòng nhập mật khẩu khởi tạo." })
  password!: string;

  @IsOptional()
  @IsIn(["active", "inactive", "blocked"], {
    message: "Trạng thái người dùng không hợp lệ.",
  })
  status?: "active" | "inactive" | "blocked";

  @IsOptional()
  @IsString({ message: "Đường dẫn ảnh đại diện phải là chuỗi ký tự." })
  avatarUrl?: string;
}
