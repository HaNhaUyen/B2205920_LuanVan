# Travela full requirements patch

Bản này giữ Prisma Client để backend query database, nhưng database và seed vẫn chạy trực tiếp bằng MySQL Workbench qua `sql/00_complete_database_workbench.sql`.

## Đã vá thêm

1. Profile user nhiều tab:
   - Thông tin cá nhân
   - Tour yêu thích
   - Tour đã đặt
   - Yêu cầu hoàn tiền
   - Voucher của tôi
   - Bảo mật

2. Admin dashboard nhiều tab:
   - Tổng quan
   - Tour đã đặt gần đây
   - Người dùng mới và top người dùng điểm/chi tiêu cao
   - Popup chọn loại báo cáo muốn xuất Excel

3. Quản lý hướng dẫn viên:
   - Thêm HDV
   - Lịch tháng tô đậm ngày HDV đang dẫn đoàn
   - Chỉ định/đổi HDV theo booking
   - Chỉ hiển thị HDV rảnh theo ngày khởi hành/kết thúc
   - Gửi email thông báo cho khách khi gán/đổi HDV nếu SMTP đúng

4. Refund UI:
   - User gửi lý do hoàn tiền trong profile
   - Admin duyệt/từ chối trong `/admin/refunds`
   - Nếu duyệt: booking bị hủy, payment chuyển refunded, slot tour được trả lại
   - Nếu từ chối: bắt buộc nhập lý do gửi khách

5. Image search end-to-end:
   - Frontend search bar cho kéo/thả ảnh hoặc chọn ảnh
   - Gọi AI service `/image-search-upload`
   - Nếu chưa cài CLIP/torch hoặc model không tải được, hệ thống dùng fallback theo tên ảnh và phân tích ảnh cơ bản để vẫn chạy demo

## Cách chạy database bằng Workbench

Mở MySQL Workbench và chạy:

```sql
sql/00_complete_database_workbench.sql
```

Không cần chạy:

```bash
npx prisma migrate dev
npx prisma db seed
```

Nhưng vẫn cần tạo Prisma Client cho backend:

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

## Chạy frontend

```bash
cd frontend
npm install
npm run dev -- -H 0.0.0.0
```

## Chạy AI service để image search hoạt động

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

Nếu máy yếu hoặc không muốn tải model CLIP, vẫn có thể demo fallback. Khi kéo ảnh tên `phu-quoc.jpg`, `da-nang.png`, `can-tho.jpg`, hệ thống vẫn gợi ý đúng điểm đến dựa vào fallback.

## Biến môi trường cần kiểm tra

Backend `.env`:

```env
DATABASE_URL="mysql://root:MAT_KHAU@localhost:3306/travela_full_mvc"
JWT_SECRET="your-secret"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="Travela <your-email@gmail.com>"
```

Frontend `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_AI_API_URL=http://localhost:8001
```
