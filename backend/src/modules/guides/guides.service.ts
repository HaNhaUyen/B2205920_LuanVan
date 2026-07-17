// @ts-nocheck
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../common/services/email.service";
import * as bcrypt from "bcrypt";

function htmlEscape(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (s) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[s],
  );
}

@Injectable()
export class GuidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async list(query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const search = String(query.search || "").trim();
    const status = String(query.status || "").trim();

    const where: any = {};

    if (status && status !== "all") {
      if (status === "issue") {
        where.assignments = {
          some: {
            status: "issue",
          },
        };
      } else {
        where.status = status;
      }
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { identityNumber: { contains: search } },
        { languages: { contains: search } },
      ];
    }

    const activeAssignmentStatuses = [
      "assigned",
      "accepted",
      "in_progress",
      "confirmed",
      "issue",
    ];

    const [total, items] = await Promise.all([
      this.prisma.guide.count({ where }),
      this.prisma.guide.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          assignments: {
            where: {
              status: {
                in: activeAssignmentStatuses,
              },
            },
            include: {
              booking: true,
              tour: true,
            },
            orderBy: {
              startDate: "desc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const mappedItems = items.map((guide: any) => {
      const issueAssignments = (guide.assignments || []).filter(
        (assignment: any) => assignment.status === "issue",
      );

      return {
        ...guide,
        hasIssue: issueAssignments.length > 0,
        issueCount: issueAssignments.length,
        issueAssignments,
      };
    });

    return {
      items: mappedItems,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async create(dto: any) {
    const fullName = String(dto.fullName || "").trim();
    const phone = String(dto.phone || "").trim();
    const email = String(dto.email || "")
      .trim()
      .toLowerCase();
    const createAccount = Boolean(dto.createAccount || dto.password);

    if (!fullName) {
      throw new BadRequestException("Vui lòng nhập họ tên HDV.");
    }

    if (!phone) {
      throw new BadRequestException("Vui lòng nhập số điện thoại HDV.");
    }

    if (createAccount && !email) {
      throw new BadRequestException(
        "Cần email để tạo tài khoản đăng nhập cho hướng dẫn viên.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      let userId = dto.userId ? BigInt(dto.userId) : null;

      if (createAccount) {
        const existed = await tx.user.findUnique({
          where: { email },
        });

        if (existed && existed.role !== "guide") {
          throw new BadRequestException(
            "Email này đã thuộc tài khoản khách/admin, không thể dùng cho HDV.",
          );
        }

        if (existed) {
          userId = existed.id;

          await tx.user.update({
            where: { id: existed.id },
            data: {
              role: "guide",
              status: "active",
            },
          });
        } else {
          const password = String(dto.password || "123456");

          if (password.length < 6) {
            throw new BadRequestException(
              "Mật khẩu HDV cần tối thiểu 6 ký tự.",
            );
          }

          const passwordHash = await bcrypt.hash(password, 10);

          const user = await tx.user.create({
            data: {
              fullName,
              email,
              phone: phone || undefined,
              identityNumber: dto.identityNumber || undefined,
              passwordHash,
              role: "guide",
              status: "active",
              authProvider: "local",
            },
          });

          userId = user.id;
        }
      }

      return tx.guide.create({
        data: {
          userId,
          fullName,
          phone,
          email: email || null,
          identityNumber: dto.identityNumber || null,
          languages: dto.languages || null,
          experienceYears: Number(dto.experienceYears || 0),
          status: dto.status || "active",
          note: dto.note || null,
        },
        include: {
          userAccount: true,
        },
      });
    });
  }

  async update(id: bigint, dto: any) {
    const guide = await this.prisma.guide.findUnique({
      where: { id },
    });

    if (!guide) {
      throw new NotFoundException("Không tìm thấy hướng dẫn viên.");
    }

    const fullName =
      dto.fullName == null ? undefined : String(dto.fullName).trim();
    const phone = dto.phone == null ? undefined : String(dto.phone).trim();
    const email =
      dto.email == null ? undefined : String(dto.email).trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      let userId =
        dto.userId === undefined
          ? guide.userId
          : dto.userId
            ? BigInt(dto.userId)
            : null;

      if (dto.createAccount || dto.password) {
        const accountEmail = email || guide.email;

        if (!accountEmail) {
          throw new BadRequestException(
            "Cần email để tạo tài khoản đăng nhập cho hướng dẫn viên.",
          );
        }

        const existed = await tx.user.findUnique({
          where: { email: accountEmail },
        });

        if (
          existed &&
          existed.id !== guide.userId &&
          existed.role !== "guide"
        ) {
          throw new BadRequestException(
            "Email này đã thuộc tài khoản khách/admin, không thể dùng cho HDV.",
          );
        }

        if (existed) {
          userId = existed.id;

          await tx.user.update({
            where: { id: existed.id },
            data: {
              role: "guide",
              status: "active",
            },
          });
        } else {
          const password = String(dto.password || "123456");

          if (password.length < 6) {
            throw new BadRequestException(
              "Mật khẩu HDV cần tối thiểu 6 ký tự.",
            );
          }

          const user = await tx.user.create({
            data: {
              fullName: fullName || guide.fullName,
              email: accountEmail,
              phone: phone || guide.phone || undefined,
              identityNumber:
                dto.identityNumber || guide.identityNumber || undefined,
              passwordHash: await bcrypt.hash(password, 10),
              role: "guide",
              status: "active",
              authProvider: "local",
            },
          });

          userId = user.id;
        }
      }

      const updated = await tx.guide.update({
        where: { id },
        data: {
          userId,
          fullName,
          phone,
          email,
          identityNumber:
            dto.identityNumber === undefined
              ? undefined
              : dto.identityNumber || null,
          languages:
            dto.languages === undefined ? undefined : dto.languages || null,
          status: dto.status === undefined ? undefined : dto.status,
          note: dto.note === undefined ? undefined : dto.note || null,
          experienceYears:
            dto.experienceYears == null
              ? undefined
              : Number(dto.experienceYears),
        },
        include: {
          userAccount: true,
        },
      });

      if (updated.userId) {
        await tx.user
          .update({
            where: { id: updated.userId },
            data: {
              fullName: updated.fullName,
              phone: updated.phone || undefined,
              avatarUrl: undefined,
            },
          })
          .catch(() => null);
      }

      return updated;
    });
  }

  private buildAssignmentInclude() {
    return {
      guide: true,
      tour: {
        include: {
          destination: true,
          media: {
            where: { isCover: true },
            take: 1,
          },
        },
      },
      booking: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          departure: true,
          pickupPoint: true,
          guests: {
            orderBy: {
              id: "asc",
            },
          },
          payments: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
          },
        },
      },
    } as any;
  }

  private async getGuideByUserId(userId: bigint) {
    const guide = await this.prisma.guide.findFirst({
      where: {
        userId,
        status: {
          not: "locked",
        },
      },
    });

    if (!guide) {
      throw new NotFoundException(
        "Tài khoản này chưa được gán hồ sơ hướng dẫn viên.",
      );
    }

    return guide;
  }

  private normalizeAssignment(row: any) {
    const booking = row.booking;
    const guests = booking?.guests || [];
    const adultCount = Number(booking?.adultCount || 0);
    const childCount = Number(booking?.childCount || 0);

    return {
      id: row.id,
      status: row.status,
      startDate: row.startDate,
      endDate: row.endDate,
      note: row.note,
      guide: row.guide,
      tour: row.tour,
      booking: {
        id: booking?.id,
        bookingCode: booking?.bookingCode,
        contactName: booking?.contactName,
        contactEmail: booking?.contactEmail,
        contactPhone: booking?.contactPhone,
        adultCount,
        childCount,
        totalGuests: adultCount + childCount,
        bookingStatus: booking?.bookingStatus,
        note: booking?.note,
        pickupName: booking?.pickupName,
        pickupAddress: booking?.pickupAddress,
        pickupTime: booking?.pickupTime,
        departure: booking?.departure,
        user: booking?.user,
        guests,
      },
    };
  }

  async mySchedule(userId: bigint, query: { from?: string; to?: string } = {}) {
    const guide = await this.getGuideByUserId(userId);

    const where: any = {
      guideId: guide.id,
      status: {
        in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
      },
    };

    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : null;
      const to = query.to ? new Date(query.to) : null;

      where.AND = [];

      if (from) {
        where.AND.push({
          endDate: {
            gte: from,
          },
        });
      }

      if (to) {
        where.AND.push({
          startDate: {
            lte: to,
          },
        });
      }
    }

    const rows = await this.prisma.guideAssignment.findMany({
      where,
      include: this.buildAssignmentInclude(),
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
    });

    return {
      guide,
      items: rows.map((row: any) => this.normalizeAssignment(row)),
    };
  }

  async myToday(userId: bigint) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const today = `${yyyy}-${mm}-${dd}`;

    return this.mySchedule(userId, {
      from: today,
      to: today,
    });
  }

  async myAssignmentDetail(userId: bigint, assignmentId: bigint) {
    const guide = await this.getGuideByUserId(userId);

    const assignment = await this.prisma.guideAssignment.findFirst({
      where: {
        id: assignmentId,
        guideId: guide.id,
      },
      include: this.buildAssignmentInclude(),
    });

    if (!assignment) {
      throw new NotFoundException("Không tìm thấy lịch phân công này.");
    }

    return this.normalizeAssignment(assignment);
  }

  async toggleLock(id: bigint) {
    const guide = await this.prisma.guide.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!guide) {
      throw new NotFoundException("Không tìm thấy hướng dẫn viên.");
    }

    const nextStatus = guide.status === "locked" ? "active" : "locked";

    return this.prisma.guide.update({
      where: { id },
      data: {
        status: nextStatus,
      },
    });
  }

  async remove(id: bigint) {
    const guide = await this.prisma.guide.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!guide) {
      throw new NotFoundException("Guide not found");
    }

    if (guide._count.assignments > 0) {
      return this.prisma.guide.update({
        where: { id },
        data: {
          status: "locked",
        },
      });
    }

    await this.prisma.guide.delete({
      where: { id },
    });

    return {
      success: true,
    };
  }

  calendar(id: bigint) {
    return this.prisma.guideAssignment.findMany({
      where: {
        guideId: id,
        status: {
          in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
        },
      },
      include: {
        booking: true,
        tour: true,
        guide: true,
      },
      orderBy: {
        startDate: "asc",
      },
    });
  }

  async allCalendar(month?: string) {
    const where: any = {
      status: {
        in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
      },
    };

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0);

      where.NOT = [
        {
          endDate: {
            lt: start,
          },
        },
        {
          startDate: {
            gt: end,
          },
        },
      ];
    }

    return this.prisma.guideAssignment.findMany({
      where,
      include: {
        guide: true,
        booking: true,
        tour: true,
      },
      orderBy: {
        startDate: "asc",
      },
    });
  }

  async assignableDepartures() {
    const activeAssignmentStatuses = [
      "assigned",
      "accepted",
      "in_progress",
      "confirmed",
      "issue",
    ];

    /*
     * Chỉ lấy lịch:
     * - Chưa tới ngày khởi hành.
     * - Có ít nhất một booking hợp lệ.
     * - Chưa có phân công HDV đang hoạt động.
     *
     * Dùng SQL tổng hợp để một lịch khởi hành chỉ xuất hiện đúng một lần,
     * dù lịch đó có nhiều booking.
     */
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         td.id AS departureId,
         td.departure_date AS departureDate,
         td.end_date AS endDate,
         td.status AS departureStatus,
         t.id AS tourId,
         t.code AS tourCode,
         t.name AS tourName,
         d.name AS destinationName,
         d.province AS destinationProvince,
         COUNT(DISTINCT b.id) AS bookingCount,
         COALESCE(SUM(b.adult_count + b.child_count), 0) AS guestCount,
         MIN(b.id) AS representativeBookingId
       FROM tour_departures td
       JOIN tours t
         ON t.id = td.tour_id
       JOIN destinations d
         ON d.id = t.destination_id
       JOIN bookings b
         ON b.departure_id = td.id
        AND b.booking_status IN ('confirmed', 'waiting_confirmation')
       WHERE td.departure_date > CURDATE()
         AND td.status NOT IN ('cancelled', 'closed')
         AND NOT EXISTS (
           SELECT 1
           FROM guide_assignments ga
           JOIN bookings assigned_booking
             ON assigned_booking.id = ga.booking_id
           WHERE assigned_booking.departure_id = td.id
             AND ga.status IN ('assigned', 'accepted', 'in_progress', 'confirmed', 'issue')
         )
       GROUP BY
         td.id,
         td.departure_date,
         td.end_date,
         td.status,
         t.id,
         t.code,
         t.name,
         d.name,
         d.province
       ORDER BY td.departure_date ASC, t.name ASC`,
    );

    return rows.map((row) => ({
      ...row,
      departureId: String(row.departureId),
      tourId: String(row.tourId),
      representativeBookingId: String(row.representativeBookingId),
      bookingCount: Number(row.bookingCount || 0),
      guestCount: Number(row.guestCount || 0),
    }));
  }

  async available(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      throw new BadRequestException(
        "Vui lòng truyền đầy đủ ngày bắt đầu và ngày kết thúc.",
      );
    }

    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59.999`);

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end < start
    ) {
      throw new BadRequestException("Khoảng thời gian kiểm tra không hợp lệ.");
    }

    const activeAssignmentStatuses = [
      "assigned",
      "accepted",
      "in_progress",
      "confirmed",
      "issue",
    ];

    const [busyAssignments, busyAvailabilities] = await Promise.all([
      this.prisma.guideAssignment.findMany({
        where: {
          status: {
            in: activeAssignmentStatuses,
          },
          NOT: [
            {
              endDate: {
                lt: start,
              },
            },
            {
              startDate: {
                gt: end,
              },
            },
          ],
        },
        select: {
          guideId: true,
        },
      }),

      this.prisma.guideAvailability.findMany({
        where: {
          /*
           * pending cũng được loại khỏi danh sách để tránh admin phân công
           * trong lúc HDV đã chủ động báo bận nhưng yêu cầu chưa kịp duyệt.
           */
          status: {
            in: ["pending", "active"],
          },
          availabilityType: {
            not: "available",
          },
          startAt: {
            lte: end,
          },
          endAt: {
            gte: start,
          },
        },
        select: {
          guideId: true,
        },
      }),
    ]);

    const busyGuideIds = Array.from(
      new Set([
        ...busyAssignments.map((item) => item.guideId.toString()),
        ...busyAvailabilities.map((item) => item.guideId.toString()),
      ]),
    ).map((id) => BigInt(id));

    return this.prisma.guide.findMany({
      where: {
        status: "active",
        ...(busyGuideIds.length
          ? {
              id: {
                notIn: busyGuideIds,
              },
            }
          : {}),
      },
      orderBy: {
        fullName: "asc",
      },
    });
  }

  async assign(dto: any) {
    const departureId = BigInt(dto.departureId || 0);
    const guideId = BigInt(dto.guideId || 0);
    const adminUserId = dto.changedBy ? BigInt(dto.changedBy) : null;
    const allowReplace = Boolean(dto.allowReplace);

    if (!departureId || departureId <= 0n) {
      throw new BadRequestException(
        "Vui lòng chọn lịch khởi hành cần phân công.",
      );
    }
    if (!guideId || guideId <= 0n) {
      throw new BadRequestException("Vui lòng chọn hướng dẫn viên.");
    }

    const departure = await this.prisma.tourDeparture.findUnique({
      where: { id: departureId },
      include: {
        tour: true,
        bookings: {
          where: {
            bookingStatus: {
              in: ["confirmed", "waiting_confirmation", "completed"],
            },
          },
          include: { user: true },
          orderBy: { id: "asc" },
        },
      },
    });

    if (!departure)
      throw new BadRequestException("Không tìm thấy lịch khởi hành.");
    if (new Date(departure.departureDate).getTime() <= Date.now()) {
      throw new BadRequestException(
        "Tour đã bắt đầu hoặc đã qua ngày khởi hành, không thể phân công HDV.",
      );
    }
    if (!departure.bookings.length) {
      throw new BadRequestException(
        "Lịch khởi hành này chưa có booking hợp lệ để phân công.",
      );
    }

    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
    });
    if (!guide || guide.status !== "active") {
      throw new BadRequestException("Hướng dẫn viên không khả dụng.");
    }

    const representative = departure.bookings[0];
    const activeStatuses = [
      "assigned",
      "accepted",
      "in_progress",
      "confirmed",
      "issue",
    ];

    const overlap = await this.prisma.guideAssignment.findFirst({
      where: {
        guideId,
        status: { in: activeStatuses },
        NOT: [
          { endDate: { lt: departure.departureDate } },
          { startDate: { gt: departure.endDate } },
        ],
        booking: { departureId: { not: departure.id } },
      },
      include: { tour: true },
    });
    if (overlap) {
      throw new BadRequestException(
        `Hướng dẫn viên đã có tour ${overlap.tour?.name || "khác"} trong thời gian này.`,
      );
    }

    const busyAvailability = await this.prisma.guideAvailability.findFirst({
      where: {
        guideId,
        status: {
          in: ["pending", "active"],
        },
        availabilityType: {
          not: "available",
        },
        startAt: {
          lte: new Date(new Date(departure.endDate).setHours(23, 59, 59, 999)),
        },
        endAt: {
          gte: new Date(new Date(departure.departureDate).setHours(0, 0, 0, 0)),
        },
      },
    });

    if (busyAvailability) {
      throw new BadRequestException(
        "Hướng dẫn viên đã khai báo lịch bận trong thời gian tour diễn ra.",
      );
    }

    const currentAssignments = await this.prisma.guideAssignment.findMany({
      where: {
        status: { in: activeStatuses },
        booking: { departureId: departure.id },
      },
      include: { guide: true },
      orderBy: { id: "desc" },
    });
    const previousGuide = currentAssignments[0]?.guide || null;

    if (currentAssignments.length > 0 && !allowReplace) {
      throw new BadRequestException(
        `Lịch khởi hành này đã được phân công cho ${previousGuide?.fullName || "một hướng dẫn viên"}.`,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.guideAssignment.updateMany({
        where: {
          status: { in: activeStatuses },
          booking: { departureId: departure.id },
        },
        data: {
          status: "replaced",
          note:
            dto.note ||
            "Phân công này đã được thay thế bởi hướng dẫn viên khác.",
        },
      });

      const assignment = await tx.guideAssignment.create({
        data: {
          guideId,
          bookingId: representative.id,
          tourId: departure.tourId,
          startDate: departure.departureDate,
          endDate: departure.endDate,
          status: "assigned",
          note:
            dto.note ||
            "Phân công chính đại diện cho toàn bộ khách của lịch khởi hành.",
        },
        include: { guide: true, booking: true, tour: true },
      });

      await tx.$executeRawUnsafe(
        `INSERT INTO trip_operations(departure_id,guide_id,operation_status,created_by,created_at,updated_at)
         VALUES (?,?, 'preparing', ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE guide_id=VALUES(guide_id), updated_at=NOW()`,
        departure.id,
        guideId,
        adminUserId,
      );

      for (const booking of departure.bookings) {
        await tx.bookingStatusLog.create({
          data: {
            bookingId: booking.id,
            actionType: previousGuide ? "change_guide" : "assign_guide",
            oldStatus: previousGuide?.fullName || null,
            newStatus: guide.fullName,
            source: "admin",
            reason: dto.note || null,
            note: previousGuide
              ? `Đổi HDV từ ${previousGuide.fullName} sang ${guide.fullName} cho toàn bộ lịch khởi hành.`
              : `Chỉ định HDV ${guide.fullName} cho toàn bộ lịch khởi hành.`,
          },
        });
      }

      if (guide.userId) {
        await tx.$executeRawUnsafe(
          `INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at)
           VALUES (?,?,?,?,?,1,?,NOW(),NOW())`,
          "Bạn có lịch tour mới",
          `${departure.tour.name} đã được phân công cho bạn.`,
          `Bạn được phân công phụ trách tour ${departure.tour.name}, khởi hành ngày ${new Date(departure.departureDate).toLocaleDateString("vi-VN")}.`,
          "user",
          guide.userId,
          adminUserId,
        );
      }

      for (const booking of departure.bookings) {
        if (!booking.userId) continue;
        await tx.$executeRawUnsafe(
          `INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at)
           VALUES (?,?,?,?,?,1,?,NOW(),NOW())`,
          previousGuide
            ? "Hướng dẫn viên đã được cập nhật"
            : "Đã có hướng dẫn viên phụ trách",
          `Booking ${booking.bookingCode} đã có hướng dẫn viên ${guide.fullName}.`,
          `Travela thông báo hướng dẫn viên phụ trách tour ${departure.tour.name} là ${guide.fullName}${guide.phone ? `, số điện thoại ${guide.phone}` : ""}.`,
          "user",
          booking.userId,
          adminUserId,
        );
      }

      return assignment;
    });

    for (const booking of departure.bookings) {
      const customerEmail = booking.user?.email || booking.contactEmail;
      if (!customerEmail) continue;
      try {
        await this.email.sendMail({
          to: customerEmail,
          subject: previousGuide
            ? `Travela cập nhật hướng dẫn viên cho ${booking.bookingCode}`
            : `Travela đã chỉ định hướng dẫn viên cho ${booking.bookingCode}`,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Thông báo hướng dẫn viên</h2>
            <p>Xin chào ${htmlEscape(booking.contactName)},</p>
            <p>Tour <b>${htmlEscape(departure.tour.name)}</b> đã được ${previousGuide ? "cập nhật" : "chỉ định"} hướng dẫn viên.</p>
            <ul><li>Hướng dẫn viên: <b>${htmlEscape(guide.fullName)}</b></li>
            <li>Số điện thoại: ${htmlEscape(guide.phone || "Travela sẽ cập nhật")}</li>
            <li>Khởi hành: ${new Date(departure.departureDate).toLocaleDateString("vi-VN")}</li></ul>
            ${dto.note ? `<p>Ghi chú: ${htmlEscape(dto.note)}</p>` : ""}
          </div>`,
        });
      } catch (_) {}
    }

    return {
      success: true,
      assignment: created,
      departureId: String(departure.id),
      bookingCount: departure.bookings.length,
      message: previousGuide
        ? "Đã phân công lại hướng dẫn viên cho toàn bộ lịch khởi hành."
        : "Đã phân công hướng dẫn viên cho toàn bộ lịch khởi hành.",
    };
  }

  async getGuideCredentials(guideId: bigint) {
    const guide = await this.prisma.guide.findUnique({
      where: { id: guideId },
      select: { id: true, fullName: true },
    });
    if (!guide) throw new NotFoundException("Không tìm thấy hướng dẫn viên.");

    const items = await this.prisma.guideCredential.findMany({
      where: { guideId },
      orderBy: { createdAt: "desc" },
    });

    return {
      guide: { id: guide.id.toString(), fullName: guide.fullName },
      items: items.map((item: any) => ({
        ...item,
        id: item.id.toString(),
        guideId: item.guideId.toString(),
        reviewedBy: item.reviewedBy?.toString() || null,
      })),
    };
  }

  async reviewGuideCredential(
    adminUserId: bigint,
    credentialId: bigint,
    dto: { status: "approved" | "rejected"; reviewNote?: string },
  ) {
    const credential = await this.prisma.guideCredential.findUnique({
      where: { id: credentialId },
      include: { guide: true },
    });
    if (!credential)
      throw new NotFoundException("Không tìm thấy khai báo chuyên môn.");

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.guideCredential.update({
        where: { id: credentialId },
        data: {
          status: dto.status,
          reviewNote: dto.reviewNote?.trim() || null,
          reviewedBy: adminUserId,
          reviewedAt: new Date(),
        },
      });

      if (credential.guide.userId) {
        await tx.notification.create({
          data: {
            title:
              dto.status === "approved"
                ? "Khai báo chuyên môn đã được duyệt"
                : "Khai báo chuyên môn bị từ chối",
            message: `${credential.name} - ${dto.status === "approved" ? "Đã duyệt" : "Từ chối"}`,
            content: [
              `Nội dung: ${credential.name}`,
              credential.level ? `Cấp độ: ${credential.level}` : null,
              dto.reviewNote ? `Ghi chú admin: ${dto.reviewNote}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
            targetRole: "guide",
            targetUserId: credential.guide.userId,
            isPublished: true,
            createdBy: adminUserId,
          },
        });
      }

      return row;
    });

    return { ...updated, id: updated.id.toString() };
  }
}
