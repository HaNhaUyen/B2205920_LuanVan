import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class AdminUpsertContactDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsEmail()
  @MaxLength(190)
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s]{8,20}$/, {
    message: "Số điện thoại không hợp lệ.",
  })
  phone?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  message!: string;

  @IsOptional()
  @IsString()
  @IsIn(["new", "pending", "replied", "closed"])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  handledBy?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  adminReply?: string;
}
