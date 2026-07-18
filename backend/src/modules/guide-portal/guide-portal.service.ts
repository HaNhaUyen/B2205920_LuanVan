import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdateGuideProfileDto } from "./dto/update-guide-profile.dto";
import { UpdateAssignmentStatusDto } from "./dto/update-assignment-status.dto";
import { CreateGuideCredentialDto } from "./dto/create-guide-credential.dto";
import { CreateGuideUnavailableDto } from "./dto/create-guide-unavailable.dto";

type CurrentUserLike = {
  userId: bigint;
  email?: string;
  role?: string;
};

@Injectable()
export class GuidePortalService {
  constructor(private readonly prisma: PrismaService) {}

  private toId(value: any) {
    return value == null ? null : value.toString();
  }

  private toNumber(value: any) {
    return Number(value || 0);
  }

  private formatDate(value: any) {
    if (!value) return null;
    return new Date(value).toISOString();
  }

  /**
   * Tự động chuyển các tour đã qua ngày kết thúc sang "completed".
   *
   * Điều kiện endDate < đầu ngày hiện tại để tour chỉ hoàn thành
   * sau khi đã qua toàn bộ ngày kết thúc.
   */
  private async completeExpiredAssignments(guideId?: bigint) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.guideAssignment.updateMany({
      where: {
        ...(guideId ? { guideId } : {}),
        endDate: {
          lt: today,
        },
        status: {
          in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
        },
      },
      data: {
        status: "completed",
      },
    });

    const whereGuide = guideId ? " AND op.guide_id=?" : "";
    const params = guideId ? [guideId] : [];

