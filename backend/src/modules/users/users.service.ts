// @ts-nocheck
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminUpdateUserDto } from "./dto/admin-update-user.dto";
import { AdminCreateUserDto } from "./dto/admin-create-user.dto";
import * as bcrypt from "bcrypt";

function cleanNullable(value?: string | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private async syncPaidActiveBookingsFromAdminUpdate(tx: any, user: any) {
    if (!user?.id || String(user.role || "").toLowerCase() !== "user") {
      return;
    }

    const bookings = await tx.booking.findMany({
      where: {
        userId: user.id,
        bookingStatus: {
          in: ["pending_payment", "waiting_confirmation", "confirmed"] as any,
        },
        payments: {
          some: {
            paymentStatus: "paid" as any,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!bookings.length) return;

    const contactName = String(user.fullName || "").trim();
    const contactEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const contactPhone = String(user.phone || "").trim();

    if (!contactName || contactName.length < 2 || contactName.length > 150) {
      throw new BadRequestException("Họ tên phải từ 2 đến 150 ký tự.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new BadRequestException("Email không đúng định dạng.");
    }

    if (!/^0\d{9}$/.test(contactPhone)) {
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );
    }

    for (const booking of bookings) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          contactName,
          contactEmail,
          contactPhone,
        },
      });

      const ownerGuest = await tx.bookingGuest.findFirst({
        where: {
          bookingId: booking.id,
          guestType: "adult" as any,
        },
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
        },
      });

      if (ownerGuest) {
        await tx.bookingGuest.update({
          where: { id: ownerGuest.id },
          data: {
            fullName: contactName,
          },
        });
      }
    }
  }

  private buildOrderBy(query: any) {
    const allowed: Record<string, string> = {
      createdAt: "createdAt",
      fullName: "fullName",
      email: "email",
      phone: "phone",
      status: "status",
    };
    const sortBy = allowed[String(query.sortBy || "")] || "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
    return [{ [sortBy]: sortOrder }, { id: "desc" }];
  }

  async adminList(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = { role: "user" };

    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search } },
        { email: { contains: query.search } },
        { phone: { contains: query.search } },
      ];
    }

    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: this.buildOrderBy(query),
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          authProvider: true,
          avatarUrl: true,
          createdAt: true,
          _count: {
            select: {
              bookings: true,
              reviews: true,
              contacts: true,
              favoriteTours: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

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

  async adminCreate(dto: AdminCreateUserDto) {
    const fullName = String(dto.fullName || "").trim();
    const email = String(dto.email || "")
      .trim()
      .toLowerCase();
    const phone = cleanNullable(dto.phone);
    const password = String(dto.password || "").trim();

    if (!fullName) {
      throw new BadRequestException("Vui lòng nhập họ tên.");
    }
    if (fullName.length < 2 || fullName.length > 150) {
      throw new BadRequestException("Họ tên phải từ 2 đến 150 ký tự.");
    }

    if (!email) {
      throw new BadRequestException("Vui lòng nhập email.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("Email không đúng định dạng.");
    }

    if (!phone) {
      throw new BadRequestException("Vui lòng nhập số điện thoại.");
    }
    if (!/^0\d{9}$/.test(phone)) {
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );
    }

    if (!password) {
      throw new BadRequestException("Vui lòng nhập mật khẩu khởi tạo.");
    }
    if (password.length < 6 || password.length > 72) {
      throw new BadRequestException("Mật khẩu phải từ 6 đến 72 ký tự.");
    }

    const existingEmail = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingEmail) throw new BadRequestException("Email đã tồn tại.");

    if (phone) {
      const existingPhone = await this.prisma.user.findUnique({
        where: { phone },
      });
      if (existingPhone)
        throw new BadRequestException("Số điện thoại đã được sử dụng.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        status: dto.status || "active",
        role: "user",
        avatarUrl: cleanNullable(dto.avatarUrl),
        authProvider: "local",
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        authProvider: true,
        avatarUrl: true,
        createdAt: true,
      },
    });
  }

  async findById(id: number) {
    const item = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        authProvider: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            bookings: true,
            reviews: true,
            contacts: true,
            favoriteTours: true,
          },
        },
      },
    });

    if (!item) throw new NotFoundException("User not found");
    if (item.role === "admin") {
      throw new BadRequestException(
        "Tài khoản quản trị không hiển thị trong trang quản lý người dùng.",
      );
    }
    return item;
  }

  async updateByAdmin(id: number, dto: AdminUpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) throw new NotFoundException("User not found");
    if (existing.role === "admin") {
      throw new BadRequestException(
        "Không được chỉnh sửa tài khoản admin trong trang quản lý người dùng.",
      );
    }

    // Chỉ bổ sung đúng ràng buộc khóa tài khoản:
    // - Không cho khóa khi khách còn booking chưa hoàn thành và tour chưa kết thúc.
    // - Không cho khóa khi khách có booking đã thanh toán nhưng chưa tới ngày đi.
    if (dto.status === "blocked" && existing.status !== "blocked") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const protectedBooking = await this.prisma.booking.findFirst({
        where: {
          userId: existing.id,
          OR: [
            {
              bookingStatus: {
                in: ["pending_payment", "waiting_confirmation", "confirmed"],
              },
              departure: {
                is: {
                  endDate: { gte: today },
                },
              },
            },
            {
              departure: {
                is: {
                  departureDate: { gte: today },
                },
              },
              payments: {
                some: {
                  paymentStatus: "paid",
                },
              },
            },
          ],
        },
        select: {
          bookingCode: true,
          bookingStatus: true,
          departure: {
            select: {
              departureDate: true,
              endDate: true,
            },
          },
          payments: {
            where: {
              paymentStatus: "paid",
            },
            select: { id: true },
            take: 1,
          },
        },
        orderBy: {
          departure: { departureDate: "asc" },
        },
      });

      if (protectedBooking) {
        const hasPaidPayment = (protectedBooking.payments || []).length > 0;
        const reason = hasPaidPayment
          ? "đã thanh toán và chuyến đi chưa tới ngày khởi hành"
          : "chưa hoàn thành và tour chưa kết thúc";

        throw new BadRequestException(
          `Không thể khóa tài khoản vì booking ${protectedBooking.bookingCode} ${reason}.`,
        );
      }
    }

    if (dto.fullName !== undefined && !String(dto.fullName || "").trim()) {
      throw new BadRequestException("Họ tên không được để trống.");
    }
    if (dto.email !== undefined && !String(dto.email || "").trim()) {
      throw new BadRequestException("Email không được để trống.");
    }
    if (dto.phone !== undefined && !String(dto.phone || "").trim()) {
      throw new BadRequestException("Số điện thoại không được để trống.");
    }

    const nextEmail = dto.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== existing.email) {
      const duplicated = await this.prisma.user.findUnique({
        where: { email: nextEmail },
      });
      if (duplicated && String(duplicated.id) !== String(existing.id)) {
        throw new BadRequestException("Email đã tồn tại.");
      }
    }

    const nextPhone =
      dto.phone === undefined ? existing.phone : cleanNullable(dto.phone);
    if (nextPhone && nextPhone !== existing.phone) {
      const duplicated = await this.prisma.user.findUnique({
        where: { phone: nextPhone },
      });
      if (duplicated && String(duplicated.id) !== String(existing.id)) {
        throw new BadRequestException("Số điện thoại đã được sử dụng.");
      }
    }

    const nextFullName =
      dto.fullName === undefined
        ? existing.fullName
        : String(dto.fullName || "").trim();

    if (!nextFullName || nextFullName.length < 2 || nextFullName.length > 150) {
      throw new BadRequestException("Họ tên phải từ 2 đến 150 ký tự.");
    }

    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw new BadRequestException("Email không đúng định dạng.");
    }

    if (nextPhone && !/^0\d{9}$/.test(nextPhone)) {
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );
    }

    const data: any = {
      fullName: dto.fullName === undefined ? undefined : nextFullName,
      email: nextEmail || undefined,
      phone: dto.phone === undefined ? undefined : nextPhone,
      status: dto.status,
    };

    if (dto.avatarUrl !== undefined) {
      data.avatarUrl = cleanNullable(dto.avatarUrl);
    }

    if (dto.newPassword?.trim()) {
      data.passwordHash = await bcrypt.hash(dto.newPassword.trim(), 10);
    }

    Object.keys(data).forEach(
      (key) => data[key] === undefined && delete data[key],
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: BigInt(id) },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          authProvider: true,
          avatarUrl: true,
          updatedAt: true,
        },
      });

      await this.syncPaidActiveBookingsFromAdminUpdate(tx, updated);

      return updated;
    });
  }

  async deleteByAdmin(id: number) {
    const existing = await this.prisma.user.findUnique({
      where: { id: BigInt(id) },
      include: {
        _count: {
          select: {
            bookings: true,
            reviews: true,
            contacts: true,
            favoriteTours: true,
          },
        },
      },
    });

    if (!existing) throw new NotFoundException("User not found");
    if (existing.role === "admin") {
      throw new BadRequestException(
        "Không được xóa trực tiếp tài khoản quản trị.",
      );
    }

    const paymentCount = await this.prisma.payment.count({
      where: {
        booking: { is: { userId: existing.id } },
        paymentStatus: { in: ["paid", "waiting_confirmation", "refunded"] },
      },
    });

    if (
      existing._count.bookings > 0 ||
      existing._count.reviews > 0 ||
      existing._count.contacts > 0 ||
      existing._count.favoriteTours > 0 ||
      paymentCount > 0
    ) {
      throw new BadRequestException(
        "Người dùng này đã phát sinh dữ liệu nghiệp vụ, không thể xóa cứng. Hãy chuyển trạng thái sang blocked hoặc inactive.",
      );
    }

    await this.prisma.user.delete({ where: { id: existing.id } });
    return { success: true };
  }
}
