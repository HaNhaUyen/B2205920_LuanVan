import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTourStep1Dto } from "./dto/create-tour-step1.dto";
import { SaveItineraryDto } from "./dto/save-itinerary.dto";
import { SaveDeparturesDto } from "./dto/save-departures.dto";
import { SaveAccommodationsDto } from "./dto/save-accommodations.dto";
import { SaveTransportsDto } from "./dto/save-transports.dto";

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

  findAllPublic() {
    return this.prisma.tour.findMany({
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
      },
      orderBy: [{ isTrending: "desc" }, { createdAt: "desc" }],
    });
  }

  async adminList() {
    return this.prisma.tour.findMany({
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: { orderBy: { departureDate: "asc" }, take: 2 },
        accommodations: { take: 2, orderBy: { createdAt: "asc" } },
        transports: { take: 2, orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
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
      },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    return tour;
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
      },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    return tour;
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

  async uploadMedia(tourId: number, files: Array<Express.Multer.File>) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: { media: true },
    });
    if (!tour) throw new NotFoundException("Tour not found");
    const currentMaxOrder =
      tour.media.reduce((max, item) => Math.max(max, item.displayOrder), 0) ||
      0;
    const created = await Promise.all(
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
    return { message: "Media uploaded", items: created };
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

    const protectedBookings = await this.prisma.booking.count({
      where: {
        tourId: BigInt(tourId),
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
    if (protectedBookings > 0) {
      throw new BadRequestException(
        "Tour này đã có booking còn hiệu lực. Không được ghi đè toàn bộ lịch khởi hành để tránh lệch dữ liệu booking.",
      );
    }

    for (const item of dto.items) {
      const departureDate = new Date(item.departureDate);
      const endDate = new Date(item.endDate);
      if (
        Number.isNaN(departureDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new BadRequestException(
          "Ngày khởi hành hoặc ngày kết thúc không hợp lệ.",
        );
      }
      if (endDate.getTime() < departureDate.getTime()) {
        throw new BadRequestException(
          "Ngày kết thúc không được sớm hơn ngày khởi hành.",
        );
      }
      if (Number(item.childPrice) > Number(item.adultPrice)) {
        throw new BadRequestException(
          "Giá trẻ em của đợt khởi hành không được lớn hơn giá người lớn.",
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.tourDeparture.deleteMany({ where: { tourId: BigInt(tourId) } });
      for (const item of dto.items) {
        await tx.tourDeparture.create({
          data: {
            tourId: BigInt(tourId),
            departureDate: new Date(item.departureDate),
            endDate: new Date(item.endDate),
            adultPrice: item.adultPrice,
            childPrice: item.childPrice,
            totalSlots: item.totalSlots,
            status: item.status as any,
          },
        });
      }
    });
    return { message: "Departures saved", totalItems: dto.items.length };
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
