import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateGuideProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: "Email không đúng định dạng." })
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$|^\d{12}$/, {
    message: "CCCD/CMND phải gồm 9 hoặc 12 chữ số.",
  })
  identityNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
