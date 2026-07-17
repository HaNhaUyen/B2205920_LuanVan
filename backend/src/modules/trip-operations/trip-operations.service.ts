import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TripOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private uid(user: any) {
    return Number(user?.userId);
  }
  private role(user: any) {
    return String(user?.role || "");
  }
  private json(value: any) {
    return value == null ? null : JSON.stringify(value);
  }

  private async guideId(user: any) {
    if (this.role(user) === "admin") return null;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM guides WHERE user_id=? LIMIT 1`,
      this.uid(user),
    );
    if (!rows.length)
      throw new ForbiddenException(
        "Tài khoản chưa liên kết hồ sơ hướng dẫn viên.",
      );
    return Number(rows[0].id);
  }

  private async assertAccess(
    user: any,
    operationId: number,
    allowCustomer = false,
  ) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT op.id, op.departure_id AS departureId, op.guide_id AS guideId
       FROM trip_operations op WHERE op.id=? LIMIT 1`,
      operationId,
    );
    if (!rows.length) throw new NotFoundException("Không tìm thấy chuyến đi.");
    if (this.role(user) === "admin") return rows[0];
    if (this.role(user) === "guide") {
      const gid = await this.guideId(user);
      if (Number(rows[0].guideId) !== gid)
        throw new ForbiddenException("Bạn không được phân công chuyến này.");
      return rows[0];
    }
    if (allowCustomer && this.role(user) === "user") {
      const owned = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT b.id FROM bookings b WHERE b.departure_id=? AND b.user_id=? AND b.booking_status IN ('confirmed','completed','waiting_confirmation') LIMIT 1`,
        rows[0].departureId,
        this.uid(user),
      );
      if (owned.length) return rows[0];
    }
    throw new ForbiddenException("Bạn không có quyền truy cập chuyến này.");
  }

  private async assertWritableOperation(user: any, operationId: number) {
    const operation = await this.assertAccess(user, operationId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT operation_status AS operationStatus
       FROM trip_operations
       WHERE id=?
       LIMIT 1`,
      operationId,
    );

    const status = String(rows[0]?.operationStatus || "");
    if (["completed", "cancelled"].includes(status)) {
      throw new BadRequestException(
        status === "completed"
          ? "Chuyến đi đã hoàn thành. Dữ liệu vận hành chỉ được xem."
          : "Chuyến đi đã bị hủy. Không thể cập nhật dữ liệu vận hành.",
      );
    }

    return operation;
  }

  async personalizedItinerary(user: any, bookingId: number) {
    const booking = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.booking_code AS bookingCode,b.user_id AS userId,b.pickup_name AS pickupName,
       b.pickup_address AS pickupAddress,TIME_FORMAT(b.pickup_time,'%H:%i') AS pickupTime,b.pickup_note AS pickupNote,
       b.booking_status AS bookingStatus,td.id AS departureId,td.departure_date AS departureDate,td.end_date AS endDate,
       t.id AS tourId,t.name AS tourName,t.slug,t.duration_days AS durationDays,t.duration_nights AS durationNights,
       d.name AS destinationName,d.province,op.id AS tripOperationId,op.operation_status AS operationStatus,
       op.vehicle_info AS vehicleInfo,op.emergency_phone AS emergencyPhone,g.full_name AS guideName,g.phone AS guidePhone
       FROM bookings b JOIN tour_departures td ON td.id=b.departure_id JOIN tours t ON t.id=b.tour_id
       JOIN destinations d ON d.id=t.destination_id LEFT JOIN trip_operations op ON op.departure_id=td.id
       LEFT JOIN guides g ON g.id=op.guide_id WHERE b.id=? AND b.user_id=? LIMIT 1`,
      bookingId,
      this.uid(user),
    );
    if (!booking.length)
      throw new NotFoundException("Không tìm thấy booking của bạn.");
    const itinerary = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT day_number AS dayNumber,item_order AS itemOrder,title,description,location_name AS locationName
       FROM tour_itinerary WHERE tour_id=? ORDER BY day_number,item_order`,
      booking[0].tourId,
    );
    const policies = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT policy_type AS policyType,content FROM tour_policies WHERE tour_id=? ORDER BY display_order`,
      booking[0].tourId,
    );
    const guests = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,full_name AS fullName,date_of_birth AS dateOfBirth,gender,guest_type AS guestType,id_number AS idNumber
       FROM booking_guests WHERE booking_id=? ORDER BY id`,
      bookingId,
    );
    const journeyLogs = booking[0].tripOperationId
      ? await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT log_type AS logType,title,content,location_name AS locationName,occurred_at AS occurredAt
           FROM journey_logs WHERE trip_operation_id=? ORDER BY occurred_at DESC`,
          booking[0].tripOperationId,
        )
      : [];
    return {
      booking: booking[0],
      itinerary,
      policies,
      guests,
      journeyLogs,
      preparationChecklist: [
        "CCCD hoặc hộ chiếu còn hiệu lực",
        "Có mặt trước giờ đón ít nhất 15 phút",
        "Kiểm tra hành lý theo chính sách tour",
        "Lưu số điện thoại hướng dẫn viên và hotline Travela",
      ],
    };
  }

  async listTrips(user: any, query: any) {
    const gid = await this.guideId(user);
    const status = String(query?.status || "").trim();
    let sql = `SELECT op.id, op.operation_status AS operationStatus, op.vehicle_info AS vehicleInfo,
      op.emergency_phone AS emergencyPhone, op.started_at AS startedAt, op.completed_at AS completedAt,
      td.id AS departureId, td.departure_date AS departureDate, td.end_date AS endDate,
      td.total_slots AS totalSlots, td.booked_slots AS bookedSlots, t.id AS tourId, t.code AS tourCode,
      t.name AS tourName, d.name AS destinationName, d.province,
      g.id AS guideId, g.full_name AS guideName,
      COUNT(DISTINCT CASE WHEN b.booking_status IN ('confirmed','completed','waiting_confirmation') THEN b.id END) AS bookingCount,
      COUNT(DISTINCT bg.id) AS passengerCount
      FROM trip_operations op
      JOIN tour_departures td ON td.id=op.departure_id
      JOIN tours t ON t.id=td.tour_id JOIN destinations d ON d.id=t.destination_id
      LEFT JOIN guides g ON g.id=op.guide_id
      LEFT JOIN bookings b ON b.departure_id=td.id AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
      LEFT JOIN booking_guests bg ON bg.booking_id=b.id
      LEFT JOIN trip_reports tr ON tr.trip_operation_id=op.id WHERE 1=1`;
    const params: any[] = [];
    if (gid) {
      sql += ` AND op.guide_id=?`;
      params.push(gid);

      // Sau khi HDV đã gửi báo cáo kết thúc, chuyến hoàn thành biến khỏi danh sách vận hành.
      // Có thể truyền includeCompleted=1 khi cần xem lịch sử.
      if (String(query?.includeCompleted || "") !== "1") {
        sql += ` AND NOT (op.operation_status='completed' AND tr.id IS NOT NULL)`;
      }
    }
    if (status && status !== "all") {
      sql += ` AND op.operation_status=?`;
      params.push(status);
    }
    sql += ` GROUP BY op.id ORDER BY
      CASE op.operation_status
        WHEN 'in_progress' THEN 1
        WHEN 'boarding' THEN 2
        WHEN 'ready' THEN 3
        WHEN 'preparing' THEN 4
        WHEN 'completed' THEN 8
        WHEN 'cancelled' THEN 9
        ELSE 5
      END,
      td.departure_date ASC`;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(sql, ...params);

    return rows.map((row) => ({
      ...row,
      totalGuests: Number(row.passengerCount || 0),
      tour: {
        id: row.tourId,
        code: row.tourCode,
        name: row.tourName,
        destination: {
          name: row.destinationName,
          province: row.province,
        },
      },
      departure: {
        id: row.departureId,
        departureDate: row.departureDate,
        endDate: row.endDate,
        totalSlots: Number(row.totalSlots || 0),
        bookedSlots: Number(row.bookedSlots || 0),
      },
      primaryGuide: {
        id: row.guideId,
        fullName: row.guideName,
      },
    }));
  }

  async dashboard(user: any, operationId: number) {
    await this.assertAccess(user, operationId);
    const trip = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT op.*, td.departure_date AS departureDate, td.end_date AS endDate, td.status AS departureStatus,
       t.name AS tourName, t.code AS tourCode, t.slug, d.name AS destinationName, d.province,
       g.full_name AS guideName, g.phone AS guidePhone
       FROM trip_operations op JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id JOIN destinations d ON d.id=t.destination_id
       LEFT JOIN guides g ON g.id=op.guide_id WHERE op.id=?`,
      operationId,
    );
    const stats = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(DISTINCT b.id) AS bookings, COUNT(bg.id) AS passengers,
       SUM(pc.status='present') AS presentCount, SUM(pc.status='late') AS lateCount,
       SUM(pc.status='absent') AS absentCount, SUM(pc.status='pending') AS pendingCount
       FROM trip_operations op LEFT JOIN bookings b ON b.departure_id=op.departure_id
       AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
       LEFT JOIN booking_guests bg ON bg.booking_id=b.id
       LEFT JOIN passenger_checkins pc ON pc.trip_operation_id=op.id AND pc.booking_guest_id=bg.id
       WHERE op.id=?`,
      operationId,
    );
    const pickupGroups = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COALESCE(b.pickup_name,'Chưa xác định') AS pickupName, b.pickup_address AS pickupAddress,
       TIME_FORMAT(b.pickup_time,'%H:%i') AS pickupTime, COUNT(DISTINCT b.id) AS bookingCount,
       COUNT(bg.id) AS passengerCount
       FROM trip_operations op JOIN bookings b ON b.departure_id=op.departure_id
       LEFT JOIN booking_guests bg ON bg.booking_id=b.id
       WHERE op.id=? AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
       GROUP BY b.pickup_name,b.pickup_address,b.pickup_time ORDER BY b.pickup_time`,
      operationId,
    );
    const incidentStats = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT status, severity, COUNT(*) AS total FROM incident_tickets WHERE trip_operation_id=? GROUP BY status,severity`,
      operationId,
    );
    const row = trip[0];
    const rawStats = stats[0] || {};

    return {
      trip: row,
      operationStatus: row?.operation_status || row?.operationStatus,
      tour: {
        id: row?.tour_id || row?.tourId,
        code: row?.tourCode,
        name: row?.tourName,
        slug: row?.slug,
        destination: {
          name: row?.destinationName,
          province: row?.province,
        },
      },
      departure: {
        id: row?.departure_id || row?.departureId,
        departureDate: row?.departureDate,
        endDate: row?.endDate,
        status: row?.departureStatus,
      },
      stats: {
        ...rawStats,
        totalPassengers: Number(rawStats.passengers || 0),
        totalGuests: Number(rawStats.passengers || 0),
        present: Number(rawStats.presentCount || 0),
        pending: Number(rawStats.pendingCount || 0),
        absent: Number(rawStats.absentCount || 0),
        late: Number(rawStats.lateCount || 0),
      },
      pickupGroups,
      incidentStats,
    };
  }

  async passengers(user: any, operationId: number) {
    await this.assertAccess(user, operationId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT bg.id AS guestId, bg.full_name AS fullName, bg.date_of_birth AS dateOfBirth,
       bg.gender, bg.guest_type AS guestType, bg.id_number AS idNumber,
       bg.nationality, bg.phone, bg.dietary_notes AS dietaryNotes,
       bg.health_notes AS healthNotes, bg.allergy_notes AS allergyNotes,
       bg.emergency_contact_name AS emergencyContactName,
       bg.emergency_contact_phone AS emergencyContactPhone,
       b.id AS bookingId, b.booking_code AS bookingCode, b.contact_name AS contactName,
       b.contact_phone AS contactPhone, b.pickup_point_id AS pickupPointId,
       COALESCE(b.pickup_name,'Chưa xác định') AS pickupName, b.pickup_address AS pickupAddress,
       TIME_FORMAT(b.pickup_time,'%H:%i') AS pickupTime,
       COALESCE(pc.status,'pending') AS checkinStatus, pc.checked_in_at AS checkedInAt, pc.note AS checkinNote
       FROM trip_operations op JOIN bookings b ON b.departure_id=op.departure_id
       JOIN booking_guests bg ON bg.booking_id=b.id
       LEFT JOIN passenger_checkins pc ON pc.trip_operation_id=op.id AND pc.booking_guest_id=bg.id
       WHERE op.id=? AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
       ORDER BY b.pickup_time, b.pickup_name, bg.full_name`,
      operationId,
    );
    const groups: Record<string, any> = {};
    for (const row of rows) {
      const key = `${row.pickupPointId || 0}-${row.pickupName}`;
      if (!groups[key])
        groups[key] = {
          pickupPointId: row.pickupPointId,
          pickupName: row.pickupName,
          pickupAddress: row.pickupAddress,
          pickupTime: row.pickupTime,
          passengers: [],
        };
      groups[key].passengers.push(row);
    }
    return { total: rows.length, groups: Object.values(groups) };
  }

  async updateCheckin(
    user: any,
    operationId: number,
    guestId: number,
    body: any,
  ) {
    await this.assertWritableOperation(user, operationId);
    const status = String(body?.status || "");
    if (!["pending", "present", "late", "absent", "cancelled"].includes(status))
      throw new BadRequestException("Trạng thái check-in không hợp lệ.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO passenger_checkins(trip_operation_id,booking_guest_id,status,checked_in_at,checked_in_by,note)
       VALUES (?,?,?,IF(? IN ('present','late'),NOW(),NULL),?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status), checked_in_at=VALUES(checked_in_at), checked_in_by=VALUES(checked_in_by), note=VALUES(note)`,
      operationId,
      guestId,
      status,
      status,
      this.uid(user),
      String(body?.note || "").trim() || null,
    );
    return { success: true };
  }

  async journeyLogs(user: any, operationId: number) {
    await this.assertAccess(user, operationId, true);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT jl.id,jl.log_type AS logType,jl.title,jl.content,jl.location_name AS locationName,
       jl.latitude,jl.longitude,jl.media_urls AS mediaUrls,jl.occurred_at AS occurredAt,g.full_name AS guideName
       FROM journey_logs jl JOIN guides g ON g.id=jl.guide_id WHERE jl.trip_operation_id=? ORDER BY jl.occurred_at DESC`,
      operationId,
    );
  }

  async createJourneyLog(user: any, operationId: number, body: any) {
    const op = await this.assertWritableOperation(user, operationId);
    const gid =
      this.role(user) === "guide"
        ? await this.guideId(user)
        : Number(op.guideId);
    const title = String(body?.title || "").trim();
    if (!title) throw new BadRequestException("Tiêu đề nhật ký là bắt buộc.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO journey_logs(trip_operation_id,guide_id,log_type,title,content,location_name,latitude,longitude,media_urls,occurred_at)
       VALUES (?,?,?,?,?,?,?,?,?,COALESCE(?,NOW()))`,
      operationId,
      gid,
      body?.logType || "general",
      title,
      body?.content || null,
      body?.locationName || null,
      body?.latitude || null,
      body?.longitude || null,
      this.json(body?.mediaUrls || []),
      body?.occurredAt || null,
    );
    return { success: true };
  }

  async updateJourneyLog(
    user: any,
    operationId: number,
    logId: number,
    body: any,
  ) {
    await this.assertWritableOperation(user, operationId);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, guide_id AS guideId
       FROM journey_logs
       WHERE id=? AND trip_operation_id=?
       LIMIT 1`,
      logId,
      operationId,
    );

    const current = rows[0];
    if (!current) {
      throw new NotFoundException("Không tìm thấy nhật ký hành trình.");
    }

    if (this.role(user) === "guide") {
      const gid = await this.guideId(user);
      if (Number(current.guideId) !== Number(gid)) {
        throw new ForbiddenException("Bạn chỉ có thể sửa nhật ký do mình tạo.");
      }
    }

    const title = String(body?.title || "").trim();
    if (!title) {
      throw new BadRequestException("Tiêu đề nhật ký là bắt buộc.");
    }

    await this.prisma.$executeRawUnsafe(
      `UPDATE journey_logs
       SET log_type=?,
           title=?,
           content=?,
           location_name=?,
           latitude=?,
           longitude=?,
           media_urls=?,
           occurred_at=COALESCE(?, occurred_at),
           updated_at=NOW()
       WHERE id=? AND trip_operation_id=?`,
      body?.logType || "general",
      title,
      String(body?.content || "").trim() || null,
      String(body?.locationName || "").trim() || null,
      body?.latitude ?? null,
      body?.longitude ?? null,
      this.json(body?.mediaUrls || []),
      body?.occurredAt || null,
      logId,
      operationId,
    );

    return { success: true, message: "Đã cập nhật nhật ký hành trình." };
  }

  async deleteJourneyLog(user: any, operationId: number, logId: number) {
    await this.assertWritableOperation(user, operationId);

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, guide_id AS guideId
       FROM journey_logs
       WHERE id=? AND trip_operation_id=?
       LIMIT 1`,
      logId,
      operationId,
    );

    const current = rows[0];
    if (!current) {
      throw new NotFoundException("Không tìm thấy nhật ký hành trình.");
    }

    if (this.role(user) === "guide") {
      const gid = await this.guideId(user);
      if (Number(current.guideId) !== Number(gid)) {
        throw new ForbiddenException("Bạn chỉ có thể xóa nhật ký do mình tạo.");
      }
    }

    await this.prisma.$executeRawUnsafe(
      `DELETE FROM journey_logs WHERE id=? AND trip_operation_id=?`,
      logId,
      operationId,
    );

    return { success: true, message: "Đã xóa nhật ký hành trình." };
  }

  async incidents(user: any, operationId: number) {
    await this.assertAccess(user, operationId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT it.*, g.full_name AS reporterName, u.full_name AS assignedAdminName,
       (SELECT COUNT(*) FROM incident_ticket_comments c WHERE c.incident_ticket_id=it.id) AS commentCount
       FROM incident_tickets it LEFT JOIN guides g ON g.id=it.reported_by_guide_id
       LEFT JOIN users u ON u.id=it.assigned_admin_id WHERE it.trip_operation_id=? ORDER BY FIELD(it.severity,'critical','high','medium','low'),it.created_at DESC`,
      operationId,
    );
  }

  async createIncident(user: any, operationId: number, body: any) {
    await this.assertWritableOperation(user, operationId);
    const title = String(body?.title || "").trim();
    const description = String(body?.description || "").trim();
    if (!title || !description)
      throw new BadRequestException("Tiêu đề và mô tả sự cố là bắt buộc.");
    const gid = this.role(user) === "guide" ? await this.guideId(user) : null;
    const code = `INC-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO incident_tickets(ticket_code,trip_operation_id,booking_id,booking_guest_id,reported_by_guide_id,category,severity,title,description,location_name,latitude,longitude,evidence_urls)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code,
      operationId,
      body?.bookingId || null,
      body?.guestId || null,
      gid,
      body?.category || "other",
      body?.severity || "medium",
      title,
      description,
      body?.locationName || null,
      body?.latitude || null,
      body?.longitude || null,
      this.json(body?.evidenceUrls || []),
    );
    return { success: true, ticketCode: code };
  }

  async updateIncident(user: any, ticketId: number, body: any) {
    const status = String(body?.status || "").trim();
    if (
      ![
        "open",
        "acknowledged",
        "in_progress",
        "resolved",
        "closed",
        "rejected",
      ].includes(status)
    ) {
      throw new BadRequestException("Trạng thái ticket không hợp lệ.");
    }

    const tickets = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         it.id,
         it.ticket_code AS ticketCode,
         it.title,
         it.status AS currentStatus,
         it.reported_by_guide_id AS reporterGuideId,
         g.user_id AS guideUserId,
         g.full_name AS guideName,
         t.name AS tourName
       FROM incident_tickets it
       JOIN trip_operations op ON op.id=it.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id
       LEFT JOIN guides g ON g.id=it.reported_by_guide_id
       WHERE it.id=?
       LIMIT 1`,
      ticketId,
    );

    if (!tickets.length) {
      throw new NotFoundException("Không tìm thấy sự cố.");
    }

    const ticket = tickets[0];
    const resolution = String(body?.resolution || "").trim() || null;

    await this.prisma.$executeRawUnsafe(
      `UPDATE incident_tickets
       SET status=?,
           assigned_admin_id=COALESCE(?,assigned_admin_id),
           resolution=COALESCE(?,resolution),
           acknowledged_at=IF(?='acknowledged',NOW(),acknowledged_at),
           resolved_at=IF(?='resolved',NOW(),resolved_at),
           closed_at=IF(?='closed',NOW(),closed_at)
       WHERE id=?`,
      status,
      body?.assignedAdminId || this.uid(user),
      resolution,
      status,
      status,
      status,
      ticketId,
    );

    if (ticket.guideUserId && status !== ticket.currentStatus) {
      const statusLabels: Record<string, string> = {
        open: "Mới",
        acknowledged: "Đã tiếp nhận",
        in_progress: "Đang xử lý",
        resolved: "Đã giải quyết",
        closed: "Đã đóng",
        rejected: "Đã từ chối",
      };

      const title = `Cập nhật sự cố ${ticket.ticketCode}`;
      const content = resolution
        ? `Sự cố "${ticket.title}" của tour ${ticket.tourName} đã chuyển sang trạng thái "${statusLabels[status] || status}". Hướng xử lý: ${resolution}`
        : `Sự cố "${ticket.title}" của tour ${ticket.tourName} đã chuyển sang trạng thái "${statusLabels[status] || status}".`;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications(
           title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at
         ) VALUES (?,?,?,'all',?,1,?,NOW(),NOW())`,
        title,
        content.slice(0, 500),
        content,
        Number(ticket.guideUserId),
        this.uid(user),
      );
    }

    return { success: true, status };
  }

  async commentIncident(user: any, ticketId: number, body: any) {
    const comment = String(body?.comment || "").trim();

    if (!comment) {
      throw new BadRequestException("Nội dung phản hồi là bắt buộc.");
    }

    const incidents = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         it.id,
         it.ticket_code AS ticketCode,
         it.title,
         it.reported_by_guide_id AS guideId,
         g.user_id AS guideUserId,
         t.name AS tourName
       FROM incident_tickets it
       JOIN trip_operations op
         ON op.id = it.trip_operation_id
       JOIN tour_departures td
         ON td.id = op.departure_id
       JOIN tours t
         ON t.id = td.tour_id
       LEFT JOIN guides g
         ON g.id = it.reported_by_guide_id
       WHERE it.id = ?
       LIMIT 1`,
      ticketId,
    );

    if (!incidents.length) {
      throw new NotFoundException("Không tìm thấy sự cố.");
    }

    const incident = incidents[0];

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO incident_ticket_comments(
       incident_ticket_id,
       user_id,
       comment,
       is_internal
     ) VALUES (?, ?, ?, 0)`,
      ticketId,
      this.uid(user),
      comment,
    );

    let notificationSent = false;

    if (this.role(user) === "admin" && incident.guideUserId) {
      const title = `Admin đã phản hồi sự cố ${incident.ticketCode}`;

      const message =
        `Sự cố của tour ${incident.tourName || "Travela"} ` +
        `đã có phản hồi mới từ Admin.`;

      const content = `${message}\n\nPhản hồi: ${comment}`;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications(
         title,
         message,
         content,
         target_role,
         target_user_id,
         is_published,
         created_by,
         created_at,
         updated_at
       ) VALUES (?, ?, ?, 'all', ?, 1, ?, NOW(), NOW())`,
        title,
        message,
        content,
        Number(incident.guideUserId),
        this.uid(user),
      );

      notificationSent = true;
    }

    return {
      success: true,
      notificationSent,
    };
  }

  async broadcast(user: any, operationId: number, body: any) {
    const op = await this.assertWritableOperation(user, operationId);
    const title = String(body?.title || "").trim();
    const content = String(body?.content || "").trim();
    if (!title || !content)
      throw new BadRequestException(
        "Tiêu đề và nội dung thông báo là bắt buộc.",
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO trip_broadcasts(trip_operation_id,sender_user_id,title,content,channel,pickup_point_id) VALUES (?,?,?,?,?,?)`,
        operationId,
        this.uid(user),
        title,
        content,
        body?.channel || "in_app",
        body?.pickupPointId || null,
      );
      const ids = await tx.$queryRawUnsafe<any[]>(
        `SELECT LAST_INSERT_ID() AS id`,
      );
      const broadcastId = Number(ids[0].id);
      await tx.$executeRawUnsafe(
        `INSERT INTO trip_broadcast_recipients(trip_broadcast_id,user_id,booking_id,delivery_status)
         SELECT ?,b.user_id,b.id,'sent' FROM bookings b
         WHERE b.departure_id=? AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
         AND (? IS NULL OR b.pickup_point_id=?)`,
        broadcastId,
        op.departureId,
        body?.pickupPointId || null,
        body?.pickupPointId || null,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by)
         SELECT ?,LEFT(?,500),?,'user',b.user_id,1,? FROM bookings b
         WHERE b.departure_id=? AND b.user_id IS NOT NULL AND b.booking_status IN ('confirmed','completed','waiting_confirmation')
         AND (? IS NULL OR b.pickup_point_id=?)`,
        title,
        content,
        content,
        this.uid(user),
        op.departureId,
        body?.pickupPointId || null,
        body?.pickupPointId || null,
      );
    });
    return { success: true };
  }

  async broadcasts(user: any, operationId: number) {
    await this.assertAccess(user, operationId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT tb.*,u.full_name AS senderName,pp.name AS pickupName,
       (SELECT COUNT(*) FROM trip_broadcast_recipients r WHERE r.trip_broadcast_id=tb.id) AS recipientCount
       FROM trip_broadcasts tb JOIN users u ON u.id=tb.sender_user_id
       LEFT JOIN tour_pickup_points pp ON pp.id=tb.pickup_point_id
       WHERE tb.trip_operation_id=? ORDER BY tb.sent_at DESC`,
      operationId,
    );
  }

  async saveReport(user: any, operationId: number, body: any) {
    const op = await this.assertAccess(user, operationId);
    const operationRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT operation_status AS operationStatus FROM trip_operations WHERE id=? LIMIT 1`,
      operationId,
    );
    const currentStatus = String(operationRows[0]?.operationStatus || "");
    if (currentStatus === "cancelled") {
      throw new BadRequestException(
        "Chuyến đi đã bị hủy. Không thể gửi báo cáo kết thúc tour.",
      );
    }

    const existingReport = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, status FROM trip_reports WHERE trip_operation_id=? LIMIT 1`,
      operationId,
    );

    if (existingReport.length) {
      throw new BadRequestException(
        "Báo cáo kết thúc tour đã được lưu. Dữ liệu hiện ở chế độ chỉ xem.",
      );
    }
    const gid =
      this.role(user) === "guide"
        ? await this.guideId(user)
        : Number(op.guideId);
    const summary = String(body?.summary || "").trim();
    if (!summary) throw new BadRequestException("Tóm tắt báo cáo là bắt buộc.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO trip_reports(trip_operation_id,guide_id,actual_guest_count,absent_guest_count,vehicle_rating,hotel_rating,restaurant_rating,itinerary_rating,summary,incidents_summary,extra_cost,extra_cost_note,recommendations,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted')
       ON DUPLICATE KEY UPDATE actual_guest_count=VALUES(actual_guest_count),absent_guest_count=VALUES(absent_guest_count),vehicle_rating=VALUES(vehicle_rating),hotel_rating=VALUES(hotel_rating),restaurant_rating=VALUES(restaurant_rating),itinerary_rating=VALUES(itinerary_rating),summary=VALUES(summary),incidents_summary=VALUES(incidents_summary),extra_cost=VALUES(extra_cost),extra_cost_note=VALUES(extra_cost_note),recommendations=VALUES(recommendations),status='submitted',submitted_at=NOW()`,
      operationId,
      gid,
      Number(body?.actualGuestCount || 0),
      Number(body?.absentGuestCount || 0),
      body?.vehicleRating || null,
      body?.hotelRating || null,
      body?.restaurantRating || null,
      body?.itineraryRating || null,
      summary,
      body?.incidentsSummary || null,
      Number(body?.extraCost || 0),
      body?.extraCostNote || null,
      body?.recommendations || null,
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE trip_operations SET operation_status='completed',completed_at=NOW() WHERE id=?`,
      operationId,
    );

    const reportRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT tr.id, tr.actual_guest_count AS actualGuestCount, tr.absent_guest_count AS absentGuestCount,
              tr.extra_cost AS extraCost, t.name AS tourName, g.full_name AS guideName
       FROM trip_reports tr
       JOIN trip_operations op ON op.id=tr.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id
       JOIN guides g ON g.id=tr.guide_id
       WHERE tr.trip_operation_id=? LIMIT 1`,
      operationId,
    );
    const saved = reportRows[0];
    if (saved) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at)
         SELECT ?,?,?, 'admin',u.id,1,?,NOW(),NOW()
         FROM users u WHERE u.role='admin' AND u.status='active'`,
        "HDV đã gửi báo cáo chuyến đi",
        `${saved.guideName} đã gửi báo cáo tour ${saved.tourName}.`,
        `Báo cáo có ${Number(saved.actualGuestCount || 0)} khách thực tế, ${Number(saved.absentGuestCount || 0)} khách vắng và ${Number(saved.extraCost || 0).toLocaleString("vi-VN")}đ chi phí phát sinh.`,
        this.uid(user),
      );
    }

    return {
      success: true,
      reportId: saved?.id || null,
      notificationSent: Boolean(saved),
    };
  }

  async report(user: any, operationId: number) {
    await this.assertAccess(user, operationId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         tr.*,
         DATE_FORMAT(tr.submitted_at,'%Y-%m-%d %H:%i:%s') AS submittedAt,
         DATE_FORMAT(tr.reviewed_at,'%Y-%m-%d %H:%i:%s') AS reviewedAt,
         DATE_FORMAT(tr.created_at,'%Y-%m-%d %H:%i:%s') AS createdAt,
         DATE_FORMAT(tr.updated_at,'%Y-%m-%d %H:%i:%s') AS updatedAt,
         g.full_name AS guideName,
         u.full_name AS reviewedByName
       FROM trip_reports tr
       JOIN guides g ON g.id=tr.guide_id
       LEFT JOIN users u ON u.id=tr.reviewed_by
       WHERE tr.trip_operation_id=?`,
      operationId,
    );
    return rows[0] || null;
  }

  async adminReports(query: any) {
    const page = Math.max(Number(query?.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query?.pageSize || 10), 1), 50);
    const status = String(query?.status || "all").trim();
    const search = String(query?.search || "").trim();
    const offset = (page - 1) * pageSize;
    let where = ` WHERE 1=1 `;
    const params: any[] = [];
    if (status && status !== "all") {
      where += ` AND tr.status=? `;
      params.push(status);
    }
    if (search) {
      where += ` AND (t.name LIKE ? OR t.code LIKE ? OR g.full_name LIKE ? OR CAST(tr.id AS CHAR) LIKE ?) `;
      const kw = `%${search}%`;
      params.push(kw, kw, kw, kw);
    }
    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total FROM trip_reports tr
       JOIN trip_operations op ON op.id=tr.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id
       JOIN guides g ON g.id=tr.guide_id ${where}`,
      ...params,
    );
    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT tr.id,tr.trip_operation_id AS tripOperationId,tr.status,tr.actual_guest_count AS actualGuestCount,
       tr.absent_guest_count AS absentGuestCount,tr.extra_cost AS extraCost,
       DATE_FORMAT(tr.submitted_at,'%Y-%m-%d %H:%i:%s') AS submittedAt,
       DATE_FORMAT(tr.reviewed_at,'%Y-%m-%d %H:%i:%s') AS reviewedAt,
       tr.admin_note AS adminNote,
       t.id AS tourId,t.code AS tourCode,t.name AS tourName,d.name AS destinationName,d.province,
       td.id AS departureId,td.departure_date AS departureDate,td.end_date AS endDate,
       g.id AS guideId,g.full_name AS guideName,g.phone AS guidePhone,u.full_name AS reviewedByName
       FROM trip_reports tr JOIN trip_operations op ON op.id=tr.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id JOIN tours t ON t.id=td.tour_id
       JOIN destinations d ON d.id=t.destination_id JOIN guides g ON g.id=tr.guide_id
       LEFT JOIN users u ON u.id=tr.reviewed_by ${where}
       ORDER BY CASE tr.status WHEN 'submitted' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,tr.submitted_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );
    const total = Number(countRows[0]?.total || 0);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async adminReportDetail(reportId: number) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT tr.*,tr.trip_operation_id AS tripOperationId,tr.actual_guest_count AS actualGuestCount,
       tr.absent_guest_count AS absentGuestCount,tr.vehicle_rating AS vehicleRating,tr.hotel_rating AS hotelRating,
       tr.restaurant_rating AS restaurantRating,tr.itinerary_rating AS itineraryRating,
       tr.incidents_summary AS incidentsSummary,tr.extra_cost AS extraCost,tr.extra_cost_note AS extraCostNote,
       tr.admin_note AS adminNote,
       DATE_FORMAT(tr.submitted_at,'%Y-%m-%d %H:%i:%s') AS submittedAt,
       DATE_FORMAT(tr.reviewed_at,'%Y-%m-%d %H:%i:%s') AS reviewedAt,
       t.code AS tourCode,t.name AS tourName,d.name AS destinationName,d.province,
       td.departure_date AS departureDate,td.end_date AS endDate,
       g.full_name AS guideName,g.phone AS guidePhone,g.email AS guideEmail,u.full_name AS reviewedByName
       FROM trip_reports tr JOIN trip_operations op ON op.id=tr.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id JOIN tours t ON t.id=td.tour_id
       JOIN destinations d ON d.id=t.destination_id JOIN guides g ON g.id=tr.guide_id
       LEFT JOIN users u ON u.id=tr.reviewed_by WHERE tr.id=? LIMIT 1`,
      reportId,
    );
    if (!rows.length)
      throw new NotFoundException("Không tìm thấy báo cáo chuyến đi.");
    return rows[0];
  }

  async reviewTripReport(user: any, reportId: number, body: any) {
    const action = String(body?.action || "review");
    if (!["review", "reopen"].includes(action))
      throw new BadRequestException("Thao tác báo cáo không hợp lệ.");
    const report = await this.adminReportDetail(reportId);
    if (action === "review") {
      await this.prisma.$executeRawUnsafe(
        `UPDATE trip_reports SET status='reviewed',reviewed_by=?,reviewed_at=NOW(),admin_note=?,updated_at=NOW() WHERE id=?`,
        this.uid(user),
        String(body?.adminNote || "").trim() || null,
        reportId,
      );
    } else {
      await this.prisma.$executeRawUnsafe(
        `UPDATE trip_reports SET status='submitted',reviewed_by=NULL,reviewed_at=NULL,admin_note=?,updated_at=NOW() WHERE id=?`,
        String(body?.adminNote || "").trim() || null,
        reportId,
      );
    }
    const guideRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT user_id AS userId FROM guides WHERE id=? LIMIT 1`,
      report.guide_id || report.guideId,
    );
    const guideUserId = guideRows[0]?.userId;
    if (guideUserId) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications(title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at)
         VALUES (?,?,?,?,?,1,?,NOW(),NOW())`,
        action === "review"
          ? "Báo cáo chuyến đi đã được xem xét"
          : "Báo cáo chuyến đi cần được kiểm tra lại",
        `Báo cáo tour ${report.tourName} đã được admin cập nhật.`,
        String(body?.adminNote || "Admin đã cập nhật trạng thái báo cáo."),
        "user",
        guideUserId,
        this.uid(user),
      );
    }
    return this.adminReportDetail(reportId);
  }

  async allIncidents(query: any) {
    const page = Math.max(Number(query?.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query?.pageSize || 6), 1), 50);
    const status = String(query?.status || "all").trim();
    const severity = String(query?.severity || "all").trim();
    const search = String(query?.search || "").trim();
    const offset = (page - 1) * pageSize;

    let where = ` WHERE 1=1 `;
    const params: any[] = [];

    if (status && status !== "all") {
      where += ` AND it.status=? `;
      params.push(status);
    }

    if (severity && severity !== "all") {
      where += ` AND it.severity=? `;
      params.push(severity);
    }

    if (search) {
      const keyword = `%${search}%`;
      where += ` AND (
        it.ticket_code LIKE ?
        OR it.title LIKE ?
        OR it.description LIKE ?
        OR it.location_name LIKE ?
        OR t.name LIKE ?
        OR g.full_name LIKE ?
      ) `;
      params.push(keyword, keyword, keyword, keyword, keyword, keyword);
    }

    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total
       FROM incident_tickets it
       JOIN trip_operations op ON op.id=it.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id
       LEFT JOIN guides g ON g.id=it.reported_by_guide_id
       ${where}`,
      ...params,
    );

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         it.id,
         it.ticket_code AS ticketCode,
         it.trip_operation_id AS tripOperationId,
         it.booking_id AS bookingId,
         it.booking_guest_id AS bookingGuestId,
         it.reported_by_guide_id AS reportedByGuideId,
         it.category,
         it.severity,
         it.title,
         it.description,
         it.location_name AS locationName,
         it.latitude,
         it.longitude,
         it.evidence_urls AS evidenceUrls,
         it.status,
         it.resolution,
         it.acknowledged_at AS acknowledgedAt,
         it.resolved_at AS resolvedAt,
         it.closed_at AS closedAt,
         it.created_at AS createdAt,
         it.updated_at AS updatedAt,
         t.id AS tourId,
         t.name AS tourName,
         d.name AS destinationName,
         d.province AS destinationProvince,
         td.departure_date AS departureDate,
         td.end_date AS endDate,
         g.full_name AS reporterName,
         g.phone AS reporterPhone,
         gu.email AS reporterEmail,
         u.full_name AS assignedAdminName,
         (
           SELECT COUNT(*)
           FROM incident_ticket_comments c
           WHERE c.incident_ticket_id=it.id
         ) AS commentCount
       FROM incident_tickets it
       JOIN trip_operations op ON op.id=it.trip_operation_id
       JOIN tour_departures td ON td.id=op.departure_id
       JOIN tours t ON t.id=td.tour_id
       JOIN destinations d ON d.id=t.destination_id
       LEFT JOIN guides g ON g.id=it.reported_by_guide_id
       LEFT JOIN users gu ON gu.id=g.user_id
       LEFT JOIN users u ON u.id=it.assigned_admin_id
       ${where}
       ORDER BY
         FIELD(it.severity,'critical','high','medium','low'),
         it.created_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );

    const ids = items.map((item) => Number(item.id)).filter(Boolean);
    let comments: any[] = [];

    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      comments = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT
           c.id,
           c.incident_ticket_id AS incidentTicketId,
           c.user_id AS userId,
           c.comment,
           c.is_internal AS isInternal,
           c.created_at AS createdAt,
           u.full_name AS authorName,
           u.role AS authorRole
         FROM incident_ticket_comments c
         JOIN users u ON u.id=c.user_id
         WHERE c.incident_ticket_id IN (${placeholders})
         ORDER BY c.created_at ASC`,
        ...ids,
      );
    }

    const commentsByTicket = new Map<number, any[]>();
    for (const comment of comments) {
      const key = Number(comment.incidentTicketId);
      if (!commentsByTicket.has(key)) commentsByTicket.set(key, []);
      commentsByTicket.get(key)!.push(comment);
    }

    const total = Number(countRows[0]?.total || 0);

    return {
      items: items.map((item) => ({
        ...item,
        comments: commentsByTicket.get(Number(item.id)) || [],
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async competencies(user: any) {
    const gid = await this.guideId(user);
    if (!gid) {
      throw new BadRequestException("Không tìm thấy hồ sơ hướng dẫn viên.");
    }

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         gc.id,
         gc.guide_id AS guideId,
         gc.competency_type AS competencyType,
         gc.name,
         gc.level,
         gc.certificate_no AS certificateNo,
         gc.issued_by AS issuedBy,
         gc.issued_date AS issuedDate,
         gc.expiry_date AS expiryDate,
         gc.document_url AS documentUrl,
         gc.note,
         gc.verification_status AS verificationStatus,
         gc.verified_by AS verifiedBy,
         gc.verified_at AS verifiedAt,
         gc.rejection_reason AS rejectionReason,
         gc.created_at AS createdAt,
         gc.updated_at AS updatedAt,
         verifier.full_name AS verifiedByName
       FROM guide_competencies gc
       LEFT JOIN users verifier ON verifier.id=gc.verified_by
       WHERE gc.guide_id=?
       ORDER BY
         FIELD(gc.verification_status,'pending','rejected','verified'),
         gc.created_at DESC`,
      gid,
    );

    const stats = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         g.id,
         g.full_name AS fullName,
         g.languages,
         g.experience_years AS experienceYears,
         COUNT(DISTINCT ga.id) AS totalAssignments,
         SUM(ga.status='completed') AS completedAssignments,
         COUNT(DISTINCT it.id) AS incidentCount,
         COALESCE(AVG(r.rating),0) AS averageTourRating
       FROM guides g
       LEFT JOIN guide_assignments ga ON ga.guide_id=g.id
       LEFT JOIN incident_tickets it ON it.reported_by_guide_id=g.id
       LEFT JOIN bookings b ON b.id=ga.booking_id
       LEFT JOIN reviews r ON r.booking_id=b.id
       WHERE g.id=?
       GROUP BY g.id`,
      gid,
    );

    return { profile: stats[0] || null, items };
  }

  async createCompetency(user: any, body: any) {
    const gid = await this.guideId(user);
    const competencyType = String(body?.competencyType || "skill").trim();
    const name = String(body?.name || "").trim();
    const documentUrl = String(body?.documentUrl || "").trim();

    if (!name) {
      throw new BadRequestException("Tên năng lực/chứng chỉ là bắt buộc.");
    }

    if (
      !["language", "route", "skill", "certificate"].includes(competencyType)
    ) {
      throw new BadRequestException("Phân loại năng lực không hợp lệ.");
    }

    if (competencyType === "certificate" && !documentUrl) {
      throw new BadRequestException(
        "Chứng chỉ ngành bắt buộc phải có minh chứng.",
      );
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO guide_competencies(
         guide_id,competency_type,name,level,certificate_no,issued_by,
         issued_date,expiry_date,document_url,note,verification_status,
         verified_by,verified_at,rejection_reason,created_at,updated_at
       ) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,NULL,NOW(),NOW())`,
      gid,
      competencyType,
      name,
      String(body?.level || "").trim() || null,
      String(body?.certificateNo || "").trim() || null,
      String(body?.issuedBy || "").trim() || null,
      body?.issuedDate || null,
      body?.expiryDate || null,
      documentUrl || null,
      String(body?.note || "").trim() || null,
    );

    return {
      success: true,
      message: "Đã gửi hồ sơ năng lực để Admin kiểm tra và phê duyệt.",
    };
  }

  async adminCompetencies(query: any) {
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(50, Math.max(5, Number(query?.pageSize || 10)));
    const status = String(query?.status || "all");
    const competencyType = String(query?.competencyType || "all");
    const search = String(query?.search || "").trim();
    const offset = (page - 1) * pageSize;

    let where = ` WHERE 1=1 `;
    const params: any[] = [];

    if (status !== "all") {
      where += ` AND gc.verification_status=? `;
      params.push(status);
    }

    if (competencyType !== "all") {
      where += ` AND gc.competency_type=? `;
      params.push(competencyType);
    }

    if (search) {
      where += ` AND (g.full_name LIKE ? OR g.phone LIKE ? OR gc.name LIKE ? OR gc.certificate_no LIKE ?) `;
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const countRows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) AS total
       FROM guide_competencies gc
       JOIN guides g ON g.id=gc.guide_id
       ${where}`,
      ...params,
    );

    const items = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT
         gc.id,
         gc.guide_id AS guideId,
         g.full_name AS guideName,
         g.phone AS guidePhone,
         gu.email AS guideEmail,
         gc.competency_type AS competencyType,
         gc.name,
         gc.level,
         gc.certificate_no AS certificateNo,
         gc.issued_by AS issuedBy,
         gc.issued_date AS issuedDate,
         gc.expiry_date AS expiryDate,
         gc.document_url AS documentUrl,
         gc.note,
         gc.verification_status AS verificationStatus,
         gc.verified_by AS verifiedBy,
         gc.verified_at AS verifiedAt,
         gc.rejection_reason AS rejectionReason,
         gc.created_at AS createdAt,
         verifier.full_name AS verifiedByName
       FROM guide_competencies gc
       JOIN guides g ON g.id=gc.guide_id
       LEFT JOIN users gu ON gu.id=g.user_id
       LEFT JOIN users verifier ON verifier.id=gc.verified_by
       ${where}
       ORDER BY
         FIELD(gc.verification_status,'pending','rejected','verified'),
         gc.created_at DESC
       LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset,
    );

    const total = Number(countRows[0]?.total || 0);
    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private async syncVerifiedCompetencies(guideId: number) {
    const verified = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT competency_type AS competencyType,name,level
       FROM guide_competencies
       WHERE guide_id=? AND verification_status='verified'
         AND competency_type IN ('language','skill')
       ORDER BY competency_type,name`,
      guideId,
    );

    const profileText = verified
      .map((item) => (item.level ? `${item.name} (${item.level})` : item.name))
      .filter(Boolean)
      .join(", ");

    await this.prisma.$executeRawUnsafe(
      `UPDATE guides SET languages=?,updated_at=NOW() WHERE id=?`,
      profileText || null,
      guideId,
    );
  }

  async reviewCompetency(user: any, competencyId: number, body: any) {
    const action = String(body?.action || "").trim();
    const reason = String(body?.reason || "").trim();

    if (!["approve", "reject"].includes(action)) {
      throw new BadRequestException("Hành động duyệt không hợp lệ.");
    }

    if (action === "reject" && !reason) {
      throw new BadRequestException("Vui lòng nhập lý do từ chối.");
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT gc.id,gc.guide_id AS guideId,gc.document_url AS documentUrl,
              gc.competency_type AS competencyType,gc.verification_status AS verificationStatus,
              gc.name,gc.level,g.user_id AS guideUserId
       FROM guide_competencies gc
       JOIN guides g ON g.id=gc.guide_id
       WHERE gc.id=? LIMIT 1`,
      competencyId,
    );

    if (!rows.length) {
      throw new NotFoundException("Không tìm thấy hồ sơ năng lực.");
    }

    const item = rows[0];
    if (
      item.competencyType === "certificate" &&
      action === "approve" &&
      !item.documentUrl
    ) {
      throw new BadRequestException(
        "Không thể duyệt chứng chỉ chưa có minh chứng.",
      );
    }

    const nextStatus = action === "approve" ? "verified" : "rejected";

    await this.prisma.$executeRawUnsafe(
      `UPDATE guide_competencies
       SET verification_status=?,verified_by=?,verified_at=NOW(),
           rejection_reason=?,updated_at=NOW()
       WHERE id=?`,
      nextStatus,
      this.uid(user),
      action === "reject" ? reason : null,
      competencyId,
    );

    await this.syncVerifiedCompetencies(Number(item.guideId));

    // Gửi thông báo trực tiếp cho hướng dẫn viên sau khi Admin duyệt/từ chối.
    if (item.guideUserId) {
      const competencyLabel = item.level
        ? `${item.name} (${item.level})`
        : item.name;
      const title =
        action === "approve"
          ? "Hồ sơ năng lực đã được duyệt"
          : "Hồ sơ năng lực bị từ chối";
      const content =
        action === "approve"
          ? `Năng lực/chứng chỉ "${competencyLabel}" của bạn đã được Admin xác minh và sẽ được hiển thị trong hồ sơ chính.`
          : `Năng lực/chứng chỉ "${competencyLabel}" chưa được duyệt. Lý do: ${reason}`;

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO notifications(
           title,message,content,target_role,target_user_id,is_published,created_by,created_at,updated_at
         ) VALUES (?,?,?,'all',?,1,?,NOW(),NOW())`,
        title,
        content.slice(0, 500),
        content,
        Number(item.guideUserId),
        this.uid(user),
      );
    }

    return {
      success: true,
      status: nextStatus,
      message:
        action === "approve"
          ? "Đã xác minh hồ sơ năng lực."
          : "Đã từ chối hồ sơ năng lực.",
    };
  }
}
