import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail({}, { message: "Email không đúng định dạng." })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @Matches(/^\d{12}$/, {
    message: "CCCD phải gồm đúng 12 chữ số.",
  })
  @MaxLength(30)
  identityNumber?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Ngày sinh phải có định dạng YYYY-MM-DD.",
  })
  birthDate?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(["male", "female", "other"], {
    message: "Giới tính chỉ nhận male, female hoặc other.",
  })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  gender?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dietaryNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  healthNotes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  refundBankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  refundAccountNo?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  refundAccountName?: string | null;
}
