import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { GuidePortalService } from "./guide-portal.service";
import { UpdateGuideProfileDto } from "./dto/update-guide-profile.dto";
import { UpdateAssignmentStatusDto } from "./dto/update-assignment-status.dto";
import { CreateGuideCredentialDto } from "./dto/create-guide-credential.dto";
import { CreateGuideUnavailableDto } from "./dto/create-guide-unavailable.dto";

@Controller("guide-portal")
@UseGuards(JwtAuthGuard)
export class GuidePortalController {
  constructor(private readonly guidePortalService: GuidePortalService) {}

  @Get("dashboard")
  dashboard(@CurrentUser() user: any) {
    return this.guidePortalService.getDashboard(user);
  }

  @Get("me")
  me(@CurrentUser() user: any) {
    return this.guidePortalService.getMyProfile(user);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: any, @Body() dto: UpdateGuideProfileDto) {
    return this.guidePortalService.updateMyProfile(user, dto);
  }

  @Post("me/credentials")
  createCredential(
    @CurrentUser() user: any,
    @Body() dto: CreateGuideCredentialDto,
  ) {
    return this.guidePortalService.createMyCredential(user, dto);
  }

  @Delete("me/credentials/:id")
  deleteCredential(@CurrentUser() user: any, @Param("id") id: string) {
    return this.guidePortalService.deleteMyCredential(user, Number(id));
  }

  @Get("assignments")
  assignments(@CurrentUser() user: any, @Query() query: any) {
    return this.guidePortalService.getMyAssignments(user, query);
  }

  @Get("assignments/:id")
  assignmentDetail(@CurrentUser() user: any, @Param("id") id: string) {
    return this.guidePortalService.getAssignmentDetail(user, Number(id));
  }

  @Post("assignments/:id/unavailable")
  reportUnavailable(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() dto: CreateGuideUnavailableDto,
  ) {
    return this.guidePortalService.reportAssignmentUnavailable(
      user,
      Number(id),
      dto,
    );
  }

  @Patch("assignments/:id/status")
  updateAssignmentStatus(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() dto: UpdateAssignmentStatusDto,
  ) {
    return this.guidePortalService.updateAssignmentStatus(
      user,
      Number(id),
      dto,
    );
  }
}
