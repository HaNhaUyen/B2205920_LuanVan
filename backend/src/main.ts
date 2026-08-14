import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { ValidationError } from "class-validator";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";

import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/filters/prisma-exception.filter";
import { BigIntInterceptor } from "./common/interceptors/bigint.interceptor";
import { PrismaService } from "./prisma/prisma.service";

/*
 * Bảo đảm các phép tính ngày giờ chạy theo múi giờ Việt Nam.
 * Nên đặt trước khi NestJS khởi tạo AppModule.
 */
process.env.TZ = process.env.TZ || "Asia/Ho_Chi_Minh";

function getCorsOrigins(): string[] {
  return (process.env.CORS_ORIGIN || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const validationFieldLabels: Record<string, string> = {
  identifier: "Email hoặc tên tài khoản",
  email: "Email",
  password: "Mật khẩu",
  currentPassword: "Mật khẩu hiện tại",
  newPassword: "Mật khẩu mới",
  fullName: "Họ và tên",
  phone: "Số điện thoại",
  identityNumber: "CCCD",
  birthDate: "Ngày sinh",
  dateOfBirth: "Ngày sinh",
  gender: "Giới tính",
  contactName: "Họ tên người liên hệ",
  contactEmail: "Email liên hệ",
  contactPhone: "Số điện thoại liên hệ",
  subject: "Chủ đề",
  message: "Nội dung",
  replyMessage: "Nội dung phản hồi",
  adminReply: "Phản hồi của quản trị viên",
  adminNote: "Ghi chú của quản trị viên",
  reviewNote: "Ghi chú duyệt",
  title: "Tiêu đề",
  content: "Nội dung",
  name: "Tên",
  code: "Mã",
  slug: "Đường dẫn",
  province: "Tỉnh/Thành phố",
  country: "Quốc gia",
  address: "Địa chỉ",
  description: "Mô tả",
  shortDescription: "Mô tả ngắn",
  fullDescription: "Mô tả chi tiết",
  coverImage: "Ảnh bìa",
  imageUrl: "Đường dẫn hình ảnh",
  fileUrl: "Đường dẫn tệp",
  status: "Trạng thái",
  bookingStatus: "Trạng thái booking",
  paymentStatus: "Trạng thái thanh toán",
  question: "Câu hỏi",
  answer: "Câu trả lời",
  topic: "Chủ đề",
  displayOrder: "Thứ tự hiển thị",
  destinationId: "Điểm đến",
  destinationLabel: "Tên điểm đến",
  departureId: "Lịch khởi hành",
  departureDate: "Ngày khởi hành",
  endDate: "Ngày kết thúc",
  pickupPointId: "Điểm đón",
  pickupTime: "Giờ đón",
  voucherCode: "Mã giảm giá",
  adultCount: "Số người lớn",
  childCount: "Số trẻ em",
  adultPrice: "Giá người lớn",
  childPrice: "Giá trẻ em",
  basePriceAdult: "Giá cơ bản người lớn",
  basePriceChild: "Giá cơ bản trẻ em",
  totalSlots: "Số chỗ",
  maxCapacityDefault: "Sức chứa mặc định",
  note: "Ghi chú",
  dietaryNotes: "Ghi chú ăn uống",
  healthNotes: "Ghi chú sức khỏe",
  guests: "Danh sách hành khách",
  guestType: "Loại hành khách",
  idNumber: "Số giấy tờ",
  bookingId: "Booking",
  tourId: "Tour",
  tourType: "Loại tour",
  tourTheme: "Chủ đề tour",
  durationDays: "Số ngày",
  durationNights: "Số đêm",
  dayNumber: "Ngày trong lịch trình",
  itemOrder: "Thứ tự lịch trình",
  locationName: "Địa điểm",
  rating: "Điểm đánh giá",
  comment: "Nội dung đánh giá",
  reason: "Lý do",
  reasonType: "Loại lý do",
  targetRole: "Nhóm nhận thông báo",
  targetUserId: "Người nhận thông báo",
  isPublished: "Trạng thái phát hành",
  metadata: "Dữ liệu bổ sung",
  paymentMethod: "Phương thức thanh toán",
  accountNumber: "Số tài khoản",
  refundAccountName: "Tên chủ tài khoản hoàn tiền",
  refundAccountNo: "Số tài khoản hoàn tiền",
  refundBankName: "Ngân hàng hoàn tiền",
  refundRate: "Tỷ lệ hoàn tiền",
  accommodationType: "Loại chỗ ở",
  hotelStars: "Số sao",
  pricePerNight: "Giá mỗi đêm",
  amenities: "Tiện nghi",
  supplierId: "Nhà cung cấp",
  transportType: "Loại phương tiện",
  durationHours: "Thời lượng",
  price: "Chi phí",
  availabilityType: "Loại lịch bận",
  credentialType: "Loại chứng chỉ",
  credential: "Chứng chỉ",
  issuer: "Đơn vị cấp",
  level: "Cấp độ",
  customerMessage: "Thông báo cho khách hàng",
  sendEmail: "Tùy chọn gửi email",
  userId: "Người dùng",
  handledBy: "Người xử lý",
  contactId: "Liên hệ",
  items: "Danh sách dữ liệu",
  conversationId: "Cuộc hội thoại",
  memory: "Bộ nhớ hội thoại",
  provider: "Nhà cung cấp",
  gateway: "Cổng thanh toán",
  transferAmount: "Số tiền chuyển khoản",
  transactionDate: "Ngày giao dịch",
};

function validationFieldLabel(path: string): string {
  const parts = path.split(".");
  const property = parts[parts.length - 1] || path;
  const label = validationFieldLabels[property] || property;

  const guestIndex = parts.findIndex((part) => part === "guests");
  if (guestIndex >= 0 && /^\d+$/.test(parts[guestIndex + 1] || "")) {
    return `Hành khách ${Number(parts[guestIndex + 1]) + 1} - ${label}`;
  }

  return label;
}

function vietnameseConstraintMessage(constraint: string, path: string): string {
  const label = validationFieldLabel(path);

  switch (constraint) {
    case "isDefined":
    case "isNotEmpty":
      return `Vui lòng nhập ${label.toLowerCase()}.`;
    case "isString":
      return `${label} phải là chuỗi ký tự.`;
    case "isEmail":
      return `${label} không đúng định dạng email.`;
    case "minLength":
      return `${label} chưa đủ độ dài tối thiểu.`;
    case "maxLength":
      return `${label} vượt quá độ dài cho phép.`;
    case "matches":
      return `${label} không đúng định dạng yêu cầu.`;
    case "isInt":
      return `${label} phải là số nguyên.`;
    case "isNumber":
      return `${label} phải là số.`;
    case "min":
      return `${label} nhỏ hơn giá trị tối thiểu cho phép.`;
    case "max":
      return `${label} lớn hơn giá trị tối đa cho phép.`;
    case "isIn":
    case "isEnum":
      return `${label} có giá trị không hợp lệ.`;
    case "isBoolean":
      return `${label} phải là giá trị đúng hoặc sai.`;
    case "isArray":
      return `${label} phải là danh sách.`;
    case "arrayMinSize":
      return `${label} chưa có đủ dữ liệu yêu cầu.`;
    case "isObject":
      return `${label} phải là dữ liệu đối tượng hợp lệ.`;
    case "isDateString":
      return `${label} không đúng định dạng ngày.`;
    case "whitelistValidation":
      return `${label} không phải là trường dữ liệu được phép gửi.`;
    default:
      return `${label} không hợp lệ.`;
  }
}

function collectVietnameseValidationMessages(
  errors: ValidationError[],
  parentPath = "",
): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      const isMissing =
        error.value === undefined ||
        error.value === null ||
        (typeof error.value === "string" && error.value.length === 0);

      if (isMissing) {
        messages.push(
          `Vui lòng nhập ${validationFieldLabel(path).toLowerCase()}.`,
        );
      } else {
        for (const constraint of Object.keys(error.constraints)) {
          messages.push(vietnameseConstraintMessage(constraint, path));
        }
      }
    }

    if (error.children?.length) {
      messages.push(
        ...collectVietnameseValidationMessages(error.children, path),
      );
    }
  }

  return messages;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Origin",
      "X-Requested-With",
    ],
  });

  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads/",
  });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors: ValidationError[]) =>
        new BadRequestException(collectVietnameseValidationMessages(errors)),
    }),
  );

  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalFilters(new PrismaExceptionFilter());

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "0.0.0.0";

  await app.listen(port, host);

  console.log(`Backend running on http://localhost:${port}/api`);
  console.log(`Timezone: ${process.env.TZ}`);
  console.log(
    `SePay webhook local route: http://localhost:${port}/api/payments/sepay-webhook`,
  );
}

bootstrap().catch((error) => {
  console.error("Không thể khởi động backend:", error);
  process.exit(1);
});
