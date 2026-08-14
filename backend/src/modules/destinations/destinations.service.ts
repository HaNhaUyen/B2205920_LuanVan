import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { UpsertDestinationDto } from "./dto/upsert-destination.dto";

type DestinationFilters = {
  page?: string | number;
  pageSize?: string | number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: string;
};

@Injectable()
export class DestinationsService {
  constructor(private readonly prisma: PrismaService) {}

  private validateDestinationInput(dto: UpsertDestinationDto) {
    const name = String(dto?.name || "").trim();
    const province = String(dto?.province || "").trim();
    const country = String(dto?.country || "Vietnam").trim();
    const description = String(dto?.description || "").trim();
    const status = String(dto?.status || "active").trim();

    if (!name) {
      throw new BadRequestException("Vui lòng nhập tên điểm đến.");
    }
    if (name.length < 2 || name.length > 160) {
      throw new BadRequestException("Tên điểm đến phải từ 2 đến 160 ký tự.");
    }

    if (!province) {
      throw new BadRequestException("Vui lòng nhập tỉnh/thành.");
    }
    if (province.length < 2 || province.length > 100) {
      throw new BadRequestException("Tỉnh/thành phải từ 2 đến 100 ký tự.");
    }

    if (!country) {
      throw new BadRequestException("Vui lòng nhập quốc gia.");
    }
    if (country.length < 2 || country.length > 100) {
      throw new BadRequestException("Quốc gia phải từ 2 đến 100 ký tự.");
    }

    if (description.length > 5000) {
      throw new BadRequestException("Mô tả điểm đến tối đa 5000 ký tự.");
    }

    if (!["active", "inactive"].includes(status)) {
      throw new BadRequestException("Trạng thái điểm đến không hợp lệ.");
    }
  }

  findAll() {
    return this.prisma.destination.findMany({
      where: { status: "active" },
      orderBy: [{ name: "asc" }],
    });
  }

  async adminList(filters: DestinationFilters = {}) {
    const page = Math.max(Number(filters.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(filters.pageSize || 10), 1), 100);
    const search = String(filters.search || "").trim();
    const status = String(filters.status || "").trim();

    const allowedSortFields = new Set([
      "createdAt",
      "name",
      "province",
      "country",
      "status",
    ]);
    const requestedSortBy = String(filters.sortBy || "createdAt");
    const sortBy = allowedSortFields.has(requestedSortBy)
      ? requestedSortBy
      : "createdAt";
    const sortOrder: Prisma.SortOrder =
      String(filters.sortOrder || "desc").toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const where: Prisma.DestinationWhereInput = {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { province: { contains: search } },
              { country: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.destination.count({ where }),
      this.prisma.destination.findMany({
        where,
        // Quan trọng: sắp xếp toàn bộ tập dữ liệu trước khi skip/take.
        // Nhờ vậy "Tên điểm đến - Tăng dần" đúng trên toàn bộ các trang,
        // không chỉ đúng trong 10 bản ghi của trang hiện tại.
        orderBy: [
          { [sortBy]: sortOrder } as Prisma.DestinationOrderByWithRelationInput,
          { id: sortOrder },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: {
              tours: true,
            },
          },
        },
      }),
    ]);

