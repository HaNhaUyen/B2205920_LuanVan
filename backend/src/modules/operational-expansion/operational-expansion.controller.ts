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
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { OperationalExpansionService } from "./operational-expansion.service";

@Controller("operations-v2")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationalExpansionController {
  constructor(private readonly service: OperationalExpansionService) {}

  // =========================================================
  // SUPPLIERS
  // =========================================================

  @Get("suppliers")
  @Roles("admin")
  suppliers(@Query() query: any) {
    return this.service.suppliers(query);
  }

  @Post("suppliers")
  @Roles("admin")
  createSupplier(@CurrentUser() user: any, @Body() body: any) {
    return this.service.createSupplier(user, body);
  }

  @Patch("suppliers/:id")
  @Roles("admin")
  updateSupplier(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.updateSupplier(user, Number(id), body);
  }

  @Delete("suppliers/:id")
  @Roles("admin")
  removeSupplier(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.removeSupplier(user, Number(id));
  }

  @Post("suppliers/:id/services")
  @Roles("admin")
  addService(@Param("id") id: string, @Body() body: any) {
    return this.service.addSupplierService(Number(id), body);
  }

  // =========================================================
  // DEPARTURE CHANGE REQUESTS
  // =========================================================

  @Post("departure-changes")
  @Roles("user")
  requestChange(@CurrentUser() user: any, @Body() body: any) {
    return this.service.requestDepartureChange(user, body);
  }

  @Get("departure-changes")
  @Roles("admin", "user")
  departureChanges(@CurrentUser() user: any, @Query() query: any) {
    return this.service.departureChanges(user, query);
  }

  @Patch("departure-changes/:id/review")
  @Roles("admin")
  reviewChange(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.reviewDepartureChange(user, Number(id), body);
  }

  // =========================================================
  // TOUR TICKETS
  // =========================================================

  @Post("tickets/booking/:bookingId/issue")
  @Roles("admin")
  issueTickets(
    @CurrentUser() user: any,
    @Param("bookingId") bookingId: string,
  ) {
    return this.service.issueTickets(user, Number(bookingId));
  }

  @Get("tickets/booking/:bookingId")
  @Roles("admin", "user")
  tickets(@CurrentUser() user: any, @Param("bookingId") bookingId: string) {
    return this.service.bookingTickets(user, Number(bookingId));
  }

  @Post("tickets/scan")
  @Roles("admin", "guide")
  scan(@CurrentUser() user: any, @Body() body: any) {
    return this.service.scanTicket(user, body);
  }

  /*
   * KHÔNG khai báo các route lịch bận tại controller này.
   *
   * Các route sau đã được chuyển sang GuideAvailabilityController:
   *
   * GET    /operations-v2/guides/availability
   * POST   /operations-v2/guides/availability
   * PATCH  /operations-v2/guides/availability/:id
   * DELETE /operations-v2/guides/availability/:id
   *
   * Admin:
   * GET   /operations-v2/admin/guide-availabilities
   * PATCH /operations-v2/admin/guide-availabilities/:id/review
   * POST  /operations-v2/admin/guide-availabilities/:id/replace-and-approve
   *
   * Việc loại bỏ route trùng giúp NestJS không gọi nhầm:
   * OperationalExpansionService.createAvailability()
   */

  // =========================================================
  // LOGIN SESSIONS
  // =========================================================

  @Get("sessions")
  @Roles("admin", "user", "guide")
  sessions(@CurrentUser() user: any) {
    return this.service.sessions(user);
  }

  @Patch("sessions/:sessionId/revoke")
  @Roles("admin", "user", "guide")
  revoke(@CurrentUser() user: any, @Param("sessionId") sessionId: string) {
    return this.service.revokeSession(user, sessionId);
  }

  @Post("sessions/revoke-all")
  @Roles("admin", "user", "guide")
  revokeAll(@CurrentUser() user: any, @Body() body: any) {
    return this.service.revokeAllSessions(user, body?.exceptSessionId);
  }

  // =========================================================
  // ALERTS
  // =========================================================

  @Get("alerts")
  @Roles("admin")
  alerts(@Query() query: any) {
    return this.service.alerts(query);
  }

  @Post("alerts/scan")
  @Roles("admin")
  scanAlerts() {
    return this.service.scanAlerts();
  }

  @Patch("alerts/:id")
  @Roles("admin")
  updateAlert(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.updateAlert(user, Number(id), body);
  }

  // =========================================================
  // TRIP CHECKLIST
  // =========================================================

  @Get("trips/:id/checklist")
  @Roles("admin", "guide")
  checklist(@Param("id") id: string) {
    return this.service.checklist(Number(id));
  }

  @Post("trips/:id/checklist/bootstrap")
  @Roles("admin")
  bootstrapChecklist(@Param("id") id: string) {
    return this.service.bootstrapChecklist(Number(id));
  }

  @Patch("trips/:id/checklist/:itemId")
  @Roles("admin", "guide")
  updateChecklist(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: any,
  ) {
    return this.service.updateChecklist(user, Number(id), Number(itemId), body);
  }

  // =========================================================
  // TRIP DOCUMENTS
  // =========================================================

  @Get("trips/:id/documents")
  @Roles("admin", "guide", "user")
  documents(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.documents(user, Number(id));
  }

  @Post("trips/:id/documents")
  @Roles("admin", "guide")
  createDocument(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.createDocument(user, Number(id), body);
  }

  // =========================================================
  // TRIP ITINERARY
  // =========================================================

  @Post("trips/:id/itinerary/bootstrap")
  @Roles("admin")
  bootstrapItinerary(@Param("id") id: string) {
    return this.service.bootstrapItinerary(Number(id));
  }

  @Get("trips/:id/itinerary")
  @Roles("admin", "guide", "user")
  itinerary(@CurrentUser() user: any, @Param("id") id: string) {
    return this.service.tripItinerary(user, Number(id));
  }

  @Post("trips/:id/itinerary-changes")
  @Roles("admin", "guide")
  requestItineraryChange(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.requestItineraryChange(user, Number(id), body);
  }

  @Patch("itinerary-changes/:id/review")
  @Roles("admin")
  reviewItineraryChange(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.service.reviewItineraryChange(user, Number(id), body);
  }

  // =========================================================
  // ADVANCED REPORTS
  // =========================================================

  @Get("reports/advanced")
  @Roles("admin")
  advancedReports(@Query() query: any) {
    return this.service.advancedReports(query);
  }
}
