import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TravelCompanionsService } from "./travel-companions.service";

@Controller("travel-companions")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("user")
export class TravelCompanionsController {
  constructor(private readonly service: TravelCompanionsService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.service.list(Number(user.userId));
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.service.create(Number(user.userId), body);
  }

  @Patch(":id")
  update(@CurrentUser() user: any, @Param("id") id: string, @Body() body: any) {
    return this.service.update(Number(user.userId), Number(id), body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.remove(Number(user.userId), Number(id));
  }
}
