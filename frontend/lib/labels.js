export const LABELS = {
  theme: {
    beach: 'Biển',
    mountain: 'Núi',
    city: 'Thành phố',
    culture: 'Văn hóa',
    family: 'Gia đình',
    luxury: 'Cao cấp',
    adventure: 'Khám phá',
    eco: 'Sinh thái',
    other: 'Khác',
  },
  type: { group: 'Tour đoàn', private: 'Tour riêng' },
  bookingStatus: {
    pending_payment: 'Chờ thanh toán',
    waiting_confirmation: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    completed: 'Hoàn tất',
    cancelled: 'Đã hủy',
    expired: 'Hết hạn',
    refunded: 'Đã hoàn tiền',
  },
  paymentStatus: {
    pending: 'Chờ thanh toán',
    waiting_confirmation: 'Chờ xác nhận',
    paid: 'Đã thanh toán',
    failed: 'Thất bại',
    expired: 'Hết hạn',
    refunded: 'Đã hoàn tiền',
  },
  paymentMethod: {
    momo: 'Ví MoMo',
    vnpay: 'VNPay',
    bank_transfer: 'Chuyển khoản',
    card: 'Thẻ quốc tế / nội địa',
    cash: 'Tiền mặt',
  },
  faqTopic: {
    general: 'Chung',
    booking: 'Đặt tour',
    payment: 'Thanh toán',
    policy: 'Chính sách',
    support: 'Hỗ trợ',
  },
  contactStatus: { new: 'Mới', processing: 'Đang xử lý', replied: 'Đã phản hồi', resolved: 'Đã xử lý' },
  reviewStatus: { pending: 'Chờ duyệt', approved: 'Đã duyệt', hidden: 'Ẩn', rejected: 'Từ chối' },
  tourStatus: { draft: 'Nháp', published: 'Đang bán', inactive: 'Ngừng bán', archived: 'Lưu trữ' },
  role: { admin: 'Quản trị viên', user: 'Người dùng' },
  memberTier: { bronze: 'Đồng', silver: 'Bạc', gold: 'Vàng', diamond: 'Kim cương' },
  refundStatus: { pending: 'Chờ xử lý', approved: 'Đã duyệt', rejected: 'Từ chối' },
};

export function mapLabel(kind, value) {
  if (value === null || value === undefined || value === '') return '--';
  return LABELS[kind]?.[value] || value;
}
