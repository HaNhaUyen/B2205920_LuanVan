import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TravelCompanionsService {
  constructor(private readonly prisma: PrismaService) {}

  private clean(body: any) {
    const fullName = String(body?.fullName || "").trim();
    if (!fullName)
      throw new BadRequestException("Họ tên hành khách là bắt buộc.");
    if (fullName.length < 2 || fullName.length > 150)
      throw new BadRequestException(
        "Họ tên hành khách phải từ 2 đến 150 ký tự.",
      );

    const relationship = String(body?.relationship || "").trim();
    if (!relationship)
      throw new BadRequestException("Mối quan hệ là bắt buộc.");
    if (relationship.length < 2 || relationship.length > 100)
      throw new BadRequestException("Mối quan hệ phải từ 2 đến 100 ký tự.");

    const dateOfBirth = String(body?.dateOfBirth || "").trim();
    if (!dateOfBirth) throw new BadRequestException("Ngày sinh là bắt buộc.");
    {
      const date = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isNaN(date.getTime()) || date > today)
        throw new BadRequestException(
          "Ngày sinh không hợp lệ hoặc nằm trong tương lai.",
        );
    }

    const gender = String(body?.gender || "").trim();
    if (!gender) throw new BadRequestException("Giới tính là bắt buộc.");
    if (!["male", "female", "other"].includes(gender))
      throw new BadRequestException("Giới tính không hợp lệ.");

    if (
      body?.guestType != null &&
      !["adult", "child", "infant"].includes(body.guestType)
    )
      throw new BadRequestException("Loại hành khách không hợp lệ.");

    if (
      body?.idType != null &&
      !["cccd", "passport", "birth_certificate", "other"].includes(body.idType)
    )
      throw new BadRequestException("Loại giấy tờ không hợp lệ.");

    const nationality = String(body?.nationality || "").trim();
    if (!nationality) throw new BadRequestException("Quốc tịch là bắt buộc.");
    if (nationality.length < 2 || nationality.length > 100)
      throw new BadRequestException("Quốc tịch phải từ 2 đến 100 ký tự.");

    const rawIdNumber = String(body?.idNumber || "").trim();
    if (!rawIdNumber) throw new BadRequestException("Số giấy tờ là bắt buộc.");
    if (rawIdNumber.length > 50)
      throw new BadRequestException("Số giấy tờ tối đa 50 ký tự.");
    if (body?.idType === "cccd" && !/^\d{12}$/.test(rawIdNumber))
      throw new BadRequestException("CCCD phải gồm đúng 12 chữ số.");
    if (body?.idType === "passport" && !/^[A-Z]\d{7}$/.test(rawIdNumber))
      throw new BadRequestException(
        "Số hộ chiếu phải gồm đúng 8 ký tự: 1 chữ cái in hoa đứng đầu và 7 chữ số.",
      );
    if (body?.idType === "birth_certificate" && !/^\d{12}$/.test(rawIdNumber))
      throw new BadRequestException(
        "Số giấy khai sinh phải gồm đúng 12 chữ số.",
      );
    if (
      body?.idType === "other" &&
      !/^[A-Za-z0-9\-\/.]{2,50}$/.test(rawIdNumber)
    )
      throw new BadRequestException("Số giấy tờ không hợp lệ.");

    const rawPhone = String(body?.phone || "").trim();
    if (!rawPhone) throw new BadRequestException("Số điện thoại là bắt buộc.");
    if (!/^0\d{9}$/.test(rawPhone))
      throw new BadRequestException(
        "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.",
      );

    if (String(body?.dietaryNotes || "").trim().length > 2000)
      throw new BadRequestException("Ghi chú ăn uống tối đa 2000 ký tự.");
    if (String(body?.healthNotes || "").trim().length > 2000)
      throw new BadRequestException("Ghi chú sức khỏe tối đa 2000 ký tự.");

    const guestType = ["adult", "child", "infant"].includes(body?.guestType)
      ? body.guestType
      : "adult";
    const idType = ["cccd", "passport", "birth_certificate", "other"].includes(
      body?.idType,
    )
      ? body.idType
      : null;

    return {
      fullName,
      relationship: relationship || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      guestType,
      idType,
      idNumber: rawIdNumber || null,
      nationality: nationality || "Việt Nam",
      phone: rawPhone || null,
      dietaryNotes: String(body?.dietaryNotes || "").trim() || null,
      healthNotes: String(body?.healthNotes || "").trim() || null,
      isDefault: Boolean(body?.isDefault),
    };
  }

  private async assertNoDuplicate(
    userId: number,
    idNumber: string | null,
    phone: string | null,
    excludeId?: number,
  ) {
    if (idNumber) {
      const duplicatedId = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM saved_travelers
         WHERE id_number=? ${excludeId ? "AND id<>?" : ""}
         LIMIT 1`,
        ...(excludeId ? [idNumber, excludeId] : [idNumber]),
      );

      if (duplicatedId.length) {
        throw new BadRequestException(
          "Số giấy tờ này đã được lưu cho một hành khách khác.",
        );
      }

      const ownerId = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM users
         WHERE id=? AND identity_number=?
         LIMIT 1`,
        userId,
        idNumber,
      );

      if (ownerId.length) {
        throw new BadRequestException(
          "Số giấy tờ này trùng với số giấy tờ của tài khoản đang khai báo.",
        );
      }
    }

    if (phone) {
      const duplicatedPhone = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM saved_travelers
         WHERE phone=? ${excludeId ? "AND id<>?" : ""}
         LIMIT 1`,
        ...(excludeId ? [phone, excludeId] : [phone]),
      );

      if (duplicatedPhone.length) {
        throw new BadRequestException(
          "Số điện thoại này đã được lưu cho một hành khách khác.",
        );
      }

      const ownerPhone = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM users
         WHERE id=? AND phone=?
         LIMIT 1`,
        userId,
        phone,
      );

      if (ownerPhone.length) {
        throw new BadRequestException(
          "Số điện thoại này trùng với số điện thoại của tài khoản đang khai báo.",
        );
      }
    }
  }

  async list(userId: number) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, user_id AS userId, full_name AS fullName, relationship,
              DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth,
              gender, guest_type AS guestType, id_type AS idType,
              id_number AS idNumber, nationality, phone,
              dietary_notes AS dietaryNotes, health_notes AS healthNotes,
              is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt
       FROM saved_travelers WHERE user_id=? ORDER BY is_default DESC, full_name ASC`,
      userId,
    );
  }

  async create(userId: number, body: any) {
    const d = this.clean(body);
    await this.assertNoDuplicate(userId, d.idNumber, d.phone);

    if (d.isDefault) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE saved_travelers SET is_default=0 WHERE user_id=?`,
        userId,
      );
    }
    const result: any = await this.prisma.$executeRawUnsafe(
      `INSERT INTO saved_travelers
       (user_id,full_name,relationship,date_of_birth,gender,guest_type,id_type,id_number,nationality,phone,dietary_notes,health_notes,is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      userId,
      d.fullName,
      d.relationship,
      d.dateOfBirth,
      d.gender,
      d.guestType,
      d.idType,
      d.idNumber,
      d.nationality,
      d.phone,
      d.dietaryNotes,
      d.healthNotes,
      d.isDefault ? 1 : 0,
    );
    return { success: true, affectedRows: Number(result) || 1 };
  }

  async update(userId: number, id: number, body: any) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM saved_travelers WHERE id=? AND user_id=?`,
      id,
      userId,
    );
    if (!rows.length)
      throw new NotFoundException("Không tìm thấy hành khách đã lưu.");
    const d = this.clean(body);

    await this.assertNoDuplicate(userId, d.idNumber, d.phone, id);

    if (d.isDefault) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE saved_travelers SET is_default=0 WHERE user_id=?`,
        userId,
      );
    }
    await this.prisma.$executeRawUnsafe(
      `UPDATE saved_travelers SET full_name=?, relationship=?, date_of_birth=?, gender=?, guest_type=?,
       id_type=?, id_number=?, nationality=?, phone=?, dietary_notes=?, health_notes=?, is_default=? WHERE id=? AND user_id=?`,
      d.fullName,
      d.relationship,
      d.dateOfBirth,
      d.gender,
      d.guestType,
      d.idType,
      d.idNumber,
      d.nationality,
      d.phone,
      d.dietaryNotes,
      d.healthNotes,
      d.isDefault ? 1 : 0,
      id,
      userId,
    );
    return { success: true };
  }

  async remove(userId: number, id: number) {
    const affected = await this.prisma.$executeRawUnsafe(
      `DELETE FROM saved_travelers WHERE id=? AND user_id=?`,
      id,
      userId,
    );
    if (!affected)
      throw new NotFoundException("Không tìm thấy hành khách đã lưu.");
    return { success: true };
  }
}
