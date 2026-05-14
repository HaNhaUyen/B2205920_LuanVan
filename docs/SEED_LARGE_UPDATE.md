# Large Seed Update

File `sql/00_complete_database_workbench.sql` đã được mở rộng để demo hệ thống đầy đủ hơn trên MySQL Workbench.

## Cách chạy

Mở MySQL Workbench và chạy toàn bộ file:

```sql
sql/00_complete_database_workbench.sql
```

Không cần chạy:

```bash
npx prisma migrate dev
npx prisma db seed
```

Backend vẫn dùng Prisma Client nên sau khi cài package vẫn chạy:

```bash
cd backend
npm install
npx prisma generate
npm run start:dev
```

## Tài khoản demo

- Admin: `admin@travela.vn`
- User seed: `user006@travela.vn` đến `user085@travela.vn`
- Password demo cho các tài khoản seed: `123456`

## Dữ liệu đã tăng thêm

Sau khi chạy SQL, hệ thống có dữ liệu dày hơn cho:

- User/member nhiều hạng: bronze, silver, gold, diamond
- Điểm đến du lịch Việt Nam
- Tour, hình ảnh tour, lịch trình theo ngày
- Lịch khởi hành nhiều tháng
- Booking nhiều trạng thái: confirmed, completed, pending_payment, waiting_confirmation, cancelled
- Payment nhiều phương thức: momo, vnpay, bank_transfer, card
- Hướng dẫn viên và lịch phân công
- Voucher theo từng cấp thành viên
- Yêu cầu hoàn tiền
- Review, tour yêu thích
- Hành vi người dùng cho AI recommendation: view, favorite, booking, review, ask_ai, image_search, voice_search
- Contact/FAQ/Notification/Chat demo

Cuối file SQL có câu SELECT kiểm tra nhanh số lượng dữ liệu sau khi seed.
