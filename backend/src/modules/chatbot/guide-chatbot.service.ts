import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ChatMessageDto } from "./dto/chat-message.dto";

type AuthUser = {
  userId?: bigint;
  role?: string;
  fullName?: string;
} | null;

@Injectable()
export class GuideChatbotService {
  constructor(private readonly prisma: PrismaService) {}

  private norm(value = "") {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private fmt(value: unknown) {
    if (!value) {
      return "--";
    }

    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value as any));
  }

  private fmtTime(value: unknown) {
    if (!value) {
      return "Chưa cập nhật";
    }

    return new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value as any));
  }

  async handle(dto: ChatMessageDto, user: AuthUser) {
    if (!user?.userId || String(user.role).toLowerCase() !== "guide") {
      throw new ForbiddenException("Chỉ hướng dẫn viên được dùng trợ lý này.");
    }

    const guide = await this.prisma.guide.findFirst({
      where: {
        userId: user.userId,
        status: "active",
      },
    });

    if (!guide) {
      throw new ForbiddenException(
        "Tài khoản chưa được liên kết hồ sơ hướng dẫn viên.",
      );
    }

    const conversation = await this.getConversation(
      dto.conversationId,
      user.userId,
      dto.message,
    );

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: dto.message,
        intent: "guide_question",
      },
    });

    const query = this.norm(dto.message);

    let answer = "";
    let data: any = null;
    let intent = "guide_general";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const baseWhere: any = {
      guideId: guide.id,
      status: {
        notIn: ["cancelled", "replaced"],
      },
    };

    if (/^(xin chao|chao|hello|hi)$/.test(query)) {
      intent = "guide_greeting";
      answer =
        `Xin chào ${user.fullName || "hướng dẫn viên"}! ` +
        "Tôi có thể hỗ trợ lịch phân công, chuyến sắp tới, " +
        "danh sách hành khách, lưu ý sức khỏe - ăn uống, " +
        "điểm đón và lịch trình.";
    } else if (/hom nay|lich hom nay|tour nao hom nay/.test(query)) {
      intent = "guide_today_schedule";

      data = await this.assignments({
        ...baseWhere,
        startDate: {
          lte: new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            23,
            59,
            59,
            999,
          ),
        },
        endDate: {
          gte: today,
        },
      });

      answer = this.assignmentAnswer(data, "Lịch hôm nay");
    } else if (/ngay mai|lich ngay mai/.test(query)) {
      intent = "guide_tomorrow_schedule";

      data = await this.assignments({
        ...baseWhere,
        startDate: {
          lte: tomorrowEnd,
        },
        endDate: {
          gte: tomorrow,
        },
      });

      answer = this.assignmentAnswer(data, "Lịch ngày mai");

      // Phải kiểm tra sức khỏe trước danh sách hành khách.
    } else if (
      /di ung|an uong|suc khoe|ghi chu.*khach|khach.*luu y|luu y.*khach/.test(
        query,
      )
    ) {
      intent = "guide_passenger_notes";

      const assignment = await this.nearest(baseWhere);

      if (!assignment) {
        answer = "Bạn chưa có chuyến đi sắp tới.";
      } else {
        const notes = (assignment.booking.guests || []).filter(
          (guest: any) =>
            String(guest.dietaryNotes || "").trim() ||
            String(guest.healthNotes || "").trim(),
        );

        answer = notes.length
          ? `Các lưu ý của chuyến ${assignment.tour.name}:\n` +
            notes
              .map(
                (guest: any) =>
                  `- ${guest.fullName}` +
                  `${
                    guest.dietaryNotes
                      ? ` | Ăn uống: ${guest.dietaryNotes}`
                      : ""
                  }` +
                  `${
                    guest.healthNotes ? ` | Sức khỏe: ${guest.healthNotes}` : ""
                  }`,
              )
              .join("\n")
          : `Chuyến ${assignment.tour.name} chưa có hành khách khai báo lưu ý ăn uống hoặc sức khỏe.`;

        data = {
          assignmentId: assignment.id.toString(),
          notes,
        };
      }
    } else if (
      /danh sach khach|danh sach hanh khach|hanh khach|khach di tour/.test(
        query,
      )
    ) {
      intent = "guide_passenger_list";

      const assignment = await this.nearest(baseWhere);

      if (!assignment) {
        answer = "Bạn chưa có chuyến đi sắp tới.";
      } else {
        const guests = assignment.booking.guests || [];

        answer =
          `Chuyến ${assignment.tour.name} ` +
          `(${this.fmt(assignment.startDate)}) có ` +
          `${guests.length} hành khách khai báo:\n` +
          guests
            .map(
              (guest: any, index: number) =>
                `${index + 1}. ${guest.fullName} - ` +
                `${
                  guest.guestType === "adult"
                    ? "Người lớn"
                    : guest.guestType === "child"
                      ? "Trẻ em"
                      : "Khách"
                }`,
            )
            .join("\n");

        data = {
          assignmentId: assignment.id.toString(),
          guests,
        };
      }
    } else if (/diem don|gio don|tap trung|don o dau/.test(query)) {
      intent = "guide_pickup_info";

      const assignment = await this.nearest(baseWhere);

      if (!assignment) {
        answer = "Bạn chưa có chuyến đi sắp tới.";
      } else {
        answer =
          `Điểm đón chuyến ${assignment.tour.name}:\n` +
          `- Điểm đón: ${assignment.booking.pickupName || "Chưa cập nhật"}\n` +
          `- Địa chỉ: ${
            assignment.booking.pickupAddress || "Chưa cập nhật"
          }\n` +
          `- Giờ đón: ${this.fmtTime(assignment.booking.pickupTime)}`;

        data = {
          assignmentId: assignment.id.toString(),
          bookingId: assignment.booking.id.toString(),
          pickupName: assignment.booking.pickupName,
          pickupAddress: assignment.booking.pickupAddress,
          pickupTime: assignment.booking.pickupTime,
        };
      }
    } else if (/lich trinh|ngay thu|di dau/.test(query)) {
      intent = "guide_itinerary";

      const assignment = await this.nearest(baseWhere);

      if (!assignment) {
        answer = "Bạn chưa có chuyến đi sắp tới.";
      } else {
        const itinerary = assignment.tour.itinerary || [];

        answer = itinerary.length
          ? `Lịch trình ${assignment.tour.name}:\n` +
            itinerary
              .map(
                (item: any) =>
                  `- Ngày ${item.dayNumber}: ` +
                  `${item.title}` +
                  `${item.locationName ? ` (${item.locationName})` : ""}`,
              )
              .join("\n")
          : `Tour ${assignment.tour.name} chưa có lịch trình chi tiết.`;

        data = {
          assignmentId: assignment.id.toString(),
          itinerary,
        };
      }
    } else if (/chuyen sap toi|tour sap toi|phan cong sap toi/.test(query)) {
      intent = "guide_next_assignment";

      const assignment = await this.nearest(baseWhere);

      if (!assignment) {
        answer = "Bạn chưa có chuyến đi sắp tới.";
      } else {
        answer =
          `Chuyến sắp tới của bạn:\n` +
          `- Tour: ${assignment.tour.name}\n` +
          `- Thời gian: ${this.fmt(assignment.startDate)} - ${this.fmt(
            assignment.endDate,
          )}\n` +
          `- Số khách: ${
            assignment.booking.adultCount + assignment.booking.childCount
          }\n` +
          `- Điểm đón: ${assignment.booking.pickupName || "Chưa cập nhật"}`;

        data = assignment;
      }
    } else {
      const rows = await this.assignments({
        ...baseWhere,
        endDate: {
          gte: today,
        },
      });

      answer =
        this.assignmentAnswer(rows, "Các chuyến sắp tới") +
        "\n\nBạn có thể hỏi: lịch hôm nay, chuyến sắp tới, " +
        "danh sách hành khách, lưu ý sức khỏe/ăn uống, " +
        "điểm đón hoặc lịch trình.";

      data = rows;
    }

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        intent,
        meta: {
          guideData: data,
        },
      },
    });

    await this.prisma.chatConversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        lastIntent: intent,
        summary: answer.slice(0, 500),
        updatedAt: new Date(),
      },
    });

    return {
      conversationId: conversation.id.toString(),
      intent,
      answer,
      guideData: data,
      cards: [],
      tours: [],
      suggestedReplies: this.suggestedReplies(intent),
    };
  }

  private suggestedReplies(intent: string) {
    const common = [
      "Hôm nay tôi có tour nào?",
      "Chuyến sắp tới của tôi là chuyến nào?",
      "Có khách nào cần lưu ý sức khỏe không?",
      "Điểm đón chuyến sắp tới ở đâu?",
      "Cho tôi xem lịch trình chuyến sắp tới",
    ];

    if (intent === "guide_passenger_list") {
      return [
        "Có khách nào cần lưu ý sức khỏe không?",
        "Điểm đón chuyến sắp tới ở đâu?",
        "Cho tôi xem lịch trình chuyến sắp tới",
      ];
    }

    if (intent === "guide_passenger_notes") {
      return [
        "Cho tôi danh sách hành khách",
        "Điểm đón chuyến sắp tới ở đâu?",
        "Cho tôi xem lịch trình chuyến sắp tới",
      ];
    }

    return common.slice(0, 3);
  }

  private async getConversation(
    id: string | undefined,
    userId: bigint,
    title: string,
  ) {
    if (id && /^\d+$/.test(id)) {
      const conversation = await this.prisma.chatConversation.findFirst({
        where: {
          id: BigInt(id),
          userId,
          scope: "guide",
        },
      });

      if (conversation) {
        return conversation;
      }
    }

    return this.prisma.chatConversation.create({
      data: {
        userId,
        scope: "guide",
        title: title.slice(0, 100),
        memoryJson: {},
      },
    });
  }

  private assignments(where: any) {
    return this.prisma.guideAssignment.findMany({
      where,
      include: {
        tour: {
          include: {
            itinerary: {
              orderBy: [
                {
                  dayNumber: "asc",
                },
                {
                  itemOrder: "asc",
                },
              ],
            },
          },
        },
        booking: {
          include: {
            guests: true,
            departure: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
      take: 10,
    });
  }

  private nearest(where: any) {
    return this.prisma.guideAssignment.findFirst({
      where: {
        ...where,
        endDate: {
          gte: new Date(),
        },
      },
      include: {
        tour: {
          include: {
            itinerary: {
              orderBy: [
                {
                  dayNumber: "asc",
                },
                {
                  itemOrder: "asc",
                },
              ],
            },
          },
        },
        booking: {
          include: {
            guests: true,
            departure: true,
          },
        },
      },
      orderBy: {
        startDate: "asc",
      },
    });
  }

  private assignmentAnswer(rows: any[], title: string) {
    if (!rows.length) {
      return `${title}: bạn không có chuyến nào.`;
    }

    return (
      `${title}:\n` +
      rows
        .map(
          (assignment: any, index: number) =>
            `${index + 1}. ${assignment.tour.name} | ` +
            `${this.fmt(assignment.startDate)} - ` +
            `${this.fmt(assignment.endDate)} | ` +
            `${
              assignment.booking.adultCount + assignment.booking.childCount
            } khách | ` +
            `${assignment.booking.pickupName || "chưa có điểm đón"}`,
        )
        .join("\n")
    );
  }
}
