import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

const ACTIVE_ASSIGNMENT_STATUSES = [
  "assigned",
  "accepted",
  "in_progress",
  "confirmed",
];

@Injectable()
export class GuideAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  private async guideByUserId(userId: bigint) {
    const guide = await this.prisma.guide.findFirst({ where: { userId } });
    if (!guide) {
      throw new NotFoundException(
        "Tài khoản chưa được liên kết với hồ sơ hướng dẫn viên.",
      );
    }
    return guide;
  }

  private parseDate(value: any, fieldName: string) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} không hợp lệ.`);
    }
    return date;
  }

  private normalizeType(value: any) {
    const allowed = [
      "available",
      "unavailable",
      "leave",
      "training",
      "personal",
    ];
    const type = String(value || "unavailable").trim();
    if (!allowed.includes(type)) {
      throw new BadRequestException("Loại lịch bận không hợp lệ.");
    }
    return type as any;
  }

  private overlapWhere(startAt: Date, endAt: Date) {
    return {
      NOT: [{ endDate: { lt: startAt } }, { startDate: { gt: endAt } }],
    };
  }

  private async findOtherAssignmentConflicts(
    guideId: bigint,
    startAt: Date,
    endAt: Date,
    excludedAssignmentId?: bigint | null,
  ) {
    return this.prisma.guideAssignment.findMany({
      where: {
        guideId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...(excludedAssignmentId ? { id: { not: excludedAssignmentId } } : {}),
        ...this.overlapWhere(startAt, endAt),
      },
      include: {
        tour: { include: { destination: true } },
        booking: { include: { departure: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  async myAvailability(userId: bigint) {
    const guide = await this.guideByUserId(userId);
    return this.prisma.guideAvailability.findMany({
      where: { guideId: guide.id, status: { not: "cancelled" } },
      include: {
        guideAssignment: {
          include: { tour: true, booking: { include: { departure: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async create(userId: bigint, dto: any) {
    const guide = await this.guideByUserId(userId);
    const assignmentId = dto.guideAssignmentId
      ? BigInt(dto.guideAssignmentId)
      : null;

    let assignment: any = null;
    let startAt: Date;
    let endAt: Date;

    if (assignmentId) {
      assignment = await this.prisma.guideAssignment.findFirst({
        where: { id: assignmentId, guideId: guide.id },
        include: { tour: true, booking: true },
      });
      if (!assignment) {
        throw new NotFoundException("Không tìm thấy tour được phân công.");
      }
      if (!["assigned", "accepted"].includes(assignment.status)) {
        throw new BadRequestException(
          "Chỉ được báo không thể nhận trước khi chuyến đi bắt đầu.",
        );
      }
      startAt = assignment.startDate;
      endAt = assignment.endDate;
    } else {
      startAt = this.parseDate(dto.startAt, "Thời gian bắt đầu");
      endAt = this.parseDate(dto.endAt, "Thời gian kết thúc");
    }

    if (endAt <= startAt) {
      throw new BadRequestException(
        "Thời gian kết thúc phải sau thời gian bắt đầu.",
      );
    }

    const duplicated = await this.prisma.guideAvailability.findFirst({
      where: {
        guideId: guide.id,
        status: { in: ["pending", "active"] },
        ...(assignmentId ? { guideAssignmentId: assignmentId } : {}),
        NOT: [{ endAt: { lt: startAt } }, { startAt: { gt: endAt } }],
      },
    });
    if (duplicated) {
      throw new BadRequestException(
        "Bạn đã gửi yêu cầu lịch bận cho khoảng thời gian này.",
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.guideAvailability.create({
        data: {
          guideId: guide.id,
          guideAssignmentId: assignmentId,
          availabilityType: this.normalizeType(dto.availabilityType),
          startAt,
          endAt,
          allDay: dto.allDay === undefined ? true : Boolean(dto.allDay),
          reason: String(dto.reason || "").trim() || null,
          status: "pending",
          createdBy: userId,
        },
        include: {
          guide: true,
          guideAssignment: { include: { tour: true, booking: true } },
        },
      });

      await tx.notification.create({
        data: {
          title: assignment
            ? `HDV báo không thể nhận tour: ${assignment.tour?.name || "Tour"}`
            : `HDV gửi yêu cầu lịch bận: ${guide.fullName}`,
          message: assignment
            ? `${guide.fullName} báo không thể nhận tour đã phân công.`
            : `${guide.fullName} vừa gửi yêu cầu lịch bận mới.`,
          content: [
            `Hướng dẫn viên: ${guide.fullName}`,
            assignment?.tour?.name ? `Tour: ${assignment.tour.name}` : null,
            assignment?.booking?.bookingCode
              ? `Booking: ${assignment.booking.bookingCode}`
              : null,
            `Từ: ${startAt.toLocaleDateString("vi-VN")}`,
            `Đến: ${endAt.toLocaleDateString("vi-VN")}`,
            dto.reason ? `Lý do: ${String(dto.reason).trim()}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          targetRole: "admin",
          targetUserId: null,
          isPublished: true,
          createdBy: userId,
        },
      });
      return row;
    });

    return created;
  }

  async update(userId: bigint, id: bigint, dto: any) {
    const guide = await this.guideByUserId(userId);
    const current = await this.prisma.guideAvailability.findFirst({
      where: { id, guideId: guide.id },
    });
    if (!current) throw new NotFoundException("Không tìm thấy lịch bận.");
    if (current.status !== "pending") {
      throw new ForbiddenException(
        "Chỉ có thể chỉnh sửa lịch bận đang chờ duyệt.",
      );
    }

    const startAt = dto.startAt
      ? this.parseDate(dto.startAt, "Thời gian bắt đầu")
      : current.startAt;
    const endAt = dto.endAt
      ? this.parseDate(dto.endAt, "Thời gian kết thúc")
      : current.endAt;
    if (endAt <= startAt) {
      throw new BadRequestException(
        "Thời gian kết thúc phải sau thời gian bắt đầu.",
      );
    }

    return this.prisma.guideAvailability.update({
      where: { id },
      data: {
        availabilityType:
          dto.availabilityType === undefined
            ? undefined
            : this.normalizeType(dto.availabilityType),
        startAt,
        endAt,
        allDay: dto.allDay === undefined ? undefined : Boolean(dto.allDay),
        reason:
          dto.reason === undefined
            ? undefined
            : String(dto.reason || "").trim() || null,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
      },
    });
  }

  async remove(userId: bigint, id: bigint) {
    const guide = await this.guideByUserId(userId);
    const current = await this.prisma.guideAvailability.findFirst({
      where: { id, guideId: guide.id },
    });
    if (!current) throw new NotFoundException("Không tìm thấy lịch bận.");

    if (current.status !== "pending") {
      throw new ForbiddenException("Chỉ có thể xóa lịch bận đang chờ duyệt.");
    }

    await this.prisma.guideAvailability.delete({ where: { id } });
    return { success: true, deleted: true };
  }

  async adminList(query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const status = String(query.status || "pending").trim();
    const search = String(query.search || "").trim();

    const where: any = {};
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { guide: { fullName: { contains: search } } },
        { guide: { phone: { contains: search } } },
        { guide: { email: { contains: search } } },
        { guideAssignment: { tour: { name: { contains: search } } } },
        { guideAssignment: { booking: { bookingCode: { contains: search } } } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.guideAvailability.count({ where }),
      this.prisma.guideAvailability.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          guide: true,
          creator: { select: { id: true, fullName: true, email: true } },
          approver: { select: { id: true, fullName: true, email: true } },
          guideAssignment: {
            include: {
              tour: { include: { destination: true } },
              booking: { include: { departure: true } },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    ]);

    const mapped = await Promise.all(
      items.map(async (item: any) => {
        const otherConflicts = await this.findOtherAssignmentConflicts(
          item.guideId,
          item.startAt,
          item.endAt,
          item.guideAssignmentId,
        );
        return {
          ...item,
          replacementRequired: Boolean(item.guideAssignmentId),
          replacementAssignment: item.guideAssignment || null,
          otherConflicts,
          otherConflictCount: otherConflicts.length,
          conflictCount: otherConflicts.length,
        };
      }),
    );

    return {
      items: mapped,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async review(adminUserId: bigint, id: bigint, dto: any) {
    const action = String(dto.action || "")
      .trim()
      .toLowerCase();
    const reason = String(dto.reason || "").trim();
    if (!["approve", "reject"].includes(action)) {
      throw new BadRequestException("Thao tác duyệt không hợp lệ.");
    }

    const item = await this.prisma.guideAvailability.findUnique({
      where: { id },
      include: { guide: true, guideAssignment: true },
    });
    if (!item) throw new NotFoundException("Không tìm thấy yêu cầu lịch bận.");
    if (item.status !== "pending") {
      throw new BadRequestException("Yêu cầu này đã được xử lý trước đó.");
    }
    if (action === "approve" && item.guideAssignmentId) {
      throw new BadRequestException(
        "Yêu cầu này gắn với tour đã phân công. Vui lòng chọn HDV thay thế rồi duyệt.",
      );
    }
    if (action === "approve") {
      const conflicts = await this.findOtherAssignmentConflicts(
        item.guideId,
        item.startAt,
        item.endAt,
        null,
      );
      if (conflicts.length) {
        throw new BadRequestException(
          "Khoảng thời gian này còn trùng tour đang hoạt động.",
        );
      }
    } else if (!reason) {
      throw new BadRequestException("Vui lòng nhập lý do từ chối.");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.guideAvailability.update({
        where: { id },
        data: {
          status: action === "approve" ? "active" : "rejected",
          approvedBy: adminUserId,
          approvedAt: new Date(),
          reason:
            action === "reject"
              ? `${item.reason || ""}${item.reason ? "\n" : ""}Lý do từ chối: ${reason}`
              : item.reason,
        },
      });
      if (item.guide.userId) {
        await tx.notification.create({
          data: {
            title:
              action === "approve"
                ? "Lịch bận đã được duyệt"
                : "Lịch bận bị từ chối",
            message:
              action === "approve"
                ? "Ban điều hành đã duyệt lịch bận của bạn."
                : "Ban điều hành đã từ chối lịch bận của bạn.",
            content: reason || item.reason || "Không có ghi chú.",
            targetRole: "guide",
            targetUserId: item.guide.userId,
            isPublished: true,
            createdBy: adminUserId,
          },
        });
      }
      return row;
    });
  }

  async replaceAndApprove(
    adminUserId: bigint,
    availabilityId: bigint,
    replacementGuideId: bigint,
    note?: string,
  ) {
    const item = await this.prisma.guideAvailability.findUnique({
      where: { id: availabilityId },
      include: {
        guide: true,
        guideAssignment: {
          include: {
            booking: { include: { departure: true, user: true } },
            tour: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException("Không tìm thấy yêu cầu lịch bận.");
    if (item.status !== "pending") {
      throw new BadRequestException("Yêu cầu này đã được xử lý trước đó.");
    }
    if (!item.guideAssignment) {
      throw new BadRequestException(
        "Yêu cầu này không gắn với tour cần thay HDV.",
      );
    }
    if (replacementGuideId === item.guideId) {
      throw new BadRequestException("Vui lòng chọn hướng dẫn viên khác.");
    }

    const replacementGuide = await this.prisma.guide.findUnique({
      where: { id: replacementGuideId },
    });
    if (!replacementGuide || replacementGuide.status !== "active") {
      throw new BadRequestException("Hướng dẫn viên thay thế không khả dụng.");
    }

    const assignment = item.guideAssignment;
    const overlap = await this.prisma.guideAssignment.findFirst({
      where: {
        guideId: replacementGuideId,
        status: { in: ACTIVE_ASSIGNMENT_STATUSES },
        ...this.overlapWhere(assignment.startDate, assignment.endDate),
      },
      include: { tour: true },
    });
    if (overlap) {
      throw new BadRequestException(
        `HDV thay thế đang bận tour ${overlap.tour?.name || "khác"}.`,
      );
    }

    const approvedBusy = await this.prisma.guideAvailability.findFirst({
      where: {
        guideId: replacementGuideId,
        status: "active",
        NOT: [
          { endAt: { lt: assignment.startDate } },
          { startAt: { gt: assignment.endDate } },
        ],
      },
    });
    if (approvedBusy) {
      throw new BadRequestException("HDV thay thế có lịch bận đã được duyệt.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.guideAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "replaced",
          note: [
            assignment.note,
            `Đã thay HDV: ${item.reason || "HDV báo bận"}`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      });

      const newAssignment = await tx.guideAssignment.create({
        data: {
          guideId: replacementGuideId,
          bookingId: assignment.bookingId,
          tourId: assignment.tourId,
          startDate: assignment.startDate,
          endDate: assignment.endDate,
          status: "assigned",
          note:
            note ||
            `Thay HDV do ${item.guide.fullName} báo không thể nhận tour`,
        },
        include: { guide: true, tour: true, booking: true },
      });

      const availability = await tx.guideAvailability.update({
        where: { id: availabilityId },
        data: {
          status: "active",
          approvedBy: adminUserId,
          approvedAt: new Date(),
        },
      });

      await tx.bookingStatusLog.create({
        data: {
          bookingId: assignment.bookingId,
          actionType: "change_guide_unavailable",
          oldStatus: item.guide.fullName,
          newStatus: replacementGuide.fullName,
          changedByUserId: adminUserId,
          source: "admin",
          reason: item.reason || "HDV báo không thể nhận tour",
          note: note || null,
        },
      });

      if (item.guide.userId) {
        await tx.notification.create({
          data: {
            title: "Yêu cầu báo bận đã được duyệt",
            message: `Tour ${assignment.tour?.name || "đã phân công"} đã được chuyển sang HDV khác.`,
            content: `HDV thay thế: ${replacementGuide.fullName}`,
            targetRole: "guide",
            targetUserId: item.guide.userId,
            isPublished: true,
            createdBy: adminUserId,
          },
        });
      }
      if (replacementGuide.userId) {
        await tx.notification.create({
          data: {
            title: "Bạn có tour mới được phân công",
            message: `Bạn được phân công tour ${assignment.tour?.name || "mới"}.`,
            content: `Thời gian: ${assignment.startDate.toLocaleDateString("vi-VN")} - ${assignment.endDate.toLocaleDateString("vi-VN")}`,
            targetRole: "guide",
            targetUserId: replacementGuide.userId,
            isPublished: true,
            createdBy: adminUserId,
          },
        });
      }

      return { availability, assignment: newAssignment };
    });
  }
}
