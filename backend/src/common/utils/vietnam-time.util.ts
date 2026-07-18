const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Trả về Date đã được cộng UTC+7 để lưu trực tiếp vào cột MySQL DATETIME.
 *
 * Lưu ý:
 * - Chỉ dùng cho cột thời điểm hệ thống.
 * - Không dùng cho ngày sinh, ngày khởi hành hoặc ngày kết thúc tour.
 */
export function vietnamNow(): Date {
  return new Date(Date.now() + VIETNAM_OFFSET_MS);
}

/**
 * Chuyển một thời điểm bất kỳ sang giá trị UTC+7 để ghi vào DATETIME.
 */
export function toVietnamDatabaseTime(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Giá trị thời gian không hợp lệ.");
  }

  return new Date(date.getTime() + VIETNAM_OFFSET_MS);
}
