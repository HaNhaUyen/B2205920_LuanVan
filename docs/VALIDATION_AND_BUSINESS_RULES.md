# Travela - Validation And Business Rules

## Cập Nhật P0 - 2026-08-06

- Booking capacity: giữ chỗ, chuyển held sang booked và trả slot dùng `DepartureCapacityService` với SQL update có điều kiện trong transaction. Backend không còn chỉ đọc remaining rồi increment sau.
- Refund active duplicate: `RefundRequest.activeKey` khóa duy nhất refund đang active theo booking; rejected set `activeKey = null` để giữ lịch sử.
- Idempotency: `POST /bookings`, `POST /payments/checkout`, `POST /refunds` nhận header `Idempotency-Key`; cùng key/cùng payload replay response, cùng key/khác payload trả 409.
- Prisma exception filter: global filter map `P2002 -> 409`, `P2003 -> 409`, `P2025 -> 404` với message không lộ chi tiết bảng/cột nội bộ.
- Migration safety: phải chạy `npm run precheck:validation:p0` trước migration P0; script chỉ tạo report và không sửa dữ liệu.

Tài liệu này mô tả các ràng buộc dữ liệu, validation, điều kiện nghiệp vụ, ngoại lệ và lớp bảo vệ dữ liệu đang thấy trong source hiện tại. Phạm vi đã đối chiếu: `backend/src`, `backend/prisma/schema.prisma`, `backend/prisma/migrations`, `sql`, `frontend/pages`, `frontend/components`, `frontend/lib`, `ai-service/app`.

## 1. Tổng quan

Travela gồm frontend Next.js/React, backend NestJS, ORM Prisma và database MySQL theo `schema.prisma`/SQL workbench. Validation nằm ở nhiều tầng: HTML/React form ở frontend, DTO `class-validator`, service nghiệp vụ, guard phân quyền, transaction Prisma, constraint database và một số provider ngoài như Google OAuth, SePay, SMTP, AI image search.

Quy tắc ưu tiên: frontend chỉ hỗ trợ trải nghiệm; backend là lớp kiểm tra bắt buộc; database là lớp bảo vệ cuối bằng enum, unique, foreign key, default, nullable và cascade/restrict.

Nguồn nền tảng:
- Backend bootstrap: `backend/src/main.ts`, `bootstrap`, `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })`.
- Auth/role guard: `backend/src/common/guards/jwt-auth.guard.ts`, `roles.guard.ts`, `optional-jwt-auth.guard.ts`.
- Database: `backend/prisma/schema.prisma`.

## 2. Bảng Tổng Hợp Theo Module

