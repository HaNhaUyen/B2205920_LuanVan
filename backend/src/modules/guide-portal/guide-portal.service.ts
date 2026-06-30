import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpdateGuideProfileDto } from "./dto/update-guide-profile.dto";
import { UpdateAssignmentStatusDto } from "./dto/update-assignment-status.dto";

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
    const languages = dto.languages?.trim();
    const note = dto.note?.trim();

    const updated = await this.prisma.guide.update({
      where: { id: guide.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(languages !== undefined ? { languages } : {}),
        ...(note !== undefined ? { note } : {}),
      },
      include: {
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
          },
        })
        .catch(() => null);
    }

    return this.mapGuide(updated);
  }

  async getMyAssignments(user: CurrentUserLike, query: any) {
    const guide = await this.getGuideByUser(user);

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

  async updateAssignmentStatus(
    user: CurrentUserLike,
    assignmentId: number,
    dto: UpdateAssignmentStatusDto,
  ) {
    const guide = await this.getGuideByUser(user);

    const assignment = await this.prisma.guideAssignment.findFirst({
      where: {
        id: BigInt(assignmentId),
        guideId: guide.id,
      },
      include: {
        booking: true,
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

    const cleanNote =
      dto.note !== undefined && dto.note !== null
        ? String(dto.note).trim()
        : assignment.note;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.guideAssignment.update({
        where: { id: assignment.id },
        data: {
          status: dto.status,
          note: cleanNote,
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

      if (dto.status === "issue") {
        const bookingCode =
          assignment.booking?.bookingCode || `BK#${assignment.bookingId}`;

        const tourName = assignment.tour?.name || "Tour chưa rõ tên";
        const guideName = guide.fullName || "Hướng dẫn viên";
        const issueNote =
          cleanNote || "HDV báo có sự cố nhưng chưa nhập ghi chú.";

        await tx.notification.create({
          data: {
            title: `HDV báo sự cố: ${bookingCode}`,
            message: `${guideName} báo sự cố cho tour ${tourName}.`,
            content: [
              `Hướng dẫn viên: ${guideName}`,
              `Tour: ${tourName}`,
              `Mã booking: ${bookingCode}`,
              `Ngày đi: ${
                assignment.startDate
                  ? new Date(assignment.startDate).toLocaleDateString("vi-VN")
                  : "--"
              }`,
              `Nội dung sự cố: ${issueNote}`,
              "",
              "Admin cần kiểm tra và có thể vào mục Hướng dẫn viên để đổi HDV khác nếu cần.",
            ].join("\n"),
            targetRole: "admin",
            targetUserId: null,
            isPublished: true,
            createdBy: guide.userId || null,
          },
        });
      }

      return row;
    });

    return this.mapAssignment(updated);
  }
}
