# Travela - Validation Gaps And Recommendations

## Cập Nhật Triển Khai P0 - 2026-08-06

Trạng thái: In progress. Đã triển khai lớp bảo vệ P0 cho booking capacity, refund active duplicate và idempotency tối thiểu cho các endpoint tạo booking/checkout/refund. Chưa chạy migration trên database thật và chưa chạy concurrency integration test với MySQL thật trong lượt này.

Completed:
- Booking capacity atomic: thêm `DepartureCapacityService` với update SQL có điều kiện cho giữ chỗ, chuyển held sang booked, giải phóng held/booked; áp dụng trong booking, checkout, payment confirm/fail/expire, cancel và refund approve.
- Refund active duplicate: thêm `RefundRequest.activeKey` nullable unique; pending/approved dùng `booking:{bookingId}`; rejected clear `activeKey`.
- Idempotency: thêm `IdempotencyRequest` và hỗ trợ header `Idempotency-Key` cho `POST /bookings`, `POST /payments/checkout`, `POST /refunds`.
- Prisma exception fallback: thêm global filter cho `P2002`, `P2003`, `P2025`.
- Migration precheck: thêm `npm run precheck:validation:p0`, xuất `docs/MIGRATION_PRECHECK_REPORT.md`, chỉ đọc dữ liệu.

Tests đã chạy:
- `npx prisma validate`: Passed.
- `npm run test:validation:p0`: Passed.
- `npm run build`: Passed.
- `npx prisma generate`: Blocked do Windows đang khóa `node_modules/.prisma/client/query_engine-windows.dll.node`; cần dừng process Node đang giữ Prisma engine rồi chạy lại.

Chưa hoàn thành:
- Chưa chạy migration thật.
- Chưa chạy concurrency integration test với MySQL thật.
- Chưa triển khai các mục P1/P2/P3 còn lại.
- Chưa triển khai PaymentWebhookLog P1.

Hướng dẫn migration an toàn:
1. Dừng các process Node/Nest đang giữ Prisma Client.
2. Chạy `npm run precheck:validation:p0` trong thư mục `backend`.
3. Nếu report có trạng thái `Blocked`, không chạy migration; xử lý dữ liệu trùng/không hợp lệ trước.
4. Chạy `npx prisma generate`.
5. Chạy migration trên development/staging trước, không dùng `prisma migrate reset`.
6. Sau migration, chạy lại `npx prisma validate`, `npm run test:validation:p0`, `npm run build`.

Tài liệu này chỉ liệt kê lỗ hổng/thiếu sót đã phát hiện khi đối chiếu source hiện tại với validation, business rules và database constraints.

