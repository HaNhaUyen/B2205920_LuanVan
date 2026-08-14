// @ts-nocheck
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, createVerify, randomInt } from "crypto";
import * as https from "https";
import { AuthRepository } from "./auth.repository";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { EmailService } from "../../common/services/email.service";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v1/certs";

type GoogleTokenPayload = {
  sub: string;
  email: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  private serializeUser(user: any) {
    return {
      id: user.id.toString(),
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      authProvider: user.authProvider,
      avatarUrl: user.avatarUrl,
      identityNumber: user.identityNumber,
      memberPoints: user.memberPoints || 0,
      memberTier: user.memberTier || "bronze",
      birthDate: user.birthDate,
      gender: user.gender || null,
      dietaryNotes: user.dietaryNotes,
      healthNotes: user.healthNotes,
      refundBankName: user.role === "admin" ? null : user.refundBankName,
      refundAccountNo: user.role === "admin" ? null : user.refundAccountNo,
      refundAccountName: user.role === "admin" ? null : user.refundAccountName,
    };
  }

  private hasRefundBankInfo(user: any) {
    return Boolean(
      user?.refundBankName?.trim() &&
      user?.refundAccountNo?.trim() &&
      user?.refundAccountName?.trim(),
    );
  }

  private async syncPendingRefundBankInfo(user: any) {
    if (user.role === "admin" || !this.hasRefundBankInfo(user)) return;

    const prisma = this.authRepository.prisma;
    const pendingRefunds = await prisma.refundRequest.findMany({
      where: {
        userId: user.id,
        status: "pending" as any,
        OR: [
          { refundBankName: null },
          { refundAccountNo: null },
          { refundAccountName: null },
        ],
      },
      select: { id: true, booking: { select: { bookingCode: true } } },
    });

    if (!pendingRefunds.length) return;

    await prisma.refundRequest.updateMany({
      where: {
        id: { in: pendingRefunds.map((item: any) => item.id) },
        status: "pending" as any,
      },
      data: {
        refundBankName: user.refundBankName,
        refundAccountNo: user.refundAccountNo,
        refundAccountName: user.refundAccountName,
      },
    });

    try {
      await prisma.$executeRawUnsafe(
        `UPDATE refund_requests
         SET bank_info_status = 'completed'
         WHERE user_id = ? AND status = 'pending'`,
        user.id.toString(),
      );
    } catch {
      // Cột bank_info_status chỉ được cập nhật khi schema/DB có hỗ trợ.
    }

    await prisma.notification.create({
      data: {
        title: "Khách đã cập nhật tài khoản nhận hoàn",
        message: `${user.fullName || user.email} đã cập nhật tài khoản nhận hoàn cho ${pendingRefunds.length} hồ sơ đang chờ.`,
        content:
          `${user.fullName || user.email} đã cập nhật đầy đủ tài khoản nhận hoàn tiền. ` +
          `Các hồ sơ hoàn tiền pending liên quan đã được đồng bộ thông tin ngân hàng.`,
        targetRole: "admin" as any,
        isPublished: true,
        metadata: {
          userId: String(user.id),
          refundRequestIds: pendingRefunds.map((item: any) => String(item.id)),
        },
      },
    });
  }

  private async syncPaidActiveBookingsFromUserProfile(tx: any, user: any) {
    if (!user?.id || String(user.role || "").toLowerCase() !== "user") {
      return;
    }

    const bookings = await tx.booking.findMany({
      where: {
        userId: user.id,
        bookingStatus: {
          in: ["pending_payment", "waiting_confirmation", "confirmed"] as any,
        },
        payments: {
          some: {
            paymentStatus: "paid" as any,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!bookings.length) return;

    const contactName = String(user.fullName || "").trim();
    const contactEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    const contactPhone = String(user.phone || "").trim();

    if (!contactName || contactName.length < 2 || contactName.length > 150) {
      throw new BadRequestException("Họ tên phải từ 2 đến 150 ký tự.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      throw new BadRequestException("Email không đúng định dạng.");
    }

    if (!/^0\d{9}$/.test(contactPhone)) {
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );
    }

    for (const booking of bookings) {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          contactName,
          contactEmail,
          contactPhone,
        },
      });

      // Người lớn đầu tiên là chủ tài khoản/người đặt tour theo flow hiện tại.
      const ownerGuest = await tx.bookingGuest.findFirst({
        where: {
          bookingId: booking.id,
          guestType: "adult" as any,
        },
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
        },
      });

      if (!ownerGuest) continue;

      const guestData: any = {
        fullName: contactName,
      };

      if (user.birthDate) {
        guestData.dateOfBirth = user.birthDate;
      }

      if (user.gender) {
        guestData.gender = user.gender;
      }

      if (user.identityNumber) {
        guestData.idNumber = String(user.identityNumber).trim();
      }

      await tx.bookingGuest.update({
        where: { id: ownerGuest.id },
        data: guestData,
      });
    }
  }

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const phone = dto.phone?.trim() ? dto.phone.trim() : undefined;

    const existing = await this.authRepository.findUserByEmail(email);
    if (existing) {
      throw new BadRequestException(
        "Email đã tồn tại. Bạn dùng email khác hoặc đăng nhập nhé.",
      );
    }

    if (phone) {
      const existingPhone = await this.authRepository.findUserByPhone(phone);
      if (existingPhone) {
        throw new BadRequestException("Số điện thoại đã được sử dụng.");
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.authRepository.createUser({
      fullName,
      email,
      phone,
      passwordHash,
      role: "user",
      authProvider: "local",
    });

    await this.assignTierVouchersToUser(user.id);

    return this.buildResponse(user);
  }

  async login(dto: LoginDto) {
    const rawIdentifier = String(dto.identifier || dto.email || "").trim();
    const password = String(dto.password || "");

    if (!rawIdentifier) {
      throw new UnauthorizedException(
        "Vui lòng nhập email hoặc tên tài khoản.",
      );
    }

    if (!password) {
      throw new UnauthorizedException("Vui lòng nhập mật khẩu.");
    }

    const isEmail = rawIdentifier.includes("@");

    /*
     * Đăng nhập bằng email:
     * Email là duy nhất nên chỉ cần tìm một tài khoản.
     */
    if (isEmail) {
      const user = await this.authRepository.findUserByEmail(
        rawIdentifier.toLowerCase(),
      );

      if (!user) {
        throw new UnauthorizedException(
          "Email/tên tài khoản hoặc mật khẩu không đúng.",
        );
      }

      if (!user.passwordHash) {
        throw new UnauthorizedException(
          "Tài khoản này đăng nhập bằng Google. Bạn hãy dùng nút Đăng nhập với Google.",
        );
      }

      const matched = await bcrypt.compare(password, user.passwordHash);

      if (!matched) {
        throw new UnauthorizedException(
          "Email/tên tài khoản hoặc mật khẩu không đúng.",
        );
      }

      if (user.status !== "active") {
        throw new UnauthorizedException("Tài khoản hiện đang bị khóa.");
      }

      return this.buildResponse(user);
    }

    /*
     * Đăng nhập bằng tên:
     * Lấy tất cả tài khoản trùng tên rồi so sánh mật khẩu từng tài khoản.
     */
    const users = await this.authRepository.findUsersByFullName(rawIdentifier);

    if (!users.length) {
      throw new UnauthorizedException(
        "Email/tên tài khoản hoặc mật khẩu không đúng.",
      );
    }

    const matchedUsers: any[] = [];

    for (const user of users) {
      if (!user.passwordHash) {
        continue;
      }

      const matched = await bcrypt.compare(password, user.passwordHash);

      if (matched) {
        matchedUsers.push(user);
      }
    }

    if (matchedUsers.length === 0) {
      throw new UnauthorizedException(
        "Email/tên tài khoản hoặc mật khẩu không đúng.",
      );
    }

    /*
     * Bình thường chỉ có một tài khoản khớp.
     * Nếu hai người trùng cả tên lẫn mật khẩu thì không thể biết user muốn vào tài khoản nào.
     */
    if (matchedUsers.length > 1) {
      throw new BadRequestException(
        "Có nhiều tài khoản trùng cả tên và mật khẩu. Vui lòng đăng nhập bằng email.",
      );
    }

    const user = matchedUsers[0];

    if (user.status !== "active") {
      throw new UnauthorizedException("Tài khoản hiện đang bị khóa.");
    }

    return this.buildResponse(user);
  }

  private passwordResetOtpHash(email: string, otp: string) {
    const secret = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
    return createHash("sha256")
      .update(`${email}:${otp}:${secret}`)
      .digest("hex");
  }

  async forgotPassword(rawEmail: string) {
    const email = String(rawEmail || "")
      .trim()
      .toLowerCase();
    if (!email) {
      throw new BadRequestException("Vui lòng nhập email.");
    }

    const user = await this.authRepository.findUserByEmail(email);

    // Chỉ cho phép quên mật khẩu khi email thực sự tồn tại trong hệ thống.
    if (!user) {
      throw new BadRequestException(
        "Email này chưa được đăng ký trong hệ thống.",
      );
    }

    if (user.status !== "active") {
      throw new BadRequestException("Tài khoản này hiện đang bị khóa.");
    }

    const prisma = this.authRepository.prisma;
    const existing = await prisma.passwordResetOtp.findUnique({
      where: { email },
    });

    if (existing) {
      const elapsedMs = Date.now() - new Date(existing.createdAt).getTime();
      if (elapsedMs < 60_000) {
        throw new BadRequestException(
          `Vui lòng chờ ${Math.max(1, Math.ceil((60_000 - elapsedMs) / 1000))} giây trước khi gửi lại mã.`,
        );
      }
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const codeHash = this.passwordResetOtpHash(email, otp);

    await prisma.passwordResetOtp.upsert({
      where: { email },
      create: {
        userId: user.id,
        email,
        codeHash,
        expiresAt,
        attempts: 0,
      },
      update: {
        userId: user.id,
        codeHash,
        expiresAt,
        attempts: 0,
        createdAt: new Date(),
      },
    });

    try {
      const brand = process.env.EMAIL_BRAND_NAME || "Travela";
      await this.emailService.sendMail({
        to: email,
        subject: `[${brand}] Mã xác nhận đặt lại mật khẩu`,
        text: `Mã xác nhận đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút. Không chia sẻ mã này cho người khác.`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937;line-height:1.6">
            <h2 style="color:#5a9d34;margin-bottom:8px">Đặt lại mật khẩu ${brand}</h2>
            <p>Xin chào <strong>${String(user.fullName || "bạn")}</strong>,</p>
            <p>Bạn vừa yêu cầu đặt lại mật khẩu. Mã xác nhận của bạn là:</p>
            <div style="font-size:30px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;margin:18px 0;background:#f1f5f9;border-radius:12px">${otp}</div>
            <p>Mã này có hiệu lực trong <strong>10 phút</strong> và chỉ sử dụng được một lần.</p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này.</p>
            <p style="color:#64748b;font-size:13px">Vì lý do bảo mật, không chia sẻ mã xác nhận cho bất kỳ ai.</p>
          </div>
        `,
      });
    } catch (error) {
      await prisma.passwordResetOtp
        .delete({ where: { email } })
        .catch(() => null);
      throw new BadRequestException(
        "Không thể gửi mã xác nhận lúc này. Vui lòng thử lại sau.",
      );
    }

    return {
      message: "Mã xác nhận đã được gửi đến email của bạn.",
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = String(dto.email || "")
      .trim()
      .toLowerCase();
    const otp = String(dto.otp || "").trim();
    const newPassword = String(dto.newPassword || "");
    const confirmPassword = String(dto.confirmPassword || "");

    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException("Mã xác nhận phải gồm đúng 6 chữ số.");
    }
    if (newPassword.length < 6 || newPassword.length > 72) {
      throw new BadRequestException("Mật khẩu mới phải từ 6 đến 72 ký tự.");
    }
    if (newPassword !== confirmPassword) {
      throw new BadRequestException("Mật khẩu nhập lại không khớp.");
    }

    const prisma = this.authRepository.prisma;
    const reset = await prisma.passwordResetOtp.findUnique({
      where: { email },
    });

    if (!reset) {
      throw new BadRequestException(
        "Mã xác nhận không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.",
      );
    }

    if (new Date(reset.expiresAt).getTime() < Date.now()) {
      await prisma.passwordResetOtp
        .delete({ where: { email } })
        .catch(() => null);
      throw new BadRequestException(
        "Mã xác nhận đã hết hạn. Vui lòng yêu cầu mã mới.",
      );
    }

    if (reset.attempts >= 5) {
      await prisma.passwordResetOtp
        .delete({ where: { email } })
        .catch(() => null);
      throw new BadRequestException(
        "Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.",
      );
    }

    const expectedHash = this.passwordResetOtpHash(email, otp);
    if (expectedHash !== reset.codeHash) {
      const updated = await prisma.passwordResetOtp.update({
        where: { email },
        data: { attempts: { increment: 1 } },
        select: { attempts: true },
      });
      const remaining = Math.max(0, 5 - updated.attempts);
      if (remaining === 0) {
        await prisma.passwordResetOtp
          .delete({ where: { email } })
          .catch(() => null);
        throw new BadRequestException(
          "Bạn đã nhập sai mã quá nhiều lần. Vui lòng yêu cầu mã mới.",
        );
      }
      throw new BadRequestException(
        `Mã xác nhận không đúng. Bạn còn ${remaining} lần thử.`,
      );
    }

    const user = await this.authRepository.findUserById(reset.userId);
    if (!user || user.status !== "active") {
      await prisma.passwordResetOtp
        .delete({ where: { email } })
        .catch(() => null);
      throw new BadRequestException(
        "Không thể đặt lại mật khẩu cho tài khoản này.",
      );
    }

    if (
      user.passwordHash &&
      (await bcrypt.compare(newPassword, user.passwordHash))
    ) {
      throw new BadRequestException(
        "Mật khẩu mới phải khác mật khẩu hiện tại.",
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const nextProvider =
      user.authProvider === "google" ? "hybrid" : user.authProvider;

    await prisma.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          authProvider: nextProvider,
          passwordChangedAt: new Date(),
        },
      });
      await tx.passwordResetOtp.delete({ where: { email } });
    });

    return {
      message:
        "Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.",
    };
  }

  async googleLogin(credential: string) {
    if (!credential) {
      throw new BadRequestException("Thiếu thông tin đăng nhập Google.");
    }

    const payload = await this.verifyGoogleCredential(credential);
    const email = payload.email.trim().toLowerCase();
    const fullName = payload.name?.trim() || email.split("@")[0];
    const existingByGoogle = await this.authRepository.findUserByGoogleId(
      payload.sub,
    );
    let user =
      existingByGoogle ?? (await this.authRepository.findUserByEmail(email));

    if (!user) {
      const passwordHash = await bcrypt.hash(
        `google-${payload.sub}-${Date.now()}`,
        10,
      );
      user = await this.authRepository.createUser({
        fullName,
        email,
        passwordHash,
        role: "user",
        googleId: payload.sub,
        authProvider: "google",
        avatarUrl: payload.picture,
      });
      await this.assignTierVouchersToUser(user.id);
    } else {
      if (user.status !== "active") {
        throw new UnauthorizedException("Tài khoản hiện đang bị khóa.");
      }

      const nextProvider = user.authProvider === "local" ? "hybrid" : "google";
      // Không ghi đè fullName/avatarUrl mỗi lần đăng nhập Google, vì user có thể đã tự đổi tên/avatar trong hồ sơ.
      user = await this.authRepository.updateUser(user.id, {
        googleId: payload.sub,
        authProvider: nextProvider,
        avatarUrl: user.avatarUrl || payload.picture || null,
      });
    }

    return this.buildResponse(user);
  }

  async logout(userId: bigint, token: string) {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await (this.authRepository as any).prisma.revokedToken
      .create({
        data: {
          tokenHash,
          userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
      .catch(() => null);
    return { message: "Đã đăng xuất và thu hồi token." };
  }

  async me(userId: bigint) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("Không tìm thấy tài khoản.");
    }

    return this.serializeUser(user);
  }

  async updateMe(userId: bigint, dto: UpdateProfileDto) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundException("Không tìm thấy tài khoản.");
    }

    const normalizedRole = String(user.role || "")
      .trim()
      .toLowerCase();
    const emailLockedRoles = new Set([
      "admin",
      "guide",
      "tour_guide",
      "tourguide",
    ]);
    const emailEditableRoles = new Set(["user", "customer"]);
    const isEmailLocked = emailLockedRoles.has(normalizedRole);
    const canEditEmail = emailEditableRoles.has(normalizedRole);
    const requestedEmail =
      dto.email === undefined
        ? undefined
        : String(dto.email || "")
            .trim()
            .toLowerCase();
    const currentEmail = String(user.email || "")
      .trim()
      .toLowerCase();

    if (requestedEmail !== undefined && !requestedEmail) {
      throw new BadRequestException("Vui lòng nhập email.");
    }

    if (isEmailLocked && requestedEmail && requestedEmail !== currentEmail) {
      throw new BadRequestException(
        "Admin và hướng dẫn viên không thể thay đổi email.",
      );
    }

    if (requestedEmail && !isEmailLocked && !canEditEmail) {
      throw new BadRequestException(
        "Role hiện tại không được phép thay đổi email tại hồ sơ.",
      );
    }

    if (canEditEmail && requestedEmail && requestedEmail !== currentEmail) {
      const duplicatedUser = await this.authRepository.prisma.user.findFirst({
        where: {
          email: requestedEmail,
          NOT: { id: user.id },
        },
        select: { id: true },
      });

      if (duplicatedUser) {
        throw new ConflictException(
          "Email này đã được sử dụng bởi tài khoản khác.",
        );
      }
    }

    const nextPhone =
      dto.phone === undefined
        ? user.phone
        : dto.phone === null
          ? null
          : String(dto.phone).trim() || null;
    if (nextPhone && nextPhone !== user.phone) {
      const existingPhone =
        await this.authRepository.findUserByPhone(nextPhone);
      if (existingPhone && String(existingPhone.id) !== String(user.id)) {
        throw new BadRequestException("Số điện thoại đã được sử dụng.");
      }
    }

    const normalizeNullable = (value: unknown) => {
      if (value === undefined) return undefined;
      const text = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
      return text || null;
    };
    const normalizeAccountNo = (value: unknown) => {
      if (value === undefined) return undefined;
      const text = String(value || "")
        .replace(/\s+/g, "")
        .trim();
      return text || null;
    };

    const bankName = normalizeNullable(dto.refundBankName);
    const accountNo = normalizeAccountNo(dto.refundAccountNo);
    const accountNameRaw = normalizeNullable(dto.refundAccountName);
    const accountName =
      accountNameRaw === undefined
        ? undefined
        : accountNameRaw?.toUpperCase() || null;
    const touchedBank =
      bankName !== undefined ||
      accountNo !== undefined ||
      accountName !== undefined;

    if (touchedBank && user.role !== "admin") {
      const nextBankName =
        bankName === undefined ? user.refundBankName : bankName;
      const nextAccountNo =
        accountNo === undefined ? user.refundAccountNo : accountNo;
      const nextAccountName =
        accountName === undefined ? user.refundAccountName : accountName;
      const hasAny = Boolean(nextBankName || nextAccountNo || nextAccountName);
      const hasAll = Boolean(nextBankName && nextAccountNo && nextAccountName);

      if (hasAny && !hasAll) {
        throw new BadRequestException(
          "Vui lòng nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản nhận hoàn tiền.",
        );
      }

      if (nextAccountNo && !/^\d{6,20}$/.test(nextAccountNo)) {
        throw new BadRequestException(
          "Số tài khoản nhận hoàn tiền phải gồm từ 6 đến 20 chữ số.",
        );
      }

      if (nextAccountName && nextAccountName.length < 2) {
        throw new BadRequestException(
          "Tên chủ tài khoản phải có ít nhất 2 ký tự.",
        );
      }
    }

    const fullName =
      dto.fullName === undefined || dto.fullName === null
        ? user.fullName
        : String(dto.fullName).trim() || user.fullName;

    const identityNumber =
      dto.identityNumber === undefined || dto.identityNumber === null
        ? user.identityNumber
        : String(dto.identityNumber).trim() || null;

    const birthDate =
      dto.birthDate === undefined
        ? user.birthDate
        : dto.birthDate
          ? new Date(String(dto.birthDate))
          : null;

    if (birthDate instanceof Date && Number.isNaN(birthDate.getTime())) {
      throw new BadRequestException("Ngày sinh không hợp lệ.");
    }

    const gender =
      dto.gender === undefined
        ? user.gender
        : dto.gender === null
          ? null
          : String(dto.gender).trim().toLowerCase() || null;

    if (gender && !["male", "female", "other"].includes(gender)) {
      throw new BadRequestException(
        "Giới tính chỉ nhận male, female hoặc other.",
      );
    }

    if (!fullName || fullName.length < 2 || fullName.length > 150) {
      throw new BadRequestException("Họ tên phải từ 2 đến 150 ký tự.");
    }

    if (nextPhone && !/^0\d{9}$/.test(nextPhone)) {
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );
    }

    if (
      identityNumber &&
      String(identityNumber) !== String(user.identityNumber || "")
    ) {
      const duplicatedIdentity =
        await this.authRepository.prisma.user.findFirst({
          where: {
            identityNumber,
            NOT: { id: user.id },
          },
          select: { id: true },
        });

      if (duplicatedIdentity) {
        throw new ConflictException(
          "CCCD này đã được sử dụng bởi tài khoản khác.",
        );
      }
    }

    if (identityNumber && !/^\d{12}$/.test(identityNumber)) {
      throw new BadRequestException("CCCD phải gồm đúng 12 chữ số.");
    }

    if (birthDate) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);

      if (birthDate.getTime() > today.getTime()) {
        throw new BadRequestException(
          "Ngày sinh không hợp lệ hoặc nằm trong tương lai.",
        );
      }
    }

    const dietaryNotes =
      dto.dietaryNotes === undefined
        ? user.dietaryNotes
        : normalizeNullable(dto.dietaryNotes);

    const healthNotes =
      dto.healthNotes === undefined
        ? user.healthNotes
        : normalizeNullable(dto.healthNotes);

    const updateData: any = {
      fullName,
      phone: nextPhone,
      identityNumber,
      birthDate,
      gender,
      dietaryNotes,
      healthNotes,
    };

    if (canEditEmail && requestedEmail && requestedEmail !== currentEmail) {
      updateData.email = requestedEmail;
    }

    if (touchedBank && user.role !== "admin") {
      updateData.refundBankName =
        bankName === undefined ? user.refundBankName : bankName;
      updateData.refundAccountNo =
        accountNo === undefined ? user.refundAccountNo : accountNo;
      updateData.refundAccountName =
        accountName === undefined ? user.refundAccountName : accountName;
    }

    const updated = await this.authRepository.prisma.$transaction(
      async (tx: any) => {
        const nextUser = await tx.user.update({
          where: { id: user.id },
          data: updateData,
        });

        await this.syncPaidActiveBookingsFromUserProfile(tx, nextUser);

        return nextUser;
      },
    );

    await this.syncPendingRefundBankInfo(updated);

    return this.serializeUser(updated);
  }

  async changePassword(userId: bigint, dto: ChangePasswordDto) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("Không tìm thấy tài khoản.");
    }

    if (dto.newPassword.trim().length < 6) {
      throw new BadRequestException("Mật khẩu mới phải có ít nhất 6 ký tự.");
    }

    const requireCurrentPassword =
      user.authProvider === "local" || user.authProvider === "hybrid";
    if (requireCurrentPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException("Vui lòng nhập mật khẩu hiện tại.");
      }
      if (!user.passwordHash) {
        throw new BadRequestException(
          "Tài khoản Google chưa có mật khẩu cục bộ. Bạn chỉ cần nhập mật khẩu mới để thiết lập.",
        );
      }
      const matched = await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!matched) {
        throw new BadRequestException("Mật khẩu hiện tại không đúng.");
      }
    }

    if (
      user.passwordHash &&
      (await bcrypt.compare(dto.newPassword.trim(), user.passwordHash))
    ) {
      throw new BadRequestException(
        "Mật khẩu mới phải khác mật khẩu hiện tại.",
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword.trim(), 10);
    await this.authRepository.updateUser(user.id, { passwordHash });

    return { message: "Đã cập nhật mật khẩu." };
  }

  async uploadAvatar(userId: bigint, file: Express.Multer.File) {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException("Không tìm thấy tài khoản.");
    }
    if (!file) {
      throw new BadRequestException("Thiếu file ảnh đại diện.");
    }

    const updated = await this.authRepository.updateUser(user.id, {
      avatarUrl: `/uploads/avatars/${file.filename}`,
    });

    return this.serializeUser(updated);
  }

  private async assignTierVouchersToUser(userId: bigint) {
    const prisma = (this.authRepository as any).prisma;
    if (!prisma?.user || !prisma?.voucher || !prisma?.userVoucher) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, memberTier: true },
    });

    if (!user || user.role !== "user" || user.status !== "active") return;

    const today = new Date();
    const vouchers = await prisma.voucher.findMany({
      where: {
        memberTier: user.memberTier || "bronze",
        status: "active",
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: { id: true },
    });

    if (!vouchers.length) return;

    await prisma.userVoucher.createMany({
      data: vouchers.map((voucher: any) => ({
        userId: user.id,
        voucherId: voucher.id,
        status: "available",
      })),
      skipDuplicates: true,
    });
  }

  private buildResponse(user: any) {
    const payload = {
      sub: user.id.toString(),
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: this.serializeUser(user),
    };
  }

  private async verifyGoogleCredential(
    credential: string,
  ): Promise<GoogleTokenPayload> {
    const [encodedHeader, encodedPayload, encodedSignature] =
      credential.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException("Invalid Google credential");
    }

    const header = JSON.parse(
      Buffer.from(encodedHeader, "base64url").toString("utf8"),
    ) as {
      alg?: string;
      kid?: string;
    };
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as GoogleTokenPayload;

    if (!header.kid || header.alg !== "RS256") {
      throw new UnauthorizedException("Unsupported Google credential");
    }

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      throw new BadRequestException("Backend chưa cấu hình GOOGLE_CLIENT_ID.");
    }

    const certs = await this.fetchGoogleCerts();
    const cert = certs[header.kid];
    if (!cert) {
      throw new UnauthorizedException("Google certificate not found");
    }

    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();

    const signature = Buffer.from(
      this.normalizeBase64(encodedSignature),
      "base64",
    );
    const isValidSignature = verifier.verify(cert, signature);
    if (!isValidSignature) {
      throw new UnauthorizedException("Invalid Google signature");
    }

    const isValidIssuer =
      payload.iss === "accounts.google.com" ||
      payload.iss === "https://accounts.google.com";
    const isAudienceValid = payload.aud === googleClientId;
    const isEmailVerified =
      payload.email_verified === true || payload.email_verified === "true";
    const isExpired = !payload.exp || payload.exp * 1000 < Date.now();

    if (
      !isValidIssuer ||
      !isAudienceValid ||
      !isEmailVerified ||
      isExpired ||
      !payload.email ||
      !payload.sub
    ) {
      throw new UnauthorizedException("Google credential validation failed");
    }

    return payload;
  }

  private normalizeBase64(input: string): string {
    return input
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(input.length / 4) * 4, "=");
  }

  private fetchGoogleCerts(): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      https
        .get(GOOGLE_CERTS_URL, (response) => {
          let raw = "";
          response.on("data", (chunk) => {
            raw += chunk;
          });
          response.on("end", () => {
            try {
              resolve(JSON.parse(raw) as Record<string, string>);
            } catch (error) {
              reject(error);
            }
          });
        })
        .on("error", reject);
    });
  }
}
