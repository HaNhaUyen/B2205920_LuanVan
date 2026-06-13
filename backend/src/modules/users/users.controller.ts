import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { mkdirSync } from "fs";

import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { UsersService } from "./users.service";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { AdminCreateUserDto } from "./dto/admin-create-user.dto";

mkdirSync("./uploads/users", { recursive: true });

function avatarFileName(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) {
  const safeExt = extname(file.originalname || ".jpg") || ".jpg";
  cb(null, `user-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
}

const avatarUpload = FileInterceptor("avatarFile", {
  storage: diskStorage({
    destination: "./uploads/users",
    filename: avatarFileName,
  }),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Avatar phải là file ảnh."), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("admin/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  adminList(
    @Query()
    query: {
      page?: string;
      pageSize?: string;
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: string;
    },
  ) {
    return this.usersService.adminList(query);
  }

  @Post()
  @UseInterceptors(avatarUpload)
  adminCreate(
    @Body() dto: AdminCreateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.usersService.adminCreate({
      ...dto,
      avatarUrl: file ? `/uploads/users/${file.filename}` : dto.avatarUrl,
    });
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.usersService.findById(Number(id));
  }

  @Patch(":id")
  @UseInterceptors(avatarUpload)
  updateByAdmin(
    @Param("id") id: string,
    @Body() dto: AdminUpdateUserDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.usersService.updateByAdmin(Number(id), {
      ...dto,
      avatarUrl: file ? `/uploads/users/${file.filename}` : dto.avatarUrl,
    });
  }

  @Delete(":id")
  deleteByAdmin(@Param("id") id: string) {
    return this.usersService.deleteByAdmin(Number(id));
  }
}
