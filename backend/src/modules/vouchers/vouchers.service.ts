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

  private validateVoucherValues(dto: any, existing?: any) {
    const name = String(dto.name ?? existing?.name ?? "").trim();
    const discountType = String(
      dto.discountType ?? existing?.discountType ?? "percent",
    );
    const discountValue = Number(
      dto.discountValue ?? existing?.discountValue ?? 0,
    );
    const maxDiscountRaw = dto.maxDiscount ?? existing?.maxDiscount;
    const minOrderAmount = Number(
      dto.minOrderAmount ?? existing?.minOrderAmount ?? 0,
    );
    const quota = Number(dto.quota ?? existing?.quota ?? 0);
    const memberTier = String(
      dto.memberTier ?? existing?.memberTier ?? "bronze",
    );
    const status = String(dto.status ?? existing?.status ?? "active");

    if (!name)
      throw new BadRequestException("Cần nhập tên chương trình voucher.");
    if (name.length < 3 || name.length > 160)
      throw new BadRequestException(
        "Tên chương trình voucher phải từ 3 đến 160 ký tự.",
      );
    if (!["percent", "fixed"].includes(discountType))
      throw new BadRequestException("Loại giảm giá voucher không hợp lệ.");
    if (!Number.isFinite(discountValue) || discountValue <= 0)
      throw new BadRequestException("Giá trị giảm phải là số lớn hơn 0.");
    if (discountType === "percent" && discountValue > 100)
      throw new BadRequestException(
        "Giá trị giảm theo phần trăm không được vượt quá 100%.",
      );
    if (maxDiscountRaw !== "" && maxDiscountRaw != null) {
      const maxDiscount = Number(maxDiscountRaw);
      if (!Number.isFinite(maxDiscount) || maxDiscount < 0)
        throw new BadRequestException("Mức giảm tối đa phải là số không âm.");
    }
    if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0)
      throw new BadRequestException(
        "Giá trị đơn tối thiểu phải là số không âm.",
      );
    if (!Number.isInteger(quota) || quota < 0)
      throw new BadRequestException("Quota phải là số nguyên không âm.");
    if (!["bronze", "silver", "gold", "diamond"].includes(memberTier))
      throw new BadRequestException(
        "Hạng thành viên của voucher không hợp lệ.",
      );
    if (!["active", "inactive", "expired"].includes(status))
      throw new BadRequestException("Trạng thái voucher không hợp lệ.");
  }

  private validateVoucherDates(dto: any, existing?: any) {
    const startRaw = dto.startDate ?? existing?.startDate;
    const endRaw = dto.endDate ?? existing?.endDate;

    if (!startRaw) {
      throw new BadRequestException("Vui lòng chọn ngày bắt đầu voucher.");
    }

    if (!endRaw) {
      throw new BadRequestException("Vui lòng chọn ngày kết thúc voucher.");
    }

    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);

    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException("Ngày bắt đầu voucher không hợp lệ.");
    }

    if (Number.isNaN(endDate.getTime())) {
      throw new BadRequestException("Ngày kết thúc voucher không hợp lệ.");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOnly = new Date(startDate);
    startOnly.setHours(0, 0, 0, 0);

    const endOnly = new Date(endDate);
    endOnly.setHours(0, 0, 0, 0);

    if (startOnly.getTime() < today.getTime()) {
      throw new BadRequestException(
        "Ngày bắt đầu voucher phải từ hôm nay trở đi.",
      );
    }

    if (endOnly.getTime() < today.getTime()) {
      throw new BadRequestException(
        "Ngày kết thúc voucher phải từ hôm nay trở đi.",
      );
    }

    // Cho phép voucher bắt đầu và kết thúc trong cùng một ngày,
    // nhưng tuyệt đối không cho ngày kết thúc đứng trước ngày bắt đầu.
    if (endOnly.getTime() < startOnly.getTime()) {
      throw new BadRequestException(
        "Ngày kết thúc voucher phải bằng hoặc sau ngày bắt đầu.",
      );
    }

    return { startDate, endDate };
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
    const allowedSort: Record<string, string> = {
      createdAt: "createdAt",
      code: "code",
      name: "name",
      discountValue: "discountValue",
      minOrderAmount: "minOrderAmount",
      quota: "quota",
      usedCount: "usedCount",
      startDate: "startDate",
      endDate: "endDate",
      status: "status",
      memberTier: "memberTier",
    };
    const sortBy = allowedSort[String(query.sortBy || "")] || "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
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
        // Sắp xếp toàn bộ voucher trước khi phân trang.
        orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
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

    this.validateVoucherValues(dto);
    this.validateVoucherDates(dto);

    const code = await this.buildUniqueCode(dto);
    const voucher = await this.prisma.voucher.create({
      data: {
        ...this.buildData(dto, code),
        // Nghiệp vụ: voucher mới luôn ở trạng thái đang phát hành.
        // Không tin status gửi từ client khi tạo mới.
        status: "active",
      },
    });
    await this.assignVoucherToEligibleUsers(voucher.id);
    return voucher;
  }

  async update(id: bigint, dto: any) {
    const existing = await this.prisma.voucher.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Không tìm thấy voucher.");

    const bookingUsageCount = await this.prisma.booking.count({
      where: { voucherId: id },
    });
    const actualUsageCount = Math.max(
      Number(existing.usedCount || 0),
      bookingUsageCount,
    );

    if (actualUsageCount > 0) {
      const toDateOnly = (value: any) => {
        if (!value) return "";
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
        return date.toISOString().slice(0, 10);
      };

      const sameNullableNumber = (left: any, right: any) => {
        const a = left === "" || left == null ? null : Number(left);
        const b = right === "" || right == null ? null : Number(right);
        return a === b;
      };

      const protectedFieldsChanged =
        (dto.code !== undefined &&
          String(dto.code || "").trim() !==
            String(existing.code || "").trim()) ||
        (dto.name !== undefined &&
          String(dto.name || "").trim() !==
            String(existing.name || "").trim()) ||
        (dto.memberTier !== undefined &&
          String(dto.memberTier) !== String(existing.memberTier)) ||
        (dto.discountType !== undefined &&
          String(dto.discountType) !== String(existing.discountType)) ||
        (dto.discountValue !== undefined &&
          Number(dto.discountValue) !== Number(existing.discountValue)) ||
        (dto.maxDiscount !== undefined &&
          !sameNullableNumber(dto.maxDiscount, existing.maxDiscount)) ||
        (dto.minOrderAmount !== undefined &&
          Number(dto.minOrderAmount) !== Number(existing.minOrderAmount)) ||
        (dto.startDate !== undefined &&
          toDateOnly(dto.startDate) !== toDateOnly(existing.startDate)) ||
        (dto.endDate !== undefined &&
          toDateOnly(dto.endDate) !== toDateOnly(existing.endDate)) ||
        (dto.quota !== undefined &&
          Number(dto.quota) !== Number(existing.quota)) ||
        (dto.status !== undefined &&
          String(dto.status) !== String(existing.status));

      if (protectedFieldsChanged) {
        throw new BadRequestException(
          `Voucher này đã có người dùng sử dụng nên chỉ được chỉnh sửa mô tả.`,
        );
      }

      return this.prisma.voucher.update({
        where: { id },
        data: {
          description:
            dto.description !== undefined
              ? String(dto.description || "").trim() || null
              : existing.description,
        },
      });
    }

    this.validateVoucherValues(dto, existing);

    const toDateOnly = (value: any) => {
      if (!value) return "";
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
      return date.toISOString().slice(0, 10);
    };

    const currentStartDate = toDateOnly(existing.startDate);
    const currentEndDate = toDateOnly(existing.endDate);
    const nextStartDate =
      dto.startDate !== undefined
        ? String(dto.startDate || "").slice(0, 10)
        : currentStartDate;
    const nextEndDate =
      dto.endDate !== undefined
        ? String(dto.endDate || "").slice(0, 10)
        : currentEndDate;

    const voucherDatesChanged =
      nextStartDate !== currentStartDate || nextEndDate !== currentEndDate;

    // Khi sửa chỉ kiểm tra ngày nếu Admin thực sự thay đổi
    // ngày bắt đầu hoặc ngày kết thúc. Nếu chỉ đổi trạng thái hoặc
    // các thông tin khác thì giữ nguyên thời hạn cũ và không chặn vì ngày cũ.
    if (voucherDatesChanged) {
      this.validateVoucherDates(dto, existing);
    }

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
      include: { _count: { select: { userVouchers: true, bookings: true } } },
    });

    if (!existed) throw new NotFoundException("Không tìm thấy voucher.");

    /*
     * Ràng buộc nghiệp vụ quan trọng:
     * Nếu voucher đang nằm trên một booking đã có tín hiệu thanh toán nhưng
     * chuyến chưa hoàn tất thì tuyệt đối không cho xóa voucher.
     */
    const protectedBooking = await this.prisma.booking.findFirst({
      where: {
        voucherId: id,
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
            paymentStatus: {
              in: ["paid", "waiting_confirmation"] as any,
            },
          },
        },
      },
      select: {
        id: true,
        bookingCode: true,
        bookingStatus: true,
        departure: {
          select: {
            departureDate: true,
            endDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (protectedBooking) {
      throw new BadRequestException(
        `Không thể xóa voucher vì đang được sử dụng cho booking ${protectedBooking.bookingCode} đã thanh toán nhưng chuyến đi chưa hoàn tất. Hãy chuyển voucher sang trạng thái Tạm ngưng nếu không muốn tiếp tục phát hành.`,
      );
    }

    /*
     * Giữ lịch sử đối soát: Booking có khóa ngoại voucherId -> Voucher.
     * Vì vậy voucher đã từng được gắn với bất kỳ booking nào cũng không nên
     * xóa cứng, kể cả booking đã hoàn thành/hủy/hoàn tiền.
     */
    const bookingReferenceCount = await this.prisma.booking.count({
      where: { voucherId: id },
    });

    if (bookingReferenceCount > 0 || Number(existed.usedCount || 0) > 0) {
      throw new BadRequestException(
        "Voucher đã phát sinh lịch sử sử dụng/đã được gắn với booking nên không thể xóa để tránh mất dữ liệu đối soát.",
      );
    }

    // Chỉ voucher chưa từng gắn booking mới được xóa cứng.
    await this.prisma.userVoucher.deleteMany({
      where: { voucherId: id, status: "available" },
    });

    await this.prisma.voucher.delete({ where: { id } });
    return { success: true };
  }
}
