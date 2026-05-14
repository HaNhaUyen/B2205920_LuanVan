import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { mkdirSync } from "fs";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GoogleLoginDto } from "./dto/google-login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";

function avatarFilename(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
  cb(null, unique);
}

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("google")
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto.credential);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(
    @CurrentUser() user: { userId: bigint },
    @Headers("authorization") authorization = "",
  ) {
    const token = authorization.replace(/^Bearer\s+/i, "");
    return this.authService.logout(user.userId, token);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: { userId: bigint }) {
    return this.authService.me(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateMe(
    @CurrentUser() user: { userId: bigint },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me/password")
  changePassword(
    @CurrentUser() user: { userId: bigint },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("me/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const target = "./uploads/avatars";
          mkdirSync(target, { recursive: true });
          cb(null, target);
        },
        filename: avatarFilename,
      }),
    }),
  )
  uploadAvatar(
    @CurrentUser() user: { userId: bigint },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.authService.uploadAvatar(user.userId, file);
  }
}