    await this.prisma.$executeRawUnsafe(
      `UPDATE trip_operations op
       JOIN tour_departures td ON td.id=op.departure_id
       SET op.operation_status='completed',
           op.completed_at=COALESCE(op.completed_at,NOW()),
           op.updated_at=NOW()
       WHERE td.end_date < CURDATE()
         AND op.operation_status NOT IN ('completed','cancelled')
         ${whereGuide}`,
      ...params,
    );
  }

  private ensureGuideRole(user: CurrentUserLike) {
    if (!user?.userId) {
      throw new ForbiddenException(
        "Bạn cần đăng nhập để sử dụng chức năng này.",
      );
    }

    if (user.role !== "guide" && user.role !== "admin") {
      throw new ForbiddenException(
        "Chỉ hướng dẫn viên mới được truy cập khu vực này.",
      );
    }
  }

  private async getGuideByUser(user: CurrentUserLike) {
    this.ensureGuideRole(user);

    const guide = await this.prisma.guide.findFirst({
      where: {
        userId: BigInt(user.userId),
      },
      include: {
        credentials: {
          orderBy: { createdAt: "desc" },
        },
        userAccount: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!guide) {
      throw new NotFoundException(
        "Tài khoản này chưa được liên kết với hồ sơ hướng dẫn viên.",
      );
    }

    return guide;
  }

  private mapGuide(guide: any) {
    return {
      id: this.toId(guide.id),
      userId: this.toId(guide.userId),
      fullName: guide.fullName,
      phone: guide.phone,
      email: guide.email,
      identityNumber: guide.identityNumber,
      languages: guide.languages,
      experienceYears: guide.experienceYears,
      status: guide.status,
      note: guide.note,
      createdAt: this.formatDate(guide.createdAt),
      updatedAt: this.formatDate(guide.updatedAt),
      credentials: (guide.credentials || []).map((item: any) => ({
        id: this.toId(item.id),
        credentialType: item.credentialType,
        name: item.name,
        issuer: item.issuer,
        level: item.level,
        fileUrl: item.fileUrl,
        status: item.status,
        reviewNote: item.reviewNote,
        reviewedAt: this.formatDate(item.reviewedAt),
        createdAt: this.formatDate(item.createdAt),
      })),
      verifiedCompetencies: (guide.credentials || [])
        .filter((item: any) => item.status === "approved")
        .map((item: any) => ({
          id: this.toId(item.id),
          type: item.credentialType,
          label: [item.name, item.level].filter(Boolean).join(" - "),
          issuer: item.issuer,
        })),
      userAccount: guide.userAccount
        ? {
            id: this.toId(guide.userAccount.id),
            fullName: guide.userAccount.fullName,
            email: guide.userAccount.email,
            phone: guide.userAccount.phone,
            role: guide.userAccount.role,
            status: guide.userAccount.status,
            avatarUrl: guide.userAccount.avatarUrl,
          }
        : null,
    };
  }

  private mapAssignment(item: any, detail = false) {
    const booking = item.booking;
    const tour = item.tour;
    const departure = booking?.departure || null;

    const adultCount = this.toNumber(booking?.adultCount);
    const childCount = this.toNumber(booking?.childCount);
    const totalGuests = adultCount + childCount;

    return {
      id: this.toId(item.id),
      guideId: this.toId(item.guideId),
      bookingId: this.toId(item.bookingId),
      tourId: this.toId(item.tourId),
      startDate: this.formatDate(item.startDate),
      endDate: this.formatDate(item.endDate),
      status: item.status,
      note: item.note,
      createdAt: this.formatDate(item.createdAt),
      updatedAt: this.formatDate(item.updatedAt),

      booking: booking
        ? {
            id: this.toId(booking.id),
            bookingCode: booking.bookingCode,
            bookingStatus: booking.bookingStatus,
            contactName: booking.contactName,
            contactEmail: booking.contactEmail,
            contactPhone: booking.contactPhone,
            adultCount,
            childCount,
            totalGuests,
            finalAmount: this.toNumber(booking.finalAmount),
            pickupName: booking.pickupName,
            pickupAddress: booking.pickupAddress,
            pickupTime: booking.pickupTime
              ? this.formatDate(booking.pickupTime)
              : null,
            pickupNote: booking.pickupNote,
            note: booking.note,
            departure: departure
              ? {
                  id: this.toId(departure.id),
                  departureDate: this.formatDate(departure.departureDate),
                  endDate: this.formatDate(departure.endDate),
                  totalSlots: this.toNumber(departure.totalSlots),
                  bookedSlots: this.toNumber(departure.bookedSlots),
                  heldSlots: this.toNumber(departure.heldSlots),
                  status: departure.status,
                }
              : null,
            guests: detail
              ? (booking.guests || []).map((guest: any) => ({
                  id: this.toId(guest.id),
                  fullName: guest.fullName,
                  dateOfBirth: this.formatDate(guest.dateOfBirth),
                  gender: guest.gender,
                  guestType: guest.guestType,
                  idNumber: guest.idNumber,
                }))
              : [],
          }
        : null,

      tour: tour
        ? {
            id: this.toId(tour.id),
            code: tour.code,
            name: tour.name,
            slug: tour.slug,
            tourTheme: tour.tourTheme,
            durationDays: this.toNumber(tour.durationDays),
            durationNights: this.toNumber(tour.durationNights),
            hotelStars: tour.hotelStars,
            destination: tour.destination
              ? {
                  id: this.toId(tour.destination.id),
                  name: tour.destination.name,
                  province: tour.destination.province,
                  country: tour.destination.country,
                }
              : null,
            itinerary: detail
              ? (tour.itinerary || []).map((row: any) => ({
                  id: this.toId(row.id),
                  dayNumber: row.dayNumber,
                  itemOrder: row.itemOrder,
                  title: row.title,
                  description: row.description,
                  locationName: row.locationName,
                }))
              : [],
            accommodations: detail
              ? (tour.accommodations || []).map((row: any) => ({
                  id: this.toId(row.id),
                  name: row.name,
                  accommodationType: row.accommodationType,
                  starRating: row.starRating,
                  address: row.address,
                  description: row.description,
                }))
              : [],
            transports: detail
              ? (tour.transports || []).map((row: any) => ({
                  id: this.toId(row.id),
                  name: row.name,
                  transportType: row.transportType,
                  provider: row.provider,
                  origin: row.origin,
                  destinationLabel: row.destinationLabel,
                  durationHours: row.durationHours
                    ? Number(row.durationHours)
                    : null,
                  description: row.description,
                }))
              : [],
          }
        : null,
    };
  }

  async getDashboard(user: CurrentUserLike) {
    const guide = await this.getGuideByUser(user);
    await this.completeExpiredAssignments(guide.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const assignments = await this.prisma.guideAssignment.findMany({
      where: {
        guideId: guide.id,
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      include: {
        booking: {
          include: {
            departure: true,
          },
        },
        tour: {
          include: {
            destination: true,
          },
        },
      },
    });

    const upcoming = assignments.filter((item: any) => {
      return new Date(item.startDate).getTime() >= today.getTime();
    });

    const totalGuests = assignments.reduce((sum: number, item: any) => {
      return (
        sum +
        Number(item.booking?.adultCount || 0) +
        Number(item.booking?.childCount || 0)
      );
    }, 0);

    const statusCounts = assignments.reduce(
      (acc: Record<string, number>, item: any) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {},
    );

    return {
      guide: this.mapGuide(guide),
      stats: {
        totalAssignments: assignments.length,
        upcomingAssignments: upcoming.length,
        completedAssignments: assignments.filter(
          (item: any) => item.status === "completed",
        ).length,
        issueAssignments: assignments.filter(
          (item: any) => item.status === "issue",
        ).length,
        totalGuests,
        statusCounts,
      },
      nextAssignment: upcoming[0] ? this.mapAssignment(upcoming[0]) : null,
      upcomingAssignments: upcoming
        .slice(0, 6)
        .map((item: any) => this.mapAssignment(item)),
    };
  }

  async getMyProfile(user: CurrentUserLike) {
    const guide = await this.getGuideByUser(user);
    return this.mapGuide(guide);
  }

  async updateMyProfile(user: CurrentUserLike, dto: UpdateGuideProfileDto) {
    const guide = await this.getGuideByUser(user);

    const phone = dto.phone?.trim();
    const email = dto.email?.trim().toLowerCase();
    const identityNumber = dto.identityNumber?.trim();
    const note = dto.note?.trim();

    const updated = await this.prisma.guide.update({
      where: { id: guide.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(identityNumber !== undefined ? { identityNumber } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      include: {
        credentials: { orderBy: { createdAt: "desc" } },
        userAccount: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (guide.userId) {
      await this.prisma.user
        .update({
          where: { id: guide.userId },
          data: {
            ...(phone !== undefined ? { phone } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(identityNumber !== undefined ? { identityNumber } : {}),
          },
        })
        .catch(() => null);
    }

    return this.mapGuide(updated);
  }

  async createMyCredential(
    user: CurrentUserLike,
    dto: CreateGuideCredentialDto,
  ) {
    const guide = await this.getGuideByUser(user);
    const name = String(dto.name || "").trim();
    if (!name)
      throw new BadRequestException("Vui lòng nhập tên năng lực/chứng chỉ.");

    const credential = await this.prisma.guideCredential.create({
      data: {
        guideId: guide.id,
        credentialType: dto.credentialType,
        name,
        issuer: dto.issuer?.trim() || null,
        level: dto.level?.trim() || null,
        fileUrl: dto.fileUrl?.trim() || null,
        status: "pending",
      },
    });

    await this.prisma.notification.create({
      data: {
        title: `HDV gửi khai báo chuyên môn: ${guide.fullName}`,
        message: `${guide.fullName} vừa gửi một khai báo ${dto.credentialType} chờ duyệt.`,
        content: [
          `Hướng dẫn viên: ${guide.fullName}`,
          `Loại: ${dto.credentialType}`,
          `Tên: ${name}`,
          dto.level ? `Trình độ/Cấp độ: ${dto.level}` : null,
          dto.issuer ? `Đơn vị cấp: ${dto.issuer}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        targetRole: "admin",
        targetUserId: null,
        isPublished: true,
        createdBy: guide.userId || null,
      },
    });

    return { ...credential, id: credential.id.toString() };
  }

  async deleteMyCredential(user: CurrentUserLike, credentialId: number) {
    const guide = await this.getGuideByUser(user);
    const credential = await this.prisma.guideCredential.findFirst({
      where: { id: BigInt(credentialId), guideId: guide.id },
    });
    if (!credential)
      throw new NotFoundException("Không tìm thấy khai báo chuyên môn.");
    if (credential.status === "approved") {
      throw new BadRequestException(
        "Không thể xóa năng lực đã được duyệt. Hãy liên hệ admin.",
      );
    }
    await this.prisma.guideCredential.delete({ where: { id: credential.id } });
    return { message: "Đã xóa khai báo chuyên môn." };
  }

  async getMyAssignments(user: CurrentUserLike, query: any) {
    const guide = await this.getGuideByUser(user);
    await this.completeExpiredAssignments(guide.id);

    const status = String(query?.status || "").trim();

    const assignments = await this.prisma.guideAssignment.findMany({
      where: {
        guideId: guide.id,
        ...(status && status !== "all" ? { status } : {}),
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      include: {
        booking: {
          include: {
            departure: true,
          },
        },
        tour: {
          include: {
            destination: true,
          },
        },
      },
    });

    return assignments.map((item: any) => this.mapAssignment(item));
  }

  async getAssignmentDetail(user: CurrentUserLike, assignmentId: number) {
    const guide = await this.getGuideByUser(user);
    await this.completeExpiredAssignments(guide.id);

    if (!assignmentId || Number.isNaN(Number(assignmentId))) {
      throw new BadRequestException("Mã phân công không hợp lệ.");
    }

    const assignment = await this.prisma.guideAssignment.findFirst({
      where: {
        id: BigInt(assignmentId),
        guideId: guide.id,
      },
      include: {
        booking: {
          include: {
            departure: true,
            guests: true,
          },
        },
        tour: {
          include: {
            destination: true,
            itinerary: {
              orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
            },
            accommodations: {
              where: { status: "active" },
              orderBy: [{ starRating: "desc" }, { createdAt: "asc" }],
            },
            transports: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        "Không tìm thấy phân công tour của hướng dẫn viên.",
      );
    }

    return this.mapAssignment(assignment, true);
  }

  async reportAssignmentUnavailable(
    user: CurrentUserLike,
    assignmentId: number,
    dto: CreateGuideUnavailableDto,
  ) {
    const guide = await this.getGuideByUser(user);

    if (!assignmentId || Number.isNaN(Number(assignmentId))) {
      throw new BadRequestException("Mã phân công không hợp lệ.");
    }

    const assignment = await this.prisma.guideAssignment.findFirst({
      where: {
        id: BigInt(assignmentId),
        guideId: guide.id,
      },
      include: {
        tour: true,
        booking: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException("Không tìm thấy tour được phân công.");
    }

    if (!["assigned", "accepted"].includes(assignment.status)) {
      throw new BadRequestException(
        "Chỉ được báo không thể nhận trước khi chuyến đi bắt đầu.",
      );
    }

    const existed = await this.prisma.guideAvailability.findFirst({
      where: {
        guideId: guide.id,
        guideAssignmentId: assignment.id,
        status: { in: ["pending", "active"] },
      },
    });

    if (existed) {
      throw new BadRequestException(
        "Bạn đã gửi yêu cầu không thể nhận cho tour này.",
      );
    }

    const reason = String(dto.reason || "").trim();
    if (!reason) {
      throw new BadRequestException("Vui lòng nhập lý do không thể nhận tour.");
    }

    return this.prisma.$transaction(async (tx) => {
      const availability = await tx.guideAvailability.create({
        data: {
          guideId: guide.id,
          guideAssignmentId: assignment.id,
          availabilityType: dto.availabilityType || "unavailable",
          startAt: assignment.startDate,
          endAt: assignment.endDate,
          allDay: true,
          reason: [reason, dto.note?.trim()].filter(Boolean).join("\n"),
          status: "pending",
          createdBy: guide.userId || user.userId,
        },
        include: {
          guideAssignment: { include: { tour: true, booking: true } },
        },
      });

      await tx.notification.create({
        data: {
          title: `HDV báo không thể nhận tour: ${assignment.tour?.name || "Tour"}`,
          message: `${guide.fullName} báo không thể nhận tour đã phân công.`,
          content: [
            `Hướng dẫn viên: ${guide.fullName}`,
            `Tour: ${assignment.tour?.name || "--"}`,
            `Booking: ${assignment.booking?.bookingCode || "--"}`,
            `Thời gian: ${assignment.startDate.toLocaleDateString("vi-VN")} - ${assignment.endDate.toLocaleDateString("vi-VN")}`,
            `Lý do: ${reason}`,
          ].join("\n"),
          targetRole: "admin",
          targetUserId: null,
          isPublished: true,
          createdBy: guide.userId || user.userId,
        },
      });

      return availability;
    });
  }

  async updateAssignmentStatus(
    user: CurrentUserLike,
    assignmentId: number,
    dto: UpdateAssignmentStatusDto,
  ) {
    const guide = await this.getGuideByUser(user);
    await this.completeExpiredAssignments(guide.id);

    if (!assignmentId || Number.isNaN(Number(assignmentId))) {
      throw new BadRequestException("Mã phân công không hợp lệ.");
    }

    const assignment = await this.prisma.guideAssignment.findFirst({
      where: {
        id: BigInt(assignmentId),
        guideId: guide.id,
      },
      include: {
        booking: {
          include: {
            departure: true,
          },
        },
        tour: {
          include: {
            destination: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(
        "Không tìm thấy phân công tour của hướng dẫn viên.",
      );
    }

    if (assignment.status === "completed") {
      throw new BadRequestException("Tour này đã hoàn thành.");
    }

    if (String(dto.status) !== "accepted") {
      throw new BadRequestException(
        "Hướng dẫn viên chỉ được xác nhận Đã nhận tour.",
      );
    }

    if (assignment.status !== "assigned") {
      throw new BadRequestException(
        "Chỉ tour đang ở trạng thái Đã phân công mới có thể xác nhận nhận tour.",
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (new Date(assignment.endDate).getTime() < today.getTime()) {
      await this.prisma.guideAssignment.update({
        where: {
          id: assignment.id,
        },
        data: {
          status: "completed",
        },
      });

      throw new BadRequestException(
        "Tour đã qua ngày kết thúc và được tự động chuyển sang Đã hoàn thành.",
      );
    }

    const updated = await this.prisma.guideAssignment.update({
      where: {
        id: assignment.id,
      },
      data: {
        status: "accepted",
        note:
          dto.note !== undefined && dto.note !== null
            ? String(dto.note).trim() || null
            : assignment.note,
      },
      include: {
        booking: {
          include: {
            departure: true,
          },
        },
        tour: {
          include: {
            destination: true,
          },
        },
      },
    });

    return this.mapAssignment(updated);
  }
}