    const items = await Promise.all(
      rows.map(async (item) => {
        const [bookingCount, protectedBookingCount] = await Promise.all([
          this.prisma.booking.count({
            where: {
              tour: {
                destinationId: item.id,
              },
            },
          }),
          this.prisma.booking.count({
            where: {
              tour: {
                destinationId: item.id,
              },
              bookingStatus: {
                notIn: [
                  "completed",
                  "cancelled",
                  "cancelled_by_customer",
                  "cancelled_by_operator",
                  "expired",
                ] as any,
              },
              payments: {
                some: {
                  paymentStatus: "paid" as any,
                },
              },
            },
          }),
        ]);

        return {
          ...item,
          tourCount: item._count.tours,
          bookingCount,
          protectedBookingCount,
          _count: undefined,
        };
      }),
    );

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async adminDetail(id: number) {
    const destination = await this.prisma.destination.findUnique({
      where: { id: BigInt(id) },
      include: {
        tours: {
          select: {
            id: true,
            code: true,
            name: true,
            status: true,
            _count: {
              select: {
                bookings: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!destination) throw new NotFoundException("Không tìm thấy điểm đến.");

    const bookingCount = await this.prisma.booking.count({
      where: { tour: { destinationId: BigInt(id) } },
    });

    return {
      ...destination,
      tourCount: destination.tours.length,
      bookingCount,
    };
  }

  async create(dto: UpsertDestinationDto) {
    this.validateDestinationInput(dto);

    const name = dto.name.trim();
    const province = dto.province.trim();

    await this.ensureUniqueDestination(name, province);

    return this.prisma.destination.create({
      data: {
        name,
        province,
        country: dto.country?.trim() || "Vietnam",
        description: dto.description?.trim() || null,
        coverImage: dto.coverImage?.trim() || null,
        status: dto.status || "active",
      },
    });
  }

  async update(id: number, dto: UpsertDestinationDto) {
    const destination = await this.prisma.destination.findUnique({
      where: {
        id: BigInt(id),
      },
    });

    if (!destination) {
      throw new NotFoundException("Không tìm thấy điểm đến.");
    }

    this.validateDestinationInput(dto);

    const name = dto.name.trim();
    const province = dto.province.trim();
    const country = dto.country?.trim() || "Vietnam";
    const nextStatus = dto.status || destination.status;

    const protectedBookingCount = await this.prisma.booking.count({
      where: {
        tour: {
          destinationId: destination.id,
        },
        bookingStatus: {
          notIn: [
            "completed",
            "cancelled",
            "cancelled_by_customer",
            "cancelled_by_operator",
            "expired",
          ] as any,
        },
        payments: {
          some: {
            paymentStatus: "paid" as any,
          },
        },
      },
    });

    if (protectedBookingCount > 0) {
      const protectedFieldsChanged =
        String(destination.name || "").trim() !== name ||
        String(destination.province || "").trim() !== province ||
        String(destination.country || "Vietnam").trim() !== country;

      if (protectedFieldsChanged) {
        throw new BadRequestException(
          `Điểm đến này đang có ${protectedBookingCount} booking đã thanh toán và chưa hoàn thành. Chỉ được chỉnh sửa mô tả, hình ảnh và trạng thái; không thể thay đổi tên điểm đến, tỉnh/thành hoặc quốc gia.`,
        );
      }
    } else {
      await this.ensureUniqueDestination(name, province, BigInt(id));
    }

    let warning: string | null = null;

    if (dto.status === "inactive" && destination.status !== "inactive") {
      const summary = await this.getDestinationOperationSummary(BigInt(id));

      if (summary.upcomingTourCount > 0 || summary.activeBookingCount > 0) {
        warning =
          `Điểm đến đã được tạm ẩn. ` +
          `Hiện còn ${summary.upcomingTourCount} tour chưa kết thúc ` +
          `và ${summary.activeBookingCount} booking còn hiệu lực. ` +
          `Các booking này vẫn được giữ nguyên và tiếp tục vận hành.`;
      }
    }

    const updated = await this.prisma.destination.update({
      where: {
        id: BigInt(id),
      },
      data: {
        name,
        province,
        country: dto.country?.trim() || destination.country || "Vietnam",
        description:
          dto.description !== undefined
            ? dto.description.trim() || null
            : destination.description,
        coverImage:
          dto.coverImage !== undefined
            ? dto.coverImage?.trim() || null
            : destination.coverImage,
        status: dto.status || destination.status,
      },
    });

    return {
      ...updated,
      warning,
    };
  }

  async remove(id: number) {
    const destinationId = BigInt(id);

    const destination = await this.prisma.destination.findUnique({
      where: { id: destinationId },
    });
    if (!destination) throw new NotFoundException("Không tìm thấy điểm đến.");

    const [tourCount, bookingCount] = await Promise.all([
      this.prisma.tour.count({ where: { destinationId } }),
      this.prisma.booking.count({ where: { tour: { destinationId } } }),
    ]);

    if (bookingCount > 0) {
      throw new BadRequestException(
        `Không thể xóa điểm đến này vì đã có ${bookingCount} booking thuộc các tour của điểm đến. Bạn nên chuyển trạng thái điểm đến sang Tạm ẩn.`,
      );
    }

    if (tourCount > 0) {
      throw new BadRequestException(
        `Không thể xóa điểm đến này vì đang có ${tourCount} tour sử dụng. Hãy xóa/chuyển tour sang điểm đến khác hoặc tạm ẩn điểm đến.`,
      );
    }

    await this.prisma.destination.delete({ where: { id: destinationId } });
    return { message: "Đã xóa điểm đến." };
  }

  private async ensureUniqueDestination(
    name: string,
    province: string,
    ignoreId?: bigint,
  ) {
    const duplicated = await this.prisma.destination.findFirst({
      where: {
        name,
        province,
        ...(ignoreId ? { NOT: { id: ignoreId } } : {}),
      },
      select: { id: true },
    });

    if (duplicated) {
      throw new BadRequestException(
        "Điểm đến này đã tồn tại trong cùng tỉnh/thành.",
      );
    }
  }
  private async getDestinationOperationSummary(destinationId: bigint) {
    const now = new Date();

    const upcomingTours = await this.prisma.tour.findMany({
      where: {
        destinationId,
        departures: {
          some: {
            endDate: {
              gte: now,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        departures: {
          where: {
            endDate: {
              gte: now,
            },
          },
          select: {
            id: true,
            departureDate: true,
            endDate: true,
            bookings: {
              where: {
                bookingStatus: {
                  in: ["pending_payment", "waiting_confirmation", "confirmed"],
                },
              },
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    const activeBookingCount = upcomingTours.reduce(
      (tourTotal, tour) =>
        tourTotal +
        tour.departures.reduce(
          (departureTotal, departure) =>
            departureTotal + departure.bookings.length,
          0,
        ),
      0,
    );

    return {
      upcomingTourCount: upcomingTours.length,
      activeBookingCount,
      upcomingTours,
    };
  }
}
