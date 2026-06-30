import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { unlink } from "fs/promises";
import { join, normalize } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTourStep1Dto } from "./dto/create-tour-step1.dto";
import { SaveItineraryDto } from "./dto/save-itinerary.dto";
import { SaveDeparturesDto } from "./dto/save-departures.dto";
import { SaveAccommodationsDto } from "./dto/save-accommodations.dto";
import { SaveTransportsDto } from "./dto/save-transports.dto";
import { SavePickupPointsDto } from "./dto/save-pickup-points.dto";

function slugify(text = "") {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  private getRemainingSlots(departure: any) {
    if (!departure) return 0;
    return Math.max(
      0,
      Number(departure.totalSlots || 0) -
        Number(departure.bookedSlots || 0) -
        Number(departure.heldSlots || 0),
    );
  }

  private getTourPrice(tour: any) {
    const departures = Array.isArray(tour.departures) ? tour.departures : [];
    const departurePrices = departures
      .map((item: any) => Number(item.adultPrice || 0))
      .filter((value: number) => value > 0);

    if (departurePrices.length) return Math.min(...departurePrices);
    return Number(tour.basePriceAdult || tour.base_price_adult || 0);
  }

  private buildDestinationAveragePriceMap(tours: any[]) {
    const groups: Record<string, { total: number; count: number }> = {};

    for (const tour of tours || []) {
      const destinationId = String(
        tour.destinationId || tour.destination?.id || "",
      );
      const price = this.getTourPrice(tour);
      if (!destinationId || !price) continue;

      if (!groups[destinationId])
        groups[destinationId] = { total: 0, count: 0 };
      groups[destinationId].total += price;
      groups[destinationId].count += 1;
    }

    return Object.fromEntries(
      Object.entries(groups).map(([destinationId, item]) => [
        destinationId,
        item.count ? item.total / item.count : 0,
      ]),
    );
  }

  private async getDestinationAveragePrice(destinationId: bigint) {
    const tours = await this.prisma.tour.findMany({
      where: { destinationId, status: "published" },
      include: {
        departures: {
          where: { status: { in: ["open", "full"] } },
          orderBy: { departureDate: "asc" },
          take: 3,
        },
      },
    });

    const prices = tours
      .map((tour) => this.getTourPrice(tour))
      .filter((value) => value > 0);

    if (!prices.length) return 0;
    return prices.reduce((sum, value) => sum + value, 0) / prices.length;
  }

  private enrichTourStats(
    tour: any,
    context: { destinationAveragePrice?: number } = {},
  ) {
    const departures = Array.isArray(tour.departures) ? tour.departures : [];
    const nextDeparture =
      departures.find((item: any) => item.status === "open") ||
      departures[0] ||
      null;

    const remainingSlots = this.getRemainingSlots(nextDeparture);
    const bookingCount = Array.isArray(tour.bookings)
      ? tour.bookings.length
      : Number(tour._count?.bookings || 0);
    const favoriteCount = Array.isArray(tour.favorites)
      ? tour.favorites.length
      : Number(tour._count?.favorites || 0);

    const tourPrice = this.getTourPrice(tour);
    const destinationAveragePrice = Number(
      context.destinationAveragePrice || 0,
    );
    const dynamicIsBestDeal =
      tourPrice > 0 &&
      destinationAveragePrice > 0 &&
      tourPrice <= destinationAveragePrice * 0.85;

    return {
      ...tour,
      nextDeparture,
      remainingSlots,
      bookingCount,
      favoriteCount,
      destinationAveragePrice,
      dynamicIsBestSeller: bookingCount >= 5,
      dynamicIsFavorite: favoriteCount >= 5,
      dynamicIsBestDeal,
    };
  }

  private enrichTourList(tours: any[]) {
    const averagePriceMap = this.buildDestinationAveragePriceMap(tours || []);

    return (tours || []).map((tour) => {
      const destinationId = String(
        tour.destinationId || tour.destination?.id || "",
      );
      return this.enrichTourStats(tour, {
        destinationAveragePrice: Number(averagePriceMap[destinationId] || 0),
      });
    });
  }

  private async buildUniqueCode(destinationId: number) {
    const prefixSource = await this.prisma.destination.findUnique({
      where: { id: BigInt(destinationId) },
      select: { name: true },
    });
    const prefix =
      (prefixSource?.name || "TR")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z]/g, "")
        .slice(0, 3)
        .toUpperCase() || "TR";
    let code = "";
    let exists = true;
    while (exists) {
      code = `${prefix}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
      exists = Boolean(await this.prisma.tour.findUnique({ where: { code } }));
    }
    return code;
  }

  private async buildUniqueSlug(name: string, currentId?: bigint) {
    const base = slugify(name) || `tour-${Date.now()}`;
    let candidate = base;
    let counter = 2;
    while (true) {
      const existing = await this.prisma.tour.findUnique({
        where: { slug: candidate },
      });
      if (!existing || (currentId && String(existing.id) === String(currentId)))
        return candidate;
      candidate = `${base}-${counter++}`;
    }
  }

  private validateStep1BusinessRules(dto: CreateTourStep1Dto) {
    if (dto.durationNights >= dto.durationDays) {
      throw new BadRequestException("Số đêm phải nhỏ hơn số ngày của tour.");
    }
    if (Number(dto.basePriceChild) > Number(dto.basePriceAdult)) {
      throw new BadRequestException(
        "Giá trẻ em không được lớn hơn giá người lớn.",
      );
    }
    if (dto.hotelStars && (dto.hotelStars < 1 || dto.hotelStars > 5)) {
      throw new BadRequestException("Số sao khách sạn chỉ được từ 1 đến 5.");
    }
  }

  async findAllPublic() {
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: {
          where: { status: { in: ["open", "full"] } },
          orderBy: { departureDate: "asc" },
          take: 3,
          include: {
            pickupPoints: {
              where: { status: "active" },
              orderBy: { pickupTime: "asc" },
            },
          },
        },
        accommodations: {
          where: { status: "active" },
          take: 3,
          orderBy: { createdAt: "asc" },
        },
        transports: {
          where: { status: "active" },
          take: 3,
          orderBy: { createdAt: "asc" },
        },
        reviews: { where: { status: "approved" }, select: { rating: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: ["waiting_confirmation", "confirmed", "completed"],
            },
          },
          select: { id: true },
        },
        favorites: { select: { id: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return this.enrichTourList(tours);
  }

  async adminList(query: any = {}) {
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();
    const destinationId = query.destinationId
      ? Number(query.destinationId)
      : null;

    const allowedSort = [
      "createdAt",
      "updatedAt",
      "name",
      "code",
      "basePriceAdult",
      "basePriceChild",
      "durationDays",
      "viewCount",
      "status",
    ];
    const sortBy = allowedSort.includes(String(query.sortBy || ""))
      ? String(query.sortBy)
      : "createdAt";
    const sortOrder =
      String(query.sortOrder || "desc").toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { slug: { contains: search } },
        { destination: { name: { contains: search } } },
      ];
    }

    if (status && status !== "all") {
      where.status = status;
    }

    if (destinationId && !Number.isNaN(destinationId)) {
      where.destinationId = BigInt(destinationId);
    }

    return this.prisma.tour.findMany({
      where,
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: { orderBy: { departureDate: "asc" }, take: 20 },
        accommodations: { take: 2, orderBy: { createdAt: "asc" } },
        transports: { take: 2, orderBy: { createdAt: "asc" } },
      },
      orderBy: { [sortBy]: sortOrder },
    });
  }

  async findById(tourId: number) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: {
        destination: true,
        media: { orderBy: { displayOrder: "asc" } },
        itinerary: { orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }] },
        departures: {
          orderBy: { departureDate: "asc" },
          include: {
            pickupPoints: {
              where: { status: "active" },
              orderBy: { pickupTime: "asc" },
            },
          },
        },
        policies: { orderBy: [{ policyType: "asc" }, { displayOrder: "asc" }] },
        accommodations: { orderBy: { createdAt: "asc" } },
        transports: { orderBy: { createdAt: "asc" } },
        pickupPoints: {
          orderBy: [
            { departureId: "asc" },
            { pickupTime: "asc" },
            { name: "asc" },
          ],
        },
        bookings: {
          where: {
            bookingStatus: {
              in: ["waiting_confirmation", "confirmed", "completed"],
            },
          },
          select: { id: true },
        },
        favorites: { select: { id: true } },
      },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    const destinationAveragePrice = await this.getDestinationAveragePrice(
      tour.destinationId,
    );
    return this.enrichTourStats(tour, { destinationAveragePrice });
  }

  async findBySlug(slug: string) {
    const tour = await this.prisma.tour.findUnique({
      where: { slug },
      include: {
        destination: true,
        media: { orderBy: { displayOrder: "asc" } },
        itinerary: { orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }] },
        departures: {
          orderBy: { departureDate: "asc" },
          include: {
            pickupPoints: {
              where: { status: "active" },
              orderBy: { pickupTime: "asc" },
            },
          },
        },
        policies: { orderBy: [{ policyType: "asc" }, { displayOrder: "asc" }] },
        accommodations: {
          where: { status: "active" },
          orderBy: { createdAt: "asc" },
        },
        transports: {
          where: { status: "active" },
          orderBy: { createdAt: "asc" },
        },
        pickupPoints: {
          where: { status: "active" },
          orderBy: [{ departureId: "asc" }, { pickupTime: "asc" }],
        },
        bookings: {
          where: {
            bookingStatus: {
              in: ["waiting_confirmation", "confirmed", "completed"],
            },
          },
          select: { id: true },
        },
        favorites: { select: { id: true } },
      },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    const destinationAveragePrice = await this.getDestinationAveragePrice(
      tour.destinationId,
    );
    return this.enrichTourStats(tour, { destinationAveragePrice });
  }

  async findPickupPoints(tourId: number, departureId?: number) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    return this.prisma.tourPickupPoint.findMany({
      where: {
        tourId: BigInt(tourId),
        status: "active",
        ...(departureId
          ? {
              OR: [{ departureId: BigInt(departureId) }, { departureId: null }],
            }
          : {}),
      },
      orderBy: [{ departureId: "asc" }, { pickupTime: "asc" }, { name: "asc" }],
    });
  }

  async createStep1(dto: CreateTourStep1Dto) {
    this.validateStep1BusinessRules(dto);
    const code =
      dto.code?.trim() ||
      (await this.buildUniqueCode(Number(dto.destinationId)));
    const slug = dto.slug?.trim() || (await this.buildUniqueSlug(dto.name));
    const duplicatedCode = await this.prisma.tour.findUnique({
      where: { code },
    });
    if (duplicatedCode) throw new BadRequestException("Mã tour đã tồn tại.");

    const tour = await this.prisma.tour.create({
      data: {
        code,
        name: dto.name,
        slug,
        destinationId: BigInt(dto.destinationId),
        tourType: dto.tourType as any,
        tourTheme: dto.tourTheme as any,
        durationDays: dto.durationDays,
        durationNights: dto.durationNights,
        hotelStars: dto.hotelStars,
        basePriceAdult: dto.basePriceAdult,
        basePriceChild: dto.basePriceChild,
        maxCapacityDefault: dto.maxCapacityDefault,
        shortDescription: dto.shortDescription,
        fullDescription: dto.fullDescription,
        isTrending: dto.isTrending ?? false,
        isBestDeal: dto.isBestDeal ?? false,
        status: "draft",
      },
    });

    return {
      message: "Step 1 saved",
      id: tour.id.toString(),
      tourId: tour.id.toString(),
      status: tour.status,
      code: tour.code,
      slug: tour.slug,
    };
  }

  async updateStep1(tourId: number, dto: CreateTourStep1Dto) {
    this.validateStep1BusinessRules(dto);
    const existing = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!existing) throw new NotFoundException("Tour not found");
    const code =
      dto.code?.trim() ||
      existing.code ||
      (await this.buildUniqueCode(Number(dto.destinationId)));
    const slug =
      dto.slug?.trim() || (await this.buildUniqueSlug(dto.name, existing.id));
    const duplicatedCode = await this.prisma.tour.findFirst({
      where: { code, NOT: { id: existing.id } },
    });
    if (duplicatedCode) throw new BadRequestException("Mã tour đã tồn tại.");

    const tour = await this.prisma.tour.update({
      where: { id: BigInt(tourId) },
      data: {
        code,
        name: dto.name,
        slug,
        destinationId: BigInt(dto.destinationId),
        tourType: dto.tourType as any,
        tourTheme: dto.tourTheme as any,
        durationDays: dto.durationDays,
        durationNights: dto.durationNights,
        hotelStars: dto.hotelStars,
        basePriceAdult: dto.basePriceAdult,
        basePriceChild: dto.basePriceChild,
        maxCapacityDefault: dto.maxCapacityDefault,
        shortDescription: dto.shortDescription,
        fullDescription: dto.fullDescription,
        isTrending: dto.isTrending ?? false,
        isBestDeal: dto.isBestDeal ?? false,
      },
    });

    return {
      message: "Step 1 updated",
      id: tour.id.toString(),
      tourId: tour.id.toString(),
      code: tour.code,
      slug: tour.slug,
    };
  }

  private mapTourMediaItem(item: any) {
    if (!item) return item;

    return {
      ...item,
      id: item.id?.toString?.() || String(item.id || ""),
      tourId: item.tourId?.toString?.() || String(item.tourId || ""),
    };
  }

  private async deleteLocalUploadFile(fileUrl?: string | null) {
    if (!fileUrl) return;

    const raw = String(fileUrl).trim();

    // Chỉ xóa file local trong backend/uploads.
    // Ảnh online như https://... chỉ xóa record trong CSDL.
    if (!raw.startsWith("/uploads/")) return;

    const uploadsRoot = join(process.cwd(), "uploads");
    const relativePath = normalize(raw.replace(/^\/uploads\/?/, ""));
    const absolutePath = join(uploadsRoot, relativePath);

    // Chặn path traversal, tránh xóa nhầm file ngoài thư mục uploads.
    if (!absolutePath.startsWith(uploadsRoot)) return;

    await unlink(absolutePath).catch(() => null);
  }

  async uploadMedia(tourId: number, files: Array<Express.Multer.File>) {
    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    if (!files?.length) {
      throw new BadRequestException("Vui lòng chọn ít nhất một ảnh.");
    }

    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: { media: true },
    });

    if (!tour) throw new NotFoundException("Tour not found");

    const currentMaxOrder =
      tour.media.reduce(
        (max, item) => Math.max(max, Number(item.displayOrder || 0)),
        0,
      ) || 0;

    await Promise.all(
      files.map((file, index) =>
        this.prisma.tourMedia.create({
          data: {
            tourId: BigInt(tourId),
            mediaType: "image",
            fileUrl: `/uploads/tours/${file.filename}`,
            isCover: tour.media.length === 0 && index === 0,
            displayOrder: currentMaxOrder + index + 1,
          },
        }),
      ),
    );

    const items = await this.prisma.tourMedia.findMany({
      where: { tourId: BigInt(tourId) },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });

    return {
      message: "Media uploaded",
      items: items.map((item) => this.mapTourMediaItem(item)),
    };
  }

  async removeMedia(tourId: number, mediaId: number) {
    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    if (!mediaId || Number.isNaN(mediaId)) {
      throw new BadRequestException("Mã ảnh không hợp lệ.");
    }

    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true, name: true },
    });

    if (!tour) {
      throw new NotFoundException("Không tìm thấy tour.");
    }

    const media = await this.prisma.tourMedia.findFirst({
      where: {
        id: BigInt(mediaId),
        tourId: BigInt(tourId),
      },
    });

    if (!media) {
      throw new NotFoundException("Không tìm thấy ảnh thuộc tour này.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tourMedia.delete({
        where: { id: BigInt(mediaId) },
      });

      const remaining = await tx.tourMedia.findMany({
        where: { tourId: BigInt(tourId) },
        orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      });

      // Nếu ảnh vừa xóa là ảnh bìa thì tự chọn ảnh còn lại đầu tiên làm ảnh bìa.
      if (media.isCover && remaining.length > 0) {
        await tx.tourMedia.updateMany({
          where: { tourId: BigInt(tourId) },
          data: { isCover: false },
        });

        await tx.tourMedia.update({
          where: { id: remaining[0].id },
          data: { isCover: true },
        });
      }

      // Sắp lại thứ tự ảnh cho gọn.
      for (let index = 0; index < remaining.length; index += 1) {
        await tx.tourMedia.update({
          where: { id: remaining[index].id },
          data: { displayOrder: index + 1 },
        });
      }
    });

    await this.deleteLocalUploadFile(media.fileUrl);

    const items = await this.prisma.tourMedia.findMany({
      where: { tourId: BigInt(tourId) },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });

    return {
      message: "Đã xóa ảnh tour.",
      deletedId: String(mediaId),
      items: items.map((item) => this.mapTourMediaItem(item)),
    };
  }

  async setCoverMedia(tourId: number, mediaId: number) {
    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    if (!mediaId || Number.isNaN(mediaId)) {
      throw new BadRequestException("Mã ảnh không hợp lệ.");
    }

    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });

    if (!tour) {
      throw new NotFoundException("Không tìm thấy tour.");
    }

    const media = await this.prisma.tourMedia.findFirst({
      where: {
        id: BigInt(mediaId),
        tourId: BigInt(tourId),
      },
    });

    if (!media) {
      throw new NotFoundException("Không tìm thấy ảnh thuộc tour này.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tourMedia.updateMany({
        where: { tourId: BigInt(tourId) },
        data: { isCover: false },
      });

      await tx.tourMedia.update({
        where: { id: BigInt(mediaId) },
        data: { isCover: true },
      });
    });

    const items = await this.prisma.tourMedia.findMany({
      where: { tourId: BigInt(tourId) },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    });

    return {
      message: "Đã đặt ảnh bìa cho tour.",
      items: items.map((item) => this.mapTourMediaItem(item)),
    };
  }

  async saveItinerary(tourId: number, dto: SaveItineraryDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.tourItinerary.deleteMany({ where: { tourId: BigInt(tourId) } });
      for (const item of dto.items) {
        await tx.tourItinerary.create({
          data: {
            tourId: BigInt(tourId),
            dayNumber: item.dayNumber,
            itemOrder: item.itemOrder,
            title: item.title,
            description: item.description,
            locationName: item.locationName,
          },
        });
      }
    });
    return { message: "Itinerary saved", totalItems: dto.items.length };
  }

  async saveDepartures(tourId: number, dto: SaveDeparturesDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!tour) throw new NotFoundException("Tour not found");

    const normalizedItems = (dto.items || []).map((item: any) => ({
      id: item.id ? BigInt(item.id) : null,
      departureDate: new Date(item.departureDate),
      endDate: new Date(item.endDate),
      adultPrice: Number(item.adultPrice || 0),
      childPrice: Number(item.childPrice || 0),
      totalSlots: Number(item.totalSlots || 0),
      status: item.status || "open",
    }));

    for (const item of normalizedItems) {
      if (
        Number.isNaN(item.departureDate.getTime()) ||
        Number.isNaN(item.endDate.getTime())
      ) {
        throw new BadRequestException(
          "Ngày khởi hành hoặc ngày kết thúc không hợp lệ.",
        );
      }
      if (item.endDate.getTime() < item.departureDate.getTime()) {
        throw new BadRequestException(
          "Ngày kết thúc không được sớm hơn ngày khởi hành.",
        );
      }
      if (item.childPrice > item.adultPrice) {
        throw new BadRequestException(
          "Giá trẻ em của đợt khởi hành không được lớn hơn giá người lớn.",
        );
      }
      if (item.totalSlots <= 0) {
        throw new BadRequestException(
          "Số chỗ của lịch khởi hành phải lớn hơn 0.",
        );
      }
    }

    const existingDepartures = await this.prisma.tourDeparture.findMany({
      where: { tourId: BigInt(tourId) },
      orderBy: { departureDate: "asc" },
    });

    const keptIncomingIds = new Set(
      normalizedItems.filter((item) => item.id).map((item) => String(item.id)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let preservedBookedCount = 0;
    let deletedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const existing of existingDepartures) {
        if (keptIncomingIds.has(String(existing.id))) continue;

        const bookingCount = await tx.booking.count({
          where: {
            departureId: existing.id,
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ],
            },
          },
        });

        if (bookingCount > 0) {
          preservedBookedCount += 1;
          continue;
        }

        await tx.tourDeparture.delete({ where: { id: existing.id } });
        deletedCount += 1;
      }

      for (const item of normalizedItems) {
        if (item.id) {
          const existing = existingDepartures.find(
            (row) => String(row.id) === String(item.id),
          );
          if (!existing) continue;

          const bookingCount = await tx.booking.count({
            where: {
              departureId: existing.id,
              bookingStatus: {
                in: [
                  "pending_payment",
                  "waiting_confirmation",
                  "confirmed",
                  "completed",
                ],
              },
            },
          });

          if (bookingCount > 0) {
            // Lịch đã có booking: không cho sửa ngày và tổng số chỗ để tránh lệch dữ liệu.
            // Nhưng vẫn cho sửa giá hiển thị cho các booking mới.
            await tx.tourDeparture.update({
              where: { id: item.id },
              data: {
                adultPrice: item.adultPrice,
                childPrice: item.childPrice,
                status: item.status as any,
              },
            });

            updatedCount += 1;
            preservedBookedCount += 1;
            continue;
          }

          await tx.tourDeparture.update({
            where: { id: item.id },
            data: {
              departureDate: item.departureDate,
              endDate: item.endDate,
              adultPrice: item.adultPrice,
              childPrice: item.childPrice,
              totalSlots: item.totalSlots,
              status: item.status as any,
            },
          });
          updatedCount += 1;
        } else {
          await tx.tourDeparture.create({
            data: {
              tourId: BigInt(tourId),
              departureDate: item.departureDate,
              endDate: item.endDate,
              adultPrice: item.adultPrice,
              childPrice: item.childPrice,
              totalSlots: item.totalSlots,
              status: item.status as any,
            },
          });
          createdCount += 1;
        }
      }
    });

    return {
      message: "Departures saved",
      totalItems: dto.items.length,
      createdCount,
      updatedCount,
      deletedCount,
      preservedBookedCount,
      note:
        preservedBookedCount > 0
          ? "Một số lịch khởi hành đã có booking nên được giữ nguyên để bảo toàn dữ liệu booking. Các lịch mới vẫn được thêm bình thường."
          : undefined,
    };
  }

  private normalizePickupTime(value?: string | null) {
    const raw = String(value || "07:00").trim();
    if (/^\d{2}:\d{2}$/.test(raw)) return new Date(`1970-01-01T${raw}:00`);
    if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) return new Date(`1970-01-01T${raw}`);
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    throw new BadRequestException("Giờ đón không hợp lệ.");
  }

  async savePickupPoints(tourId: number, dto: SavePickupPointsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: { departures: true },
    });
    if (!tour) throw new NotFoundException("Tour not found");

    const validDepartureIds = new Set(
      (tour.departures || []).map((item) => String(item.id)),
    );

    const normalizedItems = (dto.items || [])
      .filter((item) => item.name?.trim() && item.address?.trim())
      .map((item: any) => {
        const departureId = item.departureId ? BigInt(item.departureId) : null;
        if (departureId && !validDepartureIds.has(String(departureId))) {
          throw new BadRequestException(
            "Lịch khởi hành của điểm đón không thuộc tour này.",
          );
        }
        return {
          id: item.id ? BigInt(item.id) : null,
          departureId,
          name: String(item.name || "").trim(),
          address: String(item.address || "").trim(),
          province: String(
            item.province || item.address || "Chưa cập nhật",
          ).trim(),
          pickupTime: this.normalizePickupTime(item.pickupTime),
          note: item.note?.trim() || null,
          status: item.status || "active",
        };
      });

    const existingPoints = await this.prisma.tourPickupPoint.findMany({
      where: { tourId: BigInt(tourId) },
    });
    const incomingIds = new Set(
      normalizedItems.filter((item) => item.id).map((item) => String(item.id)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;
    let preservedBookedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const existing of existingPoints) {
        if (incomingIds.has(String(existing.id))) continue;

        const bookingCount = await tx.booking.count({
          where: {
            pickupPointId: existing.id,
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ],
            },
          },
        });

        if (bookingCount > 0) {
          // Không xóa điểm đón đã có booking để không làm mất thông tin booking cũ.
          await tx.tourPickupPoint.update({
            where: { id: existing.id },
            data: { status: "inactive" as any },
          });
          preservedBookedCount += 1;
          continue;
        }

        await tx.tourPickupPoint.delete({ where: { id: existing.id } });
        deletedCount += 1;
      }

      for (const item of normalizedItems) {
        if (item.id) {
          const existing = existingPoints.find(
            (row) => String(row.id) === String(item.id),
          );
          if (!existing) continue;

          await tx.tourPickupPoint.update({
            where: { id: item.id },
            data: {
              departureId: item.departureId,
              name: item.name,
              address: item.address,
              province: item.province,
              pickupTime: item.pickupTime,
              note: item.note,
              status: item.status as any,
            },
          });
          updatedCount += 1;
        } else {
          await tx.tourPickupPoint.create({
            data: {
              tourId: BigInt(tourId),
              departureId: item.departureId,
              name: item.name,
              address: item.address,
              province: item.province,
              pickupTime: item.pickupTime,
              note: item.note,
              status: item.status as any,
            },
          });
          createdCount += 1;
        }
      }
    });

    return {
      message: "Pickup points saved",
      totalItems: normalizedItems.length,
      createdCount,
      updatedCount,
      deletedCount,
      preservedBookedCount,
      note:
        preservedBookedCount > 0
          ? "Một số điểm đón đã có booking nên được giữ lại và chuyển sang tạm ẩn để bảo toàn dữ liệu booking."
          : undefined,
    };
  }

  async saveAccommodations(tourId: number, dto: SaveAccommodationsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.tourAccommodation.deleteMany({
        where: { tourId: BigInt(tourId) },
      });
      for (const item of dto.items) {
        await tx.tourAccommodation.create({
          data: {
            tourId: BigInt(tourId),
            name: item.name,
            accommodationType: item.accommodationType,
            starRating: item.starRating,
            address: item.address,
            description: item.description,
            pricePerNight: item.pricePerNight,
            imageUrl: item.imageUrl,
            amenities: item.amenities,
            status: item.status || "active",
          },
        });
      }
    });
    return { message: "Accommodations saved", totalItems: dto.items.length };
  }

  async saveTransports(tourId: number, dto: SaveTransportsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    await this.prisma.$transaction(async (tx) => {
      await tx.tourTransport.deleteMany({ where: { tourId: BigInt(tourId) } });
      for (const item of dto.items) {
        await tx.tourTransport.create({
          data: {
            tourId: BigInt(tourId),
            name: item.name,
            transportType: item.transportType,
            provider: item.provider,
            origin: item.origin,
            destinationLabel: item.destinationLabel,
            durationHours: item.durationHours,
            price: item.price,
            description: item.description,
            imageUrl: item.imageUrl,
            status: item.status || "active",
          },
        });
      }
    });
    return { message: "Transports saved", totalItems: dto.items.length };
  }

  async publishTour(tourId: number) {
    const existing = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: { media: true, itinerary: true, departures: true },
    });
    if (!existing) throw new NotFoundException("Tour not found");
    if (!existing.media.length)
      throw new BadRequestException(
        "Tour cần ít nhất 1 hình ảnh trước khi publish.",
      );
    if (!existing.itinerary.length)
      throw new BadRequestException(
        "Tour cần có lịch trình trước khi publish.",
      );
    if (!existing.departures.length)
      throw new BadRequestException(
        "Tour cần ít nhất 1 lịch khởi hành trước khi publish.",
      );
    return this.prisma.tour.update({
      where: { id: BigInt(tourId) },
      data: { status: "published" },
    });
  }

  async removeTour(tourId: number) {
    const existing = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: {
        departures: {
          include: {
            bookings: {
              where: {
                bookingStatus: {
                  in: [
                    "pending_payment",
                    "waiting_confirmation",
                    "confirmed",
                    "completed",
                  ],
                },
              },
              take: 5,
              orderBy: { createdAt: "desc" },
            },
          },
          orderBy: { departureDate: "asc" },
        },
        bookings: {
          where: {
            bookingStatus: {
              in: [
                "pending_payment",
                "waiting_confirmation",
                "confirmed",
                "completed",
              ],
            },
          },
          include: {
            payments: {
              where: {
                paymentStatus: {
                  in: ["paid", "waiting_confirmation", "refunded"],
                },
              },
              take: 3,
            },
          },
          take: 10,
        },
        reviews: { take: 1 },
        favorites: { take: 1 },
      },
    });
    if (!existing) throw new NotFoundException("Tour not found");

    const lockedDeparture = existing.departures.find(
      (item) =>
        Number(item.bookedSlots) > 0 ||
        Number(item.heldSlots) > 0 ||
        item.bookings.length > 0,
    );
    if (lockedDeparture) {
      throw new BadRequestException(
        `Tour này còn đợt khởi hành có dữ liệu giữ chỗ/booking (${String(lockedDeparture.departureDate).slice(0, 10)} - ${String(lockedDeparture.endDate).slice(0, 10)}), không được xóa. Hãy chuyển tour sang inactive nếu muốn ẩn khỏi người dùng.`,
      );
    }

    const bookingWithPayment = existing.bookings.find(
      (item) => item.payments.length > 0,
    );
    if (bookingWithPayment) {
      throw new BadRequestException(
        "Tour này đã có booking gắn với thanh toán thực tế hoặc chờ đối soát, không thể xóa cứng. Hãy chuyển sang inactive.",
      );
    }

    if (
      existing.bookings.length > 0 ||
      existing.reviews.length > 0 ||
      existing.favorites.length > 0
    ) {
      throw new BadRequestException(
        "Tour này đã phát sinh lịch sử booking/review/favorite. Không nên xóa cứng để tránh mất dữ liệu nghiệp vụ. Hãy chuyển trạng thái tour sang inactive.",
      );
    }

    return this.prisma.tour.delete({ where: { id: BigInt(tourId) } });
  }
}
