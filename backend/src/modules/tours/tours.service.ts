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

const VALID_BOOKING_STATUSES = [
  "waiting_confirmation",
  "confirmed",
  "completed",
] as const;

const PAID_PAYMENT_STATUSES = ["paid"] as const;

const FINAL_BOOKING_STATUSES = [
  "completed",
  "cancelled",
  "cancelled_by_customer",
  "cancelled_by_operator",
  "expired",
] as const;

const BEST_SELLER_THRESHOLD = 5;
const FAVORITE_THRESHOLD = 5;

@Injectable()
export class ToursService {
  constructor(private readonly prisma: PrismaService) {}

  private getCurrentMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  }

  private formatDateVi(value: Date | string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || "");
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  private buildDepartureBookingLockMessage(
    departureDate: Date | string,
    bookingCodes: string[] = [],
  ) {
    const uniqueCodes = Array.from(
      new Set(
        bookingCodes.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    );

    const codeText = uniqueCodes.length
      ? ` Booking liên quan: ${uniqueCodes.join(", ")}.`
      : "";

    return (
      `Không thể xóa lịch khởi hành ${this.formatDateVi(departureDate)} ` +
      `vì lịch này đã phát sinh booking. ` +
      "Lịch được giữ lại để bảo toàn lịch sử đặt tour."
    );
  }

  private buildActivePaidBookingLockMessage(
    resourceLabel: string,
    resourceName: string,
    bookingCodes: string[] = [],
  ) {
    const uniqueCodes = Array.from(
      new Set(
        bookingCodes.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    );

    const codeText = uniqueCodes.length
      ? ` Booking liên quan: ${uniqueCodes.join(", ")}.`
      : "";

    return `Không thể xóa ${resourceLabel} "${resourceName}" vì đã phát sinh booking.`;
  }

  private buildActivePaidBookingEditLockMessage(
    resourceLabel: string,
    resourceName: string,
    bookingCodes: string[] = [],
  ) {
    const uniqueCodes = Array.from(
      new Set(
        bookingCodes.map((value) => String(value || "").trim()).filter(Boolean),
      ),
    );
    const codeText = uniqueCodes.length
      ? ` Booking liên quan: ${uniqueCodes.join(", ")}.`
      : "";
    return `Không thể chỉnh sửa ${resourceLabel} "${resourceName}" vì đang có booking đã thanh toán và chuyến đi chưa hoàn thành`;
  }

  private activePaidBookingWhere(tourId: bigint, extraWhere: any = {}) {
    return {
      tourId,
      ...extraWhere,
      bookingStatus: {
        notIn: [...FINAL_BOOKING_STATUSES] as any,
      },
      payments: {
        some: {
          paymentStatus: "paid" as any,
        },
      },
    };
  }

  private async getTourBookingCodes(
    tx: any,
    tourId: bigint,
    extraWhere: any = {},
    take = 20,
  ) {
    const bookings = await tx.booking.findMany({
      where: {
        tourId,
        ...extraWhere,
      },
      select: {
        bookingCode: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take,
    });

    return bookings
      .map((item: any) => String(item.bookingCode || "").trim())
      .filter(Boolean);
  }

  private buildTourStructureBookingLockMessage(bookingCodes: string[] = []) {
    const uniqueCodes = Array.from(new Set(bookingCodes));
    const codeText = uniqueCodes.length
      ? ` Booking liên quan: ${uniqueCodes.join(", ")}.`
      : "";

    return "Không thể thay đổi tên tour, điểm đến, phân loại tour, chủ đề tour hoặc thời lượng tour vì tour đã phát sinh booking. ";
  }

  private buildItineraryBookingLockMessage(bookingCodes: string[] = []) {
    const uniqueCodes = Array.from(new Set(bookingCodes));
    const codeText = uniqueCodes.length
      ? ` Booking liên quan: ${uniqueCodes.join(", ")}.`
      : "";

    return "Không thể thay đổi lịch trình vì tour đã phát sinh booking. ";
  }

  /**
   * Điểm đón được quản lý ở cấp tour và dùng chung cho mọi lịch khởi hành.
   * Gộp các bản ghi trùng nội dung để API không trả lặp trên giao diện đặt tour.
   */
  private dedupePickupPoints(items: any[] = []) {
    const normalize = (value: unknown) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");

    const timeKey = (value: unknown) => {
      if (!value) return "";
      const raw = String(value);
      const iso = raw.match(/T(\d{2}):(\d{2})/);
      if (iso) return `${iso[1]}:${iso[2]}`;
      const direct = raw.match(/^(\d{1,2}):(\d{2})/);
      if (direct) {
        return `${String(direct[1]).padStart(2, "0")}:${direct[2]}`;
      }
      return raw;
    };

    const map = new Map<string, any>();

    for (const item of Array.isArray(items) ? items : []) {
      const key = [
        normalize(item?.province),
        normalize(item?.name),
        normalize(item?.address),
        timeKey(item?.pickupTime),
      ].join("|");

      if (!map.has(key)) {
        map.set(key, {
          ...item,
          // Điểm đón chung cho toàn bộ lịch.
          departureId: null,
        });
      }
    }

    return Array.from(map.values()).sort((first, second) => {
      const firstTime = timeKey(first?.pickupTime);
      const secondTime = timeKey(second?.pickupTime);
      return (
        firstTime.localeCompare(secondTime) ||
        normalize(first?.province).localeCompare(normalize(second?.province)) ||
        normalize(first?.name).localeCompare(normalize(second?.name))
      );
    });
  }

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

  private isValidSellerBooking(booking: any) {
    const bookingStatus = String(booking?.bookingStatus || "");
    const payments = Array.isArray(booking?.payments) ? booking.payments : [];

    return (
      VALID_BOOKING_STATUSES.includes(bookingStatus as any) &&
      payments.some((payment: any) =>
        PAID_PAYMENT_STATUSES.includes(String(payment?.paymentStatus) as any),
      )
    );
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
      ? tour.bookings.filter((booking: any) =>
          this.isValidSellerBooking(booking),
        ).length
      : Number(tour._count?.bookings || 0);
    const favoriteCount = Array.isArray(tour.favorites)
      ? tour.favorites.length
      : Number(tour._count?.favorites || 0);

    const tourPrice = this.getTourPrice(tour);
    const destinationAveragePrice = Number(
      context.destinationAveragePrice || 0,
    );
    const pickupPoints = this.dedupePickupPoints(
      Array.isArray(tour.pickupPoints) ? tour.pickupPoints : [],
    );

    const normalizedDepartures = departures.map((departure: any) => ({
      ...departure,
      // Điểm đón là dữ liệu cấp tour, không nhân bản theo từng lịch.
      pickupPoints,
    }));

    return {
      ...tour,
      pickupPoints,
      departures: normalizedDepartures,
      nextDeparture: nextDeparture
        ? {
            ...nextDeparture,
            pickupPoints,
          }
        : null,
      remainingSlots,
      bookingCount,
      favoriteCount,
      destinationAveragePrice,
      dynamicIsBestSeller: bookingCount >= BEST_SELLER_THRESHOLD,
      dynamicIsFavorite: favoriteCount >= FAVORITE_THRESHOLD,
      labelPriority: {
        bestSeller: 1,
        favorite: 2,
      },
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

  private normalizeTourName(value: unknown) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  private async ensureUniqueTourNameAtDestination(
    destinationId: number,
    name: string,
    currentTourId?: bigint,
  ) {
    const toursAtDestination = await this.prisma.tour.findMany({
      where: {
        destinationId: BigInt(destinationId),
        ...(currentTourId ? { NOT: { id: currentTourId } } : {}),
      },
      select: { id: true, name: true },
    });

    const normalizedName = this.normalizeTourName(name);
    const duplicated = toursAtDestination.some(
      (tour) => this.normalizeTourName(tour.name) === normalizedName,
    );

    if (duplicated) {
      throw new BadRequestException(
        "Tên tour này đã tồn tại tại cùng điểm đến. Vui lòng đặt tên khác.",
      );
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
        pickupPoints: {
          where: { status: "active" },
          orderBy: [
            { departureId: "asc" },
            { pickupTime: "asc" },
            { province: "asc" },
            { name: "asc" },
          ],
        },
        reviews: { where: { status: "approved" }, select: { rating: true } },
        bookings: {
          where: {
            bookingStatus: {
              in: [...VALID_BOOKING_STATUSES],
            },
            payments: {
              some: {
                paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
              },
            },
          },
          select: {
            id: true,
            bookingStatus: true,
            payments: { select: { paymentStatus: true } },
          },
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

  async adminTourOptions() {
    const tours = await this.prisma.tour.findMany({
      where: { status: { in: ["published", "draft", "inactive"] as any } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return tours.map((tour) => ({
      id: String(tour.id),
      name: tour.name,
    }));
  }

  async adminTourDepartureOptions(tourId: number) {
    const departures = await this.prisma.tourDeparture.findMany({
      where: { tourId: BigInt(tourId) },
      select: {
        id: true,
        departureDate: true,
        endDate: true,
        status: true,
        bookedSlots: true,
        heldSlots: true,
        totalSlots: true,
      },
      orderBy: { departureDate: "asc" },
      take: 200,
    });

    return departures.map((departure) => ({
      id: String(departure.id),
      departureDate: departure.departureDate,
      endDate: departure.endDate,
      status: departure.status,
      bookedSlots: departure.bookedSlots,
      heldSlots: departure.heldSlots,
      totalSlots: departure.totalSlots,
    }));
  }

  async findById(tourId: number) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: {
        destination: true,
        media: {
          orderBy: [
            {
              isCover: "desc",
            },
            {
              displayOrder: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
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
              in: [...VALID_BOOKING_STATUSES],
            },
            payments: {
              some: {
                paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
              },
            },
          },
          select: {
            id: true,
            bookingStatus: true,
            payments: { select: { paymentStatus: true } },
          },
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
        media: {
          orderBy: [
            {
              isCover: "desc",
            },
            {
              displayOrder: "asc",
            },
            {
              id: "asc",
            },
          ],
        },
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
              in: [...VALID_BOOKING_STATUSES],
            },
            payments: {
              some: {
                paymentStatus: { in: [...PAID_PAYMENT_STATUSES] },
              },
            },
          },
          select: {
            id: true,
            bookingStatus: true,
            payments: { select: { paymentStatus: true } },
          },
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

  async findPickupPoints(tourId: number, _departureId?: number) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });
    if (!tour) throw new NotFoundException("Tour not found");

    const items = await this.prisma.tourPickupPoint.findMany({
      where: {
        tourId: BigInt(tourId),
        status: "active",
        // Điểm đón dùng chung cho tất cả lịch khởi hành.
        departureId: null,
      },
      orderBy: [{ pickupTime: "asc" }, { province: "asc" }, { name: "asc" }],
    });

    return this.dedupePickupPoints(items);
  }

  /**
   * Trả về các dữ liệu đã từng được lưu trong CSDL để quản trị viên
   * có thể tái sử dụng khi tạo/chỉnh sửa tour khác.
   *
   * Không cần tạo thêm bảng catalog:
   * - Điểm đón lấy từ tour_pickup_points.
   * - Lưu trú lấy từ tour_accommodations.
   * - Phương tiện lấy từ tour_transports.
   *
   * Các dòng trùng nội dung được gộp lại trước khi trả về frontend.
   */
  async getReusableCatalogs() {
    const [pickupRows, accommodationRows, transportRows] = await Promise.all([
      this.prisma.tourPickupPoint.findMany({
        where: { status: "active" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.tourAccommodation.findMany({
        where: { status: "active" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.tourTransport.findMany({
        where: { status: "active" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);

    const normalizeKey = (...parts: unknown[]) =>
      parts
        .map((value) =>
          String(value || "")
            .trim()
            .toLocaleLowerCase("vi"),
        )
        .join("|");

    const uniqueBy = <T>(items: T[], keyOf: (item: T) => string) => {
      const map = new Map<string, T>();

      for (const item of items) {
        const key = keyOf(item);
        if (!key || map.has(key)) continue;
        map.set(key, item);
      }

      return Array.from(map.values());
    };

    const pickupPoints = uniqueBy(
      pickupRows.map((item) => ({
        id: item.id.toString(),
        province: item.province || "",
        name: item.name || "",
        address: item.address || "",
        pickupTime: item.pickupTime,
        note: item.note || "",
        status: item.status,
      })),
      (item) => normalizeKey(item.name, item.address, item.province),
    );

    const accommodations = uniqueBy(
      accommodationRows
        .filter((item) => String(item.name || "").trim())
        .map((item) => ({
          id: item.id.toString(),
          supplierId: item.supplierId?.toString() || "",
          name: item.name || "",
          accommodationType: item.accommodationType,
          starRating: item.starRating,
          address: item.address || "",
          description: item.description || "",
          pricePerNight: item.pricePerNight,
          imageUrl: item.imageUrl || "",
          amenities: item.amenities || "",
          status: item.status,
        })),
      (item) => normalizeKey(item.name, item.address),
    );

    const transports = uniqueBy(
      transportRows
        .filter((item) => String(item.name || "").trim())
        .map((item) => ({
          id: item.id.toString(),
          supplierId: item.supplierId?.toString() || "",
          name: item.name || "",
          transportType: item.transportType,
          provider: item.provider || "",
          origin: item.origin || "",
          destinationLabel: item.destinationLabel || "",
          durationHours: item.durationHours,
          price: item.price,
          description: item.description || "",
          imageUrl: item.imageUrl || "",
          status: item.status,
        })),
      (item) =>
        normalizeKey(
          item.name,
          item.provider,
          item.origin,
          item.destinationLabel,
        ),
    );

    return {
      pickupPoints,
      accommodations,
      transports,
    };
  }

  async createStep1(dto: CreateTourStep1Dto) {
    this.validateStep1BusinessRules(dto);
    await this.ensureUniqueTourNameAtDestination(
      Number(dto.destinationId),
      dto.name,
    );
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

    const changedProtectedStructure =
      this.normalizeTourName(existing.name) !==
        this.normalizeTourName(dto.name) ||
      String(existing.destinationId) !== String(dto.destinationId) ||
      String(existing.tourType || "") !== String(dto.tourType || "") ||
      String(existing.tourTheme || "") !== String(dto.tourTheme || "") ||
      Number(existing.durationDays) !== Number(dto.durationDays) ||
      Number(existing.durationNights) !== Number(dto.durationNights);

    if (changedProtectedStructure) {
      const bookingCodes = await this.getTourBookingCodes(
        this.prisma,
        existing.id,
      );

      if (bookingCodes.length > 0) {
        throw new BadRequestException(
          this.buildTourStructureBookingLockMessage(bookingCodes),
        );
      }
    }

    const changedNameOrDestination =
      this.normalizeTourName(existing.name) !==
        this.normalizeTourName(dto.name) ||
      String(existing.destinationId) !== String(dto.destinationId);

    if (changedNameOrDestination) {
      await this.ensureUniqueTourNameAtDestination(
        Number(dto.destinationId),
        dto.name,
        existing.id,
      );
    }

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
      orderBy: [{ isCover: "desc" }, { displayOrder: "asc" }, { id: "asc" }],
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
      // Bỏ cover cũ.
      await tx.tourMedia.updateMany({
        where: {
          tourId: BigInt(tourId),
        },
        data: {
          isCover: false,
        },
      });

      // Đặt ảnh mới làm cover và đưa lên vị trí đầu tiên.
      await tx.tourMedia.update({
        where: {
          id: BigInt(mediaId),
        },
        data: {
          isCover: true,
          displayOrder: 1,
        },
      });

      // Sắp lại các ảnh còn lại từ vị trí số 2.
      const remainingMedia = await tx.tourMedia.findMany({
        where: {
          tourId: BigInt(tourId),
          id: {
            not: BigInt(mediaId),
          },
        },
        orderBy: [
          {
            displayOrder: "asc",
          },
          {
            id: "asc",
          },
        ],
      });

      for (let index = 0; index < remainingMedia.length; index += 1) {
        await tx.tourMedia.update({
          where: {
            id: remainingMedia[index].id,
          },
          data: {
            displayOrder: index + 2,
          },
        });
      }

      // Cập nhật tour để frontend có version mới, tránh cache ảnh cũ.
      await tx.tour.update({
        where: {
          id: BigInt(tourId),
        },
        data: {
          updatedAt: new Date(),
        },
      });
    });

    const items = await this.prisma.tourMedia.findMany({
      where: {
        tourId: BigInt(tourId),
      },
      orderBy: [
        {
          isCover: "desc",
        },
        {
          displayOrder: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    return {
      message: "Đã đặt ảnh bìa cho tour.",
      coverMediaId: String(mediaId),
      items: items.map((item) => this.mapTourMediaItem(item)),
    };
  }

  async saveItinerary(tourId: number, dto: SaveItineraryDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
    });
    if (!tour) throw new NotFoundException("Tour not found");

    const existingItinerary = await this.prisma.tourItinerary.findMany({
      where: { tourId: BigInt(tourId) },
      orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }, { id: "asc" }],
    });

    const normalizeText = (value: unknown) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim();

    /*
     * Chỉ xem là thay đổi lịch trình khi nội dung/thứ tự thực tế thay đổi.
     *
     * Frontend có thể đánh lại itemOrder khi mở form theo từng ngày.
     * Nếu dùng itemOrder để so sánh trực tiếp thì một lịch trình không hề
     * thay đổi nội dung vẫn có thể bị hiểu nhầm là đã sửa, làm endpoint
     * itinerary báo lỗi trước điểm đón/chỗ ở/phương tiện.
     *
     * existingItinerary đã được query theo dayNumber -> itemOrder -> id,
     * còn dto.items giữ đúng thứ tự đang hiển thị trên form, nên chỉ cần
     * so sánh nội dung theo thứ tự mảng thực tế.
     */
    const currentComparable = existingItinerary.map((item) => ({
      dayNumber: Number(item.dayNumber),
      title: normalizeText(item.title),
      description: normalizeText(item.description),
      locationName: normalizeText(item.locationName),
    }));

    const incomingComparable = (dto.items || []).map((item) => ({
      dayNumber: Number(item.dayNumber),
      title: normalizeText(item.title),
      description: normalizeText(item.description),
      locationName: normalizeText(item.locationName),
    }));

    const itineraryChanged =
      JSON.stringify(currentComparable) !== JSON.stringify(incomingComparable);

    if (itineraryChanged) {
      const bookingCodes = await this.getTourBookingCodes(
        this.prisma,
        BigInt(tourId),
      );

      if (bookingCodes.length > 0) {
        throw new BadRequestException(
          this.buildItineraryBookingLockMessage(bookingCodes),
        );
      }
    }

    if (!itineraryChanged) {
      return {
        message: "Itinerary unchanged",
        totalItems: dto.items.length,
      };
    }

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

  async checkPickupPointDeletion(tourId: number, pickupPointId: number) {
    const point = await this.prisma.tourPickupPoint.findFirst({
      where: {
        id: BigInt(pickupPointId),
        tourId: BigInt(tourId),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!point) {
      throw new NotFoundException("Không tìm thấy điểm đón thuộc tour này.");
    }

    const blockingBookingCodes = await this.getTourBookingCodes(
      this.prisma,
      BigInt(tourId),
      {
        pickupPointId: point.id,
      },
    );

    if (blockingBookingCodes.length > 0) {
      throw new BadRequestException(
        this.buildActivePaidBookingLockMessage(
          "điểm đón",
          point.name,
          blockingBookingCodes,
        ),
      );
    }

    return {
      canDelete: true,
      id: String(point.id),
      message: "Điểm đón chưa phát sinh booking và có thể xóa.",
    };
  }

  async checkAccommodationDeletion(tourId: number, accommodationId: number) {
    const accommodation = await this.prisma.tourAccommodation.findFirst({
      where: {
        id: BigInt(accommodationId),
        tourId: BigInt(tourId),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!accommodation) {
      throw new NotFoundException("Không tìm thấy chỗ ở thuộc tour này.");
    }

    /*
     * Booking không lưu accommodationId riêng.
     * Chỗ ở là dịch vụ cấp tour nên chỉ cần tour còn một booking đã thanh toán
     * và chưa hoàn thành/hủy thì không cho xóa bất kỳ chỗ ở đang dùng nào.
     */
    const blockingBookingCodes = await this.getTourBookingCodes(
      this.prisma,
      BigInt(tourId),
    );

    if (blockingBookingCodes.length > 0) {
      throw new BadRequestException(
        this.buildActivePaidBookingLockMessage(
          "chỗ ở",
          accommodation.name,
          blockingBookingCodes,
        ),
      );
    }

    return {
      canDelete: true,
      id: String(accommodation.id),
      message: "Chỗ ở chưa phát sinh booking và có thể xóa.",
    };
  }

  async checkTransportDeletion(tourId: number, transportId: number) {
    const transport = await this.prisma.tourTransport.findFirst({
      where: {
        id: BigInt(transportId),
        tourId: BigInt(tourId),
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!transport) {
      throw new NotFoundException("Không tìm thấy phương tiện thuộc tour này.");
    }

    /*
     * Booking không lưu transportId riêng.
     * Phương tiện là dịch vụ cấp tour nên khóa xóa theo booking đã thanh toán
     * chưa ở trạng thái kết thúc.
     */
    const blockingBookingCodes = await this.getTourBookingCodes(
      this.prisma,
      BigInt(tourId),
    );

    if (blockingBookingCodes.length > 0) {
      throw new BadRequestException(
        this.buildActivePaidBookingLockMessage(
          "phương tiện",
          transport.name,
          blockingBookingCodes,
        ),
      );
    }

    return {
      canDelete: true,
      id: String(transport.id),
      message: "Phương tiện chưa phát sinh booking và có thể xóa.",
    };
  }

  async checkDepartureDeletion(tourId: number, departureId: number) {
    if (
      !tourId ||
      Number.isNaN(tourId) ||
      !departureId ||
      Number.isNaN(departureId)
    ) {
      throw new BadRequestException(
        "Mã tour hoặc mã lịch khởi hành không hợp lệ.",
      );
    }

    const departure = await this.prisma.tourDeparture.findFirst({
      where: {
        id: BigInt(departureId),
        tourId: BigInt(tourId),
      },
      select: {
        id: true,
        departureDate: true,
        bookings: {
          select: {
            bookingCode: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
      },
    });

    if (!departure) {
      throw new NotFoundException(
        "Không tìm thấy lịch khởi hành thuộc tour này.",
      );
    }

    if (departure.bookings.length > 0) {
      throw new BadRequestException(
        this.buildDepartureBookingLockMessage(
          departure.departureDate,
          departure.bookings.map((item) => item.bookingCode),
        ),
      );
    }

    const [
      tripOperationCount,
      electronicTicketCount,
      oldDepartureChangeCount,
      newDepartureChangeCount,
      operationalAlertCount,
    ] = await Promise.all([
      this.prisma.tripOperation.count({
        where: { departureId: departure.id },
      }),
      this.prisma.electronicTicket.count({
        where: { departureId: departure.id },
      }),
      this.prisma.departureChangeRequest.count({
        where: { oldDepartureId: departure.id },
      }),
      this.prisma.departureChangeRequest.count({
        where: { newDepartureId: departure.id },
      }),
      this.prisma.operationalAlert.count({
        where: { departureId: departure.id },
      }),
    ]);

    const hasOperationalData =
      tripOperationCount > 0 ||
      electronicTicketCount > 0 ||
      oldDepartureChangeCount > 0 ||
      newDepartureChangeCount > 0 ||
      operationalAlertCount > 0;

    if (hasOperationalData) {
      throw new BadRequestException(
        `Không thể xóa lịch khởi hành ${this.formatDateVi(
          departure.departureDate,
        )} vì lịch đã phát sinh dữ liệu vận hành. Lịch cần được giữ lại để bảo toàn lịch sử.`,
      );
    }

    return {
      canDelete: true,
      departureId: String(departure.id),
      departureDate: departure.departureDate,
      message:
        "Lịch khởi hành chưa có booking hoặc dữ liệu vận hành và có thể xóa.",
    };
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
      if (!item.id) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOnly = new Date(item.departureDate);
        startOnly.setHours(0, 0, 0, 0);
        if (startOnly.getTime() < today.getTime()) {
          throw new BadRequestException(
            "Ngày khởi hành mới không được nằm trong quá khứ.",
          );
        }
      }
      if (item.adultPrice < 0 || item.childPrice < 0) {
        throw new BadRequestException(
          "Giá áp dụng của lịch khởi hành không được là số âm.",
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

    /*
     * Không cho một tour có hai lịch khởi hành trùng CHÍNH XÁC
     * cả ngày đi và ngày về.
     *
     * Ví dụ tour đã có 01/09 - 02/09:
     * - thêm mới 01/09 - 02/09 => chặn;
     * - sửa một lịch khác thành 01/09 - 02/09 => chặn;
     * - sửa chính lịch 01/09 - 02/09 và giữ nguyên ngày => hợp lệ.
     *
     * Chỉ kiểm tra trùng chính xác theo yêu cầu, không thay đổi các
     * nghiệp vụ ngày/lịch khác đang có.
     */
    const toDateOnlyKey = (value: Date | string) => {
      const date = value instanceof Date ? new Date(value) : new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    };

    // Chặn trùng ngay giữa các dòng đang có trên form.
    for (
      let firstIndex = 0;
      firstIndex < normalizedItems.length;
      firstIndex += 1
    ) {
      const first = normalizedItems[firstIndex];

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < normalizedItems.length;
        secondIndex += 1
      ) {
        const second = normalizedItems[secondIndex];

        const sameRange =
          toDateOnlyKey(first.departureDate) ===
            toDateOnlyKey(second.departureDate) &&
          toDateOnlyKey(first.endDate) === toDateOnlyKey(second.endDate);

        if (sameRange) {
          throw new BadRequestException(
            `Không thể lưu vì lịch khởi hành ${this.formatDateVi(
              first.departureDate,
            )} - ${this.formatDateVi(
              first.endDate,
            )} đã được khai báo trùng trong tour này.`,
          );
        }
      }
    }

    // Chặn lịch mới / lịch khác sửa thành đúng khoảng ngày đã tồn tại trong DB.
    for (const item of normalizedItems) {
      const duplicated = existingDepartures.find((existing) => {
        // Khi sửa chính record đó, giữ nguyên ngày của nó thì không coi là trùng.
        if (item.id && String(existing.id) === String(item.id)) {
          return false;
        }

        return (
          toDateOnlyKey(existing.departureDate) ===
            toDateOnlyKey(item.departureDate) &&
          toDateOnlyKey(existing.endDate) === toDateOnlyKey(item.endDate)
        );
      });

      if (duplicated) {
        throw new BadRequestException(
          `Không thể lưu lịch ${this.formatDateVi(
            item.departureDate,
          )} - ${this.formatDateVi(
            item.endDate,
          )} vì tour này đã có lịch khởi hành đúng khoảng ngày đó.`,
        );
      }
    }

    /*
     * Chỉ quản lý xóa đối với lịch từ tháng hiện tại trở về sau.
     * Các lịch thuộc tháng trước đã bị ẩn khỏi form admin nên dù không được
     * frontend gửi lại, backend vẫn phải giữ nguyên, tuyệt đối không xem đó
     * là yêu cầu xóa.
     */
    const currentMonthStart = this.getCurrentMonthStart();

    const keptIncomingIds = new Set(
      normalizedItems.filter((item) => item.id).map((item) => String(item.id)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let preservedBookedCount = 0;
    let deletedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const existing of existingDepartures) {
        if (keptIncomingIds.has(String(existing.id))) {
          continue;
        }

        /*
         * Lịch thuộc tháng trước chỉ bị ẩn trên giao diện.
         * Vì frontend không gửi các lịch ẩn này về nên phải bỏ qua hoàn toàn,
         * không xóa và cũng không đổi trạng thái.
         */
        const existingDate = new Date(existing.departureDate);
        existingDate.setHours(0, 0, 0, 0);

        if (existingDate.getTime() < currentMonthStart.getTime()) {
          continue;
        }

        /*
         * Lịch từ tháng hiện tại trở đi mà bị bỏ khỏi payload được hiểu là
         * Admin muốn xóa. Nếu đã có BẤT KỲ booking nào thì chặn ngay và trả
         * bookingCode để frontend hiển thị cho Admin.
         */
        const relatedBookings = await tx.booking.findMany({
          where: {
            departureId: existing.id,
          },
          select: {
            bookingCode: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        });

        if (relatedBookings.length > 0) {
          throw new BadRequestException(
            this.buildDepartureBookingLockMessage(
              existing.departureDate,
              relatedBookings.map((item) => item.bookingCode),
            ),
          );
        }

        const tripOperationCount = await tx.tripOperation.count({
          where: {
            departureId: existing.id,
          },
        });

        const electronicTicketCount = await tx.electronicTicket.count({
          where: {
            departureId: existing.id,
          },
        });

        const oldDepartureChangeCount = await tx.departureChangeRequest.count({
          where: {
            oldDepartureId: existing.id,
          },
        });

        const newDepartureChangeCount = await tx.departureChangeRequest.count({
          where: {
            newDepartureId: existing.id,
          },
        });

        const operationalAlertCount = await tx.operationalAlert.count({
          where: {
            departureId: existing.id,
          },
        });

        const hasOperationalData =
          tripOperationCount > 0 ||
          electronicTicketCount > 0 ||
          oldDepartureChangeCount > 0 ||
          newDepartureChangeCount > 0 ||
          operationalAlertCount > 0;

        if (hasOperationalData) {
          throw new BadRequestException(
            `Không thể xóa lịch khởi hành ${this.formatDateVi(
              existing.departureDate,
            )} vì lịch đã phát sinh dữ liệu vận hành. Lịch cần được giữ lại để bảo toàn lịch sử.`,
          );
        }

        await tx.tourDeparture.delete({
          where: {
            id: existing.id,
          },
        });

        deletedCount += 1;
      }

      for (const item of normalizedItems) {
        if (item.id) {
          const existing = existingDepartures.find(
            (row) => String(row.id) === String(item.id),
          );
          if (!existing) continue;

          const relatedBookingCodes = await this.getTourBookingCodes(
            tx,
            BigInt(tourId),
            {
              departureId: existing.id,
            },
          );

          const existingDepartureDateForLock = new Date(existing.departureDate);
          const existingEndDateForLock = new Date(existing.endDate);
          const incomingDepartureDateForLock = new Date(item.departureDate);
          const incomingEndDateForLock = new Date(item.endDate);
          existingDepartureDateForLock.setHours(0, 0, 0, 0);
          existingEndDateForLock.setHours(0, 0, 0, 0);
          incomingDepartureDateForLock.setHours(0, 0, 0, 0);
          incomingEndDateForLock.setHours(0, 0, 0, 0);

          const changedDeparture =
            existingDepartureDateForLock.getTime() !==
              incomingDepartureDateForLock.getTime() ||
            existingEndDateForLock.getTime() !==
              incomingEndDateForLock.getTime() ||
            Number(existing.adultPrice || 0) !== Number(item.adultPrice || 0) ||
            Number(existing.childPrice || 0) !== Number(item.childPrice || 0) ||
            Number(existing.totalSlots || 0) !== Number(item.totalSlots || 0) ||
            String(existing.status || "") !== String(item.status || "");

          if (relatedBookingCodes.length > 0) {
            if (changedDeparture) {
              throw new BadRequestException(
                this.buildActivePaidBookingEditLockMessage(
                  "lịch khởi hành",
                  `${this.formatDateVi(existing.departureDate)} - ${this.formatDateVi(existing.endDate)}`,
                  relatedBookingCodes,
                ).replace(
                  "đang có booking đã thanh toán và chuyến đi chưa hoàn thành",
                  "lịch này đã phát sinh booking",
                ),
              );
            }

            // Payload không thay đổi: giữ nguyên record để save toàn wizard
            // vẫn thành công khi Admin chỉ thêm tài nguyên/lịch mới.
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

  private getPickupTimeKey(value: unknown) {
    if (!value) return "";

    const raw = String(value).trim();

    // Giá trị từ frontend: HH:mm hoặc HH:mm:ss.
    const direct = raw.match(/^(\d{1,2}):(\d{2})/);
    if (direct) {
      return `${String(direct[1]).padStart(2, "0")}:${direct[2]}`;
    }

    // Giá trị TIME do Prisma/MySQL trả về thường ở dạng ISO.
    const iso = raw.match(/T(\d{2}):(\d{2})/);
    if (iso) {
      return `${iso[1]}:${iso[2]}`;
    }

    // Fallback chỉ dùng phần giờ-phút UTC của Date đã parse.
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(
        parsed.getUTCMinutes(),
      ).padStart(2, "0")}`;
    }

    return raw;
  }

  async savePickupPoints(tourId: number, dto: SavePickupPointsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      include: { departures: true },
    });
    if (!tour) throw new NotFoundException("Tour not found");

    const normalizedItemsRaw = (dto.items || [])
      .filter((item) => item.name?.trim())
      .map((item: any) => {
        // Điểm đón thuộc cấp tour và áp dụng cho toàn bộ lịch khởi hành.
        // Không lưu departureId riêng cho từng lịch.
        const departureId = null;

        return {
          id: item.id ? BigInt(item.id) : null,
          departureId,
          name: String(item.name || "").trim(),
          address: String(
            item.address || item.name || item.province || "",
          ).trim(),
          province: String(
            item.province || item.address || "Chưa cập nhật",
          ).trim(),
          pickupTime: this.normalizePickupTime(item.pickupTime),
          pickupTimeKey: this.getPickupTimeKey(item.pickupTime),
          note: item.note?.trim() || null,
          status: item.status || "active",
        };
      });

    const normalizedItems = this.dedupePickupPoints(normalizedItemsRaw);

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

        const blockingBookingCodes = await this.getTourBookingCodes(
          tx,
          BigInt(tourId),
          {
            pickupPointId: existing.id,
          },
        );

        if (blockingBookingCodes.length > 0) {
          throw new BadRequestException(
            this.buildActivePaidBookingLockMessage(
              "điểm đón",
              existing.name,
              blockingBookingCodes,
            ),
          );
        }

        /*
         * Booking đã hoàn thành/đã hủy hoặc booking chưa thanh toán được phép
         * bỏ liên kết tới điểm đón. Booking vẫn giữ snapshot pickupName,
         * pickupAddress, pickupTime, pickupNote nên lịch sử không mất.
         */
        await tx.booking.updateMany({
          where: {
            pickupPointId: existing.id,
          },
          data: {
            pickupPointId: null,
          },
        });

        await tx.tourPickupPoint.delete({ where: { id: existing.id } });
        deletedCount += 1;
      }

      for (const item of normalizedItems) {
        if (item.id) {
          const existing = existingPoints.find(
            (row) => String(row.id) === String(item.id),
          );
          if (!existing) continue;

          const blockingBookingCodes = await this.getTourBookingCodes(
            tx,
            BigInt(tourId),
            {
              pickupPointId: existing.id,
            },
          );

          const changedPickupPoint =
            String(existing.name || "") !== String(item.name || "") ||
            String(existing.address || "") !== String(item.address || "") ||
            String(existing.province || "") !== String(item.province || "") ||
            this.getPickupTimeKey(existing.pickupTime) !==
              String(item.pickupTimeKey || "") ||
            String(existing.note || "") !== String(item.note || "") ||
            String(existing.status || "") !== String(item.status || "");

          if (blockingBookingCodes.length > 0 && changedPickupPoint) {
            throw new BadRequestException(
              this.buildActivePaidBookingEditLockMessage(
                "điểm đón",
                item.name,
                blockingBookingCodes,
              ).replace(
                "đang có booking đã thanh toán và chuyến đi chưa hoàn thành",
                "điểm đón này đã được sử dụng trong booking",
              ),
            );
          }

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
      note: undefined,
    };
  }

  async saveAccommodations(tourId: number, dto: SaveAccommodationsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });

    if (!tour) {
      throw new NotFoundException("Tour not found");
    }

    const validItems = (dto.items || [])
      .filter((item) => String(item.name || "").trim())
      .map((item) => ({
        ...item,
        id: item.id ? BigInt(item.id) : null,
        name: String(item.name || "").trim(),
      }));

    for (const item of validItems) {
      if (item.supplierId) {
        const supplier = await this.prisma.supplier.findUnique({
          where: {
            id: BigInt(item.supplierId),
          },
        });

        if (!supplier) {
          throw new BadRequestException(
            `Nhà cung cấp lưu trú mã ${item.supplierId} không tồn tại.`,
          );
        }
      }
    }

    const existingItems = await this.prisma.tourAccommodation.findMany({
      where: {
        tourId: BigInt(tourId),
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const existingIdSet = new Set(existingItems.map((item) => String(item.id)));

    for (const item of validItems) {
      if (item.id && !existingIdSet.has(String(item.id))) {
        throw new BadRequestException(
          `Chỗ ở mã ${String(item.id)} không thuộc tour này.`,
        );
      }
    }

    const incomingIds = new Set(
      validItems.filter((item) => item.id).map((item) => String(item.id)),
    );
    const removedItems = existingItems.filter(
      (item) => !incomingIds.has(String(item.id)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (removedItems.length > 0) {
        const blockingBookingCodes = await this.getTourBookingCodes(
          tx,
          BigInt(tourId),
        );

        if (blockingBookingCodes.length > 0) {
          throw new BadRequestException(
            this.buildActivePaidBookingLockMessage(
              "chỗ ở",
              removedItems.map((item) => item.name).join(", "),
              blockingBookingCodes,
            ),
          );
        }

        await tx.tourAccommodation.deleteMany({
          where: {
            id: {
              in: removedItems.map((item) => item.id),
            },
            tourId: BigInt(tourId),
          },
        });
        deletedCount = removedItems.length;
      }

      for (const item of validItems) {
        const data = {
          supplierId: item.supplierId ? BigInt(item.supplierId) : null,
          name: item.name,
          accommodationType: item.accommodationType as any,
          starRating: item.starRating,
          address: item.address,
          description: item.description,
          pricePerNight: item.pricePerNight,
          imageUrl: item.imageUrl,
          amenities: item.amenities,
          status: (item.status || "active") as any,
        };

        if (item.id) {
          const existing = existingItems.find(
            (row) => String(row.id) === String(item.id),
          );

          if (existing) {
            const blockingBookingCodes = await this.getTourBookingCodes(
              tx,
              BigInt(tourId),
            );

            const changedAccommodation =
              String(existing.supplierId || "") !==
                String(item.supplierId || "") ||
              String(existing.name || "") !== String(item.name || "") ||
              String(existing.accommodationType || "") !==
                String(item.accommodationType || "") ||
              Number(existing.starRating || 0) !==
                Number(item.starRating || 0) ||
              String(existing.address || "") !== String(item.address || "") ||
              String(existing.description || "") !==
                String(item.description || "") ||
              Number(existing.pricePerNight || 0) !==
                Number(item.pricePerNight || 0) ||
              String(existing.imageUrl || "") !== String(item.imageUrl || "") ||
              String(existing.amenities || "") !==
                String(item.amenities || "") ||
              String(existing.status || "") !== String(item.status || "active");

            if (blockingBookingCodes.length > 0 && changedAccommodation) {
              throw new BadRequestException(
                this.buildActivePaidBookingEditLockMessage(
                  "chỗ ở",
                  existing.name,
                  blockingBookingCodes,
                ).replace(
                  "đang có booking đã thanh toán và chuyến đi chưa hoàn thành",
                  "tour này đã phát sinh booking",
                ),
              );
            }
          }

          await tx.tourAccommodation.update({
            where: {
              id: item.id,
            },
            data,
          });
          updatedCount += 1;
        } else {
          await tx.tourAccommodation.create({
            data: {
              tourId: BigInt(tourId),
              ...data,
            },
          });
          createdCount += 1;
        }
      }
    });

    return {
      message: "Accommodations saved",
      totalItems: validItems.length,
      createdCount,
      updatedCount,
      deletedCount,
    };
  }

  async saveTransports(tourId: number, dto: SaveTransportsDto) {
    const tour = await this.prisma.tour.findUnique({
      where: {
        id: BigInt(tourId),
      },
      select: { id: true },
    });

    if (!tour) {
      throw new NotFoundException("Tour not found");
    }

    const validItems = (dto.items || [])
      .filter((item) => String(item.name || "").trim())
      .map((item) => ({
        ...item,
        id: item.id ? BigInt(item.id) : null,
        name: String(item.name || "").trim(),
      }));

    for (const item of validItems) {
      if (item.supplierId) {
        const supplier = await this.prisma.supplier.findUnique({
          where: {
            id: BigInt(item.supplierId),
          },
        });

        if (!supplier) {
          throw new BadRequestException(
            `Nhà cung cấp vận chuyển mã ${item.supplierId} không tồn tại.`,
          );
        }
      }
    }

    const existingItems = await this.prisma.tourTransport.findMany({
      where: {
        tourId: BigInt(tourId),
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const existingIdSet = new Set(existingItems.map((item) => String(item.id)));

    for (const item of validItems) {
      if (item.id && !existingIdSet.has(String(item.id))) {
        throw new BadRequestException(
          `Phương tiện mã ${String(item.id)} không thuộc tour này.`,
        );
      }
    }

    const incomingIds = new Set(
      validItems.filter((item) => item.id).map((item) => String(item.id)),
    );
    const removedItems = existingItems.filter(
      (item) => !incomingIds.has(String(item.id)),
    );

    let createdCount = 0;
    let updatedCount = 0;
    let deletedCount = 0;

    await this.prisma.$transaction(async (tx) => {
      if (removedItems.length > 0) {
        const blockingBookingCodes = await this.getTourBookingCodes(
          tx,
          BigInt(tourId),
        );

        if (blockingBookingCodes.length > 0) {
          throw new BadRequestException(
            this.buildActivePaidBookingLockMessage(
              "phương tiện",
              removedItems.map((item) => item.name).join(", "),
              blockingBookingCodes,
            ),
          );
        }

        await tx.tourTransport.deleteMany({
          where: {
            id: {
              in: removedItems.map((item) => item.id),
            },
            tourId: BigInt(tourId),
          },
        });
        deletedCount = removedItems.length;
      }

      for (const item of validItems) {
        const data = {
          supplierId: item.supplierId ? BigInt(item.supplierId) : null,
          name: item.name,
          transportType: item.transportType as any,
          provider: item.provider,
          origin: item.origin,
          destinationLabel: item.destinationLabel,
          durationHours: item.durationHours,
          price: item.price,
          description: item.description,
          imageUrl: item.imageUrl,
          status: (item.status || "active") as any,
        };

        if (item.id) {
          const existing = existingItems.find(
            (row) => String(row.id) === String(item.id),
          );

          if (existing) {
            const blockingBookingCodes = await this.getTourBookingCodes(
              tx,
              BigInt(tourId),
            );

            const changedTransport =
              String(existing.supplierId || "") !==
                String(item.supplierId || "") ||
              String(existing.name || "") !== String(item.name || "") ||
              String(existing.transportType || "") !==
                String(item.transportType || "") ||
              String(existing.provider || "") !== String(item.provider || "") ||
              String(existing.origin || "") !== String(item.origin || "") ||
              String(existing.destinationLabel || "") !==
                String(item.destinationLabel || "") ||
              Number(existing.durationHours || 0) !==
                Number(item.durationHours || 0) ||
              Number(existing.price || 0) !== Number(item.price || 0) ||
              String(existing.description || "") !==
                String(item.description || "") ||
              String(existing.imageUrl || "") !== String(item.imageUrl || "") ||
              String(existing.status || "") !== String(item.status || "active");

            if (blockingBookingCodes.length > 0 && changedTransport) {
              throw new BadRequestException(
                this.buildActivePaidBookingEditLockMessage(
                  "phương tiện",
                  existing.name,
                  blockingBookingCodes,
                ).replace(
                  "đang có booking đã thanh toán và chuyến đi chưa hoàn thành",
                  "tour này đã phát sinh booking",
                ),
              );
            }
          }

          await tx.tourTransport.update({
            where: {
              id: item.id,
            },
            data,
          });
          updatedCount += 1;
        } else {
          await tx.tourTransport.create({
            data: {
              tourId: BigInt(tourId),
              ...data,
            },
          });
          createdCount += 1;
        }
      }
    });

    return {
      message: "Transports saved",
      totalItems: validItems.length,
      createdCount,
      updatedCount,
      deletedCount,
    };
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
      const bookingCodes = lockedDeparture.bookings
        .map((item) => String(item.bookingCode || "").trim())
        .filter(Boolean);

      const codeText = bookingCodes.length
        ? ` Booking liên quan: ${bookingCodes.join(", ")}.`
        : "";

      throw new BadRequestException(
        `Không thể xóa tour vì có dữ liệu booking`
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
        "Tour này đã phát sinh lịch sử booking/review/favorite. Không nên xóa cứng để tránh mất dữ liệu nghiệp vụ.",
      );
    }

    return this.prisma.tour.delete({ where: { id: BigInt(tourId) } });
  }
}
