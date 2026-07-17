import {
  Body,
  Controller,
  Delete,
  UploadedFile,
  UseInterceptors,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { mkdirSync } from "fs";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { TripOperationsService } from "./trip-operations.service";

const competencyUploadDir = "./uploads/guide-competencies";
mkdirSync(competencyUploadDir, { recursive: true });

const competencyFileStorage = diskStorage({
  destination: competencyUploadDir,
  filename: (_req, file, callback) => {
    const safeExtension = extname(file.originalname || "").toLowerCase();
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const extension = allowedExtensions.includes(safeExtension)
      ? safeExtension
      : ".jpg";

    callback(
      null,
      `guide-competency-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`,
    );
  },
});

@Controller("trip-operations")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripOperationsController {
  constructor(private readonly service: TripOperationsService) {}

  @Get("user/bookings/:bookingId/personalized-itinerary")
  @Roles("user")
  personalized(
    @CurrentUser() user: any,
    @Param("bookingId") bookingId: string,
  ) {
    return this.service.personalizedItinerary(user, Number(bookingId));
  }

  @Get("my-trips")
  @Roles("guide", "admin")
  myTrips(@CurrentUser() user: any, @Query() query: any) {
    return this.service.listTrips(user, query);
  }

  @Get(":id/dashboard")
  @Roles("guide", "admin")
  dashboard(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.dashboard(user, Number(id));
  }

  @Get(":id/passengers")
  @Roles("guide", "admin")
  passengers(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.passengers(user, Number(id));
  }

  @Patch(":id/checkins/:guestId")
  @Roles("guide", "admin")
  checkin(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Param("guestId") guestId: string,
    @Body() body: any,
  ) {
    return this.service.updateCheckin(user, Number(id), Number(guestId), body);
  }

  @Get(":id/journey-logs")
  @Roles("guide", "admin", "user")
  journeyLogs(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.journeyLogs(user, Number(id));
  }

  @Post(":id/journey-logs")
  @Roles("guide", "admin")
  createJourneyLog(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.createJourneyLog(user, Number(id), body);
  }

  @Patch(":id/journey-logs/:logId")
  @Roles("guide", "admin")
  updateJourneyLog(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Param("logId") logId: string,
    @Body() body: any,
  ) {
    return this.service.updateJourneyLog(user, Number(id), Number(logId), body);
  }

  @Delete(":id/journey-logs/:logId")
  @Roles("guide", "admin")
  deleteJourneyLog(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Param("logId") logId: string,
  ) {
    return this.service.deleteJourneyLog(user, Number(id), Number(logId));
  }

  @Get(":id/incidents")
  @Roles("guide", "admin")
  incidents(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.incidents(user, Number(id));
  }

  @Post(":id/incidents")
  @Roles("guide", "admin")
  createIncident(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.createIncident(user, Number(id), body);
  }

  @Patch("incidents/:ticketId")
  @Roles("admin")
  updateIncident(
    @CurrentUser() user: any,
    @Param("ticketId") ticketId: string,
    @Body() body: any,
  ) {
    return this.service.updateIncident(user, Number(ticketId), body);
  }

  @Post("incidents/:ticketId/comments")
  @Roles("guide", "admin")
  commentIncident(
    @CurrentUser() user: any,
    @Param("ticketId") ticketId: string,
    @Body() body: any,
  ) {
    return this.service.commentIncident(user, Number(ticketId), body);
  }

  @Post(":id/broadcasts")
  @Roles("guide", "admin")
  broadcast(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.broadcast(user, Number(id), body);
  }

  @Get(":id/broadcasts")
  @Roles("guide", "admin")
  broadcasts(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.broadcasts(user, Number(id));
  }

  @Post(":id/report")
  @Roles("guide", "admin")
  saveReport(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.saveReport(user, Number(id), body);
  }

  @Get(":id/report")
  @Roles("guide", "admin")
  report(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.report(user, Number(id));
  }

  @Get("admin/reports")
  @Roles("admin")
  adminReports(@Query() query: any) {
    return this.service.adminReports(query);
  }

  @Get("admin/reports/:reportId")
  @Roles("admin")
  adminReportDetail(@Param("reportId") reportId: string) {
    return this.service.adminReportDetail(Number(reportId));
  }

  @Patch("admin/reports/:reportId/review")
  @Roles("admin")
  reviewTripReport(
    @CurrentUser() user: any,
    @Param("reportId") reportId: string,
    @Body() body: any,
  ) {
    return this.service.reviewTripReport(user, Number(reportId), body);
  }

  @Get("admin/incidents/all")
  @Roles("admin")
  allIncidents(@Query() query: any) {
    return this.service.allIncidents(query);
  }

  @Get("admin/guide-competencies")
  @Roles("admin")
  adminCompetencies(@Query() query: any) {
    return this.service.adminCompetencies(query);
  }

  @Patch("admin/guide-competencies/:id/review")
  @Roles("admin")
  reviewCompetency(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.reviewCompetency(user, Number(id), body);
  }

  @Get("guides/me/competencies")
  @Roles("guide", "admin")
  competencies(@CurrentUser() user: any) {
    return this.service.competencies(user);
  }

  @Post("guides/me/competencies")
  @Roles("guide")
  @UseInterceptors(
    FileInterceptor("evidenceFile", {
      storage: competencyFileStorage,
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          callback(
            new Error("Minh chứng chỉ hỗ trợ JPG, PNG, WEBP hoặc PDF."),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  createCompetency(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.createCompetency(user, {
      ...body,
      documentUrl: file
        ? `/uploads/guide-competencies/${file.filename}`
        : body?.documentUrl,
    });
  }
}