| Module | Trường hợp | Ràng buộc hiện tại | Tầng kiểm tra | Ngoại lệ/HTTP code | File nguồn |
| ------ | ---------- | ------------------ | ------------- | ------------------ | ---------- |
| Xác thực | Đăng ký email | Bắt buộc, `@IsEmail`, trim/lowercase, không trùng email | DTO + Service + DB unique | 400 | `auth/dto/register.dto.ts`, `auth.service.ts#register`, `schema.prisma#User.email` |
| Xác thực | Đăng nhập | Cho email hoặc tên hiển thị; password tối thiểu 6 ở DTO; tài khoản bị khóa không được login | DTO + Service | 401/400 | `auth/dto/login.dto.ts`, `auth.service.ts#login` |
| Hồ sơ | User đổi email | Chỉ role user/customer được đổi; admin/guide bị khóa đổi email; email mới không trùng | DTO + Service + DB unique | 400/409 | `auth/dto/update-profile.dto.ts`, `auth.service.ts#updateMe` |
| Hồ sơ | Bank refund | Nếu nhập một trong bankName/accountNo/accountName thì phải đủ bộ; accountNo 6-50 ký tự không khoảng trắng; accountName uppercase | Service | 400 | `auth.service.ts#updateMe` |
| Tour | Tạo tour bước 1 | name bắt buộc; durationDays >= 1; durationNights >= 0 và nhỏ hơn durationDays; hotelStars 1-5; capacity >= 1 | DTO + Service + DB enum/default | 400 | `tours/dto/create-tour-step1.dto.ts`, `tours.service.ts#validateTourStep1` |
| Tour | Mã/slug | `code` và `slug` unique ở DB; service check trùng code | Service + DB unique | 400/DB error | `tours.service.ts#create/update`, `schema.prisma#Tour` |
| Tour | Publish | Không publish nếu thiếu ảnh, thiếu itinerary hoặc thiếu departure | Service | 400 | `tours.service.ts#publish` |
| Tour | Xóa tour | Không xóa cứng nếu còn booking/payment/review/favorite hoặc departure có giữ chỗ/booking; đề nghị chuyển inactive | Service + FK | 400 | `tours.service.ts#remove` |
| Departure | Lưu lịch | departureDate/endDate phải parse được; endDate >= departureDate; childPrice <= adultPrice; totalSlots > 0 | DTO + Service | 400 | `tours/dto/save-departures.dto.ts`, `tours.service.ts#saveDepartures` |
| Departure | Xóa/sửa lịch có booking | Lịch có booking/change request/trip operation không bị xóa; chuyển `closed`; nếu có booking chỉ cho sửa giá/status, không sửa ngày/totalSlots | Service + Transaction | 200 kèm warning | `tours.service.ts#saveDepartures` |
| Departure | Admin hủy lịch | Không hủy khi đã cancelled/completed/departed hoặc đã qua thời điểm khởi hành; dùng transaction; chỉ áp dụng departureId; tạo refund pending cho booking đã paid/waiting_confirmation | DTO + Service + Transaction | 400/404 | `bookings/dto/cancel-departure.dto.ts`, `bookings.service.ts#adminCancelDeparture` |
| Booking | Tạo booking | departure tồn tại, status open, chưa khởi hành, số khách > 0, còn đủ chỗ, có ít nhất 1 guest | DTO + Service + Transaction | 400/404 | `bookings/dto/create-booking.dto.ts`, `bookings.service.ts#create` |
| Booking | Tạo booking payment checkout | User login nếu dùng voucher; chống duplicate booking cùng user/departure khi còn trạng thái hoạt động; tạo payment QR bank_transfer | DTO + Service + Transaction | 400/404 | `payments/dto/checkout-payment.dto.ts`, `payments.service.ts#checkout` |
| Booking | Chuyển trạng thái admin | Chỉ cho transition theo map; completed phải từ confirmed và departure đã kết thúc; confirmed cần payment pending/waiting/paid | DTO + Service + Transaction | 400 | `bookings/dto/update-booking-status.dto.ts`, `bookings.service.ts#adminUpdateStatus` |
| Booking | User hủy booking | Chỉ hủy booking thuộc user; không hủy booking đã thanh toán/waiting/refunded; giải phóng heldSlots và expire payment pending | Service + Transaction + Ownership | 400/404 | `bookings.service.ts#cancelMyBooking` |
| Booking | Admin hủy booking riêng | Không hủy booking cancelled/completed/expired; không hủy nếu departure đã bắt đầu/cancelled/completed/departed; không tạo trùng refund pending/approved; refund 100% tính từ số tiền đã trả | DTO + Service + Transaction | 400/404 | `bookings/dto/cancel-booking-by-admin.dto.ts`, `bookings.service.ts#adminCancelBooking` |
| Voucher | Dùng voucher | User phải login; voucher active; trong thời gian hiệu lực; chưa hết quota; đơn đạt minOrder; userVoucher available | Service + DB unique userVoucher | 400 | `bookings.service.ts#resolveVoucher`, `payments.service.ts#resolveVoucher` |
| Voucher | Xóa voucher | Không xóa voucher đã used; xóa userVoucher available rồi xóa voucher | Service | 400/404 | `vouchers.service.ts#remove` |
| Payment | Checkout | Booking/departure hợp lệ; còn chỗ; duplicate booking bị chặn; payment method chỉ `bank_transfer` ở DTO | DTO + Service + Transaction | 400/403/404 | `payments/dto/checkout-payment.dto.ts`, `payments.service.ts#checkout` |
| Payment | Callback/SePay | Webhook cần secret; paid yêu cầu số tiền chuyển >= expected; callback paid/failed/expired cập nhật payment và booking trong transaction | DTO + Service + External provider | 401/400/404 | `payments/dto/sepay-webhook.dto.ts`, `payments.service.ts#handleSepayWebhook/handleCallback` |
| Refund | User tạo refund | Booking thuộc user; booking confirmed/waiting_confirmation; đã thanh toán; chưa có refund pending/approved; amount/rate do backend tính | DTO + Service | 400 | `refunds/dto/create-refund.dto.ts`, `refunds.service.ts#create` |
| Refund | Admin review | Chỉ xử lý pending; rejected cần adminNote; approved cần đủ bank info và refundAmount > 0; tạo revenue adjustment khi approved | DTO + Service + Transaction + DB unique | 400 | `refunds/dto/review-refund.dto.ts`, `refunds.service.ts#review`, `schema.prisma#revenue_adjustments` |
| Guide | Tạo/sửa HDV | fullName và phone bắt buộc; nếu tạo tài khoản cần email; email/phone/identity được check trùng qua User khi liên kết account | Service + DB unique User | 400/404 | `guides.service.ts#create/update` |
| Guide | Phân công | Kiểm tra booking hợp lệ, guide active, overlap lịch/availability; không gán trùng departure đã có guide active | Service + SQL raw | 400/404 | `guides.service.ts#assignGuide`, `#availableGuides` |
| Review | Tạo đánh giá | Rating 1-5; tối đa 5 ảnh; booking thuộc user, paid, completed/kết thúc, chưa review | DTO + Service + Upload filter | 400/404 | `reviews/dto/create-review.dto.ts`, `reviews.controller.ts`, `reviews.service.ts#create` |
| Contact | Gửi liên hệ | name/email/subject/message qua DTO; email lowercase; user login nếu có phải active; admin reply lưu log email | DTO + Service + Email | 400/404 | `contacts/dto/create-contact.dto.ts`, `contacts.service.ts#create/reply` |
| Notification | User đọc | Endpoint user dùng JWT; service lọc theo userId/targetRole/published; mark read theo user | Guard + Service + DB unique read | 400/404 | `notifications.controller.ts`, `notifications.service.ts` |
| Upload | Avatar/tour image/review image | Avatar/tour dùng random filename nhưng chưa thấy MIME/size filter; review giới hạn image/* và 8MB/tối đa 5 ảnh | Controller + Multer | 400 | `auth.controller.ts`, `tours.controller.ts`, `reviews.controller.ts` |
| Chatbot | Đặt/tìm tour | Rule NLU nhận ngày tương đối, duration, intent phụ; chặn ngày quá khứ; chỉ lấy departure open, còn chỗ, chưa khởi hành; invalid context khi đổi destination/date/duration | Service + DB | trả lời hội thoại | `chatbot-rule-nlu.service.ts`, `chatbot-temporal.service.ts`, `chatbot.service.ts#tryHandleRuleFirstTourQuery` |
| Image search | Tìm kiếm ảnh | Có ngưỡng confidence, low_confidence, giới hạn provider ngoài, không thấy upload limit riêng cho ảnh tìm kiếm trong AI service | AI service | HTTP theo FastAPI route | `ai-service/app/services/vision_search.py`, `external_vision_search.py`, `routes/ai.py` |

## 3. Xác Thực Và Tài Khoản

Nguồn: `auth/dto/register.dto.ts`, `login.dto.ts`, `change-password.dto.ts`, `update-profile.dto.ts`, `auth.service.ts`, `auth.repository.ts`, `users.service.ts`, `schema.prisma#User`.

| Rule | Hiện trạng | Tầng | Ngoại lệ |
| ---- | ---------- | ---- | -------- |
| Email đăng ký | Bắt buộc, `@IsEmail`, trim/lowercase, unique `User.email` | DTO + Service + DB | `BadRequestException` |
| Password đăng ký/login/change | `@MinLength(6)`; service cũng check `newPassword.trim().length < 6` | DTO + Service | 400/401 |
| Confirm password | Chỉ thấy frontend login/register kiểm tra `password !== confirmPassword`; backend RegisterDto không có field confirmPassword | Frontend only | Toast frontend |
| Đăng nhập bằng email | Tìm email lowercase; sai tài khoản/password trả thông báo chung | Service | `UnauthorizedException` |
| Đăng nhập bằng tên | Tìm theo fullName, so khớp bcrypt từng user; nếu nhiều user trùng cả tên và mật khẩu thì yêu cầu login bằng email | Service | 400/401 |
| Google login | Verify JWT header alg RS256, kid, issuer, audience `GOOGLE_CLIENT_ID`, email verified, exp, signature | Service + External provider | 400/401 |
| User bị khóa | `user.status !== active` không được login/local/google | Service + DB enum | 401 |
| Token bị thu hồi | `JwtAuthGuard` hash bearer token, check `revokedToken`; logout lưu hash 7 ngày | Guard + DB | 401 |
| Role endpoint | Controller dùng `JwtAuthGuard`, `RolesGuard`, `@Roles("admin")`; guide chatbot/portal dùng role guide | Guard + Controller | 403 mặc định guard |
| Admin/Guide đổi email | `updateMe` chặn role admin/guide/tour_guide/tourguide đổi email | Service | 400 |
| User đổi email | Role user/customer được đổi nếu email không trùng | DTO + Service + DB | 409 |
| Phone unique | DB `User.phone @unique`; service auth/users check trùng khi đăng ký/cập nhật | Service + DB | 400/DB |
| CCCD unique | DB `User.identityNumber @unique`; update profile không thấy service check trùng trước khi lưu | DB only | DB error nếu vi phạm |
| Rate limit login | Chưa tìm thấy triển khai rate limit/lock tăng failedLoginAttempts dù schema có `failedLoginAttempts`, `lockedUntil` | Chưa xác minh | - |

## 4. Hồ Sơ Người Dùng

Nguồn: `auth/dto/update-profile.dto.ts`, `auth.service.ts#updateMe`, `guide-portal/dto/update-guide-profile.dto.ts`, `guide-portal.service.ts#updateProfile`, `schema.prisma#User`, migration `20260806133000_refund_bank_notification_metadata`.

| Field/Rule | Hiện trạng | Tầng |
| ---------- | ---------- | ---- |
| `fullName` | Optional khi update; string 2-150; fallback giữ tên cũ nếu rỗng | DTO + Service |
| `email` | Optional, `@IsEmail`, lowercase; role admin/guide không được đổi | DTO + Service + DB |
| `phone` | Optional, max 20; service check trùng phone nếu đổi | DTO + Service + DB |
| `identityNumber` | Optional, max 30 ở user profile; guide portal regex 9 hoặc 12 chữ số | DTO + DB |
| `birthDate` | Optional string; service parse `new Date`; chưa thấy giới hạn tuổi/ngày tương lai | Service |
| `dietaryNotes`, `healthNotes` | Optional, max 2000 | DTO + DB text |
| Refund bank | `refundBankName` max 100, `refundAccountNo` max 50, `refundAccountName` 2-150, `refundQrUrl` max 500 | DTO + DB |
| Bank đủ bộ | Nếu có bankName/accountNo/accountName bất kỳ thì phải đủ cả 3 | Service |
| Account number | Bỏ toàn bộ khoảng trắng; regex `^[0-9A-Za-z_.-]{6,50}$` | Service |
| Account name | Trim và uppercase trước khi lưu | Service |
| Admin bank | Admin bị ẩn field bank trong serialize và không cập nhật bank | Service |
| Đồng bộ refund pending | Khi user có đủ bank info, update các `RefundRequest pending` thiếu bank info, set `bank_info_status` completed nếu cột tồn tại, tạo notification admin | Service + raw SQL |

## 5. Tour

Nguồn: `tours/dto/*.ts`, `tours.service.ts`, `tours.controller.ts`, `schema.prisma#Tour`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Name | `@IsString`, `@IsNotEmpty` | DTO |
| Code | Optional, DB unique; service check duplicate code trước create/update | Service + DB |
| Slug | Optional, DB unique; chưa thấy service check duplicate slug rõ ràng trong các match đã đọc | DB |
| Destination | `destinationId @IsNumber`; FK `Tour.destinationId` onDelete NoAction | DTO + DB |
| Tour type/theme/status | Enum DB `TourType`, `TourTheme`, `TourStatus`; DTO tourType string, tourTheme string | DTO một phần + DB |
| Duration | days >= 1, nights >= 0; service chặn nights >= days | DTO + Service |
| Hotel stars | 1-5 | DTO + Service |
| Price | `basePriceAdult/basePriceChild @IsNumber`; chưa thấy `@Min(0)` ở step1; service chặn child > adult, nhưng chưa thấy chặn giá âm base | DTO/Service một phần |
| Capacity | `maxCapacityDefault >= 1`; departure `totalSlots >= 1` | DTO |
| Publish | Phải có ảnh, itinerary, departure | Service |
| Delete | Không hard delete nếu có booking/payment/review/favorite hoặc departure có booking/held/booked; khuyến nghị inactive | Service + FK |
| Upload ảnh tour | `FileInterceptor/FilesInterceptor` random filename; chưa thấy MIME/size filter rõ như review | Controller |

## 6. Điểm Đến

Nguồn: `destinations/dto/upsert-destination.dto.ts`, `destinations.service.ts`, `schema.prisma#Destination`, `DestinationLandmark`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Name/province | Bắt buộc string, max 150/100 | DTO |
| Country | Optional max 100, DB default Vietnam | DTO + DB |
| Cover image | Optional max 500; chưa thấy bắt buộc | DTO |
| Status | `active/inactive` | DTO + Service |
| Unique name/province | Chưa thấy `@unique` trên Destination trong schema đoạn đọc; cần xem service nếu muốn khẳng định thêm | Chưa xác minh |
| Landmark | `@@unique([destinationId, normalizedName])`, onDelete Cascade theo destination | DB |
| Xóa khi có tour/booking | Tour FK `onDelete: NoAction` với destination; service cần chặn/xử lý, chưa xác minh chi tiết đầy đủ | DB/Service một phần |

## 7. Lịch Khởi Hành

Nguồn: `tours/dto/save-departures.dto.ts`, `tours.service.ts#saveDepartures`, `bookings.service.ts#adminDepartureSummary/#adminCancelDeparture`, `schema.prisma#TourDeparture`, migration `20260806120000_operator_cancel_departures`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| departureDate/endDate | Bắt buộc string; parse Date; endDate >= departureDate | DTO + Service |
| Giá | adultPrice/childPrice number; childPrice <= adultPrice; chưa thấy chặn âm bằng DTO | DTO + Service một phần |
| totalSlots | `@Min(1)` và service chặn <= 0 | DTO + Service |
| booked/held slots | DB default 0, unsigned; capacity tính `totalSlots - bookedSlots - heldSlots` | DB + Service |
| Status | DB enum `open/full/closed/departed/completed/cancelled`; DTO chỉ union string | DTO + DB |
| Tạo quá khứ | Chưa thấy service chặn tạo departure quá khứ trong `saveDepartures` | Chưa xác minh |
| Trùng tour + ngày đi | Chưa thấy unique constraint/logic chống trùng | Chưa xác minh |
| Xóa lịch có booking | Không xóa; chuyển `closed` nếu có booking/change request/trip operation | Service + Transaction |
| Sửa lịch có booking | Không sửa ngày/totalSlots; chỉ sửa giá/status | Service + Transaction |
| Hủy lịch | Chặn cancelled/completed/departed và thời điểm đã qua; transaction riêng; cập nhật departure cancelled và booking eligible `cancelled_by_operator`; tạo refund pending cho paid/waiting_confirmation; notification/email/log | DTO + Service + Transaction |

## 8. Booking

Nguồn: `bookings/dto/*.ts`, `bookings.service.ts`, `payments.service.ts#checkout`, `schema.prisma#Booking`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| User | Public booking dùng OptionalJwt; nếu có userId thì gắn user; `/bookings/me` và cancel mine cần JWT/ownership | Guard + Service |
| Tour/departure | Departure phải tồn tại, open, chưa khởi hành, còn chỗ; tour lấy từ departure | Service |
| Guests | `guests @ArrayMinSize(1)`; adultCount >= 1, childCount >= 0; guest fullName max 150, guestType adult/child | DTO |
| Passenger count | Service chặn `adult + child <= 0` và so với còn chỗ | Service |
| Pickup | DTO chỉ ID; service kiểm tra pickup hợp lệ/thuộc tour/departure trong luồng create/checkout/admin update | Service |
| Price | Tính từ departure adultPrice/childPrice, voucher discount backend tính | Service |
| Duplicate | Checkout service chặn cùng user + departure nếu booking còn pending/waiting/confirmed/completed | Service |
| Hold timeout | `holdExpiresAt`; cancel/expired luồng payment cập nhật expired và giải phóng slot | Service + Scheduler |
| Status transition | Map: draft -> pending_payment/cancelled; pending_payment -> waiting_confirmation/confirmed/cancelled/expired; waiting_confirmation -> confirmed/cancelled/expired; confirmed -> completed/cancelled; terminal không chuyển | Service |
| Admin delete | Không xóa booking đã paid/waiting/refunded hoặc confirmed/completed; giải phóng slot và delete nếu đủ điều kiện | Service + Transaction |
| Refund pending/approved | Admin cancel booking chặn nếu có refund pending/approved | Service |

## 9. Voucher

Nguồn: `vouchers.service.ts`, `vouchers.controller.ts`, `bookings.service.ts#resolveVoucher`, `payments.service.ts#resolveVoucher`, `schema.prisma#Voucher/UserVoucher`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Code | DB unique nếu model Voucher có `code @unique` trong schema; service uppercase code khi dùng | DB + Service |
| Status | Chỉ active dùng được; admin CRUD nhận dto any, service default active | Service |
| Time window | startDate <= today <= endDate | Service |
| Quota | Nếu quota > 0 và usedCount >= quota thì từ chối | Service |
| Discount | fixed = min(discountValue, amount); percent = amount * percent / 100, cap maxDiscount nếu có | Service |
| Min order | originalAmount >= minOrderAmount | Service |
| UserVoucher | User phải login và có userVoucher status available | Service + DB unique userId/voucherId |
| Delete | Không xóa voucher đã có userVoucher used; xóa available trước khi xóa voucher | Service |
| Missing checks | Chưa thấy chặn percent > 100, endDate < startDate, usedCount > quota ở admin service | Chưa xác minh |

## 10. Thanh Toán

Nguồn: `payments/dto/*.ts`, `payments.service.ts`, `payments.controller.ts`, `schema.prisma#Payment`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Payment thuộc booking | FK `Payment.bookingId` onDelete Cascade | DB |
| Transaction code | `internalTransactionCode @unique` | DB |
| Amount | Khi checkout, amount = booking.finalAmount; SePay paid yêu cầu transfer amount >= expected | Service |
| Method | Checkout DTO chỉ cho `bank_transfer`; DB enum còn momo/vnpay/card/cash | DTO + DB |
| Duplicate paid | Nếu payment đã paid và callback paid lại, không cập nhật lại nhưng vẫn cố gửi email xác nhận | Service |
| Failed/expired | Payment callback failed/expired cập nhật payment và booking expired/cancelled theo nhánh code | Service + Transaction |
| Manual confirm | Endpoint admin dùng Roles admin; chỉ payment waiting_confirmation được confirm | Guard + Service |
| Hold timeout | Nếu booking hết hold khi tạo QR thì cập nhật booking expired và payment pending/waiting -> expired | Service |
| Email | Gửi email hướng dẫn thanh toán và xác nhận thanh toán; lỗi email được ghi log trong status log/console tùy nhánh | Service + Email |

## 11. Hủy Và Hoàn Tiền

Nguồn: `refunds.service.ts`, `refunds/dto/*.ts`, `bookings.service.ts#adminCancelBooking/#adminCancelDeparture`, `schema.prisma#RefundRequest/revenue_adjustments`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| User refund | Booking thuộc user, status confirmed/waiting_confirmation, đã paid/waiting_confirmation, chưa pending/approved | Service |
| Refund amount | Không nhận từ frontend; tính từ paid amount/final amount theo policy | Service |
| Policy | Có logic hoàn theo thời gian thanh toán/ngày khởi hành; policy raw SQL active nếu có | Service + DB |
| Bank info | User refund yêu cầu nhập bank fields; admin/operator cancel snapshot bank từ hồ sơ user, nếu thiếu set bank_info_status missing | DTO + Service |
| Pending/approved/rejected | DB enum; review DTO chỉ approved/rejected | DTO + DB |
| Approve | Chỉ pending; approved cần bankName/accountNo/accountName; refundAmount > 0; update payment refunded; booking cancelled; trả slot; tạo revenue_adjustments | Service + Transaction |
| Double approve | Chặn status != pending; revenue_adjustments có unique theo refund_request_id | Service + DB |
| Doanh thu | Không giảm khi tạo refund; giảm khi approved bằng insert revenue_adjustments | Service + DB |
| Travela hủy | Admin cancel booking/departure tạo refund 100% nếu booking đã thanh toán; booking chưa thanh toán không tạo refund | Service + Transaction |
| Notification/email/audit | Có notification user, bookingStatusLog, userBehavior/audit-ish meta, email kết quả refund | Service |

## 12. Hướng Dẫn Viên

Nguồn: `guides.service.ts`, `guides.controller.ts`, `guide-portal.service.ts`, `guide-portal/dto/*.ts`, `schema.prisma#Guide/GuideAssignment/GuideAvailability`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Email đổi | Profile guide DTO không có email; auth updateMe chặn guide đổi email | DTO + Service |
| Full name/phone | Tạo HDV yêu cầu fullName và phone; tạo account cần email | Service |
| Unique email/phone/CCCD | Khi tạo/liên kết account check User email/phone/identity; Guide model cũng có field riêng nhưng cần DB xem unique riêng nếu muốn khẳng định | Service + DB User |
| Delete guide | Service khóa/xóa tùy trạng thái; có kiểm tra assignment active trong các match đọc | Service |
| Phân công trùng | Có query available/overlap và exclude departure đã có assignment active | Service + raw SQL |
| Guide status | Chỉ active được chọn trong available guides | Service |
| Assignment status | DTO chỉ cho assigned/accepted/in_progress/completed/cancelled/issue/rejected | DTO |
| Guide portal ownership | Guide chỉ xem/sửa assignment của mình; không có liên kết guide -> forbidden | Service |

## 13. Đánh Giá

Nguồn: `reviews/dto/create-review.dto.ts`, `reviews.controller.ts`, `reviews.service.ts`, `schema.prisma#Review/ReviewMedia`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Login | Tạo review và eligible bookings cần JWT | Guard |
| Rating | 1-5 ở DTO và service | DTO + Service |
| Booking completed | Booking phải paid và completed hoặc đã kết thúc theo endDate | Service |
| Ownership | Booking phải thuộc user hiện tại | Service |
| Một booking review | Check existing review theo bookingId; từ chối nếu đã review | Service |
| Moderation | Review tạo status approved; admin update status/reply | Service |
| Upload | Tối đa 5 ảnh, fileSize 8MB, MIME bắt đầu `image/`, random filename; xóa ảnh cũ có path traversal guard `startsWith(uploadsRoot)` | Controller + Service |

## 14. Liên Hệ

Nguồn: `contacts/dto/*.ts`, `contacts.service.ts`, `contacts.controller.ts`, `schema.prisma#Contact/ContactEmailLog`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Field bắt buộc | create: name, email, subject, message string; email `@IsEmail`; phone optional | DTO |
| User active | Nếu contact gắn userId thì user phải tồn tại và active | Service |
| Admin reply | Reply content bắt buộc; gửi email nếu requested; lưu `ContactEmailLog` với sent/failed/error | Service + Email |
| Delete | Không hard delete contact đã có response hoặc emailLogs | Service |
| Chống trả lời trùng | Chưa thấy chặn reply nhiều lần; delete mới kiểm tra đã có log/response | Chưa xác minh |

## 15. Thông Báo

Nguồn: `notifications/dto/upsert-notification.dto.ts`, `notifications.controller.ts`, `notifications.service.ts`, `schema.prisma#Notification/NotificationRead`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| User đọc notification | Endpoint cần JWT; lọc notification published theo user/role/targetRole; read theo userId | Guard + Service |
| Mark read | Tạo/upsert read record; DB có unique theo notification/user nếu schema model khai báo | Service + DB |
| Admin CRUD | Admin endpoints dùng Roles admin; DTO title/content/targetRole/actionUrl/metadata optional tùy dto | DTO + Guard |
| Action URL | Chưa thấy validation internal path/open redirect | Chưa xác minh |
| Chống trùng retry | Chưa thấy idempotency key/deduplication cho notification thường | Chưa xác minh |
| Bulk email | Admin notifications page và service gửi email/notification hàng loạt theo booking/account; lưu counts/email errors | Frontend + Service |

## 16. Upload File Và Hình Ảnh

Nguồn: `auth.controller.ts`, `tours.controller.ts`, `reviews.controller.ts`, `reviews.service.ts`, `ai-service/app/routes/ai.py`, `ai-service/app/services/vision_search.py`.

| Loại | Rule hiện tại | Tầng |
| ---- | ------------- | ---- |
| Avatar | `FileInterceptor("file")`, lưu `uploads/avatars`, random filename dùng ext gốc; chưa thấy fileFilter/size | Controller |
| Tour image | Lưu upload tour bằng random filename; yêu cầu ít nhất một ảnh khi upload images; chưa thấy MIME/size trong match đã đọc | Controller + Service |
| Review image | `FilesInterceptor("images", 5)`, `fileSize: 8MB`, MIME `image/*`; service cũng chặn quá 5 | Controller + Service |
| Path traversal | Review delete chỉ xóa nếu path normalized nằm trong uploadsRoot | Service |
| Resize/EXIF scan | Chưa tìm thấy | Chưa xác minh |
| Image search | AI service dùng confidence/low_confidence và external provider threshold; chưa thấy giới hạn file upload riêng trong route đã quét | AI service |

## 17. Chatbot

Nguồn: `chatbot/dto/chat-message.dto.ts`, `chatbot.service.ts`, `chatbot-nlu.service.ts`, `chatbot-confidence.service.ts`, `chatbot-rule-nlu.service.ts`, `chatbot-temporal.service.ts`, `rag.service.ts`, `location-resolver.service.ts`.

| Rule | Hiện trạng | Tầng |
| ---- | ---------- | ---- |
| Intent | NLU rule + LLM fallback; confidence service quyết định shouldAnswer; unsupported destination trả lời không bịa tour | Service |
| Slot | Rule NLU tách date/duration/guest; booking flow yêu cầu tour, departure, pickup nếu có, số khách, contact, passenger, voucher/payment | Service |
| Tour thật DB | Tìm tour/departure từ Prisma; không tự tạo voucher/tour khi không có dữ liệu | Service + DB |
| Hallucination guard | Prompt yêu cầu chỉ dùng dữ liệu ctx; confidence fallback khi thiếu dữ liệu; voucher phần trăm ảo bị chặn | Service |
| Invalid context | Khi đổi destination/date/duration, clear lastTour/lastDeparture/bookingDraft tourId/departureId | Service |
| Ngày quá khứ | Temporal parser set isPast; direct handler không tự đổi sang ngày khác | Service |
| Departure | Chỉ bookable nếu status open, departureDate > now, deadline nếu có chưa qua, availableSlots > 0 | Service |
| Login booking | Booking flow yêu cầu login trước khi tạo booking/checkout | Service |
| Voucher/payment | Voucher code chỉ nhận khi có tín hiệu rõ; payment method bank_transfer | Service |

## 18. Phân Quyền

| Endpoint/Chức năng | User | Guide | Admin | Ghi chú |
| ------------------ | ---: | ----: | ----: | ------- |
| `POST /auth/register`, `/auth/login`, `/auth/google` | Có | Có thể login | Có thể login | Public |
| `GET/PATCH /auth/me`, logout, đổi password/avatar | Có | Có | Có | JWT; email admin/guide bị khóa đổi trong service |
| `GET /vouchers/me` | Có | Có JWT nhưng service chỉ assign role user | Có JWT | User voucher theo userId |
| Admin voucher CRUD | Không | Không | Có | `@Roles("admin")` |
| `POST /bookings` | Có/guest optional | Có thể nếu token | Có thể nếu token | OptionalJwt; voucher cần login |
| `GET /bookings/me`, user cancel | Có | Có theo userId nếu có booking | Có theo userId | JWT + ownership |
| Admin bookings/departures/cancel/reports | Không | Không | Có | `@Roles("admin")` |
| Payment checkout/status user | Có | Theo quyền booking/email | Có nếu endpoint admin/manual | Service ownership; admin manual confirm |
| Refund create/list mine | Có | Có theo userId | Có theo userId | JWT + booking ownership |
| Admin refund review/list | Không | Không | Có | `@Roles("admin")` |
| Admin users/guides/tours/destinations/contacts/reviews/notifications | Không | Không | Có | `@Roles("admin")` |
| Guide portal | Không | Có | Không/không phải luồng chính | role guide + ownership guide |
| Public tours/destinations/reviews/contact | Có | Có | Có | Một số endpoint public/optional auth |
| Chatbot user | Có/guest | Guide được route sang guide chatbot | Admin có admin tools nếu role admin | Guard tùy controller/chat scope |

## 19. Trạng Thái Và Chuyển Trạng Thái

| Entity | Từ trạng thái | Sang trạng thái | Điều kiện | File |
| ------ | ------------- | --------------- | --------- | ---- |
| Booking | draft | pending_payment/cancelled | Theo `allowed` map admin update | `bookings.service.ts#validateBookingTransition` |
| Booking | pending_payment | waiting_confirmation/confirmed/cancelled/expired | Payment/timeout/admin status | `bookings.service.ts`, `payments.service.ts` |
| Booking | waiting_confirmation | confirmed/cancelled/expired | Admin/payment callback | `bookings.service.ts`, `payments.service.ts` |
| Booking | confirmed | completed/cancelled | Completed cần qua endDate; cancel theo nghiệp vụ | `bookings.service.ts` |
| Booking | any eligible | cancelled_by_operator | Admin cancel booking/departure | `bookings.service.ts#adminCancelBooking/#adminCancelDeparture` |
| Payment | pending | waiting_confirmation | Khách gửi giao dịch/manual flow | `payments.service.ts` |
| Payment | pending/waiting_confirmation | paid | Callback/SePay/manual confirm hợp lệ | `payments.service.ts` |
| Payment | pending/waiting_confirmation | failed/expired | Callback failed/expired hoặc hold timeout | `payments.service.ts` |
| Payment | paid/waiting_confirmation | refunded | Refund approved | `refunds.service.ts#review` |
| Refund | pending | approved | Admin duyệt, đủ bank info, refundAmount > 0 | `refunds.service.ts#review` |
| Refund | pending | rejected | AdminNote bắt buộc | `refunds.service.ts#review` |
| Tour | draft | published | Có media, itinerary, departures | `tours.service.ts#publish` |
| Tour | published/draft | inactive | Admin update status; xóa bị chặn khuyến nghị inactive | `tours.service.ts` |
| TourDeparture | open/full/closed | cancelled | Admin cancel departure | `bookings.service.ts#adminCancelDeparture` |
| TourDeparture | existing with booking | closed | Save departures xóa mềm lịch có booking/link | `tours.service.ts#saveDepartures` |
| Review | pending/approved/rejected/hidden | dto.status | Admin update | `reviews.service.ts#adminUpdate` |
| Contact | new | resolved hoặc status dto | Admin reply | `contacts.service.ts#reply` |
| NotificationRead | unread | read | User mark read | `notifications.service.ts` |

## 20. Ngoại Lệ Hệ Thống

| Exception | Khi nào xảy ra | HTTP status | Message hiện tại | File |
| --------- | -------------- | ----------: | ---------------- | ---- |
| `UnauthorizedException` | Login thiếu identifier/password, sai credentials, tài khoản bị khóa, Google invalid, revoked token | 401 | Nhiều message tiếng Việt/English | `auth.service.ts`, `jwt-auth.guard.ts` |
| `BadRequestException` | DTO qua ValidationPipe hoặc service rule sai: duplicate phone/email, invalid transition, thiếu bank, không đủ chỗ, voucher invalid | 400 | Theo từng service | Nhiều module |
| `ConflictException` | User đổi email trùng account khác | 409 | `Email này đã được sử dụng...` | `auth.service.ts#updateMe` |
| `NotFoundException` | Không tìm thấy user/tour/booking/departure/payment/refund/contact/review | 404 | Theo module | Nhiều module |
| `ForbiddenException` | Booking/payment/guide ownership không đúng; guide không có quyền truy cập | 403 | Theo module | `payments.service.ts`, `guide-portal.service.ts`, `operational-expansion.service.ts` |
| Prisma unique error | Không thấy handler P2002 chung; DB unique vẫn có thể ném lỗi Prisma nếu service không check trước | 500 nếu không bắt | Chưa có message chuẩn | Chưa thấy |
| Foreign key error | FK database bảo vệ onDelete NoAction/Cascade; chưa thấy handler P2003 chung | 500 nếu không bắt | Chưa có message chuẩn | Chưa thấy |
| Transaction rollback | Các `$transaction` rollback khi throw exception trong booking/payment/refund/tour save | Theo exception gốc | Theo exception gốc | `bookings.service.ts`, `payments.service.ts`, `refunds.service.ts`, `tours.service.ts` |
| File validation error | Review MIME không phải image hoặc quá size | 400 | `Chỉ được tải file ảnh.` | `reviews.controller.ts` |
| Payment error | SePay secret sai, amount thiếu, payment not waiting confirmation | 400/401/404 | Theo payment service | `payments.service.ts` |
| Refund error | Refund đã xử lý, thiếu bank, refundAmount không hợp lệ | 400 | Theo refund service | `refunds.service.ts` |

## 21. Database Constraints Đáng Chú Ý

Nguồn: `backend/prisma/schema.prisma`.

| Nhóm | Constraint |
| ---- | ---------- |
| User | `email`, `phone`, `identityNumber`, `googleId` unique; role/status/tier enum; nhiều field nullable; `memberPoints` unsigned default 0 |
| Session/token | `RevokedToken.tokenHash` unique; `UserSession.sessionId`, `refreshTokenHash` unique |
| Tour | `code`, `slug` unique; destination FK NoAction; media/itinerary/departure/pickup cascade theo tour |
| Itinerary | `@@unique([tourId, dayNumber, itemOrder])` |
| DestinationLandmark | `@@unique([destinationId, normalizedName])`, cascade theo destination |
| Booking | `bookingCode` unique; FK tour/departure NoAction, voucher/pickup/user NoAction; status enum |
| Payment | `internalTransactionCode` unique; FK booking cascade |
| Review | ReviewStatus enum; ReviewMedia cascade theo review |
| Refund | RefundStatus enum; FK booking cascade; bank fields nullable |
| Revenue adjustment | `refund_request_id @unique`; FK booking/refund cascade |
| Guide/operation | TripOperation `departureId @unique`; nhiều index cho guide/status/departure |
| Notification/contact | Có index/unique theo model; cần xem từng model khi thay đổi nghiệp vụ |

## 22. Cảnh Báo Rule Chỉ Có Ở Frontend Hoặc Chưa Xác Minh

| Module | Cảnh báo |
| ------ | -------- |
| Register | Confirm password chỉ thấy frontend kiểm tra; backend không có confirmPassword DTO |
| Tour price | `basePriceAdult/basePriceChild` chưa thấy `@Min(0)` trong DTO step1 |
| Departure | Chưa thấy chặn tạo lịch trong quá khứ hoặc unique tour+departureDate |
| Voucher | Admin CRUD dùng `dto:any`; chưa thấy DTO validate percent <= 100, date order, quota >= usedCount |
| Upload avatar/tour | Chưa thấy MIME/size filter như review |
| Prisma errors | Chưa thấy exception filter/handler chung cho P2002/P2003/P2025 |
| Login security | Schema có failedLoginAttempts/lockedUntil nhưng chưa thấy logic tăng/chặn theo số lần sai |
| Notification URL | Chưa thấy validation actionUrl là internal path |
