# Ràng buộc nghiệp vụ đã thêm cho Travela

## 1) Booking

- Không cho tạo booking nếu lịch khởi hành đã qua ngày đặt hợp lệ.
- Không cho tạo booking nếu đợt khởi hành không ở trạng thái có thể bán (`open/full` có kiểm tra slot thực còn lại).
- Không cho booking khi tài khoản người dùng không ở trạng thái `active`.
- Không cho tạo booking trùng cho cùng một lịch khởi hành nếu đã có booking còn hiệu lực theo:
  - cùng `userId`, hoặc
  - cùng `contactEmail + contactPhone`
- Booking giữ chỗ mặc định có hạn 15 phút.
- Admin không được sửa thông tin booking khi booking đã ở trạng thái cuối (`completed/cancelled/expired`).
- Admin không được xóa cứng booking nếu:
  - booking đã `confirmed/completed`
  - booking đã đến ngày khởi hành
  - booking có payment `paid/waiting_confirmation/refunded`
- Chỉ cho chuyển trạng thái booking theo luồng hợp lệ:
  - `pending_payment -> waiting_confirmation/confirmed/cancelled/expired`
  - `waiting_confirmation -> confirmed/cancelled/expired`
  - `confirmed -> completed/cancelled`

## 2) Payment

- Không cho initiate payment nếu booking đã hết hạn hoặc không còn ở trạng thái có thể thanh toán.
- Không cho người khác thanh toán booking không thuộc quyền của họ.
- Không tạo trùng payment pending cho cùng booking và cùng phương thức; hệ thống sẽ tái sử dụng payment đang chờ nếu có.
- Có thêm API `POST /payments/checkout` để:
  - tạo booking
  - giữ chỗ tạm thời
  - tạo payment
  - trả luôn transaction code
  trong một luồng, giúp user **thanh toán ngay mà không cần bấm giữ chỗ trước**.
- Khi payment thất bại/hết hạn, hệ thống tự trả lại `heldSlots`.
- Khi payment thành công, hệ thống chuyển `heldSlots -> bookedSlots`.

## 3) Tour

- Không cho tạo/cập nhật tour nếu:
  - `durationNights >= durationDays`
  - `basePriceChild > basePriceAdult`
  - `hotelStars` ngoài khoảng 1–5
- Không cho publish tour nếu thiếu một trong các phần:
  - ảnh
  - lịch trình
  - lịch khởi hành
- Không cho ghi đè toàn bộ lịch khởi hành nếu tour đã có booking còn hiệu lực.
- Không cho lưu đợt khởi hành nếu:
  - `endDate < departureDate`
  - `childPrice > adultPrice`
- Không cho xóa cứng tour nếu:
  - còn dữ liệu `heldSlots/bookedSlots`
  - còn booking hiệu lực
  - còn payment thực tế/chờ đối soát
  - còn review/favorite/history
- Với các case trên, hệ thống khuyến nghị chuyển tour sang `inactive` thay vì xóa.

## 4) Contact

- Không cho gửi contact mới nếu tài khoản không ở trạng thái `active`.
- Chặn gửi contact trùng nội dung trong 10 phút để giảm spam.
- Không cho xóa cứng contact nếu đã có:
  - admin reply
  - repliedAt
  - email log

## 5) User

- Vẫn giữ kiểm tra trùng `email` và `phone` khi tạo/sửa.
- Có thêm ràng buộc xóa cứng user:
  - không cho xóa nếu user đã phát sinh booking/review/contact/favorite/payment
  - không cho xóa trực tiếp tài khoản admin
- Với user đã có dữ liệu nghiệp vụ, nên dùng `blocked/inactive` thay vì delete.
