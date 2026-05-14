import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RefundsService } from "./refunds.service";

@Controller("refunds")
export class RefundsController {
  constructor(private readonly service: RefundsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() u: { userId: bigint }, @Body() dto: any) {
    return this.service.create(u.userId, dto);
  }

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
  @Patch(":id/review")
  review(
    @CurrentUser() u: { userId: bigint },
    @Param("id") id: string,
    @Body() dto: any,
  ) {
    return this.service.review(BigInt(id), u.userId, dto);
  }
}
