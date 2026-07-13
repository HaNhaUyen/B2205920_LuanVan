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
      relationship: String(body?.relationship || "").trim() || null,
      dateOfBirth: body?.dateOfBirth || null,
      gender: String(body?.gender || "").trim() || null,
      guestType,
      idType,
      idNumber: String(body?.idNumber || "").trim() || null,
      nationality: String(body?.nationality || "Việt Nam").trim() || "Việt Nam",
      phone: String(body?.phone || "").trim() || null,
      dietaryNotes: String(body?.dietaryNotes || "").trim() || null,
      healthNotes: String(body?.healthNotes || "").trim() || null,
      isDefault: Boolean(body?.isDefault),
    };
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
