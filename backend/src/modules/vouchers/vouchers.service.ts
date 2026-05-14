// @ts-nocheck
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
    const tierPrefix = String(dto.memberTier || "bronze").toUpperCase().slice(0, 3);
    const discount = dto.discountType === "fixed" ? `FIX${Number(dto.discountValue || 0)}` : `${Number(dto.discountValue || 0)}P`;
    const base = slugCode(dto.code || dto.name || `VOUCHER-${tierPrefix}-${discount}`) || `VC-${tierPrefix}-${discount}`;
    let candidate = base;
    let counter = 2;
    while (true) {
      const existed = await this.prisma.voucher.findUnique({ where: { code: candidate } });
      if (!existed || (currentId && String(existed.id) === String(currentId))) return candidate;
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
      maxDiscount: dto.maxDiscount === "" || dto.maxDiscount == null ? null : Number(dto.maxDiscount),
      minOrderAmount: Number(dto.minOrderAmount || 0),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      quota: Number(dto.quota || 0),
      status: dto.status || "active",
    };
    if (code) data.code = code;
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return data;
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
    if (search) where.OR = [{ code: { contains: search } }, { name: { contains: search } }, { description: { contains: search } }];
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
    return { items, pagination: { page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) } };
  }

  mine(userId: bigint) {
    return this.prisma.userVoucher.findMany({ where: { userId }, include: { voucher: true }, orderBy: { createdAt: "desc" } });
  }

  async detail(id: bigint) {
    const row = await this.prisma.voucher.findUnique({
      where: { id },
      include: { userVouchers: { include: { user: { select: { id: true, fullName: true, email: true, memberTier: true, memberPoints: true } } }, orderBy: { createdAt: "desc" } }, _count: { select: { userVouchers: true } } },
    });
    if (!row) throw new NotFoundException("Không tìm thấy voucher.");
    return row;
  }

  async create(dto: any) {
    if (!dto.name) throw new BadRequestException("Cần nhập tên chương trình voucher.");
    const code = await this.buildUniqueCode(dto);
    return this.prisma.voucher.create({ data: this.buildData(dto, code) });
  }

  async update(id: bigint, dto: any) {
    const existing = await this.prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Không tìm thấy voucher.");
    const code = dto.code ? await this.buildUniqueCode(dto, id) : undefined;
    return this.prisma.voucher.update({ where: { id }, data: this.buildData(dto, code) });
  }

  async remove(id: bigint) {
    const existed = await this.prisma.voucher.findUnique({ where: { id }, include: { _count: { select: { userVouchers: true } } } });
    if (!existed) throw new NotFoundException("Không tìm thấy voucher.");
    if (existed.usedCount > 0) throw new BadRequestException("Voucher đã phát sinh lượt sử dụng nên không thể xóa cứng. Hãy chuyển trạng thái tạm ngưng.");
    await this.prisma.userVoucher.deleteMany({ where: { voucherId: id, status: "available" } });
    await this.prisma.voucher.delete({ where: { id } });
    return { success: true };
  }
}
