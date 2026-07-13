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

  async available(startDate: string, endDate: string) {
    if (!startDate || !endDate) {
      return this.prisma.guide.findMany({
        where: {
          status: "active",
        },
        orderBy: {
          fullName: "asc",
        },
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const busy = await this.prisma.guideAssignment.findMany({
      where: {
        status: {
          in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
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
    });

    return this.prisma.guide.findMany({
      where: {
        status: "active",
        id: {
          notIn: busy.map((x) => x.guideId),
        },
      },
      orderBy: {
        fullName: "asc",
      },
    });
  }

  async assign(dto: any) {
    const bookingId = BigInt(dto.bookingId);
    const guideId = BigInt(dto.guideId);

    const booking = await this.prisma.booking.findUnique({
      where: {
        id: bookingId,
      },
      include: {
        departure: true,
        tour: true,
        user: true,
        guideAssignments: {
          include: {
            guide: true,
          },
          where: {
            status: {
              in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
            },
          },
        },
      },
    });

    if (!booking) {
      throw new BadRequestException("Không tìm thấy booking.");
    }

    if (!booking.departure) {
      throw new BadRequestException("Booking này chưa có lịch khởi hành.");
    }

    const guide = await this.prisma.guide.findUnique({
      where: {
        id: guideId,
      },
    });

    if (!guide || guide.status !== "active") {
      throw new BadRequestException("Hướng dẫn viên không khả dụng.");
    }

    const overlap = await this.prisma.guideAssignment.findFirst({
      where: {
        guideId,
        status: {
          in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
        },
        bookingId: {
          not: booking.id,
        },
        NOT: [
          {
            endDate: {
              lt: booking.departure.departureDate,
            },
          },
          {
            startDate: {
              gt: booking.departure.endDate,
            },
          },
        ],
      },
      include: {
        booking: true,
        tour: true,
      },
    });

    if (overlap) {
      throw new BadRequestException(
        `Hướng dẫn viên đã bận tour ${overlap.tour?.name || ""} trong thời gian này.`,
      );
    }

    const previousGuide = booking.guideAssignments[0]?.guide;

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.guideAssignment.updateMany({
        where: {
          bookingId: booking.id,
          status: {
            in: ["assigned", "accepted", "in_progress", "confirmed", "issue"],
          },
        },
        data: {
          status: "replaced",
          note: dto.note || "Đã đổi hướng dẫn viên sau khi HDV báo sự cố",
        },
      });

      const assignment = await tx.guideAssignment.create({
        data: {
          guideId,
          bookingId: booking.id,
          tourId: booking.tourId,
          startDate: booking.departure.departureDate,
          endDate: booking.departure.endDate,
          status: "assigned",
          note: dto.note || null,
        },
        include: {
          guide: true,
          booking: true,
          tour: true,
        },
      });

      await tx.bookingStatusLog.create({
        data: {
          bookingId: booking.id,
          actionType: previousGuide ? "change_guide" : "assign_guide",
          oldStatus: previousGuide?.fullName || null,
          newStatus: guide.fullName,
          source: "admin",
          reason: dto.note || null,
          note: previousGuide
            ? `Đổi HDV từ ${previousGuide.fullName} sang ${guide.fullName}`
            : `Chỉ định HDV ${guide.fullName}`,
        },
      });

      return assignment;
    });

    const customerEmail = booking.user?.email || booking.contactEmail;

    if (customerEmail) {
      try {
        await this.email.sendMail({
          to: customerEmail,
          subject: previousGuide
            ? `Travela cập nhật hướng dẫn viên cho đơn ${booking.bookingCode}`
            : `Travela đã chỉ định hướng dẫn viên cho đơn ${booking.bookingCode}`,
          html: `
            <div style="font-family:Arial,sans-serif;line-height:1.6">
              <h2>Thông báo hướng dẫn viên</h2>
              <p>Xin chào ${htmlEscape(booking.contactName)},</p>
              <p>
                Đơn <b>${htmlEscape(booking.bookingCode)}</b> - tour 
                <b>${htmlEscape(booking.tour.name)}</b> đã được 
                ${previousGuide ? "cập nhật" : "chỉ định"} hướng dẫn viên.
              </p>
              <ul>
                <li>Hướng dẫn viên: <b>${htmlEscape(guide.fullName)}</b></li>
                <li>Số điện thoại HDV: ${htmlEscape(guide.phone)}</li>
                <li>
                  Thời gian tour:
                  ${new Date(booking.departure.departureDate).toLocaleDateString("vi-VN")}
                  -
                  ${new Date(booking.departure.endDate).toLocaleDateString("vi-VN")}
                </li>
              </ul>
              ${dto.note ? `<p>Ghi chú: ${htmlEscape(dto.note)}</p>` : ""}
              <p>Travela chúc quý khách có chuyến đi vui vẻ.</p>
            </div>
          `,
        });
      } catch (error) {
        await this.prisma.bookingStatusLog
          .create({
            data: {
              bookingId: booking.id,
              actionType: "guide_email_failed",
              source: "system",
              reason: String(error?.message || error),
              note: `Không gửi được email thông báo HDV đến ${customerEmail}`,
            },
          })
          .catch(() => null);
      }
    }

    return created;
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
