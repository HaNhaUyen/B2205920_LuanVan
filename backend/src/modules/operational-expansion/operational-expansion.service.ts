import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class OperationalExpansionService {
  constructor(private readonly prisma: PrismaService) {}
  private uid(u: any) {
    return Number(u?.userId);
  }
  private role(u: any) {
    return String(u?.role || "");
  }
  private json(v: any) {
    return v == null ? null : JSON.stringify(v);
  }
  private async audit(
    user: any,
    action: string,
    entityType: string,
    entityId: any,
    oldData: any = null,
    newData: any = null,
  ) {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,old_data,new_data) VALUES (?,?,?,?,?,?)`,
      this.uid(user) || null,
      action,
      entityType,
      String(entityId ?? ""),
      this.json(oldData),
      this.json(newData),
    );
  }
  private async guideId(user: any) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM guides WHERE user_id=? LIMIT 1`,
      this.uid(user),
    );
    if (!rows.length)
      throw new ForbiddenException("Tài khoản chưa liên kết hướng dẫn viên.");
    return Number(rows[0].id);
  }
  private async assertBookingOwner(user: any, bookingId: number) {
    if (this.role(user) === "admin") return;
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM bookings WHERE id=? AND user_id=? LIMIT 1`,
      bookingId,
      this.uid(user),
    );
    if (!rows.length)
      throw new ForbiddenException("Bạn không có quyền truy cập booking này.");
  }
  private async assertTripAccess(
    user: any,
    operationId: number,
    allowUser = false,
  ) {
    if (this.role(user) === "admin") return;
    if (this.role(user) === "guide") {
      const gid = await this.guideId(user);
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT id FROM trip_operations WHERE id=? AND guide_id=?`,
        operationId,
        gid,
      );
      if (rows.length) return;
    }
    if (allowUser && this.role(user) === "user") {
      const rows = await this.prisma.$queryRawUnsafe<any[]>(
        `SELECT op.id FROM trip_operations op JOIN bookings b ON b.departure_id=op.departure_id WHERE op.id=? AND b.user_id=? AND b.booking_status IN ('confirmed','completed','waiting_confirmation') LIMIT 1`,
        operationId,
        this.uid(user),
      );
      if (rows.length) return;
    }
    throw new ForbiddenException("Bạn không có quyền truy cập chuyến đi.");
  }

  async suppliers(q: any) {
    const search = String(q?.search || "").trim();
    const type = String(q?.type || "").trim();
    const status = String(q?.status || "").trim();
    let sql = `SELECT s.*,COUNT(DISTINCT ss.id) serviceCount,COUNT(DISTINCT sc.id) contactCount FROM suppliers s LEFT JOIN supplier_services ss ON ss.supplier_id=s.id LEFT JOIN supplier_contacts sc ON sc.supplier_id=s.id WHERE 1=1`;
    const p: any[] = [];
    if (search) {
      sql += ` AND (s.name LIKE ? OR s.supplier_code LIKE ? OR s.phone LIKE ?)`;
      p.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (type) {
      sql += ` AND s.supplier_type=?`;
      p.push(type);
    }
    if (status) {
      sql += ` AND s.status=?`;
      p.push(status);
    }
    sql += ` GROUP BY s.id ORDER BY s.created_at DESC`;
    return this.prisma.$queryRawUnsafe<any[]>(sql, ...p);
  }
  async createSupplier(user: any, b: any) {
    if (!b?.name || !b?.supplierType)
      throw new BadRequestException("Tên và loại nhà cung cấp là bắt buộc.");
    const code = String(b.supplierCode || `SUP-${Date.now()}`);
    const r: any = await this.prisma.$executeRawUnsafe(
      `INSERT INTO suppliers(supplier_code,name,supplier_type,tax_code,representative,phone,email,address,province,bank_account,bank_name,rating,status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code,
      b.name,
      b.supplierType,
      b.taxCode || null,
      b.representative || null,
      b.phone || null,
      b.email || null,
      b.address || null,
      b.province || null,
      b.bankAccount || null,
      b.bankName || null,
      b.rating || null,
      b.status || "active",
      b.note || null,
    );
    await this.audit(user, "CREATE", "supplier", code, null, b);
    return { success: true, id: Number(r) };
  }
  async updateSupplier(user: any, id: number, b: any) {
    const old = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM suppliers WHERE id=?`,
      id,
    );
    if (!old.length)
      throw new NotFoundException("Không tìm thấy nhà cung cấp.");
    await this.prisma.$executeRawUnsafe(
      `UPDATE suppliers SET name=COALESCE(?,name),supplier_type=COALESCE(?,supplier_type),tax_code=?,representative=?,phone=?,email=?,address=?,province=?,bank_account=?,bank_name=?,rating=?,status=COALESCE(?,status),note=? WHERE id=?`,
      b.name || null,
      b.supplierType || null,
      b.taxCode ?? old[0].tax_code,
      b.representative ?? old[0].representative,
      b.phone ?? old[0].phone,
      b.email ?? old[0].email,
      b.address ?? old[0].address,
      b.province ?? old[0].province,
      b.bankAccount ?? old[0].bank_account,
      b.bankName ?? old[0].bank_name,
      b.rating ?? old[0].rating,
      b.status || null,
      b.note ?? old[0].note,
      id,
    );
    await this.audit(user, "UPDATE", "supplier", id, old[0], b);
    return { success: true };
  }
  async removeSupplier(user: any, id: number) {
    const used = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) total FROM trip_supplier_bookings WHERE supplier_id=? AND status NOT IN ('cancelled','completed')`,
      id,
    );
    if (Number(used[0]?.total) > 0)
      throw new BadRequestException(
        "Nhà cung cấp đang có dịch vụ chưa hoàn tất.",
      );
    await this.prisma.$executeRawUnsafe(
      `UPDATE suppliers SET status='inactive' WHERE id=?`,
      id,
    );
    await this.audit(user, "DEACTIVATE", "supplier", id);
    return { success: true };
  }
  async addSupplierService(id: number, b: any) {
    if (!b?.name || !b?.serviceType)
      throw new BadRequestException("Thiếu tên hoặc loại dịch vụ.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO supplier_services(supplier_id,service_code,name,service_type,unit,unit_price,description,status) VALUES (?,?,?,?,?,?,?,?)`,
      id,
      b.serviceCode || null,
      b.name,
      b.serviceType,
      b.unit || null,
      b.unitPrice || null,
      b.description || null,
      b.status || "active",
    );
    return { success: true };
  }

  async requestDepartureChange(user: any, b: any) {
    const bookingId = Number(b?.bookingId),
      newDepartureId = Number(b?.newDepartureId);
    if (!bookingId || !newDepartureId || !b?.reason)
      throw new BadRequestException("Thiếu thông tin đổi lịch.");
    await this.assertBookingOwner(user, bookingId);
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT b.id,b.departure_id oldDepartureId,b.final_amount oldAmount,b.adult_count,b.child_count,b.tour_id,td.adult_price,td.child_price,td.total_slots,td.booked_slots,td.held_slots,td.status FROM bookings b JOIN tour_departures td ON td.id=? WHERE b.id=? AND td.tour_id=b.tour_id`,
      newDepartureId,
      bookingId,
    );
    if (!rows.length)
      throw new BadRequestException("Lịch mới không hợp lệ hoặc khác tour.");
    const x = rows[0];
    const seats = Number(x.adult_count) + Number(x.child_count);
    if (
      x.status !== "open" ||
      Number(x.total_slots) - Number(x.booked_slots) - Number(x.held_slots) <
        seats
    )
      throw new BadRequestException("Lịch mới không còn đủ chỗ.");
    const newAmount =
      Number(x.adult_count) * Number(x.adult_price) +
      Number(x.child_count) * Number(x.child_price);
    const code = `DCR-${Date.now()}-${bookingId}`;
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO departure_change_requests(request_code,booking_id,requested_by,old_departure_id,new_departure_id,reason,old_amount,new_amount,price_difference) VALUES (?,?,?,?,?,?,?,?,?)`,
      code,
      bookingId,
      this.uid(user),
      x.oldDepartureId,
      newDepartureId,
      b.reason,
      x.oldAmount,
      newAmount,
      newAmount - Number(x.oldAmount),
    );
    return {
      success: true,
      requestCode: code,
      newAmount,
      priceDifference: newAmount - Number(x.oldAmount),
    };
  }
  async departureChanges(user: any, q: any) {
    let sql = `SELECT r.*,b.booking_code bookingCode,t.name tourName,od.departure_date oldDate,nd.departure_date newDate,u.full_name requesterName FROM departure_change_requests r JOIN bookings b ON b.id=r.booking_id JOIN tours t ON t.id=b.tour_id JOIN tour_departures od ON od.id=r.old_departure_id JOIN tour_departures nd ON nd.id=r.new_departure_id JOIN users u ON u.id=r.requested_by WHERE 1=1`;
    const p: any[] = [];
    if (this.role(user) !== "admin") {
      sql += ` AND r.requested_by=?`;
      p.push(this.uid(user));
    }
    if (q?.status) {
      sql += ` AND r.status=?`;
      p.push(q.status);
    }
    sql += ` ORDER BY r.created_at DESC`;
    return this.prisma.$queryRawUnsafe<any[]>(sql, ...p);
  }
  async reviewDepartureChange(user: any, id: number, b: any) {
    const action = String(b?.action || "");
    if (!["approve", "reject"].includes(action))
      throw new BadRequestException("Action không hợp lệ.");
    return this.prisma.$transaction(async (tx) => {
      const rr = await tx.$queryRawUnsafe<any[]>(
        `SELECT r.*,b.adult_count,b.child_count,b.booking_status FROM departure_change_requests r JOIN bookings b ON b.id=r.booking_id WHERE r.id=? FOR UPDATE`,
        id,
      );
      if (!rr.length) throw new NotFoundException("Không tìm thấy yêu cầu.");
      const r = rr[0];
      if (r.status !== "pending")
        throw new BadRequestException("Yêu cầu đã được xử lý.");
      if (action === "reject") {
        await tx.$executeRawUnsafe(
          `UPDATE departure_change_requests SET status='rejected',admin_note=?,reviewed_by=?,reviewed_at=NOW() WHERE id=?`,
          b.adminNote || null,
          this.uid(user),
          id,
        );
        return { success: true, status: "rejected" };
      }
      const nd = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM tour_departures WHERE id=? FOR UPDATE`,
        r.new_departure_id,
      );
      const seats = Number(r.adult_count) + Number(r.child_count);
      if (
        !nd.length ||
        nd[0].status !== "open" ||
        Number(nd[0].total_slots) -
          Number(nd[0].booked_slots) -
          Number(nd[0].held_slots) <
          seats
      )
        throw new BadRequestException("Lịch mới không còn đủ chỗ.");
      await tx.$executeRawUnsafe(
        `UPDATE tour_departures SET booked_slots=GREATEST(booked_slots-?,0) WHERE id=?`,
        seats,
        r.old_departure_id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE tour_departures SET booked_slots=booked_slots+? WHERE id=?`,
        seats,
        r.new_departure_id,
      );
      const nextStatus =
        Number(r.price_difference) > 0 ? "awaiting_payment" : "completed";
      await tx.$executeRawUnsafe(
        `UPDATE bookings SET departure_id=?,original_amount=?,final_amount=?,pickup_point_id=NULL,pickup_name=NULL,pickup_address=NULL,pickup_time=NULL,pickup_note=NULL WHERE id=?`,
        r.new_departure_id,
        r.new_amount,
        r.new_amount,
        r.booking_id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE departure_change_requests SET status=?,admin_note=?,reviewed_by=?,reviewed_at=NOW(),completed_at=IF(?='completed',NOW(),NULL) WHERE id=?`,
        nextStatus,
        b.adminNote || null,
        this.uid(user),
        nextStatus,
        id,
      );
      await tx.$executeRawUnsafe(
        `INSERT INTO booking_status_logs(booking_id,action_type,old_status,new_status,changed_by_user_id,source,reason,note) VALUES (?,'departure_changed',?,?,?,'admin',?,?)`,
        r.booking_id,
        r.booking_status,
        r.booking_status,
        this.uid(user),
        "Khách đổi lịch khởi hành",
        b.adminNote || null,
      );
      return { success: true, status: nextStatus };
    });
  }

  async issueTickets(user: any, bookingId: number) {
    const b = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id,departure_id,booking_status FROM bookings WHERE id=?`,
      bookingId,
    );
    if (!b.length) throw new NotFoundException("Không tìm thấy booking.");
    if (
      !["confirmed", "completed", "waiting_confirmation"].includes(
        b[0].booking_status,
      )
    )
      throw new BadRequestException("Booking chưa đủ điều kiện phát hành vé.");
    const guests = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM booking_guests WHERE booking_id=?`,
      bookingId,
    );
    let issued = 0;
    for (const g of guests) {
      const token = randomBytes(32).toString("hex"),
        hash = createHash("sha256").update(token).digest("hex"),
        code = `ET-${bookingId}-${g.id}-${Date.now().toString().slice(-6)}`;
      await this.prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO electronic_tickets(ticket_code,booking_id,booking_guest_id,departure_id,qr_token_hash,expires_at) VALUES (?,?,?,?,?,(SELECT DATE_ADD(end_date,INTERVAL 1 DAY) FROM tour_departures WHERE id=?))`,
        code,
        bookingId,
        g.id,
        b[0].departure_id,
        hash,
        b[0].departure_id,
      );
      issued++;
    }
    await this.audit(user, "ISSUE", "electronic_ticket", bookingId, null, {
      issued,
    });
    return { success: true, issued };
  }
  async bookingTickets(user: any, bookingId: number) {
    await this.assertBookingOwner(user, bookingId);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT et.id,et.ticket_code ticketCode,et.status,et.issued_at issuedAt,et.expires_at expiresAt,et.checked_in_at checkedInAt,bg.full_name fullName,bg.guest_type guestType FROM electronic_tickets et JOIN booking_guests bg ON bg.id=et.booking_guest_id WHERE et.booking_id=? ORDER BY bg.id`,
      bookingId,
    );
  }
  async scanTicket(user: any, b: any) {
    const token = String(b?.token || "");
    if (!token) throw new BadRequestException("Thiếu token QR.");
    const hash = createHash("sha256").update(token).digest("hex");
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT et.*,op.id operationId FROM electronic_tickets et LEFT JOIN trip_operations op ON op.departure_id=et.departure_id WHERE et.qr_token_hash=? LIMIT 1`,
      hash,
    );
    if (!rows.length) return { success: false, result: "invalid" };
    const t = rows[0];
    let result = "success";
    if (t.status === "used") result = "already_used";
    else if (t.status === "cancelled") result = "cancelled";
    else if (t.expires_at && new Date(t.expires_at) < new Date())
      result = "expired";
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO ticket_scan_logs(ticket_id,trip_operation_id,scanned_by,scan_result,device_info,ip_address,note) VALUES (?,?,?,?,?,?,?)`,
      t.id,
      t.operationId || null,
      this.uid(user),
      result,
      b.deviceInfo || null,
      b.ipAddress || null,
      b.note || null,
    );
    if (result === "success") {
      await this.prisma.$transaction([
        this.prisma.$executeRawUnsafe(
          `UPDATE electronic_tickets SET status='used',checked_in_at=NOW() WHERE id=?`,
          t.id,
        ),
        this.prisma.$executeRawUnsafe(
          `INSERT INTO passenger_checkins(trip_operation_id,booking_guest_id,status,checked_in_at,checked_in_by,note) VALUES (?,?, 'present',NOW(),?,'QR check-in') ON DUPLICATE KEY UPDATE status='present',checked_in_at=NOW(),checked_in_by=VALUES(checked_in_by),note='QR check-in'`,
          t.operationId,
          t.booking_guest_id,
          this.uid(user),
        ),
      ]);
    }
    return { success: result === "success", result, ticketCode: t.ticket_code };
  }

  async availability(user: any, q: any) {
    let gid = q?.guideId ? Number(q.guideId) : null;
    if (this.role(user) === "guide") gid = await this.guideId(user);
    let sql = `SELECT ga.*,g.full_name guideName FROM guide_availabilities ga JOIN guides g ON g.id=ga.guide_id WHERE 1=1`;
    const p: any[] = [];
    if (gid) {
      sql += ` AND ga.guide_id=?`;
      p.push(gid);
    }
    if (q?.from) {
      sql += ` AND ga.end_at>=?`;
      p.push(q.from);
    }
    if (q?.to) {
      sql += ` AND ga.start_at<=?`;
      p.push(q.to);
    }
    sql += ` ORDER BY ga.start_at`;
    return this.prisma.$queryRawUnsafe<any[]>(sql, ...p);
  }
  async createAvailability(user: any, b: any) {
    const gid =
      this.role(user) === "guide"
        ? await this.guideId(user)
        : Number(b?.guideId);
    if (!gid || !b?.startAt || !b?.endAt)
      throw new BadRequestException("Thiếu hướng dẫn viên hoặc thời gian.");
    if (new Date(b.endAt) <= new Date(b.startAt))
      throw new BadRequestException("Thời gian kết thúc phải sau bắt đầu.");
    const conflict = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM guide_assignments WHERE guide_id=? AND status NOT IN ('cancelled','rejected') AND start_date<=DATE(?) AND end_date>=DATE(?) LIMIT 1`,
      gid,
      b.endAt,
      b.startAt,
    );
    if (conflict.length)
      throw new BadRequestException(
        "Khoảng thời gian trùng tour đã phân công.",
      );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO guide_availabilities(guide_id,availability_type,start_at,end_at,all_day,reason,status,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      gid,
      b.availabilityType || "unavailable",
      b.startAt,
      b.endAt,
      b.allDay !== false,
      b.reason || null,
      this.role(user) === "admin" ? "active" : "pending",
      this.uid(user),
    );
    return { success: true };
  }
  async deleteAvailability(user: any, id: number) {
    let sql = `DELETE FROM guide_availabilities WHERE id=?`;
    const p: any[] = [id];
    if (this.role(user) === "guide") {
      sql += ` AND guide_id=?`;
      p.push(await this.guideId(user));
    }
    await this.prisma.$executeRawUnsafe(sql, ...p);
    return { success: true };
  }

  async sessions(user: any) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT session_id sessionId,device_name deviceName,device_type deviceType,browser,operating_system operatingSystem,ip_address ipAddress,status,last_active_at lastActiveAt,expires_at expiresAt,created_at createdAt FROM user_sessions WHERE user_id=? ORDER BY last_active_at DESC`,
      this.uid(user),
    );
  }
  async revokeSession(user: any, sid: string) {
    await this.prisma.$executeRawUnsafe(
      `UPDATE user_sessions SET status='revoked',revoked_at=NOW(),revoke_reason='Người dùng đăng xuất thiết bị' WHERE session_id=? AND user_id=?`,
      sid,
      this.uid(user),
    );
    return { success: true };
  }
  async revokeAllSessions(user: any, except?: string) {
    let sql = `UPDATE user_sessions SET status='revoked',revoked_at=NOW(),revoke_reason='Đăng xuất tất cả thiết bị' WHERE user_id=? AND status='active'`;
    const p: any[] = [this.uid(user)];
    if (except) {
      sql += ` AND session_id<>?`;
      p.push(except);
    }
    await this.prisma.$executeRawUnsafe(sql, ...p);
    return { success: true };
  }

  async alerts(q: any) {
    let sql = `SELECT oa.*,t.name tourName,td.departure_date departureDate,g.full_name guideName FROM operational_alerts oa LEFT JOIN tour_departures td ON td.id=oa.departure_id LEFT JOIN tours t ON t.id=td.tour_id LEFT JOIN guides g ON g.id=oa.guide_id WHERE 1=1`;
    const p: any[] = [];
    if (q?.status) {
      sql += ` AND oa.status=?`;
      p.push(q.status);
    }
    if (q?.severity) {
      sql += ` AND oa.severity=?`;
      p.push(q.severity);
    }
    sql += ` ORDER BY FIELD(oa.severity,'critical','high','warning','info'),oa.detected_at DESC`;
    return this.prisma.$queryRawUnsafe<any[]>(sql, ...p);
  }
  async scanAlerts() {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO operational_alerts(alert_code,alert_type,severity,departure_id,title,message,deduplication_key) SELECT CONCAT('ALT-G-',td.id),'guide_not_assigned','high',td.id,'Chưa phân công hướng dẫn viên',CONCAT('Lịch ',DATE_FORMAT(td.departure_date,'%d/%m/%Y'),' chưa có hướng dẫn viên'),CONCAT('guide_not_assigned:',td.id) FROM tour_departures td LEFT JOIN trip_operations op ON op.departure_id=td.id WHERE td.status='open' AND td.departure_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 3 DAY) AND (op.guide_id IS NULL) ON DUPLICATE KEY UPDATE updated_at=NOW()`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO operational_alerts(alert_code,alert_type,severity,departure_id,title,message,deduplication_key) SELECT CONCAT('ALT-L-',td.id),'low_guest_count','warning',td.id,'Số khách thấp',CONCAT('Lịch chỉ có ',td.booked_slots,' khách trên ',td.total_slots,' chỗ'),CONCAT('low_guest_count:',td.id) FROM tour_departures td WHERE td.status='open' AND td.departure_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY) AND td.booked_slots<10 ON DUPLICATE KEY UPDATE message=VALUES(message),updated_at=NOW()`,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO operational_alerts(alert_code,alert_type,severity,booking_id,departure_id,title,message,deduplication_key) SELECT CONCAT('ALT-P-',b.id),'unpaid_booking','warning',b.id,b.departure_id,'Booking chưa thanh toán',CONCAT('Booking ',b.booking_code,' chưa thanh toán'),CONCAT('unpaid_booking:',b.id) FROM bookings b JOIN tour_departures td ON td.id=b.departure_id WHERE b.booking_status='pending_payment' AND td.departure_date<=DATE_ADD(CURDATE(),INTERVAL 2 DAY) ON DUPLICATE KEY UPDATE updated_at=NOW()`,
    );
    const c = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) total FROM operational_alerts WHERE status='open'`,
    );
    return { success: true, open: Number(c[0]?.total || 0) };
  }
  async updateAlert(user: any, id: number, b: any) {
    const status = String(b?.status || "");
    if (
      !["acknowledged", "in_progress", "resolved", "ignored"].includes(status)
    )
      throw new BadRequestException("Trạng thái không hợp lệ.");
    await this.prisma.$executeRawUnsafe(
      `UPDATE operational_alerts SET status=?,assigned_to=COALESCE(?,assigned_to),acknowledged_by=IF(?='acknowledged',?,acknowledged_by),acknowledged_at=IF(?='acknowledged',NOW(),acknowledged_at),resolved_by=IF(?='resolved',?,resolved_by),resolved_at=IF(?='resolved',NOW(),resolved_at),resolution_note=COALESCE(?,resolution_note) WHERE id=?`,
      status,
      b.assignedTo || null,
      status,
      this.uid(user),
      status,
      status,
      this.uid(user),
      status,
      b.resolutionNote || null,
      id,
    );
    return { success: true };
  }

  async checklist(id: number) {
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM trip_checklist_items WHERE trip_operation_id=? ORDER BY display_order,id`,
      id,
    );
  }
  async bootstrapChecklist(id: number) {
    const defs = [
      ["guide", "Xác nhận hướng dẫn viên"],
      ["vehicle", "Xác nhận phương tiện"],
      ["hotel", "Xác nhận khách sạn"],
      ["passenger", "Chốt danh sách hành khách"],
      ["payment", "Kiểm tra thanh toán"],
      ["notification", "Gửi thông báo khởi hành"],
      ["document", "Chuẩn bị tài liệu đoàn"],
    ];
    let i = 1;
    for (const [c, t] of defs) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO trip_checklist_items(trip_operation_id,category,title,display_order) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM trip_checklist_items WHERE trip_operation_id=? AND title=?)`,
        id,
        c,
        t,
        i++,
        id,
        t,
      );
    }
    return this.checklist(id);
  }
  async updateChecklist(user: any, id: number, item: number, b: any) {
    await this.assertTripAccess(user, id);
    await this.prisma.$executeRawUnsafe(
      `UPDATE trip_checklist_items SET status=COALESCE(?,status),note=COALESCE(?,note),completed_by=IF(?='completed',?,completed_by),completed_at=IF(?='completed',NOW(),completed_at) WHERE id=? AND trip_operation_id=?`,
      b.status || null,
      b.note || null,
      b.status,
      this.uid(user),
      b.status,
      item,
      id,
    );
    return { success: true };
  }

  async documents(user: any, id: number) {
    await this.assertTripAccess(user, id, true);
    let vis = `('all','customer')`;
    if (this.role(user) === "guide") vis = `('all','customer','admin_guide')`;
    if (this.role(user) === "admin")
      vis = `('all','customer','admin_guide','admin_only')`;
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM trip_documents WHERE trip_operation_id=? AND visibility IN ${vis} ORDER BY uploaded_at DESC`,
      id,
    );
  }
  async createDocument(user: any, id: number, b: any) {
    await this.assertTripAccess(user, id);
    if (!b?.title || !b?.fileUrl || !b?.fileName)
      throw new BadRequestException("Thiếu thông tin tài liệu.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO trip_documents(trip_operation_id,document_type,title,description,file_name,file_url,mime_type,file_size,visibility,version,uploaded_by,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      b.documentType || "other",
      b.title,
      b.description || null,
      b.fileName,
      b.fileUrl,
      b.mimeType || null,
      b.fileSize || null,
      b.visibility || "admin_guide",
      b.version || 1,
      this.uid(user),
      b.expiresAt || null,
    );
    return { success: true };
  }

  async bootstrapItinerary(id: number) {
    await this.prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO trip_itinerary_items(trip_operation_id,source_itinerary_item_id,day_number,item_order,title,description,location_name) SELECT op.id,ti.id,ti.day_number,ti.item_order,ti.title,ti.description,ti.location_name FROM trip_operations op JOIN tour_departures td ON td.id=op.departure_id JOIN tour_itinerary ti ON ti.tour_id=td.tour_id WHERE op.id=?`,
      id,
    );
    return this.tripItinerary({ role: "admin" }, id);
  }
  async tripItinerary(user: any, id: number) {
    await this.assertTripAccess(user, id, true);
    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM trip_itinerary_items WHERE trip_operation_id=? ORDER BY day_number,item_order`,
      id,
    );
  }
  async requestItineraryChange(user: any, id: number, b: any) {
    await this.assertTripAccess(user, id);
    if (!b?.changeType || !b?.proposedData || !b?.reason)
      throw new BadRequestException("Thiếu dữ liệu thay đổi.");
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO itinerary_change_requests(trip_operation_id,itinerary_item_id,requested_by,change_type,old_data,proposed_data,reason,is_emergency,status) VALUES (?,?,?,?,?,?,?,?,?)`,
      id,
      b.itineraryItemId || null,
      this.uid(user),
      b.changeType,
      this.json(b.oldData),
      this.json(b.proposedData),
      b.reason,
      !!b.isEmergency,
      this.role(user) === "admin" ? "approved" : "pending",
    );
    return { success: true };
  }
  async reviewItineraryChange(user: any, id: number, b: any) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.$queryRawUnsafe<any[]>(
        `SELECT * FROM itinerary_change_requests WHERE id=? FOR UPDATE`,
        id,
      );
      if (!r.length) throw new NotFoundException("Không tìm thấy yêu cầu.");
      if (b.action === "reject") {
        await tx.$executeRawUnsafe(
          `UPDATE itinerary_change_requests SET status='rejected',reviewed_by=?,reviewed_at=NOW(),admin_note=? WHERE id=?`,
          this.uid(user),
          b.adminNote || null,
          id,
        );
        return { success: true };
      }
      const d =
        typeof r[0].proposed_data === "string"
          ? JSON.parse(r[0].proposed_data)
          : r[0].proposed_data;
      if (r[0].itinerary_item_id) {
        await tx.$executeRawUnsafe(
          `UPDATE trip_itinerary_items SET title=COALESCE(?,title),description=COALESCE(?,description),location_name=COALESCE(?,location_name),planned_start_at=COALESCE(?,planned_start_at),planned_end_at=COALESCE(?,planned_end_at),status='changed',change_reason=?,updated_by=? WHERE id=?`,
          d.title || null,
          d.description || null,
          d.locationName || null,
          d.plannedStartAt || null,
          d.plannedEndAt || null,
          r[0].reason,
          this.uid(user),
          r[0].itinerary_item_id,
        );
      }
      await tx.$executeRawUnsafe(
        `UPDATE itinerary_change_requests SET status='approved',reviewed_by=?,reviewed_at=NOW(),admin_note=?,applied_at=NOW() WHERE id=?`,
        this.uid(user),
        b.adminNote || null,
        id,
      );
      return { success: true };
    });
  }

  async advancedReports(q: any) {
    const from = q?.from || "2026-01-01",
      to = q?.to || "2030-12-31";
    const [finance, occupancy, incidents, guides] = await Promise.all([
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT DATE_FORMAT(COALESCE(p.paid_at,p.created_at),'%Y-%m') period,SUM(CASE WHEN p.payment_status='paid' THEN p.amount ELSE 0 END) grossRevenue,SUM(CASE WHEN rr.status='approved' THEN COALESCE(rr.refund_amount,0) ELSE 0 END) refundAmount,SUM(CASE WHEN p.payment_status='paid' THEN p.amount ELSE 0 END)-SUM(CASE WHEN rr.status='approved' THEN COALESCE(rr.refund_amount,0) ELSE 0 END) netRevenue,COUNT(DISTINCT b.id) bookingCount FROM payments p JOIN bookings b ON b.id=p.booking_id LEFT JOIN refund_requests rr ON rr.booking_id=b.id WHERE DATE(COALESCE(p.paid_at,p.created_at)) BETWEEN ? AND ? GROUP BY period ORDER BY period`,
        from,
        to,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT t.name tourName,td.departure_date departureDate,td.total_slots totalSlots,td.booked_slots bookedSlots,ROUND(td.booked_slots*100/NULLIF(td.total_slots,0),2) occupancyRate FROM tour_departures td JOIN tours t ON t.id=td.tour_id WHERE td.departure_date BETWEEN ? AND ? ORDER BY occupancyRate DESC LIMIT 50`,
        from,
        to,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT category,severity,status,COUNT(*) total FROM incident_tickets WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY category,severity,status`,
        from,
        to,
      ),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT g.id,g.full_name guideName,COUNT(DISTINCT op.id) tripCount,SUM(CASE WHEN op.operation_status='completed' THEN 1 ELSE 0 END) completedTrips,COUNT(DISTINCT it.id) incidentCount,ROUND(AVG((COALESCE(tr.vehicle_rating,0)+COALESCE(tr.hotel_rating,0)+COALESCE(tr.restaurant_rating,0)+COALESCE(tr.itinerary_rating,0))/NULLIF((tr.vehicle_rating IS NOT NULL)+(tr.hotel_rating IS NOT NULL)+(tr.restaurant_rating IS NOT NULL)+(tr.itinerary_rating IS NOT NULL),0)),2) averageRating FROM guides g LEFT JOIN trip_operations op ON op.guide_id=g.id LEFT JOIN incident_tickets it ON it.trip_operation_id=op.id LEFT JOIN trip_reports tr ON tr.trip_operation_id=op.id WHERE op.created_at IS NULL OR DATE(op.created_at) BETWEEN ? AND ? GROUP BY g.id ORDER BY completedTrips DESC`,
        from,
        to,
      ),
    ]);
    return { range: { from, to }, finance, occupancy, incidents, guides };
  }
}