| STT | Module | Lỗ hổng/thiếu sót | Độ nghiêm trọng | Đề xuất | File cần sửa | Mức ưu tiên |
| --: | ------ | ----------------- | --------------- | ------- | ------------ | ----------- |
| 1 | Booking | Chưa thấy atomic capacity update dạng `WHERE remaining >= requested` khi giữ/chốt chỗ; hai request đồng thời có thể đọc cùng remaining trước khi increment | Critical | Dùng transaction với update có điều kiện hoặc row lock, kiểm tra affected rows | `backend/src/modules/bookings/bookings.service.ts`, `backend/src/modules/payments/payments.service.ts` | P0 |
| 2 | Refund | Chưa có unique DB trực tiếp cho `RefundRequest.bookingId`; service chặn pending/approved nhưng DB chưa khóa trùng tuyệt đối | Critical | Thêm unique có điều kiện bằng logic transaction/lock hoặc index phù hợp theo DB strategy | `backend/prisma/schema.prisma`, `backend/src/modules/refunds/refunds.service.ts` | P0 |
| 3 | Payment | Chưa thấy idempotency key cho checkout/tạo booking; retry client có thể tạo nhiều booking nếu khác transaction code | High | Thêm idempotency key hoặc unique pending booking theo user/departure/contact trong transaction | `backend/src/modules/payments/payments.service.ts`, `backend/src/modules/bookings/bookings.service.ts` | P0 |
| 4 | Payment | Manual/SePay confirm chỉ check amount >= expected; chưa thấy reconciliation log riêng đầy đủ cho gateway payload | High | Lưu raw webhook/callback và reconciliation status | `backend/src/modules/payments/payments.service.ts`, `schema.prisma` | P1 |
| 5 | Auth | Schema có `failedLoginAttempts`, `lockedUntil` nhưng chưa thấy rate limit/lock tăng khi login sai | High | Thêm rate limit per IP/email và lock tạm thời | `backend/src/modules/auth/auth.service.ts` | P1 |
| 6 | Auth | Chưa thấy handler Prisma P2002/P2003/P2025 chung; unique DB có thể trả 500 | High | Thêm exception filter cho PrismaClientKnownRequestError | `backend/src/main.ts`, `backend/src/common/filters` | P1 |
| 7 | Account | `identityNumber` unique ở DB nhưng update profile chưa check trùng trước khi lưu | Medium | Check duplicate identityNumber trong service và trả 400/409 rõ ràng | `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/users/users.service.ts` | P1 |
| 8 | Account | Email unique phụ thuộc collation DB; chưa thấy unique case-insensitive được tài liệu hóa/ép chuẩn mọi entry point admin | Medium | Lowercase email ở mọi create/update admin/guide/auth và kiểm tra collation | `auth.service.ts`, `users.service.ts`, `guides.service.ts` | P1 |
| 9 | Tour | `basePriceAdult/basePriceChild` DTO chưa có `@Min(0)`; chưa thấy service chặn giá âm base | High | Thêm `@Min(0)` và service check adult/child base price | `backend/src/modules/tours/dto/create-tour-step1.dto.ts`, `tours.service.ts` | P1 |
| 10 | Departure | Chưa thấy unique tour + departureDate; có thể tạo lịch trùng ngày | Medium | Thêm unique/index hoặc service duplicate check | `schema.prisma`, `backend/src/modules/tours/tours.service.ts` | P2 |
| 11 | Departure | Chưa thấy chặn tạo lịch trong quá khứ ở `saveDepartures` | Medium | Chặn departureDate < today cho lịch mới; cho phép dữ liệu cũ chỉ khi update có quyền đặc biệt | `backend/src/modules/tours/tours.service.ts` | P2 |
| 12 | Departure | Chưa thấy check `totalSlots >= bookedSlots + heldSlots` khi giảm capacity trong mọi nhánh update | High | Trước khi update totalSlots, so với booked/held hiện tại | `backend/src/modules/tours/tours.service.ts` | P1 |
| 13 | Voucher | Admin CRUD dùng `dto:any`; thiếu DTO validate discount percent <= 100, quota >= 0, minOrder >= 0, date order | High | Tạo `UpsertVoucherDto`, service validate date/quota/discount | `backend/src/modules/vouchers/vouchers.controller.ts`, `vouchers.service.ts` | P1 |
| 14 | Voucher | Chưa thấy atomic increment usedCount khi dùng voucher dưới tải đồng thời | High | Increment trong cùng transaction với điều kiện `usedCount < quota` | `bookings.service.ts`, `payments.service.ts`, `vouchers.service.ts` | P1 |
| 15 | Upload | Avatar/tour image chưa thấy MIME/size validation | High | Thêm fileFilter image MIME, size limit, kiểm tra ext, random filename giữ an toàn | `auth.controller.ts`, `tours.controller.ts` | P1 |
| 16 | Upload | Chưa thấy MIME sniffing/EXIF stripping/quét file | Medium | Thêm magic-byte sniffing và xử lý metadata nếu triển khai thật | Upload controllers/services | P2 |
| 17 | Notification | `actionUrl` chưa thấy validate internal path; có nguy cơ open redirect nếu render trực tiếp | Medium | Chỉ cho path bắt đầu `/`, cấm `//`, `http://`, `https://` | `notifications.dto.ts`, `notifications.service.ts`, frontend notification components | P2 |
| 18 | Contact | Chưa thấy chặn admin reply trùng; chỉ chặn delete nếu đã có log/response | Low | Thêm cảnh báo/confirm hoặc version log cho nhiều phản hồi | `contacts.service.ts`, `frontend/pages/admin/contacts.js` | P3 |
| 19 | User deletion | Cần xác minh/chặn xóa admin cuối cùng; chưa thấy rule này | High | Đếm admin active trước khi delete/lock admin | `backend/src/modules/users/users.service.ts` | P1 |
| 20 | Guide deletion | Cần đảm bảo không hard delete guide có assignment tương lai; service có kiểm tra assignment active nhưng nên khóa bằng rule rõ hơn | High | Chuyển sang locked/inactive nếu còn assignment tương lai | `backend/src/modules/guides/guides.service.ts` | P1 |
| 21 | Review | Review auto `approved`; nếu cần moderation thật thì pending trước | Medium | Tạo cấu hình moderation hoặc auto pending khi có media/comment nhạy cảm | `backend/src/modules/reviews/reviews.service.ts` | P2 |
| 22 | Chatbot | NLU rule mới có test script nhưng chưa tích hợp test runner chính thức | Low | Thêm script `test:chatbot`/Jest hoặc e2e với DB seed | `backend/package.json`, `backend/src/scripts/test-chatbot-nlu.ts` | P3 |

## Critical

| Module | Vấn đề | Lý do |
| ------ | ------ | ----- |
| Booking | Capacity chưa được khóa atomic ở DB/update condition | Có thể đặt vượt chỗ dưới tải đồng thời |
| Refund | Chưa có unique DB trực tiếp theo booking refund | Có thể phát sinh refund trùng nếu race condition vượt qua service check |

## High Priority

| Module | Ràng buộc đề xuất | Tầng nên triển khai |
| ------ | ----------------- | ------------------- |
| Payment/Booking | Idempotency key và chống duplicate booking | DTO + Service + DB/Transaction |
| Auth | Rate limit login và lock theo failedLoginAttempts | Guard/Middleware + Service + DB |
| Prisma | Exception filter P2002/P2003/P2025 | Global filter |
| Tour/Departure | Chặn giá âm, capacity nhỏ hơn booked/held | DTO + Service + DB unsigned/check nếu có |
| Voucher | DTO validate đầy đủ và atomic quota | DTO + Service + Transaction |
| Upload | MIME/size validation cho avatar/tour image | Controller + Service |

## Chưa Xác Minh Được Trong Source Hiện Tại

- Chưa xác minh có `check constraint` MySQL cho giá không âm, date order, quota/order ngoài Prisma unsigned/default.
- Chưa xác minh có middleware rate limit HTTP.
- Chưa xác minh có exception filter Prisma toàn cục.
- Chưa xác minh toàn bộ schema của NotificationRead/UserVoucher vì tài liệu này tập trung vào constraint đã thấy qua quét schema và service.
- Chưa chạy migration hoặc truy vấn database thật; audit dựa trên source/schema/SQL trong workspace.
