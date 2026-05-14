import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateContactDto } from "./dto/create-contact.dto";
import { AdminUpsertContactDto } from "./dto/admin-upsert-contact.dto";
import { ReplyContactDto } from "./dto/reply-contact.dto";
import { EmailService } from "../../common/services/email.service";

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async create(dto: CreateContactDto, userId?: bigint) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;
    const subject = dto.subject.trim();
    const message = dto.message.trim();

    if (userId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!owner) throw new NotFoundException("User not found");
      if (owner.status !== "active") {
        throw new BadRequestException(
          "Tài khoản hiện không thể gửi liên hệ mới.",
        );
      }
    }

    const recentDuplicate = await this.prisma.contact.findFirst({
      where: {
        email,
        subject,
        message,
        createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
      },
      select: { id: true, createdAt: true },
    });
    if (recentDuplicate) {
      throw new BadRequestException(
        "Bạn vừa gửi nội dung liên hệ tương tự. Vui lòng chờ ít phút trước khi gửi lại.",
      );
    }

    const contact = await this.prisma.contact.create({
      data: {
        userId,
        fullName: dto.fullName.trim(),
        email,
        phone,
        subject,
        message,
        status: "new",
      },
    });

    const adminEmailSent = false;
    const adminEmailError: string | null = null;

    return {
      ...contact,
      adminEmailSent,
      adminEmailError,
    };
  }

  async findAll() {
    return this.prisma.contact.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async adminList(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    emailStatus?: string;
  }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where = this.buildAdminWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          handler: { select: { id: true, fullName: true, email: true } },
          emailLogs: {
            orderBy: { attemptedAt: "desc" },
            take: 1,
            include: {
              adminUser: { select: { id: true, fullName: true, email: true } },
            },
          },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async adminDetail(id: number) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: BigInt(id) },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, phone: true },
        },
        handler: { select: { id: true, fullName: true, email: true } },
        emailLogs: {
          orderBy: { attemptedAt: "desc" },
          include: {
            adminUser: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  async adminEmailHistory(query: {
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    emailStatus?: string;
    contactId?: string;
  }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 20), 1), 200);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.contactId) where.contactId = BigInt(query.contactId);
    if (query.status) where.contact = { is: { status: query.status } };
    if (query.emailStatus === "sent") where.sendStatus = "sent";
    if (query.emailStatus === "failed") where.sendStatus = "failed";
    if (query.emailStatus === "pending") where.id = BigInt(0);
    if (query.search) {
      where.OR = [
        { recipientEmail: { contains: query.search } },
        { subject: { contains: query.search } },
        { bodyPreview: { contains: query.search } },
        { errorMessage: { contains: query.search } },
        { contact: { is: { fullName: { contains: query.search } } } },
        { contact: { is: { email: { contains: query.search } } } },
        { contact: { is: { subject: { contains: query.search } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contactEmailLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { attemptedAt: "desc" },
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              email: true,
              subject: true,
              status: true,
            },
          },
          adminUser: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.contactEmailLog.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  adminCreate(dto: AdminUpsertContactDto) {
    return this.prisma.contact.create({
      data: {
        userId: dto.userId ? BigInt(dto.userId) : null,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        subject: dto.subject,
        message: dto.message,
        status: dto.status ?? "new",
        handledBy: dto.handledBy ? BigInt(dto.handledBy) : null,
        adminReply: dto.adminReply || null,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        handler: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async adminUpdate(id: number, dto: AdminUpsertContactDto) {
    const existing = await this.prisma.contact.findUnique({
      where: { id: BigInt(id) },
    });
    if (!existing) throw new NotFoundException("Contact not found");

    return this.prisma.contact.update({
      where: { id: BigInt(id) },
      data: {
        userId: dto.userId ? BigInt(dto.userId) : null,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        subject: dto.subject,
        message: dto.message,
        status: dto.status ?? existing.status,
        handledBy: dto.handledBy ? BigInt(dto.handledBy) : existing.handledBy,
        adminReply:
          dto.adminReply !== undefined ? dto.adminReply : existing.adminReply,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        handler: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  async replyToContact(id: number, dto: ReplyContactDto, adminUserId: bigint) {
    const existing = await this.prisma.contact.findUnique({
      where: { id: BigInt(id) },
      include: {
        handler: { select: { fullName: true, email: true } },
      },
    });
    if (!existing) throw new NotFoundException("Contact not found");

    const adminUser = await this.prisma.user.findUnique({
      where: { id: adminUserId },
      select: { id: true, fullName: true, email: true },
    });

    const replyMessage = dto.replyMessage?.trim();
    if (!replyMessage) {
      throw new BadRequestException("Vui lòng nhập nội dung phản hồi.");
    }

    const now = new Date();
    const status = dto.status || "resolved";
    const emailSubject =
      dto.subject?.trim() || `Phản hồi từ Travela: ${existing.subject}`;
    let replyEmailError: string | null = null;
    let replyEmailSentAt: Date | null = null;

    if (dto.sendEmail !== false) {
      try {
        const adminName =
          adminUser?.fullName ||
          existing.handler?.fullName ||
          "Đội ngũ Travela";
        const html = this.buildReplyTemplate({
          customerName: existing.fullName,
          adminName,
          originalSubject: existing.subject,
          originalMessage: existing.message,
          replyMessage,
          contactEmail: existing.email,
          contactPhone: existing.phone || "",
        });

        await this.emailService.sendMail({
          to: existing.email.trim(),
          subject: emailSubject,
          html,
          text: `${replyMessage}

---
Khách: ${existing.fullName}
Email: ${existing.email}
Chủ đề: ${existing.subject}`,
        });
        replyEmailSentAt = now;
      } catch (error: any) {
        replyEmailError = error?.message || "Không gửi được email phản hồi.";
      }

      await this.prisma.contactEmailLog.create({
        data: {
          contactId: existing.id,
          adminUserId,
          recipientEmail: existing.email,
          subject: emailSubject,
          bodyPreview: replyMessage,
          provider: "smtp",
          sendStatus: replyEmailSentAt ? "sent" : "failed",
          attemptedAt: now,
          sentAt: replyEmailSentAt,
          errorMessage: replyEmailError,
        },
      });
    }

    const updated = await this.prisma.contact.update({
      where: { id: BigInt(id) },
      data: {
        adminReply: replyMessage,
        repliedAt: now,
        status,
        handledBy: adminUserId,
        replyEmailSentAt,
        replyEmailError,
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        handler: { select: { id: true, fullName: true, email: true } },
      },
    });

    return {
      contact: updated,
      email: {
        attempted: dto.sendEmail !== false,
        sent: Boolean(replyEmailSentAt),
        error: replyEmailError,
        subject: emailSubject,
      },
      message: replyEmailSentAt
        ? "Đã lưu phản hồi và gửi email cho khách hàng."
        : dto.sendEmail === false
          ? "Đã lưu phản hồi nội bộ, chưa gửi email."
          : "Đã lưu phản hồi nhưng gửi email thất bại. Kiểm tra cấu hình SMTP.",
    };
  }

  async adminDelete(id: number) {
    const existing = await this.prisma.contact.findUnique({
      where: { id: BigInt(id) },
      include: { emailLogs: { take: 1 } },
    });
    if (!existing) throw new NotFoundException("Contact not found");

    if (
      existing.adminReply ||
      existing.repliedAt ||
      existing.emailLogs.length > 0
    ) {
      throw new BadRequestException(
        "Liên hệ này đã có phản hồi hoặc lịch sử gửi email. Không nên xóa cứng để tránh mất log chăm sóc khách hàng.",
      );
    }

    await this.prisma.contact.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }

  private buildAdminWhere(query: {
    search?: string;
    status?: string;
    emailStatus?: string;
  }) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.emailStatus === "sent") {
      where.replyEmailSentAt = { not: null };
    } else if (query.emailStatus === "failed") {
      where.replyEmailSentAt = null;
      where.replyEmailError = { not: null };
    } else if (query.emailStatus === "pending") {
      where.replyEmailSentAt = null;
      where.replyEmailError = null;
    }
    if (query.search) {
      where.OR = [
        { fullName: { contains: query.search } },
        { email: { contains: query.search } },
        { subject: { contains: query.search } },
        { message: { contains: query.search } },
        { adminReply: { contains: query.search } },
      ];
    }
    return where;
  }

  private buildReplyTemplate(input: {
    customerName: string;
    adminName: string;
    originalSubject: string;
    originalMessage: string;
    replyMessage: string;
    contactEmail: string;
    contactPhone: string;
  }) {
    const safeReply = input.replyMessage.replace(/\n/g, "<br />");
    const safeOriginal = input.originalMessage.replace(/\n/g, "<br />");

    return `
      <div style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#0f172a;line-height:1.6;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;border:1px solid #e2e8f0;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <div style="width:44px;height:44px;border-radius:999px;background:linear-gradient(135deg,#ffab22,#ff8a00);"></div>
            <div>
              <div style="font-size:22px;font-weight:700;">Travela</div>
              <div style="color:#64748b;">Phản hồi yêu cầu liên hệ</div>
            </div>
          </div>
          <p>Xin chào <strong>${input.customerName}</strong>,</p>
          <p>Travela đã nhận và phản hồi yêu cầu của bạn với chủ đề <strong>${input.originalSubject}</strong>.</p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin:18px 0;">
            <div style="font-weight:700;margin-bottom:8px;">Nội dung phản hồi từ admin</div>
            <div>${safeReply}</div>
          </div>
          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin:18px 0;">
            <div style="font-weight:700;margin-bottom:8px;">Tin nhắn bạn đã gửi</div>
            <div>${safeOriginal}</div>
          </div>
          <p style="color:#64748b;font-size:13px;">Nếu cần trao đổi thêm, bạn có thể trả lời lại email này hoặc liên hệ qua ${input.contactEmail}${input.contactPhone ? ` / ${input.contactPhone}` : ""}.</p>
        </div>
      </div>
    `;
  }
}
