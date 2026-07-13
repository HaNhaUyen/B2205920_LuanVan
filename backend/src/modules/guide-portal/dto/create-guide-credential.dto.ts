import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateGuideCredentialDto {
  @IsIn(["language", "skill", "certificate"])
  credentialType!: "language" | "skill" | "certificate";

  @IsString()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;
}
