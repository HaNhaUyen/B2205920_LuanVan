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
import { existsSync, mkdirSync } from "fs";
import { extname } from "path";
import { DestinationsService } from "./destinations.service";
import { UpsertDestinationDto } from "./dto/upsert-destination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

const destinationUploadDir = "./uploads/destinations";
if (!existsSync(destinationUploadDir)) {
  mkdirSync(destinationUploadDir, { recursive: true });
}

const destinationImageStorage = diskStorage({
  destination: destinationUploadDir,
  filename: (_req, file, cb) => {
    const safeExt = extname(file.originalname || "").toLowerCase() || ".jpg";
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `destination-${unique}${safeExt}`);
  },
});

const destinationImageInterceptor = FileInterceptor("coverImageFile", {
  storage: destinationImageStorage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) {
      cb(new Error("Chỉ được tải lên file hình ảnh."), false);
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

function applyUploadedCoverImage(
  dto: UpsertDestinationDto,
  file?: Express.Multer.File,
): UpsertDestinationDto {
  if (!file) return dto;
  return {
    ...dto,
    coverImage: `/uploads/destinations/${file.filename}`,
  };
}

@Controller()
export class DestinationsController {
  constructor(private readonly destinationsService: DestinationsService) {}

  @Get("destinations")
  findAll() {
    return this.destinationsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/destinations")
  adminList(@Query() query: any) {
    return this.destinationsService.adminList(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/destinations/:id")
  adminDetail(@Param("id") id: string) {
    return this.destinationsService.adminDetail(Number(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/destinations")
  @UseInterceptors(destinationImageInterceptor)
  create(
    @Body() dto: UpsertDestinationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.destinationsService.create(applyUploadedCoverImage(dto, file));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/destinations/:id")
  @UseInterceptors(destinationImageInterceptor)
  update(
    @Param("id") id: string,
    @Body() dto: UpsertDestinationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.destinationsService.update(
      Number(id),
      applyUploadedCoverImage(dto, file),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/destinations/:id")
  remove(@Param("id") id: string) {
    return this.destinationsService.remove(Number(id));
  }
}
