import { Transform } from "class-transformer";
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
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
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  identityNumber?: string | null;

  @IsOptional()
  @IsString()
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
