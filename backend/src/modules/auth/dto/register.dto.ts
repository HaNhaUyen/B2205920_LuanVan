import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsEmail()
  @MaxLength(190)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^0\d{9}$/, {
    message: "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
  })
  phone?: string;

  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password!: string;
}
