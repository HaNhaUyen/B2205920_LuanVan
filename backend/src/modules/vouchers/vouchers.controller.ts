import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { VouchersService } from "./vouchers.service";

@Controller("vouchers")
export class VouchersController {
  constructor(private readonly service: VouchersService) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  mine(@CurrentUser() u: { userId: bigint }) {
    return this.service.mine(u.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get()
  list(@Query() query: any) {
    return this.service.list(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get(":id")
  detail(@Param("id") id: string) {
    return this.service.detail(BigInt(id));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.service.update(BigInt(id), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(BigInt(id));
  }
}
