# Travela full MVC-style patch

## 1. Code có theo MVC chưa?
Project này dùng NestJS + Next.js nên không phải MVC cổ điển Express, nhưng đã được tổ chức theo MVC-style:

- View: `frontend/pages`, `frontend/components`
- Controller: `backend/src/modules/*/*.controller.ts`
- Service: `backend/src/modules/*/*.service.ts`
- Model/Data layer: `backend/prisma/schema.prisma` và MySQL tables trong `sql/00_complete_database_workbench.sql`
- DTO/Validation: `backend/src/modules/*/dto`

## 2. Database chạy bằng MySQL Workbench
Mở MySQL Workbench, chạy toàn bộ file:

```sql
sql/00_complete_database_workbench.sql
```

File này tự tạo database `travela_full_mvc`, tạo bảng và seed dữ liệu demo.

## 3. Không chạy Prisma seed/migrate được không?
Được. Bạn không cần chạy `prisma migrate` hay `prisma db seed`.
Backend vẫn dùng Prisma Client như ORM runtime, nên sau khi `npm install` chỉ cần chạy:

```bash
cd backend
npx prisma generate
npm run start:dev
```

## 4. Bảo mật
Đã dùng JWT. Bản này thêm bảng `revoked_tokens` và guard kiểm tra blacklist token sau logout. Nếu làm production mạnh hơn, có thể thay `revoked_tokens` bằng Redis blacklist hoặc tích hợp Keycloak.

## 5. Các chức năng đã thêm
- Kiểm tra số lượng tour, không đặt vượt slot.
- Chặn user đặt nếu chưa có số điện thoại và CCCD.
- Ngày sinh không bắt buộc.
- QR payment demo: `/mock-payment`.
- Email xác nhận thanh toán dùng SMTP env.
- Quản lý hướng dẫn viên + kiểm tra HDV rảnh theo ngày.
- Quản lý voucher theo hạng thành viên.
- Quản lý hoàn tiền, duyệt sẽ hủy booking và trả lại slot.
- AI recommendation theo hành vi người dùng.
- Dark mode ở frontend.
- SQL seed có users, tours, departures, bookings, payments, guides, vouchers, refunds, reviews, favorites, behaviors, FAQs.

## 6. File không cần thiết đã loại/sạch hóa
- Không đính kèm `node_modules`, `.next`, `dist`, `build`, `coverage`.
- Đã bỏ `tsconfig.tsbuildinfo`.
- Đã thay `.env` thật bằng placeholder an toàn.
