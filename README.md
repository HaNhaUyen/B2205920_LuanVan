# Travela / TourAI Việt - bản đã tinh gọn, không dùng Docker

Bản này đã được chỉnh lại theo hướng giao diện sáng, ít rối hơn và bám sát travel site demo hơn, đồng thời cải thiện rõ phần tìm kiếm bằng **ảnh** và **giọng nói**.

## Đã chỉnh gì trong bản này

- Bỏ Dockerfile, docker-compose, dist, .next, frontend static cũ.
- Giao diện public đổi sang style sáng, nav pill, card tour rõ ràng hơn.
- Trang `/tours` có thanh tìm kiếm AI lớn:
  - nhập chữ bình thường
  - kéo thả ảnh trực tiếp vào thanh tìm kiếm
  - bấm mic để nói nhu cầu bằng tiếng Việt
  - hiển thị trạng thái AI service, top match, độ tin cậy
- Tab chat AI riêng tại `/assistant`, kiểu hộp chat tách biệt.
- Admin quản lý tour có:
  - xem / sửa / xóa
  - wizard 3 bước: thông tin → hình ảnh → lịch trình theo ngày
- AI vision đã được nâng theo hướng thực tế hơn:
  - CLIP prompt retrieval
  - nhiều prompt hơn cho mỗi destination
  - gom điểm theo destination tốt hơn
  - dùng multi-view image embedding
  - có alias boost theo tên file nếu filename gợi ý địa danh
- AI voice parser đã cải thiện:
  - hiểu điểm đến
  - hiểu số ngày
  - hiểu ngân sách kiểu “6 triệu”, “6 củ”
  - hiểu số người và một phần chủ đề chuyến đi

## Cấu trúc còn lại

- `frontend/` Next.js
- `backend/` NestJS + Prisma
- `ai-service/` FastAPI + CLIP vision search

## Chạy local trên Windows

### 1) MySQL

Trong Workbench, cách dễ nhất là chạy file này:

```sql
backend/sql/setup_full_tour_booking_ai_db.sql
```

Đây là bản all-in-one: tạo DB, tạo bảng, seed dữ liệu.

### 2) Backend

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

Backend chạy tại:

```bash
http://localhost:3001/api
```

### 3) AI service

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

AI service chạy tại:

```bash
http://localhost:8001
```

Lần chạy đầu tiên, model CLIP sẽ tải weight về máy nên có thể chậm hơn.

Có thể cấu hình thêm:

```bash
set VISION_MODEL_NAME=openai/clip-vit-base-patch32
set VISION_DEVICE=auto
```

### 4) Frontend

```bash
cd frontend
npm install
npm run dev -- -H 0.0.0.0
```

Frontend chạy tại:

```bash
http://localhost:3000
```

### 5) redis

//docker run -d --name travela-redis -p 6379:6379 redis:7

```bash
docker start travela-redis
docker stop travela-redis
```

## Email template thương mại

Bản này đã nâng giao diện email theo hướng giống web tour thật hơn:

- header thương hiệu lớn hơn
- hỗ trợ logo qua biến `EMAIL_LOGO_URL`
- badge trạng thái thanh toán theo màu
- mail đầu là **phiếu thanh toán điện tử** kèm QR + mã giao dịch
- mail sau là **vé / phiếu xác nhận dịch vụ** sau khi thanh toán thành công

Cấu hình thêm trong `backend/.env`:

```env
EMAIL_BRAND_NAME="Travela"
EMAIL_LOGO_URL="https://your-domain.com/logo.png"
```

Nếu chưa có logo công khai, hệ thống sẽ tự hiển thị logo chữ cái mặc định.

## Route chính

- `/` Trang chủ
- `/tours` Danh sách tour + AI search bằng chữ / ảnh / giọng nói
- `/tour/[slug]` Chi tiết tour
- `/assistant` Tab chat AI riêng
- `/dashboard` Khu vực user
- `/admin` Trang quản trị
- `/vision-status` API trạng thái model vision

## Lưu ý về giọng nói

- Mic dùng Web Speech API của trình duyệt.
- Nên chạy trên **Chrome** và mở bằng **localhost**.
- Nếu trình duyệt không hỗ trợ, hệ thống vẫn cho nhập mô tả bằng chữ để AI parse nhu cầu.

## Lưu ý thực tế

- Vision hiện là **zero-shot retrieval bằng CLIP**, phù hợp demo luận văn và đồ án.
- Nó thuyết phục hơn bản cũ chỉ đoán theo tên file, nhưng vẫn chưa phải mô hình train riêng landmark Việt Nam.
- Nếu muốn mạnh hơn nữa, bước sau có thể nâng thêm:
  - OCR text trong ảnh
  - fine-tune riêng ảnh địa danh Việt Nam
  - nối catalog ảnh thật của từng destination

## Phản hồi liên hệ qua Gmail

Tính năng mới:

- Khách gửi form liên hệ ở trang chủ sẽ vào thẳng mục **Liên hệ** trong `/admin`.
- Admin có thể mở từng liên hệ, nhập nội dung phản hồi và bấm gửi email thẳng tới Gmail của khách.

Cấu hình trong `backend/.env`:

```bash
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your_gmail@gmail.com"
SMTP_PASS="your_gmail_app_password"
SMTP_FROM="Travela <your_gmail@gmail.com>"
FRONTEND_URL="http://localhost:3000"
```

