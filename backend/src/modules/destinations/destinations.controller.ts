import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { DestinationsService } from "./destinations.service";
import { UpsertDestinationDto } from "./dto/upsert-destination.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

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
  create(@Body() dto: UpsertDestinationDto) {
    return this.destinationsService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/destinations/:id")
  update(@Param("id") id: string, @Body() dto: UpsertDestinationDto) {
    return this.destinationsService.update(Number(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/destinations/:id")
  remove(@Param("id") id: string) {
    return this.destinationsService.remove(Number(id));
  }
}
