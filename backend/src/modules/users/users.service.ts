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
    const email = dto.email.trim().toLowerCase();
    const phone = cleanNullable(dto.phone);

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

    if (!dto.password?.trim()) {
      throw new BadRequestException("Vui lòng nhập mật khẩu khởi tạo.");
    }

    const passwordHash = await bcrypt.hash(dto.password.trim(), 10);

    return this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
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

    const nextEmail = dto.email?.trim().toLowerCase();
    if (nextEmail && nextEmail !== existing.email) {
      const duplicated = await this.prisma.user.findUnique({
        where: { email: nextEmail },
      });
      if (duplicated && String(duplicated.id) !== String(existing.id)) {
        throw new BadRequestException("Email đã tồn tại.");
      }
    }

    const nextPhone = cleanNullable(dto.phone);
    if (nextPhone && nextPhone !== existing.phone) {
      const duplicated = await this.prisma.user.findUnique({
        where: { phone: nextPhone },
      });
      if (duplicated && String(duplicated.id) !== String(existing.id)) {
        throw new BadRequestException("Số điện thoại đã được sử dụng.");
      }
    }

    const data: any = {
      fullName: dto.fullName?.trim() || undefined,
      email: nextEmail || undefined,
      phone: nextPhone,
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

    return this.prisma.user.update({
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
