// @ts-nocheck
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

function slugCode(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

@Injectable()
export class VouchersService {
  constructor(private readonly prisma: PrismaService) {}

  private async buildUniqueCode(dto: any, currentId?: bigint) {
    const tierPrefix = String(dto.memberTier || "bronze")
      .toUpperCase()
      .slice(0, 3);
    const discount =
      dto.discountType === "fixed"
        ? `FIX${Number(dto.discountValue || 0)}`
        : `${Number(dto.discountValue || 0)}P`;
    const base =
      slugCode(dto.code || dto.name || `VOUCHER-${tierPrefix}-${discount}`) ||
      `VC-${tierPrefix}-${discount}`;
    let candidate = base;
    let counter = 2;
    while (true) {
      const existed = await this.prisma.voucher.findUnique({
        where: { code: candidate },
      });
      if (!existed || (currentId && String(existed.id) === String(currentId)))
        return candidate;
      candidate = `${base}-${counter++}`;
    }
  }

  private buildData(dto: any, code?: string) {
    const data: any = {
      name: dto.name,
      description: dto.description || null,
      memberTier: dto.memberTier || "bronze",
      discountType: dto.discountType || "percent",
      discountValue: Number(dto.discountValue || 0),
      maxDiscount:
        dto.maxDiscount === "" || dto.maxDiscount == null
          ? null
          : Number(dto.maxDiscount),
      minOrderAmount: Number(dto.minOrderAmount || 0),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      quota: Number(dto.quota || 0),
      status: dto.status || "active",
    };
    if (code) data.code = code;
    Object.keys(data).forEach(
      (key) => data[key] === undefined && delete data[key],
    );
    return data;
  }

  private buildActiveVoucherWhere(extra: any = {}) {
    const today = new Date();
    return {
      status: "active",
      startDate: { lte: today },
      endDate: { gte: today },
      ...extra,
    };
  }

  async assignTierVouchersToUser(userId: bigint) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, memberTier: true },
    });

    if (!user || user.role !== "user" || user.status !== "active") {
      return { assigned: 0 };
    }

    const vouchers = await this.prisma.voucher.findMany({
      where: this.buildActiveVoucherWhere({
        memberTier: user.memberTier || "bronze",
      }),
      select: { id: true },
    });

    if (!vouchers.length) return { assigned: 0 };

    const result = await this.prisma.userVoucher.createMany({
      data: vouchers.map((voucher: any) => ({
        userId: user.id,
        voucherId: voucher.id,
        status: "available",
      })),
      skipDuplicates: true,
    });

    return { assigned: result.count || 0 };
  }

  async assignVoucherToEligibleUsers(voucherId: bigint) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id: voucherId },
    });
    if (!voucher) return { assigned: 0 };

    const today = new Date();
    if (
      voucher.status !== "active" ||
      new Date(voucher.startDate).getTime() > today.getTime() ||
      new Date(voucher.endDate).getTime() < today.getTime()
    ) {
      return { assigned: 0 };
    }

    const users = await this.prisma.user.findMany({
      where: {
        role: "user",
        status: "active",
        memberTier: voucher.memberTier,
      },
      select: { id: true },
    });

    if (!users.length) return { assigned: 0 };

    const result = await this.prisma.userVoucher.createMany({
      data: users.map((user: any) => ({
        userId: user.id,
        voucherId: voucher.id,
        status: "available",
      })),
      skipDuplicates: true,
    });

    return { assigned: result.count || 0 };
  }

  async syncAllActiveTierVouchers() {
    const users = await this.prisma.user.findMany({
      where: { role: "user", status: "active" },
      select: { id: true, memberTier: true },
    });

    const vouchers = await this.prisma.voucher.findMany({
      where: this.buildActiveVoucherWhere(),
      select: { id: true, memberTier: true },
    });

    const data: any[] = [];
    for (const user of users) {
      for (const voucher of vouchers) {
        if (String(user.memberTier) === String(voucher.memberTier)) {
          data.push({
            userId: user.id,
            voucherId: voucher.id,
            status: "available",
          });
        }
      }
    }

    if (!data.length) return { assigned: 0 };
    const result = await this.prisma.userVoucher.createMany({
      data,
      skipDuplicates: true,
    });
    return { assigned: result.count || 0 };
  }

  async list(query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();
    const memberTier = String(query.memberTier || "").trim();
    const where: any = {};
    if (status) where.status = status;
    if (memberTier) where.memberTier = memberTier;
    if (search)
      where.OR = [
        { code: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    const [total, items] = await Promise.all([
      this.prisma.voucher.count({ where }),
      this.prisma.voucher.findMany({
        where,
        include: { _count: { select: { userVouchers: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async mine(userId: bigint) {
    await this.assignTierVouchersToUser(userId);

    return this.prisma.userVoucher.findMany({
      where: { userId },
      include: { voucher: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async detail(id: bigint) {
    const row = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        userVouchers: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                memberTier: true,
                memberPoints: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { userVouchers: true } },
      },
    });
    if (!row) throw new NotFoundException("Không tìm thấy voucher.");
    return row;
  }

  async create(dto: any) {
    if (!dto.name)
      throw new BadRequestException("Cần nhập tên chương trình voucher.");
    const code = await this.buildUniqueCode(dto);
    const voucher = await this.prisma.voucher.create({
      data: this.buildData(dto, code),
    });
    await this.assignVoucherToEligibleUsers(voucher.id);
    return voucher;
  }

  async update(id: bigint, dto: any) {
    const existing = await this.prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Không tìm thấy voucher.");
    const code = dto.code ? await this.buildUniqueCode(dto, id) : undefined;
    const updated = await this.prisma.voucher.update({
      where: { id },
      data: this.buildData(dto, code),
    });
    await this.assignVoucherToEligibleUsers(updated.id);
    return updated;
  }

  async remove(id: bigint) {
    const existed = await this.prisma.voucher.findUnique({
      where: { id },
      include: { _count: { select: { userVouchers: true } } },
    });
    if (!existed) throw new NotFoundException("Không tìm thấy voucher.");
    if (existed.usedCount > 0)
      throw new BadRequestException(
        "Voucher đã phát sinh lượt sử dụng nên không thể xóa cứng. Hãy chuyển trạng thái tạm ngưng.",
      );
    await this.prisma.userVoucher.deleteMany({
      where: { voucherId: id, status: "available" },
    });
    await this.prisma.voucher.delete({ where: { id } });
    return { success: true };
  }
}
