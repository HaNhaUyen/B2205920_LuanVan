# Patch Admin + AI + Membership

Đã chỉnh trong bản này:

## Admin
- `frontend/pages/admin.js`: đóng form thêm tour sẽ hỏi hủy bản nháp và gọi `DELETE /admin/tours/:id`, bỏ nút xem chi tiết ở card tour, dashboard chia tab nhỏ và hiển thị người dùng mới gần đây.
- `frontend/lib/labels.js`: thêm label hạng thành viên, hoàn tiền, payment refunded.
- `frontend/pages/admin/vouchers.js`: thêm/sửa/xóa/xem chi tiết voucher; mã voucher có thể để trống để backend tự sinh theo tên chương trình.

## Backend nghiệp vụ
- `backend/src/modules/vouchers/*`: thêm phân trang/filter, detail, tự sinh mã voucher, xóa an toàn.
- `backend/src/modules/refunds/*`: thêm phân trang/filter backend; duyệt hoàn tiền vẫn trả slot về `bookedSlots`.
- `backend/src/modules/payments/payments.service.ts`: sau thanh toán thành công, cộng điểm thành viên, tự tính hạng và tự gán voucher theo hạng nếu còn quota.
- `backend/src/modules/admin-dashboard/admin-dashboard.service.ts`: thêm chart người dùng theo hạng.

## AI
- `ai-service/app/data/destination_catalog.py`: thêm Cần Thơ, Huế, Ninh Bình cho tìm kiếm bằng hình ảnh.
- `backend/src/modules/chatbot/chatbot.service.ts`: thêm alias Cần Thơ, Huế, Ninh Bình cho chatbot.

## SQL
Không bắt buộc đổi cấu trúc SQL vì các bảng `users.member_points`, `users.member_tier`, `vouchers`, `user_vouchers`, `refund_requests`, `tour_departures.booked_slots/held_slots` đã có sẵn.

Rule điểm thành viên đang dùng:
- 1 điểm / 10.000đ thanh toán thành công.
- Bronze: 0–999 điểm.
- Silver: 1.000–4.999 điểm.
- Gold: 5.000–14.999 điểm.
- Diamond: từ 15.000 điểm.

Lưu ý: để chatbot không phải sửa code khi thêm điểm đến mới, hướng tốt hơn là thêm bảng `destination_aliases` và cho chatbot đọc alias từ DB. Bản patch này đã mở rộng alias thường gặp trước.
