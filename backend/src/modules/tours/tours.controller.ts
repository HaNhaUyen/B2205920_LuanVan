import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { ToursService } from "./tours.service";
import { DepartureMaintenanceService } from "./depature-maintenance.service";
import { CreateTourStep1Dto } from "./dto/create-tour-step1.dto";
import { SaveItineraryDto } from "./dto/save-itinerary.dto";
import { SaveDeparturesDto } from "./dto/save-departures.dto";
import { SaveAccommodationsDto } from "./dto/save-accommodations.dto";
import { SaveTransportsDto } from "./dto/save-transports.dto";
import { SavePickupPointsDto } from "./dto/save-pickup-points.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";

function filename(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname)}`;
  cb(null, unique);
}

@Controller()
export class ToursController {
  constructor(
    private readonly toursService: ToursService,
    private readonly departureMaintenanceService: DepartureMaintenanceService,
  ) {}

  private filterAdminVisibleDepartures(tour: any) {
    if (!tour) return tour;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 7);

    const departures = (Array.isArray(tour.departures) ? tour.departures : [])
      .filter((departure: any) => {
        const departureDate = new Date(departure.departureDate);
        if (Number.isNaN(departureDate.getTime())) return false;
        departureDate.setHours(0, 0, 0, 0);
        return departureDate.getTime() >= cutoff.getTime();
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.departureDate).getTime() -
          new Date(b.departureDate).getTime(),
      );

    return { ...tour, departures };
  }

  private filterBookableDepartures(tour: any) {
    if (!tour) return tour;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const departures = (Array.isArray(tour.departures) ? tour.departures : [])
      .filter((departure: any) => {
        const departureDate = new Date(departure.departureDate);
        departureDate.setHours(0, 0, 0, 0);

        const remainingSlots = Math.max(
          0,
          Number(departure.totalSlots || 0) -
            Number(departure.bookedSlots || 0) -
            Number(departure.heldSlots || 0),
        );

        return (
          String(departure.status) === "open" &&
          !Number.isNaN(departureDate.getTime()) &&
          departureDate.getTime() >= today.getTime() &&
          remainingSlots > 0
        );
      })
      .sort(
        (a: any, b: any) =>
          new Date(a.departureDate).getTime() -
          new Date(b.departureDate).getTime(),
      );

    const nextDeparture = departures[0] || null;

    return {
      ...tour,
      departures,
      nextDeparture,
      remainingSlots: nextDeparture
        ? Math.max(
            0,
            Number(nextDeparture.totalSlots || 0) -
              Number(nextDeparture.bookedSlots || 0) -
              Number(nextDeparture.heldSlots || 0),
          )
        : 0,
    };
  }

  @Get("tours")
  async findAllPublic() {
    const tours = await this.toursService.findAllPublic();
    const items = Array.isArray(tours) ? tours : [];
    const departuresByTour =
      await this.departureMaintenanceService.getBookableDeparturesForTours(
        items.map((tour: any) => tour.id),
      );

    return items.map((tour: any) =>
      this.filterBookableDepartures({
        ...tour,
        departures: departuresByTour.get(String(tour.id)) || [],
      }),
    );
  }

  @Get("tours/:slug")
  async findBySlug(@Param("slug") slug: string) {
    const tour = await this.toursService.findBySlug(slug);
    return this.filterBookableDepartures(tour);
  }

  @Get("tours/:tourId/pickup-points")
  findPickupPoints(
    @Param("tourId") tourId: string,
    @Query("departureId") departureId?: string,
  ) {
    return this.toursService.findPickupPoints(
      Number(tourId),
      departureId ? Number(departureId) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/departures/maintenance")
  runDepartureMaintenance() {
    return this.departureMaintenanceService.runMaintenance();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/tours")
  async adminList(@Query() query: any) {
    const tours = await this.toursService.adminList(query);
    return (Array.isArray(tours) ? tours : []).map((tour) =>
      this.filterAdminVisibleDepartures(tour),
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/tours/:tourId")
  async adminDetail(@Param("tourId") tourId: string) {
    const tour = await this.toursService.findById(Number(tourId));
    return this.filterAdminVisibleDepartures(tour);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/step1")
  createStep1(@Body() dto: CreateTourStep1Dto) {
    return this.toursService.createStep1(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/tours/:tourId/step1")
  updateStep1(
    @Param("tourId") tourId: string,
    @Body() dto: CreateTourStep1Dto,
  ) {
    return this.toursService.updateStep1(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/media")
  @UseInterceptors(
    FilesInterceptor("files", 20, {
      storage: diskStorage({
        destination: "./uploads/tours",
        filename,
      }),
    }),
  )
  uploadMedia(
    @Param("tourId") tourId: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    return this.toursService.uploadMedia(Number(tourId), files);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/tours/:tourId/media/:mediaId")
  removeMedia(
    @Param("tourId") tourId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.toursService.removeMedia(Number(tourId), Number(mediaId));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/tours/:tourId/media/:mediaId/cover")
  setCoverMedia(
    @Param("tourId") tourId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.toursService.setCoverMedia(Number(tourId), Number(mediaId));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/itinerary")
  saveItinerary(
    @Param("tourId") tourId: string,
    @Body() dto: SaveItineraryDto,
  ) {
    return this.toursService.saveItinerary(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/departures")
  saveDepartures(
    @Param("tourId") tourId: string,
    @Body() dto: SaveDeparturesDto,
  ) {
    return this.toursService.saveDepartures(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/pickup-points")
  savePickupPoints(
    @Param("tourId") tourId: string,
    @Body() dto: SavePickupPointsDto,
  ) {
    return this.toursService.savePickupPoints(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/accommodations")
  saveAccommodations(
    @Param("tourId") tourId: string,
    @Body() dto: SaveAccommodationsDto,
  ) {
    return this.toursService.saveAccommodations(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("admin/tours/:tourId/transports")
  saveTransports(
    @Param("tourId") tourId: string,
    @Body() dto: SaveTransportsDto,
  ) {
    return this.toursService.saveTransports(Number(tourId), dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch("admin/tours/:tourId/publish")
  publishTour(@Param("tourId") tourId: string) {
    return this.toursService.publishTour(Number(tourId));
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete("admin/tours/:tourId")
  removeTour(@Param("tourId") tourId: string) {
    return this.toursService.removeTour(Number(tourId));
  }
}