Nếu bạn đã tạo database bằng bản cũ, chạy thêm file sau trong Workbench trước khi start backend:

```sql
backend/sql/patch_contact_reply_email.sql
```

Gợi ý với Gmail:

- dùng Gmail thật
- bật xác thực 2 bước
- tạo **App Password**
- dán App Password vào `SMTP_PASS`

## Lưu ý cấu hình MySQL

Nếu mật khẩu MySQL có ký tự đặc biệt như `@`, bạn cần mã hóa trong `DATABASE_URL`.
Ví dụ: `mysql://root:Hanhauyen%4051@localhost:3306/tour_booking_ai_db`

## Google Sign-In

- Khởi động lại frontend sau khi đổi `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
- Khởi động lại backend sau khi đổi `GOOGLE_CLIENT_ID`.
- Trong Google Cloud Console, thêm đúng origin đang chạy frontend, ví dụ `http://localhost:3000`.

## Bản vá mới nhất trong gói này

### 1) Thanh toán gần luồng thật hơn

- Khi user bấm **Thanh toán ngay**, hệ thống không chỉ tạo booking + payment session mà còn gửi luôn **email đầu tiên** cho khách.
- Email đầu tiên chứa:
  - mã đơn hàng
  - mã giao dịch
  - thông tin tour
  - thời gian giữ chỗ
  - nút mở lại trang thanh toán
  - mã QR để khách mở lại thông tin thanh toán trên thiết bị khác
- Khi callback thanh toán trả về `paid` hoặc admin manual confirm chuyển khoản thành công, hệ thống gửi tiếp **email thứ hai** xác nhận thanh toán thành công.
- Nếu SMTP chưa cấu hình đúng, flow booking/payment vẫn chạy, nhưng email sẽ không gửi được.

- Thêm luồng **thanh toán ngay** ngay tại form đặt tour.
- Người dùng không cần bấm “Giữ chỗ” trước rồi mới vào payment nữa.
- Khi bấm **Thanh toán ngay**, hệ thống sẽ tự:
  - tạo booking
  - giữ chỗ tạm thời trong thời gian ngắn
  - tạo payment session
  - mở popup thanh toán luôn
- Nếu muốn, người dùng vẫn có thể chọn **Giữ chỗ trước** như cũ.

Lưu ý: về nghiệp vụ thật, hệ thống thanh toán online vẫn luôn cần một khoảng giữ chỗ ngắn ở backend để tránh oversell. Điểm mới ở bản này là **user không còn phải thao tác giữ chỗ thủ công** nữa.

### 2) Ràng buộc nghiệp vụ sâu hơn

Tôi đã thêm các ràng buộc thực tế hơn cho:

- booking
- payment
- tour
- contact
- user

Xem chi tiết tại:

- `docs/BUSINESS_RULES.md`

### 3) Hướng làm AI nhận diện ảnh đúng hơn

Tôi đã ghi rõ bản chất vấn đề và roadmap nâng độ chính xác ở đây:

- `docs/AI_IMAGE_RECOGNITION_GUIDE.md`

Nói ngắn gọn:

- frontend không phải nút thắt cổ chai chính
- cần dataset landmark thật
- cần fine-tune model theo dữ liệu của hệ thống
- cần top-k re-rank + ngưỡng từ chối đoán sai

## Các ràng buộc chính đã làm

### Booking

- chặn booking trùng cùng lịch khởi hành theo `userId` hoặc `contactEmail + contactPhone`
- chặn booking khi lịch đã qua ngày hợp lệ
- chặn booking nếu tài khoản không `active`
- booking giữ chỗ mặc định 15 phút
- chặn admin xóa booking đã có payment quan trọng hoặc đã confirmed/completed

### Payment

- chặn initiate payment nếu booking không còn hợp lệ
- tái sử dụng payment đang chờ thay vì tạo trùng
- thêm API checkout một bước để user thanh toán ngay
- khi fail/expire sẽ trả lại chỗ giữ
- khi paid sẽ chuyển từ `heldSlots` sang `bookedSlots`

### Tour

- chặn publish nếu thiếu ảnh / lịch trình / lịch khởi hành
- chặn giá trẻ em lớn hơn giá người lớn
- chặn số đêm >= số ngày
- chặn ghi đè departure nếu đã có booking còn hiệu lực
- chặn xóa cứng tour khi đã có dữ liệu nghiệp vụ thật

### Contact

- chặn spam contact trùng nội dung trong 10 phút
- chặn xóa cứng contact đã có reply hoặc email log

### User

- thêm ràng buộc không cho xóa cứng user nếu đã có booking/review/contact/favorite/payment
- khuyến nghị chuyển `inactive/blocked` thay vì delete

## Endpoint mới

### Direct checkout

```bash
POST /payments/checkout
```

Body mẫu:

```json
{
  "departureId": 1,
  "adultCount": 2,
  "childCount": 1,
  "contactName": "Nguyen Van A",
  "contactEmail": "a@gmail.com",
  "contactPhone": "0900000000",
  "note": "Phong view bien",
  "paymentMethod": "momo"
}
```

API này dùng cho nút **Thanh toán ngay**.

====
nhớ đổi port theo ipconfig
