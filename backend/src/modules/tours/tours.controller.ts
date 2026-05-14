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
import { CreateTourStep1Dto } from "./dto/create-tour-step1.dto";
import { SaveItineraryDto } from "./dto/save-itinerary.dto";
import { SaveDeparturesDto } from "./dto/save-departures.dto";
import { SaveAccommodationsDto } from "./dto/save-accommodations.dto";
import { SaveTransportsDto } from "./dto/save-transports.dto";
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
  constructor(private readonly toursService: ToursService) {}

  @Get("tours")
  findAllPublic() {
    return this.toursService.findAllPublic();
  }

  @Get("tours/:slug")
  findBySlug(@Param("slug") slug: string) {
    return this.toursService.findBySlug(slug);
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
  @Get("admin/tours")
  adminList() {
    return this.toursService.adminList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get("admin/tours/:tourId")
  adminDetail(@Param("tourId") tourId: string) {
    return this.toursService.findById(Number(tourId));
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
