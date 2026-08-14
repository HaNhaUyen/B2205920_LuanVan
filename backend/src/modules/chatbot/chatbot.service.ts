import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { ChatMessageDto } from "./dto/chat-message.dto";
import { GuideChatbotService } from "./guide-chatbot.service";
import { LocationResolverService } from "./location-resolver.service";
import { BookingsService } from "../bookings/bookings.service";
import { PaymentsService } from "../payments/payments.service";
import { RefundsService } from "../refunds/refunds.service";
import { RecommendationsService } from "../recommendations/recommendations.service";
import { RagService } from "./rag.service";
import type { RagHit } from "./rag.service";
import { ChatbotNluService } from "./chatbot-nlu.service";
import type { NluResult, NluEntities } from "./chatbot-nlu.service";
import { ChatbotConfidenceService } from "./chatbot-confidence.service";
import type { AnswerConfidence } from "./chatbot-confidence.service";
import { groupDeparturesByTour } from "./chatbot-tour-result-grouper";

type AuthUser = {
  userId?: bigint;
  fullName?: string;
  email?: string;
  role?: "admin" | "user" | string;
} | null;

type ChatGuestDraft = {
  guestType: "adult" | "child";
  index: number;
  fullName?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  idNumber?: string | null;
};

type ChatRefundDraft = {
  started?: boolean;
  confirmed?: boolean;
  bookingCode?: string | null;
  reason?: string | null;
  refundBankName?: string | null;
  refundAccountNo?: string | null;
  refundAccountName?: string | null;
  refundQrUrl?: string | null;
};

type MemoryState = {
  destination?: string | null;
  budgetMax?: number | null;
  durationDays?: number | null;
  durationNights?: number | null;
  departureMonth?: string | null;
  partySize?: number | null;
  hotelStars?: number | null;
  tourType?: "group" | "private" | null;
  softNeeds?: string[];
  avoidNeeds?: string[];
  intent?: string | null;
  lastTourName?: string | null;
  lastTourId?: string | null;
  lastTourOptions?: Array<{
    tourId: string;
    departureId: string | null;
    name: string;
  }> | null;
  lastDepartureOptions?: Array<{
    tourId: string;
    departureId: string;
    index: number;
    startDate: string | null;
    endDate: string | null;
    adultPrice: number;
    availableSlots: number;
    status: string;
  }> | null;
  candidateTours?: Array<{
    tourId: string;
    departureIds: string[];
    departures: Array<{
      departureId: string;
      departureDate: string | null;
      endDate: string | null;
      remainingSlots: number;
      status: string;
      adultPrice: number;
    }>;
  }> | null;
  selectedCandidateTourId?: string | null;
  bookingContext?: ChatBookingContext | null;
  bookingDraft?: ChatBookingDraft | null;
  refundDraft?: ChatRefundDraft | null;
  lastFailedTourSearch?: {
    destinationId?: string | null;
    destinationName?: string | null;
    durationDays?: number | null;
    durationNights?: number | null;
    departureFrom?: string | null;
    departureTo?: string | null;
    departureRangeLabel?: string | null;
    requestedThemes?: string[];
  } | null;
  lastBookingCode?: string | null;
  lastBookingPaymentStatus?: string | null;
};

type ChatBookingDraft = {
  tourId?: string | null;
  departureId?: string | null;
  pickupPointId?: string | null;
  voucherCode?: string | null;
  skipVoucher?: boolean;
  adultCount?: number | null;
  childCount?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  paymentMethod?: "bank_transfer" | null;
  confirmed?: boolean;
  replacingBookingCode?: string | null;
  started?: boolean;

  guests?: ChatGuestDraft[] | null;
  passengerInfoConfirmed?: boolean;
};

type TourCard = {
  type: "tour";
  tourId: string;
  slug: string;
  name: string;
  destination: string;
  priceAdult: number;
  durationText: string;
  departureId: string | null;
  departureDate: string | null;
  imageUrl: string | null;
  shortDescription: string | null;
  reason: string;
  tags: string[];
  departures?: Array<{
    departureId: string;
    departureDate: string | null;
    endDate: string | null;
    remainingSlots: number;
    status: string;
    adultPrice: number;
  }>;
  priceFrom?: number;
};

type ChatBookingState =
  | "IDLE"
  | "SHOWING_TOUR_LIST"
  | "WAITING_TOUR_SELECTION"
  | "WAITING_DEPARTURE_SELECTION"
  | "WAITING_BOOKING_CONFIRMATION"
  | "BOOKING_REDIRECT_READY";

type ChatBookingContext = {
  state: ChatBookingState;
  displayedTours: Array<{
    index: number;
    tourId: string;
    slug?: string;
    name: string;
  }>;
  selectedTourId?: string;
  selectedTourName?: string;
  selectedTourSlug?: string;
  displayedDepartures: Array<{
    index: number;
    departureId: string;
    departureDate: string | null;
    availableSeats: number;
    status: string;
    adultPrice?: number;
  }>;
  selectedDepartureId?: string;
  selectedDepartureDate?: string | null;
  updatedAt: string;
};

type VoucherCard = {
  code: string;
  name: string;
  description: string | null;
  discountText: string;
  minOrderAmount: number;
  endDate: string | null;
  status: string;
};

type BookingCard = {
  id: string;
  bookingId: string;
  bookingCode: string;
  status: string;
  paymentStatus: string | null;
  tourName: string;
  destination: string | null;
  departureDate: string | null;
  endDate: string | null;
  amount: number;
  pickupName: string | null;
  pickupAddress: string | null;
  pickupTime: string | null;
};

type BookingCheckoutCard = {
  type: "booking_checkout";
  bookingId: string;
  bookingCode: string;
  amount: number;
  finalAmount: number;
  holdExpiresAt: string | null;
  paymentUrl: string;
  mobilePaymentUrl: string;
  qrCodeUrl: string;
  transactionCode: string;
  paymentMethod: string;
  paymentStatus: string;
  tourName?: string | null;
  departureDate?: string | null;
  endDate?: string | null;
  pickupName?: string | null;
  pickupAddress?: string | null;
  pickupTime?: string | null;
  bankCode?: string | null;
  accountNo?: string | null;
  accountName?: string | null;
  transferContent?: string | null;
  qrProvider?: "sepay" | "internal" | string | null;
};

type RefundRequestCard = {
  id: string;
  bookingCode: string;
  tourName: string;
  refundAmount: number;
  status: string;
  createdAt: string | null;
  reason: string | null;
};

type PickupPointCard = {
  id: string;
  tourName: string;
  province: string;
  name: string;
  address: string;
  pickupTime: string | null;
  note: string | null;
};

type FaqPreview = {
  question: string;
  answer: string;
  topic: string | null;
};

type PromptContext = {
  intent: string;
  userMessage: string;
  memory: MemoryState;
  recentMessages: Array<{ role: string; content: string }>;
  tours: TourCard[];
  vouchers: VoucherCard[];
  bookings: BookingCard[];
  pickupPoints: PickupPointCard[];
  bookingCheckout: BookingCheckoutCard | null;
  refundRequest: RefundRequestCard | null;
  faqs: FaqPreview[];
  userProfile: { loggedIn: boolean; fullName?: string };
  ragHits: RagHit[];
  nlu: NluResult | null;
  answerConfidence: AnswerConfidence | null;
};

const ACTION_SCORE: Record<string, number> = {
  ask_ai: 2,
  view: 1,
  search: 1,
  favorite: 3,
  booking: 6,
};

const DESTINATION_ALIASES: Record<string, string[]> = {
  "Phú Quốc": [
    "phu quoc",
    "phú quốc",
    "phuquoc",
    "dao ngoc",
    "đảo ngọc",
    "daongoc",
  ],
  "Nha Trang": ["nha trang", "nhatrang"],
  "Đà Lạt": ["da lat", "đà lạt", "dalat", "san may", "săn mây", "sanmay"],
  "Đà Nẵng": ["da nang", "đà nẵng", "danang"],
  "Hội An": ["hoi an", "hội an", "hoian", "pho co", "phố cổ", "phoco"],
  "Sa Pa": ["sa pa", "sapa"],
  "Quy Nhơn": ["quy nhon", "quy nhơn", "quynhon"],
  "Vũng Tàu": [
    "vung tau",
    "vũng tàu",
    "vungtau",
    "ba ria vung tau",
    "bà rịa vũng tàu",
    "bariavungtau",
  ],
  "Hạ Long": [
    "ha long",
    "hạ long",
    "halong",
    "vinh ha long",
    "vịnh hạ long",
    "vinhhalong",
  ],
  "Cần Thơ": [
    "can tho",
    "cần thơ",
    "cantho",
    "mien tay",
    "miền tây",
    "mientay",
    "cho noi",
    "chợ nổi",
    "chonoi",
  ],
  Huế: ["hue", "huế", "co do", "cố đô", "codo"],
  "Ninh Bình": [
    "ninh binh",
    "ninh bình",
    "ninhbinh",
    "trang an",
    "tràng an",
    "trangan",
  ],
  "An Giang": [
    "an giang",
    "angiang",
    "châu đốc",
    "chau doc",
    "chaudoc",
    "núi sam",
    "nui sam",
    "nuisam",
    "xứ sở thần tiên",
    "xu so than tien",
    "xusothantien",
    "núi cấm",
    "nui cam",
    "nuicam",
  ],
  "Tây Ninh": [
    "tay ninh",
    "tây ninh",
    "tayninh",
    "núi bà đen",
    "nui ba den",
    "nuibaden",
    "bà đen",
    "ba den",
    "baden",
    "tòa thánh cao đài",
    "toa thanh cao dai",
    "toathanhcaodai",
  ],
  "Buôn Ma Thuộc": [
    "buôn ma thuộc",
    "buon ma thuoc",
    "buonmathuoc",
    "núi đá voi",
    "nui da voi",
    "nuidavoi",
  ],
  "Cà Mau": [
    "cà mau",
    "ca mau",
    "camau",
    "u minh hạ",
    "u minh ha",
    "uminhha",
    "mũi cà mau",
    "mui ca mau",
    "muicamau",
    "hòn đá bạc",
    "hon da bac",
    "hondabac",
  ],
  "Côn Đảo": [
    "côn đảo",
    "con dao",
    "condao",
    "nhà tù côn đảo",
    "nha tu con dao",
    "nhatucondao",
    "hòn bảy cạnh",
    "hon bay canh",
    "hon bai canh",
    "đầm trầu",
    "dam trau",
    "damtrau",
  ],
  "Hà Giang": [
    "hà giang",
    "ha giang",
    "hagiang",
    "lũng cú",
    "lung cu",
    "lungcu",
    "ruộng bậc thang",
    "ruong bac thang",
    "ruongbacthang",
  ],
  "Mộc Châu": [
    "mộc châu",
    "moc chau",
    "mocchau",
    "rừng thông bản áng",
    "rung thong ban ang",
    "rungthongbanang",
    "thác dải yếm",
    "thac dai yem",
    "thacdaiyem",
  ],
  "Mũi Né": [
    "mũi né",
    "mui ne",
    "muine",
    "đồi cát đỏ",
    "doi cat do",
    "doicatdo",
    "suối tiên",
    "suoi tien",
    "suoitien",
  ],
};

@Injectable()
export class ChatbotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly refundsService: RefundsService,
    private readonly ragService: RagService,
    private readonly nluService: ChatbotNluService,
    private readonly confidenceService: ChatbotConfidenceService,
    private readonly guideChatbotService: GuideChatbotService,
    private readonly locationResolver: LocationResolverService,
    private readonly recommendationsService: RecommendationsService,
  ) {}

  async message(dto: ChatMessageDto, user: AuthUser) {
    if (String(user?.role || "").toLowerCase() === "guide") {
      return this.guideChatbotService.handle({ ...dto, scope: "guide" }, user);
    }
    const userMessage = String(dto.message || "").trim();
    const conversation = await this.getOrCreateConversation(
      dto.conversationId,
      user,
      userMessage,
    );

    // ADMIN HARD GATE: câu hỏi quản trị phải được xử lý trước hard tour search.
    // Tránh các cụm thời gian như "tháng này" trong câu hỏi doanh thu bị parser tour
    // hiểu nhầm thành điều kiện tìm lịch khởi hành. Người dùng thường vẫn đi luồng cũ.
    const earlyAdminGateAnswer = await this.tryHandleAdminAdvancedQuestion(
      userMessage,
      user,
      conversation.id,
    );
    if (earlyAdminGateAnswer) return earlyAdminGateAnswer;

    // GỢI Ý THAY THẾ: chỉ dùng tiêu chí của lần tìm tour vừa thất bại.
    // Không đưa câu này qua NLU/personal_recommendation để tránh gọi Hybrid Recommender.
    const alternativeTourAnswer = await this.tryHandleAlternativeTourSuggestion(
      userMessage,
      conversation,
    );
    if (alternativeTourAnswer) return alternativeTourAnswer;

    // ================================================================
    // HARD ROUTE V3 - TOUR SEARCH THEO TIÊU CHÍ CỨNG
    // ================================================================
    // Chạy NGAY SAU khi có conversation, trước landmark/NLU/follow-up/booking
    // để câu tìm tour rõ ràng không thể bị memory cũ kéo sang low-confidence.
    //
    // Ví dụ bắt buộc đi vào đây:
    // - "cho các tour 3 ngày 2 đêm"
    // - "tour 3 ngày 2 đêm"
    // - "đi Cần Thơ 3 ngày 2 đêm tuần sau"
    // - "tour cuối tháng 8"
    // - "tour tháng 9"
    // - "tour thứ 2 tuần sau"
    //
    // Không dựa vào intent của NLU.
    const hardRouteNormalized = this.stripText(userMessage);
    const hardRouteDurationDays = this.parseDurationDays(hardRouteNormalized);
    const hardRouteDurationNights =
      this.parseDurationNights(hardRouteNormalized);
    const hardRouteDateRange =
      this.parseDepartureDateRange(hardRouteNormalized);
    const hardRouteDestination = this.detectDestination(hardRouteNormalized);

    const hasExplicitHardTourSearch =
      !this.isNumberedTourReference(userMessage) &&
      !/\b(tour nay|tour do|tour dau tien|tour tren)\b/.test(
        hardRouteNormalized,
      ) &&
      Boolean(
        (hardRouteDurationDays !== null && hardRouteDurationNights !== null) ||
        hardRouteDateRange ||
        hardRouteDestination,
      ) &&
      /\b(tour|du lich|di|cho|tim|goi y|co tour|cac tour|thang|tuan|thu|ngay|dem)\b/.test(
        hardRouteNormalized,
      );

    if (hasExplicitHardTourSearch) {
      const hardRouteMemory = this.toMemoryState(conversation.memoryJson);

      console.log("[CHATBOT_HARD_TOUR_SEARCH_V3]", {
        message: userMessage,
        durationDays: hardRouteDurationDays,
        durationNights: hardRouteDurationNights,
        destination: hardRouteDestination,
        departureRange: hardRouteDateRange?.label || null,
      });

      const hardRouteAnswer = await this.tryHandleDeterministicTourQuery({
        message: userMessage,
        conversation,
        memory: hardRouteMemory,
        nlu: null,
      });

      if (hardRouteAnswer) {
        return hardRouteAnswer;
      }
    }

    // Nếu đang ở một bước của luồng đặt tour, các tên địa danh xuất hiện trong
    // tên điểm đón (ví dụ "Bưu điện Hội An") chỉ là dữ liệu của booking hiện tại.
    // Không cho landmark search giành route và biến câu chọn điểm đón thành tìm tour.
    const earlyBookingMemory = this.toMemoryState(conversation.memoryJson);
    const normalizedBeforeLandmark = this.stripText(userMessage);
    const isActiveBookingSubstepBeforeLandmark = Boolean(
      earlyBookingMemory.bookingDraft?.started &&
      (/\b(chon diem don|diem don ma|ma diem don|pickup)\b/.test(
        normalizedBeforeLandmark,
      ) ||
        /\b(voucher|ma giam gia|khong dung voucher|dung voucher|ap voucher)\b/.test(
          normalizedBeforeLandmark,
        ) ||
        this.isPartySizeMessage(userMessage) ||
        /\b(xac nhan|dong y|thanh toan|qr|vietqr|sepay|chuyen khoan)\b/.test(
          normalizedBeforeLandmark,
        )),
    );

    const landmarkAnswer = isActiveBookingSubstepBeforeLandmark
      ? null
      : await this.tryHandleLandmarkTourSearch(userMessage, conversation.id);
    if (landmarkAnswer) return landmarkAnswer;

    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 12,
    });

    const dbMemory = this.toMemoryState(conversation.memoryJson);

    // Chỉ nhận memory phía client khi conversationId thực sự thuộc đúng hội thoại
    // vừa được backend xác thực. Nếu frontend còn giữ conversationId/memory của tài
    // khoản trước trong localStorage, getOrCreateConversation sẽ tạo hội thoại mới
    // và đoạn này sẽ bỏ toàn bộ memory cũ, tránh lộ/ngộ nhận lịch sử người dùng khác.
    const canUseClientMemory =
      Boolean(dto.conversationId) &&
      String(dto.conversationId) === String(conversation.id);
    const clientMemory = canUseClientMemory
      ? this.toMemoryState((dto as any).memory)
      : {};
    let currentMemory = this.mergeMemory(dbMemory, clientMemory);

    // Các state điều khiển luồng đặt tour phải lấy DB làm nguồn sự thật.
    // Frontend có thể gửi memory của response trước đó chậm hơn DB; nếu cho client
    // ghi đè bookingContext/bookingDraft thì "chọn lịch số 2" có thể bị resolve
    // theo candidateTours cũ và dẫn tới preview một ngày khởi hành khác.
    if (dbMemory.bookingDraft?.started || dbMemory.bookingContext) {
      currentMemory.bookingDraft = dbMemory.bookingDraft;
      currentMemory.bookingContext = dbMemory.bookingContext;
      currentMemory.lastDepartureOptions = dbMemory.lastDepartureOptions;
      currentMemory.candidateTours = dbMemory.candidateTours;
      currentMemory.selectedCandidateTourId = dbMemory.selectedCandidateTourId;
    }

    const recentForNlu = recentMessages.map((item: any) => ({
      role: item.role,
      content: item.content,
    }));

    // Nếu memory bị mất lastTourOptions nhưng user vẫn hỏi "tour số 1",
    // thử phục hồi danh sách tour từ câu trả lời gần nhất của bot.
    // Trường hợp này thường xảy ra khi reload trang, đổi conversation, hoặc bản cũ chưa lưu memory đúng.
    if (
      this.isNumberedTourReference(userMessage) &&
      (!Array.isArray(currentMemory.lastTourOptions) ||
        currentMemory.lastTourOptions.length === 0)
    ) {
      currentMemory = await this.restoreLastTourOptionsFromRecentMessages(
        currentMemory,
        recentForNlu,
      );
    }

    const ruleMemory = this.extractMemory(userMessage, currentMemory);
    const preliminaryMemory = this.mergeMemory(currentMemory, ruleMemory);

    // Hard guard: các câu có tiêu chí tour rõ ràng phải query DB trực tiếp
    // trước NLU/LLM để không rơi vào low-confidence/follow_up.
    if (
      !preliminaryMemory.bookingDraft?.started &&
      !preliminaryMemory.refundDraft?.started
    ) {
      const earlyDeterministicTourAnswer =
        await this.tryHandleDeterministicTourQuery({
          message: userMessage,
          conversation,
          memory: preliminaryMemory,
          nlu: null,
        });

      if (earlyDeterministicTourAnswer) {
        return earlyDeterministicTourAnswer;
      }
    }

    let fallbackIntent = this.detectIntent(
      userMessage,
      preliminaryMemory,
      recentForNlu,
    );

    // HARD GUARD cho 3 thao tác chỉnh draft ngay tại màn hình preview booking.
    // Đây là thao tác của state-machine, không phụ thuộc Groq/OpenRouter NLU.
    // Chỉ áp dụng khi bookingDraft đang mở, nên không ảnh hưởng luồng đổi booking
    // đã tạo (có mã BK) hoặc các câu hỏi voucher/điểm đón thông thường.
    const isActiveBookingDraftEdit = Boolean(
      preliminaryMemory.bookingDraft?.started &&
      preliminaryMemory.bookingDraft?.tourId &&
      (this.isChangePartySizeUiRequest(userMessage) ||
        this.isChangePickupUiRequest(userMessage) ||
        this.isChangeVoucherUiRequest(userMessage)),
    );

    if (isActiveBookingDraftEdit) {
      fallbackIntent = "booking_create";
    }

    const isBareVoucherCodeDuringBooking = Boolean(
      preliminaryMemory.bookingDraft?.started &&
      /^(?=.{4,30}$)(?=.*\d)[A-Z][A-Z0-9_-]*$/i.test(userMessage),
    );

    if (isBareVoucherCodeDuringBooking) {
      fallbackIntent = "booking_create";
    }

    // HARD GUARD hoàn tiền: mọi câu có mã BK và hành động hoàn/hủy/xác nhận hoàn
    // phải đi thẳng vào state-machine refund_create, không để NLU/RAG đổi thành tour_policy.
    if (this.isExplicitRefundAction(userMessage, preliminaryMemory)) {
      fallbackIntent = "refund_create";
    }

    const ruleOnlySelectionNlu = this.tryBuildRuleOnlySelectionNlu(
      userMessage,
      preliminaryMemory,
      fallbackIntent,
      ruleMemory,
    );

    const nlu = ruleOnlySelectionNlu
      ? ruleOnlySelectionNlu
      : await this.nluService.analyze({
          message: userMessage,
          memory: preliminaryMemory,
          recentMessages: recentForNlu.slice(-6),
          fallbackIntent: fallbackIntent as any,
          fallbackEntities: this.memoryToNluEntities(ruleMemory),
        });

    // Nếu câu hiện tại chỉ là chọn điểm đón/thanh toán mà không nhắc rõ voucher,
    // không cho NLU/Groq gán nhầm các số như "mã điểm đón 3914" thành voucherCode.
    if (
      (nlu as any).entities?.voucherCode &&
      !this.hasExplicitVoucherCodeSignal(userMessage)
    ) {
      delete (nlu as any).entities.voucherCode;
    }

    const mergedMemory = this.mergeMemory(
      preliminaryMemory,
      this.memoryFromNluEntities(nlu.entities, preliminaryMemory),
    );

    let intent = nlu.intent || fallbackIntent;
    const normalizedForIntentGuard = this.stripText(userMessage);

    if (this.isExplicitRefundAction(userMessage, mergedMemory)) {
      intent = "refund_create";
      (nlu as any).intent = intent;
    }

    // Guard quan trọng cho luồng đặt tour:
    // Nếu rule-based đã nhận đây là bước tiếp theo của booking thì KHÔNG để LLM NLU
    // bẻ sang voucher_check/pickup_point/general_consulting. Nếu không, câu như
    // “chọn điểm đón mã 40, không dùng voucher, thanh toán momo” sẽ chỉ bị trả lời tư vấn,
    // memory bookingDraft không được lưu, và câu sau “1 người lớn” sẽ hỏi lặp lại điểm đón.
    if (
      (fallbackIntent === "booking_create" || isBareVoucherCodeDuringBooking) &&
      !this.isFreshTourSearchRequest(userMessage)
    ) {
      intent = "booking_create";
      (nlu as any).intent = intent;
    }

    // Guard: LLM NLU đôi lúc nhận nhầm câu tìm tour mới thành follow_up
    // vì trong câu có cụm như "3 ngày 2 đêm" hoặc "trẻ nhỏ".
    // Nếu rule-based đã thấy đây là tìm tour mới thì ưu tiên tour_search.
    if (
      fallbackIntent === "tour_search" &&
      [
        "follow_up",
        "general_consulting",
        "tour_policy",
        "pickup_point",
      ].includes(String(intent)) &&
      /\b(toi muon di|minh muon di|muon di|co tour nao|goi y|tim tour|ngan sach|duoi|gia|ngay|dem|nguoi|tre nho|tre em|gia dinh|nghi duong|bien|chup hinh|nhe nhang)\b/.test(
        normalizedForIntentGuard,
      )
    ) {
      intent = "tour_search";
      (nlu as any).intent = intent;
    }

    // Guard: câu xin gợi ý "phù hợp với tôi/cho tôi/cá nhân hóa" phải đi đúng
    // personal_recommendation, kể cả khi NLU trả nhầm tour_search.
    // Nhờ đó khách vãng lai được báo rõ chưa thể cá nhân hóa, còn người đăng nhập
    // mới dùng lịch sử hành vi và hệ thống gợi ý Hybrid.
    const asksPersonalRecommendation =
      /\b(goi y tour phu hop voi toi|goi y phu hop voi toi|tour phu hop voi toi|goi y tour cho toi|de xuat tour cho toi|goi y ca nhan|ca nhan hoa|dua tren so thich cua toi|theo so thich cua toi)\b/.test(
        normalizedForIntentGuard,
      );

    if (asksPersonalRecommendation) {
      intent = "personal_recommendation";
      (nlu as any).intent = intent;
    }

    const temporalFollowUpMonth = this.parseDepartureMonth(
      normalizedForIntentGuard,
    );
    const isTemporalSearchContinuation =
      Boolean(temporalFollowUpMonth) &&
      (/^(?:(?:con|the|vay|roi)\s+)?thang\s+\d{1,2}(?:\s+(?:thi sao|sao|nua))?$/i.test(
        normalizedForIntentGuard,
      ) ||
        /\b(thang\s+\d{1,2}).*\b(nen di dau|co tour nao|goi y|du lich)\b/.test(
          normalizedForIntentGuard,
        )) &&
      ["tour_search", "personal_recommendation", "follow_up"].includes(
        String(
          preliminaryMemory.intent || mergedMemory.intent || fallbackIntent,
        ),
      );

    if (isTemporalSearchContinuation) {
      intent = "tour_search";
      (nlu as any).intent = intent;
    }

    // Guard: câu hỏi voucher phải đi vào voucher_check, không bị booking draft cũ kéo sang chọn lịch.
    if (
      fallbackIntent === "voucher_check" &&
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon)\b/.test(
        normalizedForIntentGuard,
      )
    ) {
      intent = "voucher_check";
      (nlu as any).intent = intent;
    }

    // Guard: yêu cầu tạo hoàn tiền phải đi vào refund_create; hỏi chính sách chung mới là tour_policy.
    if (
      fallbackIntent === "refund_create" ||
      (mergedMemory.refundDraft?.started &&
        /\b(hoan cho toi|hoàn cho tôi|hoan di|hoàn đi|tiep tuc hoan|tiếp tục hoàn|gui yeu cau|gửi yêu cầu|xac nhan|xác nhận|dong y|đồng ý|ngan hang|ngân hàng|stk|so tai khoan|số tài khoản|chu tai khoan|chủ tài khoản)\b/.test(
          normalizedForIntentGuard,
        ))
    ) {
      intent = "refund_create";
      (nlu as any).intent = intent;
    } else if (fallbackIntent === "tour_policy") {
      intent = "tour_policy";
      (nlu as any).intent = intent;
    }

    // Guard: câu so sánh/"nên chọn A hay B" phải ưu tiên tour_compare.
    // Đặc biệt khi đang có bookingDraft/lastDepartureOptions, LLM có thể kéo nhầm
    // câu "So sánh tour số 1 và số 2" vào booking_create rồi bot quay lại hỏi chọn lịch.
    if (fallbackIntent === "tour_compare") {
      intent = "tour_compare";
      (nlu as any).intent = intent;
    }

    // Guard: câu hỏi chi tiết về tour đã gợi ý phải là follow_up, không phải tiếp tục booking.
    // Ví dụ: "Tour số 1 có phù hợp cho trẻ nhỏ không?" đang có draft cũ thì bot vẫn phải trả lời
    // về tour, không được nhảy sang validate departure và hỏi chọn lịch.
    const asksTourDetailFromOptions =
      /\btour\s*(?:so|số)?\s*\d+\b/.test(normalizedForIntentGuard) &&
      this.isTourDetailQuestion(userMessage);

    if (fallbackIntent === "follow_up" || asksTourDetailFromOptions) {
      intent = "follow_up";
      (nlu as any).intent = intent;

      // Nếu user hỏi "tour số 1/tour số 2" thì đây là tham chiếu tới danh sách tour
      // vừa hiển thị, không phải từ khóa tìm kiếm mới. Phải resolve ngay tại đây để
      // tránh buildPromptContext search lại và lấy nhầm tour khác (ví dụ Đà Lạt -> Quy Nhơn).
      const referencedTour = this.resolveTourChoiceFromMessage(
        userMessage,
        preliminaryMemory,
      );
      if (referencedTour) {
        mergedMemory.lastTourId = String(referencedTour.tourId || "");
        mergedMemory.lastTourName = String(referencedTour.name || "");
        if (referencedTour.departureId) {
          mergedMemory.bookingDraft = {
            ...(mergedMemory.bookingDraft || {}),
            departureId: String(referencedTour.departureId),
          };
        }
      }
    }

    // Guard: các câu hỏi/so sánh/tư vấn tour không phải là tín hiệu tiếp tục đặt tour.
    // Chỉ giữ booking_create khi user có hành động rõ: đặt, chọn lịch, chọn điểm đón, xác nhận, thanh toán...
    const hasExplicitBookingAction =
      /\b(dat tour|dat cho|giu cho|chot tour|toi muon dat|muon dat tour|dat luon|tao booking|book tour|booking tour|chon lich|lich so|chọn lịch|diem don|điểm đón|pickup|voucher|ma giam gia|qr|vietqr|sepay|chuyen khoan|chuyển khoản|bank|thanh toan|thanh toán|momo|vnpay|vn pay|tien mat|tiền mặt|cash|the|card|xac nhan|xác nhận|dong y|đồng ý|khong dung voucher|không dùng voucher|bo qua voucher|bỏ qua voucher)\b/.test(
        normalizedForIntentGuard,
      ) ||
      /\b\d+\s*(nguoi|người|khach|khách|nguoi lon|người lớn|tre em|trẻ em)\b/.test(
        normalizedForIntentGuard,
      );

    if (
      String(intent) === "booking_create" &&
      !hasExplicitBookingAction &&
      (asksTourDetailFromOptions ||
        /\b(so sanh|so sánh|khac nhau|khác nhau|phu hop|phù hợp|tre nho|trẻ nhỏ|tre em|trẻ em|lich trinh|lịch trình|khach san|khách sạn|an uong|ăn uống)\b/.test(
          normalizedForIntentGuard,
        ))
    ) {
      intent = fallbackIntent === "tour_compare" ? "tour_compare" : "follow_up";
      (nlu as any).intent = intent;
    }

    mergedMemory.intent = intent;

    // Chỉ cho deterministic tour search chạy khi intent cuối cùng thực sự là tìm/gợi ý tour.
    // Các intent nghiệp vụ như refund_create, booking_*, voucher_check... phải đi đúng
    // state-machine của chúng. Nếu không, các con số trong mã booking/STK có thể bị
    // parser tour hiểu nhầm thành tiêu chí ngày/thời gian và trả về danh sách tour.
    const deterministicTourAnswer = [
      "tour_search",
      "personal_recommendation",
    ].includes(String(intent))
      ? await this.tryHandleDeterministicTourQuery({
          message: userMessage,
          conversation,
          memory: mergedMemory,
          nlu,
        })
      : null;

    if (deterministicTourAnswer) return deterministicTourAnswer;

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: userMessage,
        intent,
        meta: { intent },
      },
    });

    await this.trackAskAi(user, userMessage, intent, mergedMemory).catch(
      () => null,
    );

    const promptContext = await this.buildPromptContext(
      userMessage,
      intent,
      mergedMemory,
      conversation.id,
      user,
      nlu,
    );

    // Chỉ cập nhật danh sách tour gợi ý khi đây là câu tìm/tư vấn tour.
    // Không cập nhật trong booking_create, vì câu “đặt tour 1” phải dùng
    // lastTourOptions của câu gợi ý trước đó. Nếu ghi đè tại đây, bot có thể
    // chọn nhầm tour số 1 thành một tour khác do buildPromptContext tự tìm lại.
    const isNumberedTourFollowUp =
      ["follow_up", "tour_compare"].includes(String(intent)) &&
      this.isNumberedTourReference(userMessage);

    const canUpdateLastTourMemory =
      ["tour_search", "personal_recommendation", "tour_compare"].includes(
        String(intent),
      ) ||
      (String(intent) === "follow_up" && !isNumberedTourFollowUp);

    if (
      promptContext.tours[0] &&
      canUpdateLastTourMemory &&
      !isNumberedTourFollowUp
    ) {
      mergedMemory.lastTourId = promptContext.tours[0].tourId;
      mergedMemory.lastTourName = promptContext.tours[0].name;
      mergedMemory.lastTourOptions = promptContext.tours
        .slice(0, this.getMaxTourResults())
        .map((tour) => ({
          tourId: tour.tourId,
          departureId:
            Array.isArray(tour.departures) && tour.departures.length > 1
              ? null
              : tour.departureId,
          name: tour.name,
        }));
      mergedMemory.candidateTours = promptContext.tours
        .filter(
          (tour) => Array.isArray(tour.departures) && tour.departures.length,
        )
        .map((tour) => ({
          tourId: tour.tourId,
          departureIds: tour.departures!.map(
            (departure) => departure.departureId,
          ),
          departures: tour.departures!,
        }));
      mergedMemory.selectedCandidateTourId = null;
      mergedMemory.bookingContext = this.buildTourListBookingContext(
        promptContext.tours,
      );
    }

    let bookingFlow: {
      answer: string;
      memory?: Partial<MemoryState>;
      bookingCheckout?: BookingCheckoutCard;
      suggestedReplies?: string[];
    } | null = null;

    let refundFlow: {
      answer: string;
      memory?: Partial<MemoryState>;
      refundRequest?: RefundRequestCard | null;
    } | null = null;

    // Các câu cần chặn/tra cứu nghiệp vụ phải chạy trước booking flow.
    // Nếu không, câu như "Tôi muốn đặt tour chưa có trong hệ thống" có thể bị kéo memory cũ
    // rồi nhảy sang hỏi điểm đón của tour cũ.
    const earlyDirectBusinessAnswer =
      intent === "refund_create"
        ? null
        : await this.tryEarlyBusinessAnswer(promptContext, intent, user);

    const hasActiveBookingDraft = Boolean(
      mergedMemory.bookingDraft?.started && mergedMemory.bookingDraft?.tourId,
    );

    const shouldPreserveBookingWhileBrowsing =
      hasActiveBookingDraft && ["voucher_check"].includes(String(intent));

    if (earlyDirectBusinessAnswer) {
      if (!shouldPreserveBookingWhileBrowsing) {
        mergedMemory.bookingDraft = null;
      }
      promptContext.memory = mergedMemory;
    } else if (intent === "booking_change") {
      bookingFlow = await this.processBookingChangeFlow(
        promptContext,
        mergedMemory,
        user,
      );
    } else if (intent === "booking_create") {
      bookingFlow = await this.processBookingFlow(
        promptContext,
        mergedMemory,
        user,
      );
    } else if (intent === "refund_create") {
      refundFlow = await this.processRefundFlow(
        promptContext,
        mergedMemory,
        user,
      );
    } else if (!shouldPreserveBookingWhileBrowsing) {
      mergedMemory.bookingDraft = null;
    }

    if (bookingFlow?.memory) {
      Object.assign(mergedMemory, bookingFlow.memory);
      promptContext.memory = mergedMemory;
    }
    if (bookingFlow?.bookingCheckout) {
      promptContext.bookingCheckout = bookingFlow.bookingCheckout;
    }

    if (refundFlow?.memory) {
      Object.assign(mergedMemory, refundFlow.memory);
      promptContext.memory = mergedMemory;
    }

    if (refundFlow?.refundRequest) {
      promptContext.refundRequest = refundFlow.refundRequest;
    }

    promptContext.answerConfidence = this.confidenceService.evaluate({
      intent,
      nlu,
      tours: promptContext.tours,
      ragHits: promptContext.ragHits,
      vouchers: promptContext.vouchers,
      bookings: promptContext.bookings,
      pickupPoints: promptContext.pickupPoints,
      bookingCheckout: promptContext.bookingCheckout,
      memory: mergedMemory,
    });

    let answer: string;

    // Nếu user hỏi trực tiếp một tour cụ thể hoặc hỏi “tour này/tour đó”,
    // cần resolve tour trước để lưu memory. Nếu không, câu sau như
    // “Tour đó còn lịch khởi hành nào gần nhất?” sẽ bị mất lastTourId.
    const shouldResolveDirectTour = ![
      "tour_search",
      "personal_recommendation",
      "tour_compare",
    ].includes(String(intent));

    const directResolvedTour = shouldResolveDirectTour
      ? await this.findTourForDirectAnswer(promptContext).catch(() => null)
      : null;
    if (directResolvedTour?.id) {
      mergedMemory.lastTourId = String(directResolvedTour.id);
      mergedMemory.lastTourName = String(directResolvedTour.name || "");
      if (directResolvedTour.destination?.name) {
        mergedMemory.destination = String(directResolvedTour.destination.name);
      }

      if (
        this.detectTourSectionIntent(normalizedForIntentGuard, intent) ===
        "departure"
      ) {
        const departureOptions = await this.findBookableDepartureOptions(
          BigInt(directResolvedTour.id),
        );
        mergedMemory.lastDepartureOptions = departureOptions
          .slice(0, 5)
          .map((item: any, index: number) =>
            this.toDepartureMemoryOption(
              BigInt(directResolvedTour.id),
              item,
              index,
            ),
          );
        mergedMemory.bookingDraft = {
          ...(mergedMemory.bookingDraft || {}),
          started: true,
          tourId: String(directResolvedTour.id),
        };
      }

      promptContext.memory = mergedMemory;
    }

    const directBusinessAnswer =
      earlyDirectBusinessAnswer ||
      (await this.tryDirectBusinessAnswer(promptContext, intent));

    // Với booking_create, câu trả lời của state-machine phải được ưu tiên tuyệt đối.
    // Nếu để directBusinessAnswer/LLM chen vào, bot sẽ nói kiểu “để mình kiểm tra...”
    // hoặc quay lại liệt kê điểm đón dù user đã chọn đủ thông tin.
    if (bookingFlow?.answer) {
      answer = bookingFlow.answer;
    } else if (refundFlow?.answer) {
      answer = refundFlow.answer;
    } else if (directBusinessAnswer) {
      answer = directBusinessAnswer;
    } else if (!promptContext.answerConfidence.shouldAnswer) {
      answer = this.confidenceService.buildLowConfidenceAnswer({
        intent,
        nlu,
        tours: promptContext.tours,
        ragHits: promptContext.ragHits,
        vouchers: promptContext.vouchers,
        bookings: promptContext.bookings,
        pickupPoints: promptContext.pickupPoints,
        memory: mergedMemory,
      });
    } else if (intent === "refund_create") {
      answer =
        directBusinessAnswer || this.generateNaturalAnswer(promptContext);
    } else if (intent === "tour_policy") {
      answer = await this.generatePolicyAnswer(promptContext, user);
    } else if (intent === "follow_up") {
      answer = await this.generateFollowUpAnswer(promptContext);
    } else if (intent === "tour_compare") {
      answer = await this.generateCompareAnswer(promptContext);
    } else if (
      intent === "tour_search" ||
      intent === "personal_recommendation" ||
      intent === "booking_status" ||
      intent === "voucher_check" ||
      intent === "small_talk"
    ) {
      answer = this.generateNaturalAnswer(promptContext);
    } else {
      answer = await this.generateLlmAnswer(promptContext);
    }
    const suggestedReplies =
      bookingFlow?.suggestedReplies ||
      this.buildSuggestedReplies(promptContext);

    // Khi state-machine booking đang trả lời, không gửi kèm voucher/booking cũ
    // không liên quan về frontend. Nếu không, sau câu “1 người lớn” giao diện có
    // thể hiện hàng loạt voucher + booking đã thanh toán làm người dùng tưởng bot
    // đang xử lý nhầm đơn cũ.
    const isBookingStateAnswer = Boolean(bookingFlow?.answer);
    const isRefundIntent = String(intent) === "refund_create";
    const isRefundPolicyWithBooking =
      String(intent) === "tour_policy" &&
      /\bbk[a-z0-9\-]+\b/i.test(userMessage) &&
      /\b(hoan tien|hoan lai|refund|huy don|huy booking|huy tour|lay lai tien)\b/.test(
        this.stripText(userMessage),
      );
    const shouldReturnTourCards =
      !isBookingStateAnswer &&
      !isRefundIntent &&
      !isRefundPolicyWithBooking &&
      ["tour_search", "personal_recommendation", "tour_compare"].includes(
        String(intent),
      );

    const responseTours = shouldReturnTourCards ? promptContext.tours : [];
    const responseVouchers =
      String(intent) === "voucher_check" && !isBookingStateAnswer
        ? promptContext.vouchers
        : [];
    const responseBookings =
      String(intent) === "booking_status" && !isBookingStateAnswer
        ? promptContext.bookings
        : [];
    const responsePickupPoints =
      String(intent) === "pickup_point" && !isBookingStateAnswer
        ? promptContext.pickupPoints
        : [];

    await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastIntent: intent,
        title: conversation.title ?? this.buildConversationTitle(userMessage),
        memoryJson: mergedMemory as unknown as object,
        summary: this.buildSummary(promptContext),
      },
    });

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        intent,
        meta: {
          intent,
          nlu,
          confidence: promptContext.answerConfidence,
          cards: responseTours,
          vouchers: responseVouchers,
          bookings: responseBookings,
          pickupPoints: responsePickupPoints,
          bookingCheckout: promptContext.bookingCheckout,
          refundRequest: promptContext.refundRequest,
          suggestedReplies,
        },
      },
    });

    return {
      conversationId: conversation.id.toString(),
      intent,
      nlu,
      confidence: promptContext.answerConfidence,
      answer,
      memory: mergedMemory,
      cards: responseTours,
      tours: responseTours,
      vouchers: responseVouchers,
      bookings: responseBookings,
      pickupPoints: responsePickupPoints,
      bookingCheckout: promptContext.bookingCheckout,
      refundRequest: promptContext.refundRequest,
      suggestedReplies,
    };
  }

  private async tryHandleLandmarkTourSearch(
    message: string,
    conversationId: bigint,
  ) {
    const location = await this.locationResolver.resolve(message);
    if (!location?.landmark) return null;
    const normalized = this.stripText(message);
    if (
      /\b(booking|ma don|hoan tien|voucher|thanh toan|chinh sach)\b/.test(
        normalized,
      )
    )
      return null;

    const tours = await this.locationResolver.findTours(location, 8);
    const cards = tours.map((tour: any) =>
      this.toTourCard(
        tour,
        Array.isArray(tour.departures) ? tour.departures[0] : null,
        tour._locationScore >= 100
          ? [`Lịch trình hoặc nội dung tour có ${location.landmark}`]
          : [`Tour thuộc ${location.province}`],
      ),
    );
    const answer = cards.length
      ? `${location.landmark} thuộc ${location.province}. Mình tìm thấy ${cards.length} tour phù hợp; các tour có lịch trình hoặc nội dung nhắc trực tiếp đến ${location.landmark} được xếp trước.`
      : `${location.landmark} thuộc ${location.province}, nhưng hiện hệ thống chưa có tour đang mở phù hợp với địa danh này.`;

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: "user",
        content: message,
        intent: "tour_search",
        meta: { resolvedLocation: location },
      } as any,
    });
    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: answer,
        intent: "tour_search",
        meta: { resolvedLocation: location, cards },
      } as any,
    });
    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        lastIntent: "tour_search",
        summary: answer.slice(0, 500),
        memoryJson: {
          destination: location.destination,
          landmark: location.landmark,
        },
        updatedAt: new Date(),
      } as any,
    });

    return {
      conversationId: conversationId.toString(),
      intent: "tour_search",
      answer,
      resolvedLocation: location,
      cards,
      tours: cards,
      vouchers: [],
      bookings: [],
      pickupPoints: [],
      bookingCheckout: null,
      refundRequest: null,
      memory: {
        destination: location.destination,
        landmark: location.landmark,
      },
      suggestedReplies: cards.length
        ? [
            "Xem tour đầu tiên",
            "Có lịch khởi hành nào?",
            "So sánh các tour này",
          ]
        : [`Tìm tour ${location.province}`],
    };
  }

  async listConversations(user: AuthUser, scope: string = "user") {
    if (!user?.userId) return [];
    const role = String(user?.role || "").toLowerCase();
    const safeScope =
      role === "guide"
        ? "guide"
        : scope === "admin" && role === "admin"
          ? "admin"
          : "user";
    const where: any = { userId: user.userId, scope: safeScope };
    const conversations = await this.prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        summary: true,
        lastIntent: true,
        scope: true,
        updatedAt: true,
        createdAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return conversations.map((item: any) => ({
      id: item.id.toString(),
      title: item.title || "Cuộc hội thoại",
      summary: item.summary || item.messages?.[0]?.content || "",
      lastIntent: item.lastIntent || null,
      updatedAt: item.updatedAt,
      createdAt: item.createdAt,
      lastMessage: item.messages?.[0]?.content || "",
      scope: item.scope || safeScope,
    }));
  }

  async getConversation(conversationId: string, user: AuthUser) {
    if (!user?.userId)
      throw new NotFoundException("Bạn cần đăng nhập để xem lại hội thoại.");
    if (!/^\d+$/.test(String(conversationId || ""))) {
      throw new NotFoundException("Mã hội thoại không hợp lệ.");
    }

    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id: BigInt(conversationId) },
      include: {
        messages: { orderBy: { createdAt: "asc" }, take: 80 },
      },
    });

    const expectedScope =
      String(user?.role || "").toLowerCase() === "admin"
        ? "admin"
        : String(user?.role || "").toLowerCase() === "guide"
          ? "guide"
          : "user";

    if (
      !conversation ||
      String(conversation.userId || "") !== String(user.userId) ||
      String((conversation as any).scope || expectedScope) !== expectedScope
    ) {
      throw new NotFoundException("Không tìm thấy hội thoại chat.");
    }

    return {
      id: conversation.id.toString(),
      conversationId: conversation.id.toString(),
      title: conversation.title || "Cuộc hội thoại",
      summary: conversation.summary || null,
      lastIntent: conversation.lastIntent || null,
      memory: this.toMemoryState(conversation.memoryJson),
      messages: conversation.messages.map((msg: any) => {
        const meta = msg.meta && typeof msg.meta === "object" ? msg.meta : {};
        return {
          id: msg.id.toString(),
          role: msg.role,
          content: msg.content,
          intent: msg.intent || meta.intent || null,
          time: this.formatTimeForChat(msg.createdAt),
          createdAt: msg.createdAt,
          cards: meta.cards || meta.tours || [],
          tours: meta.tours || meta.cards || [],
          vouchers: meta.vouchers || [],
          bookings: meta.bookings || [],
          pickupPoints: meta.pickupPoints || [],
          bookingCheckout: meta.bookingCheckout || null,
          refundRequest: meta.refundRequest || null,
          suggestedReplies: Array.isArray(meta.suggestedReplies)
            ? meta.suggestedReplies
            : [],
        };
      }),
    };
  }

  private async tryHandleAdminAdvancedQuestion(
    userMessage: string,
    user: AuthUser,
    conversationId: bigint,
  ) {
    if (String(user?.role || "").toLowerCase() !== "admin") return null;
    const intent = this.detectAdminAdvancedIntent(userMessage);
    if (!intent) return null;

    const answer = await this.buildAdminAdvancedAnswer(intent, userMessage);

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: "user",
        content: userMessage,
        intent,
        meta: { intent, adminIntent: true },
      },
    });

    await this.prisma.chatConversation.update({
      where: { id: conversationId },
      data: {
        lastIntent: intent,
        title: "Admin: " + this.buildConversationTitle(userMessage),
        summary: answer.slice(0, 500),
        memoryJson: { adminIntent: intent },
      },
    });

    await this.prisma.chatMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: answer,
        intent,
        meta: { intent, adminIntent: true },
      },
    });

    return {
      conversationId: conversationId.toString(),
      intent,
      nlu: { intent, entities: {}, confidence: 1 },
      confidence: {
        level: "high",
        shouldAnswer: true,
        reasons: ["admin_intent_gate"],
      },
      answer,
      memory: { intent },
      cards: [],
      tours: [],
      vouchers: [],
      bookings: [],
      pickupPoints: [],
      bookingCheckout: null,
      suggestedReplies: this.buildAdminSuggestedReplies(intent),
    };
  }

  private detectAdminAdvancedIntent(message: string): string | null {
    const n = this.stripText(message);

    // Các câu tổng quan/cảnh báo phải được xét trước doanh thu.
    // Nếu không, cụm “hôm nay” sẽ làm “Hôm nay có gì cần xử lý?”
    // bị nhận nhầm thành báo cáo doanh thu.
    if (
      /\b(canh bao|van de van hanh|can xu ly|hom nay co gi|hom nay can lam gi|co gi can xu ly|viec nao can xu ly|bat thuong he thong|tong quan van hanh)\b/.test(
        n,
      )
    ) {
      return "admin_operation_alert";
    }

    // Câu hỏi thiếu HDV phải đứng trước nhóm “booking nào”.
    if (
      /\b(chua co huong dan vien|khong co huong dan vien|chua co hdv|khong co hdv|chua phan cong huong dan vien|chua phan cong hdv|booking nao chua co huong dan vien|booking nao chua co hdv|tour nao chua co huong dan vien|tour nao chua co hdv)\b/.test(
        n,
      )
    ) {
      return "admin_booking_without_guide";
    }

    if (
      /\b(doanh thu|revenue|doanh so|thu nhap)\b/.test(n) ||
      (/\b(thang nay|thang truoc|tuan nay|quy nay|hom nay)\b/.test(n) &&
        /\b(tien|thu|doanh)\b/.test(n))
    ) {
      return "admin_revenue_time_compare";
    }

    // Phải bắt câu hỏi giữ chỗ trước nhóm "booking nào" chung.
    // Nếu không, "Booking nào sắp hết hạn giữ chỗ?" sẽ rơi vào thống kê trạng thái.
    if (
      /\b(sap het han giu cho|sap het han thanh toan|booking nao sap het han|booking sap het han|giu cho sap het han|het han giu cho trong 30 phut)\b/.test(
        n,
      )
    ) {
      return "admin_expiring_holds";
    }

    if (
      /\b(bao nhieu booking|booking nao|don nao|cho thanh toan|cho xac nhan|pending|confirmed|cancelled|da huy|trang thai booking|trang thai don)\b/.test(
        n,
      )
    ) {
      return "admin_booking_status";
    }
    if (
      /\b(luot xem cao|it nguoi dat|it dat|khong co booking|chuyen doi thap|bat thuong|tour nao dang yeu|tour nao yeu|tour nao e|tour e|tour nao it dat|tour nao can toi uu|can toi uu)\b/.test(
        n,
      )
    ) {
      return "admin_tour_anomaly";
    }
    if (
      /\b(nen giam gia|giam gia tour|tour nao nen giam|nen tao uu dai|nen khuyen mai|tour nao can uu dai|de xuat hanh dong)\b/.test(
        n,
      )
    ) {
      return "admin_discount_action";
    }
    if (
      /\b(khach hang tiem nang|nhom khach|phan nhom|hanh vi|hay dat tour bien|dat tour bien|thich bien|gia dinh|nghi duong|san khuyen mai)\b/.test(
        n,
      )
    ) {
      return "admin_customer_segments";
    }
    if (
      /\b(voucher|ma giam gia|hieu qua nhat|it duoc dung|thap hieu qua|ty le su dung voucher)\b/.test(
        n,
      )
    ) {
      return "admin_voucher_performance";
    }
    if (
      /\b(refund|hoan tien|yeu cau hoan|can xu ly gap|cho duyet|ton dong)\b/.test(
        n,
      )
    ) {
      return "admin_refund_urgent";
    }

    return null;
  }

  private async buildAdminAdvancedAnswer(intent: string, message: string) {
    switch (intent) {
      case "admin_revenue_time_compare":
        return this.buildAdminRevenueCompareAnswer();
      case "admin_booking_status":
        return this.buildAdminBookingStatusAnswer(message);
      case "admin_expiring_holds":
        return this.buildAdminExpiringHoldsAnswer();
      case "admin_booking_without_guide":
        return this.buildAdminBookingWithoutGuideAnswer();
      case "admin_tour_anomaly":
        return this.buildAdminTourAnomalyAnswer();
      case "admin_discount_action":
        return this.buildAdminDiscountActionAnswer();
      case "admin_customer_segments":
        return this.buildAdminCustomerSegmentsAnswer();
      case "admin_voucher_performance":
        return this.buildAdminVoucherPerformanceAnswer();
      case "admin_refund_urgent":
        return this.buildAdminRefundUrgentAnswer();
      case "admin_operation_alert":
        return this.buildAdminOperationAlertAnswer();
      default:
        return "Mình chưa nhận diện được câu hỏi quản trị này. Admin có thể hỏi về doanh thu, booking, tour yếu, voucher, refund hoặc phân nhóm khách hàng.";
    }
  }

  private buildAdminSuggestedReplies(intent: string) {
    const common = [
      "Doanh thu tháng này so với tháng trước thế nào?",
      "Có bao nhiêu booking chờ thanh toán?",
      "Tour nào lượt xem cao nhưng ít người đặt?",
      "Voucher nào hiệu quả nhất?",
    ];
    if (intent === "admin_tour_anomaly" || intent === "admin_discount_action") {
      return [
        "Nên giảm giá tour nào?",
        "Tour nào lượt xem cao nhưng ít người đặt?",
        "Nhóm khách nào hay đặt tour biển?",
      ];
    }
    if (intent === "admin_refund_urgent") {
      return [
        "Có vấn đề vận hành nào không?",
        "Có bao nhiêu booking chờ thanh toán?",
        "Doanh thu tháng này thế nào?",
      ];
    }
    return common;
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private endOfMonth(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
  }

  private percent(value: number, total: number) {
    if (!total) return "0%";
    return `${((value / total) * 100).toFixed(1)}%`;
  }

  private async buildAdminRevenueCompareAnswer() {
    const now = new Date();
    const thisStart = this.startOfMonth(now);
    const thisEnd = this.endOfMonth(now);
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevStart = this.startOfMonth(prev);
    const prevEnd = this.endOfMonth(prev);

    const [
      thisRevenue,
      prevRevenue,
      paidToday,
      bookingsThisMonth,
      paidBookingsThisMonth,
    ] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid",
          paidAt: { gte: thisStart, lte: thisEnd },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid",
          paidAt: { gte: prevStart, lte: prevEnd },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paymentStatus: "paid",
          paidAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          },
        },
      }),
      this.prisma.booking.count({
        where: { createdAt: { gte: thisStart, lte: thisEnd } },
      }),
      this.prisma.booking.count({
        where: {
          bookingStatus: { in: ["confirmed", "completed"] },
          createdAt: { gte: thisStart, lte: thisEnd },
        },
      }),
    ]);

    const current = Number(thisRevenue._sum.amount || 0);
    const previous = Number(prevRevenue._sum.amount || 0);
    const diff = current - previous;
    const diffRate =
      previous > 0
        ? `${diff >= 0 ? "+" : ""}${((diff / previous) * 100).toFixed(1)}%`
        : current > 0
          ? "+100%"
          : "0%";

    return [
      "Doanh thu theo thời gian:",
      `- Tháng này: ${this.formatCurrency(current)}`,
      `- Tháng trước: ${this.formatCurrency(previous)}`,
      `- Chênh lệch: ${diff >= 0 ? "+" : ""}${this.formatCurrency(diff)} (${diffRate})`,
      `- Doanh thu hôm nay: ${this.formatCurrency(Number(paidToday._sum.amount || 0))}`,
      `- Booking tạo trong tháng: ${bookingsThisMonth}`,
      `- Booking đã xác nhận/hoàn thành trong tháng: ${paidBookingsThisMonth}`,
      "",
      diff < 0
        ? "Nhận xét: doanh thu đang giảm. Nên kiểm tra tour có lượt xem cao nhưng chưa đặt, booking chờ thanh toán và voucher đang ít được dùng."
        : "Nhận xét: doanh thu đang ổn. Nên tiếp tục đẩy các tour/voucher có tỷ lệ chuyển đổi tốt.",
    ].join("\n");
  }

  private async buildAdminBookingWithoutGuideAnswer() {
    const now = new Date();

    const rows = await this.prisma.booking.findMany({
      where: {
        bookingStatus: {
          in: ["waiting_confirmation", "confirmed"] as any,
        },
        departure: {
          departureDate: { gte: now },
        },
        guideAssignments: {
          none: {
            status: { in: ["assigned", "confirmed"] as any },
          },
        },
      },
      include: {
        tour: true,
        departure: true,
        user: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        departure: {
          departureDate: "asc",
        },
      },
      take: 20,
    });

    if (!rows.length) {
      return [
        "Booking chưa có hướng dẫn viên:",
        "✅ Hiện không có booking sắp khởi hành cần phân công HDV.",
      ].join("\n");
    }

    return [
      `Booking chưa có hướng dẫn viên: ${rows.length} booking cần xử lý`,
      "",
      ...rows.map((booking: any, index: number) =>
        [
          `${index + 1}. ${booking.bookingCode} - ${booking.tour?.name || "Tour"}`,
          `   Khởi hành: ${this.formatDate(
            booking.departure?.departureDate
              ? new Date(booking.departure.departureDate).toISOString()
              : null,
          )}`,
          `   Trạng thái: ${booking.bookingStatus}`,
          booking.user?.fullName
            ? `   Khách đặt: ${booking.user.fullName}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
      "",
      "Ưu tiên phân công theo ngày khởi hành gần nhất.",
    ].join("\n");
  }

  private async buildAdminExpiringHoldsAnswer() {
    const now = new Date();
    const next30 = new Date(now.getTime() + 30 * 60 * 1000);

    const [count, rows] = await Promise.all([
      this.prisma.booking.count({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: next30 },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          bookingStatus: "pending_payment" as any,
          holdExpiresAt: { gte: now, lte: next30 },
        },
        include: {
          tour: true,
          user: { select: { fullName: true, email: true } },
          payments: { take: 1, orderBy: { createdAt: "desc" } },
        },
        orderBy: { holdExpiresAt: "asc" },
        take: 10,
      }),
    ]);

    if (!count) {
      return "✅ Hiện không có booking nào sắp hết hạn giữ chỗ trong 30 phút tới.";
    }

    return [
      `⚠ Có ${count} booking sắp hết hạn giữ chỗ trong 30 phút tới.`,
      "",
      "Các booking cần theo dõi trước:",
      ...rows.map((booking: any, index: number) => {
        const payment = booking.payments?.[0];
        return `${index + 1}. ${booking.bookingCode} - ${booking.tour?.name || "Tour"} - ${booking.user?.fullName || booking.contactName || "Khách"} - ${this.formatCurrency(Number(booking.finalAmount || 0))} - hết hạn ${`${this.formatDate(booking.holdExpiresAt)} ${this.formatTimeForChat(booking.holdExpiresAt)}`}${payment?.internalTransactionCode ? ` - mã TT ${payment.internalTransactionCode}` : ""}`;
      }),
      "",
      count > rows.length
        ? `Đang hiển thị ${rows.length}/${count} booking gần hết hạn sớm nhất.`
        : "Admin nên ưu tiên kiểm tra giao dịch nếu khách báo đã chuyển khoản trước khi thời gian giữ chỗ kết thúc.",
    ].join("\n");
  }

  private async buildAdminBookingStatusAnswer(message: string) {
    const n = this.stripText(message);
    const statusGroups: any = {
      pending_payment: ["pending_payment"],
      waiting_confirmation: ["waiting_confirmation"],
      confirmed: ["confirmed"],
      completed: ["completed"],
      cancelled: ["cancelled", "expired"],
    };
    let selected: string[] | null = null;
    if (/\b(cho thanh toan|pending payment|chua thanh toan)\b/.test(n))
      selected = statusGroups.pending_payment;
    if (/\b(cho xac nhan|waiting confirmation|can xac nhan)\b/.test(n))
      selected = statusGroups.waiting_confirmation;
    if (/\b(da xac nhan|confirmed)\b/.test(n))
      selected = statusGroups.confirmed;
    if (/\b(da huy|huy|cancel|expired|qua han)\b/.test(n))
      selected = statusGroups.cancelled;

    const [allGroups, rows] = await Promise.all([
      this.prisma.booking.groupBy({
        by: ["bookingStatus"],
        _count: { _all: true },
      }),
      selected
        ? this.prisma.booking.findMany({
            where: { bookingStatus: { in: selected as any } },
            take: 8,
            orderBy: { createdAt: "desc" },
            include: {
              tour: true,
              user: true,
              payments: { take: 1, orderBy: { createdAt: "desc" } },
            },
          })
        : Promise.resolve([]),
    ]);

    const lines = ["Tình trạng booking hiện tại:"];
    for (const item of allGroups as any[]) {
      lines.push(`- ${item.bookingStatus}: ${item._count._all}`);
    }

    if (selected) {
      lines.push("", "Danh sách cần kiểm tra gần nhất:");
      if (!rows.length)
        lines.push("- Không có booking phù hợp trạng thái này.");
      rows.forEach((b: any, index: number) => {
        lines.push(
          `${index + 1}. ${b.bookingCode} - ${b.tour?.name || "Tour"} - ${this.formatCurrency(Number(b.finalAmount || 0))} - ${b.bookingStatus}`,
        );
      });
    }

    lines.push(
      "",
      "Ưu tiên: pending_payment quá lâu → waiting_confirmation → booking sắp khởi hành → booking chưa phân công HDV.",
    );
    return lines.join("\n");
  }

  private async getTourPerformanceRows(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [tours, behaviors, bookings, favorites] = await Promise.all([
      this.prisma.tour.findMany({
        where: {
          status: "published" as any,
        },
        take: 200,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          slug: true,
          basePriceAdult: true,
          destination: {
            select: {
              name: true,
            },
          },
        },
      }),

      (this.prisma as any).userBehavior?.groupBy
        ? (this.prisma as any).userBehavior.groupBy({
            by: ["tourId", "action"],
            where: {
              createdAt: { gte: since },
              tourId: { not: null },
            },
            _count: { _all: true },
            _sum: { score: true },
          })
        : Promise.resolve([]),

      this.prisma.booking.groupBy({
        by: ["tourId"],
        where: {
          createdAt: { gte: since },
        },
        _count: { _all: true },
        _sum: { finalAmount: true },
      }),

      (this.prisma as any).favoriteTour?.groupBy
        ? (this.prisma as any).favoriteTour.groupBy({
            by: ["tourId"],
            where: {
              createdAt: { gte: since },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const behaviorMap = new Map<string, any>();
    for (const row of behaviors as any[]) {
      const key = String(row.tourId || "");
      const current = behaviorMap.get(key) || {
        views: 0,
        searches: 0,
        score: 0,
        signals: 0,
      };
      const action = String(row.action || "");
      const count = Number(row._count?._all || 0);
      current.signals += count;
      current.score += Number(row._sum?.score || 0);
      if (["view", "view_detail", "tour_view"].includes(action))
        current.views += count;
      if (["search", "ask_ai"].includes(action)) current.searches += count;
      behaviorMap.set(key, current);
    }

    const bookingMap = new Map(
      (bookings as any[]).map((row) => [String(row.tourId), row]),
    );
    const favoriteMap = new Map(
      (favorites as any[]).map((row) => [
        String(row.tourId),
        Number(row._count?._all || 0),
      ]),
    );

    return (tours as any[]).map((tour: any) => {
      const key = String(tour.id);
      const b = bookingMap.get(key);
      const behavior = behaviorMap.get(key) || {
        views: 0,
        searches: 0,
        score: 0,
        signals: 0,
      };
      const totalBookings = Number(b?._count?._all || 0);
      const revenue = Number(b?._sum?.finalAmount || 0);
      const favoritesCount = Number(favoriteMap.get(key) || 0);
      const interest =
        behavior.views +
        behavior.searches +
        favoritesCount * 3 +
        behavior.score;
      const conversionRate =
        behavior.views > 0
          ? totalBookings / behavior.views
          : totalBookings > 0
            ? 1
            : 0;
      return {
        id: key,
        name: tour.name,
        destination: tour.destination?.name || "",
        price: Number(tour.basePriceAdult || 0),
        views: behavior.views,
        searches: behavior.searches,
        favorites: favoritesCount,
        signals: behavior.signals,
        behaviorScore: behavior.score,
        bookings: totalBookings,
        revenue,
        interest,
        conversionRate,
      };
    });
  }

  private async buildAdminTourAnomalyAnswer() {
    const rows = await this.getTourPerformanceRows(30);
    const weak = rows
      .filter((r: any) => r.interest >= 3 && r.bookings <= 1)
      .sort(
        (a: any, b: any) =>
          b.interest - b.bookings * 5 - (a.interest - a.bookings * 5),
      )
      .slice(0, 6);

    if (!weak.length) {
      return "Tour đang yếu trong 30 ngày gần nhất:\n- Chưa có tour nào có tín hiệu yếu rõ ràng.\n\nGợi ý: tiếp tục theo dõi lượt xem, yêu thích và tỷ lệ chuyển đổi theo từng tour.";
    }

    return [
      "Tour đang yếu trong 30 ngày gần nhất:",
      ...weak.map(
        (r: any, i: number) =>
          `${i + 1}. ${r.name} - ${r.views} lượt xem, ${r.favorites} yêu thích, ${r.bookings} booking, chuyển đổi ${this.percent(r.bookings, Math.max(r.views, 1))} → có quan tâm nhưng chuyển đổi thấp.`,
      ),
      "",
      "Ưu tiên xử lý: kiểm tra giá, ảnh đại diện, lịch khởi hành, mô tả lịch trình và điều kiện voucher của các tour trên.",
    ].join("\n");
  }

  private async buildAdminDiscountActionAnswer() {
    const rows = await this.getTourPerformanceRows(30);
    const candidates = rows
      .filter((r: any) => r.interest >= 4 && r.bookings === 0)
      .sort((a: any, b: any) => b.interest - a.interest)
      .slice(0, 6);

    if (!candidates.length) {
      return "Tour nên giảm giá / tạo ưu đãi:\n- Chưa có tour nào đủ tín hiệu để đề xuất giảm giá.\n\nGợi ý: không nên giảm giá đại trà; chỉ giảm khi có lượt xem/yêu thích nhưng không ra booking.";
    }

    return [
      "Tour nên cân nhắc giảm giá / tạo ưu đãi:",
      ...candidates.map(
        (r: any, i: number) =>
          `${i + 1}. ${r.name} - ${r.views} lượt xem, ${r.favorites} yêu thích, 0 booking → đề xuất voucher 5-10% hoặc combo ưu đãi.`,
      ),
      "",
      "Lý do: nhóm này đã có tín hiệu quan tâm nhưng chưa chuyển đổi, phù hợp thử ưu đãi ngắn hạn thay vì giảm toàn bộ tour.",
    ].join("\n");
  }

  private async buildAdminCustomerSegmentsAnswer() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const behaviors =
      (await (this.prisma as any).userBehavior?.findMany?.({
        where: { createdAt: { gte: since } },
        take: 5000,
        select: {
          keyword: true,
          action: true,
          score: true,
          meta: true,
          tour: {
            select: { name: true, destination: { select: { name: true } } },
          },
        },
      })) || [];

    const segments: Record<string, number> = {
      "Thích biển/đảo": 0,
      "Du lịch gia đình": 0,
      "Nghỉ dưỡng": 0,
      "Săn khuyến mãi": 0,
      "Thích chụp ảnh": 0,
      "Chưa rõ sở thích": 0,
    };

    const add = (label: string, score = 1) => {
      segments[label] = (segments[label] || 0) + score;
    };
    for (const row of behaviors as any[]) {
      const raw = `${row.keyword || ""} ${row.tour?.name || ""} ${row.tour?.destination?.name || ""} ${JSON.stringify(row.meta || {})}`;
      const n = this.stripText(raw);
      const score = Math.max(1, Number(row.score || 1));
      let matched = false;
      if (
        /\b(bien|dao|phu quoc|nha trang|quy nhon|da nang|ha long)\b/.test(n)
      ) {
        add("Thích biển/đảo", score);
        matched = true;
      }
      if (/\b(gia dinh|tre em|tre nho|family)\b/.test(n)) {
        add("Du lịch gia đình", score);
        matched = true;
      }
      if (/\b(nghi duong|resort|it di chuyen|nhe nhang|khong met)\b/.test(n)) {
        add("Nghỉ dưỡng", score);
        matched = true;
      }
      if (/\b(voucher|giam gia|khuyen mai|uu dai|gia re|duoi)\b/.test(n)) {
        add("Săn khuyến mãi", score);
        matched = true;
      }
      if (/\b(chup hinh|check in|song ao|canh dep|view dep)\b/.test(n)) {
        add("Thích chụp ảnh", score);
        matched = true;
      }
      if (!matched) add("Chưa rõ sở thích", 1);
    }

    const ranked = Object.entries(segments).sort((a, b) => b[1] - a[1]);
    return [
      "Phân nhóm khách hàng theo hành vi 30 ngày gần nhất:",
      ...ranked.map(
        ([label, value], index) => `${index + 1}. ${label}: ${value} tín hiệu`,
      ),
      "",
      "Ứng dụng: dùng các nhóm này để cá nhân hóa gợi ý tour, voucher, banner trang chủ và nội dung chatbot.",
    ].join("\n");
  }

  private async buildAdminVoucherPerformanceAnswer() {
    const [vouchers, bookingGroups, userVoucherGroups] = await Promise.all([
      this.prisma.voucher.findMany({
        take: 100,
        orderBy: { createdAt: "desc" } as any,
      }),
      this.prisma.booking.groupBy({
        by: ["voucherCode"],
        where: { voucherCode: { not: null } },
        _count: { _all: true },
        _sum: { finalAmount: true },
      }),
      (this.prisma as any).userVoucher?.groupBy
        ? (this.prisma as any).userVoucher.groupBy({
            by: ["voucherId", "status"],
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const bookingMap = new Map(
      (bookingGroups as any[]).map((row) => [
        String(row.voucherCode || "").toUpperCase(),
        row,
      ]),
    );
    const userVoucherMap = new Map<string, any>();
    for (const row of userVoucherGroups as any[]) {
      const key = String(row.voucherId);
      const current = userVoucherMap.get(key) || { total: 0, used: 0 };
      current.total += Number(row._count?._all || 0);
      if (String(row.status) === "used")
        current.used += Number(row._count?._all || 0);
      userVoucherMap.set(key, current);
    }

    const rows = (vouchers as any[]).map((v: any) => {
      const b = bookingMap.get(String(v.code || "").toUpperCase());
      const uv = userVoucherMap.get(String(v.id)) || { total: 0, used: 0 };
      return {
        code: v.code,
        name: v.name,
        status: v.status,
        assigned: uv.total,
        usedByUser: uv.used,
        bookingCount: Number(b?._count?._all || 0),
        revenue: Number(b?._sum?.finalAmount || 0),
        usageRate: uv.total ? uv.used / uv.total : 0,
      };
    });

    const best = rows
      .slice()
      .sort(
        (a: any, b: any) =>
          b.bookingCount * 10 +
          b.revenue / 1000000 +
          b.usageRate * 20 -
          (a.bookingCount * 10 + a.revenue / 1000000 + a.usageRate * 20),
      )
      .slice(0, 5);
    const weak = rows
      .filter(
        (r: any) =>
          r.assigned >= 5 && r.usedByUser === 0 && r.bookingCount === 0,
      )
      .slice(0, 3);

    return [
      "Voucher hiệu quả nhất:",
      ...(best.length
        ? best.map(
            (r: any, i: number) =>
              `${i + 1}. ${r.code} - ${r.bookingCount} booking, ${r.usedByUser}/${r.assigned} lượt dùng, doanh thu ${this.formatCurrency(r.revenue)}, tỷ lệ dùng ${this.percent(r.usedByUser, r.assigned)}.`,
          )
        : ["- Chưa có dữ liệu sử dụng voucher."]),
      "",
      "Voucher cần xem lại:",
      ...(weak.length
        ? weak.map(
            (r: any) =>
              `- ${r.code}: đã cấp ${r.assigned} nhưng chưa phát sinh booking.`,
          )
        : ["- Chưa có voucher yếu rõ ràng."]),
      "",
      "Gợi ý: giữ voucher có booking/doanh thu tốt; với voucher ít dùng, kiểm tra điều kiện áp dụng, thời hạn và vị trí hiển thị.",
    ].join("\n");
  }

  private async buildAdminRefundUrgentAnswer() {
    const refunds = await this.prisma.refundRequest.findMany({
      where: { status: "pending" as any },
      orderBy: { createdAt: "asc" },
      take: 8,
      include: {
        booking: {
          include: {
            tour: true,
            payments: { take: 1, orderBy: { createdAt: "desc" } },
          },
        },
        user: true,
      },
    });

    if (!refunds.length) {
      return "Yêu cầu hoàn tiền cần xử lý:\n✅ Hiện không có refund pending.";
    }

    return [
      `Yêu cầu hoàn tiền cần xử lý: ${refunds.length} yêu cầu pending gần nhất`,
      ...refunds.map(
        (r: any, i: number) =>
          `${i + 1}. ${r.booking?.bookingCode || "Booking"} - ${r.booking?.tour?.name || "Tour"} - ${this.formatCurrency(Number(r.refundAmount || r.booking?.finalAmount || 0))} - tạo ${this.formatDate(String(r.createdAt))}`,
      ),
      "",
      "Ưu tiên: yêu cầu cũ nhất → booking đã thanh toán → booking sắp khởi hành → số tiền hoàn cao.",
    ].join("\n");
  }

  private async buildAdminOperationAlertAnswer() {
    const now = new Date();
    const next30 = new Date(now.getTime() + 30 * 60 * 1000);

    const [expiring, waitingConfirmation, refundPending, noGuideUpcoming] =
      await Promise.all([
        this.prisma.booking.count({
          where: {
            bookingStatus: "pending_payment" as any,
            holdExpiresAt: { gte: now, lte: next30 },
          },
        }),
        this.prisma.booking.count({
          where: { bookingStatus: "waiting_confirmation" as any },
        }),
        this.prisma.refundRequest.count({
          where: { status: "pending" as any },
        }),
        this.prisma.booking.count({
          where: {
            bookingStatus: { in: ["confirmed", "waiting_confirmation"] as any },
            departure: { departureDate: { gte: now } },
            guideAssignments: {
              none: { status: { in: ["assigned", "confirmed"] as any } },
            },
          },
        }),
      ]);

    const totalNeedAction =
      expiring + waitingConfirmation + refundPending + noGuideUpcoming;

    if (!totalNeedAction) {
      return [
        "✅ Hiện chưa có công việc vận hành ưu tiên cần Admin xử lý ngay.",
        "- Không có booking sắp hết hạn giữ chỗ trong 30 phút.",
        "- Không có giao dịch chờ xác nhận thanh toán.",
        "- Không có yêu cầu hoàn tiền chờ duyệt.",
        "- Không có booking tương lai thiếu hướng dẫn viên.",
      ].join("\n");
    }

    return [
      "Các việc Admin cần ưu tiên xử lý hiện tại:",
      expiring
        ? `1. ⚠ ${expiring} booking sắp hết hạn giữ chỗ trong 30 phút.`
        : "1. ✅ Không có booking sắp hết hạn giữ chỗ trong 30 phút.",
      waitingConfirmation
        ? `2. ⚠ ${waitingConfirmation} giao dịch đang chờ xác nhận thanh toán.`
        : "2. ✅ Không có giao dịch chờ xác nhận thanh toán.",
      refundPending
        ? `3. ⚠ ${refundPending} yêu cầu hoàn tiền đang chờ duyệt.`
        : "3. ✅ Không có yêu cầu hoàn tiền chờ duyệt.",
      noGuideUpcoming
        ? `4. ⚠ ${noGuideUpcoming} booking có ngày khởi hành từ hiện tại trở đi nhưng chưa có HDV.`
        : "4. ✅ Các booking tương lai đã có HDV phù hợp.",
      "",
      "Thứ tự xử lý: giữ chỗ sắp hết hạn → đối soát thanh toán → hoàn tiền → phân công HDV theo ngày khởi hành gần nhất.",
    ].join("\n");
  }

  private buildConversationTitle(message: string) {
    const clean = String(message || "")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) return "Cuộc hội thoại mới";

    if (clean.length <= 70) return clean;

    return `${clean.slice(0, 67)}...`;
  }

  private async getOrCreateConversation(
    conversationId: string | undefined,
    user: AuthUser,
    firstMessage: string,
  ) {
    const scope =
      String(user?.role || "").toLowerCase() === "admin"
        ? "admin"
        : String(user?.role || "").toLowerCase() === "guide"
          ? "guide"
          : "user";

    const createNewConversation = () =>
      this.prisma.chatConversation.create({
        data: {
          userId: user?.userId ?? null,
          scope,
          title: this.buildConversationTitle(firstMessage),
          summary: null,
          lastIntent: null,
          memoryJson: {},
        } as any,
      });

    if (conversationId && /^\d+$/.test(String(conversationId))) {
      const conversation = await this.prisma.chatConversation.findUnique({
        where: { id: BigInt(conversationId) },
      });

      const belongsToCurrentUser =
        Boolean(conversation) &&
        String(conversation?.userId || "") === String(user?.userId || "") &&
        String((conversation as any)?.scope || scope) === scope;

      if (belongsToCurrentUser) {
        return conversation!;
      }

      // Frontend có thể còn giữ conversationId của tài khoản trước trong localStorage.
      // Tuyệt đối không mở hội thoại đó và cũng không báo lỗi làm UI kẹt; tạo một
      // hội thoại sạch cho tài khoản hiện tại.
      return createNewConversation();
    }

    // ID rỗng hoặc sai định dạng cũng được xem là bắt đầu hội thoại mới.
    return createNewConversation();
  }

  private toMemoryState(input: unknown): MemoryState {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    const source = input as Record<string, unknown>;
    return {
      destination:
        typeof source.destination === "string" ? source.destination : null,
      budgetMax: typeof source.budgetMax === "number" ? source.budgetMax : null,
      durationDays:
        typeof source.durationDays === "number" ? source.durationDays : null,
      durationNights:
        typeof source.durationNights === "number"
          ? source.durationNights
          : null,
      departureMonth:
        typeof source.departureMonth === "string"
          ? source.departureMonth
          : null,
      partySize: typeof source.partySize === "number" ? source.partySize : null,
      hotelStars:
        typeof source.hotelStars === "number" ? source.hotelStars : null,
      tourType:
        source.tourType === "group" || source.tourType === "private"
          ? source.tourType
          : null,
      softNeeds: Array.isArray(source.softNeeds)
        ? source.softNeeds.map(String).filter(Boolean)
        : [],
      avoidNeeds: Array.isArray(source.avoidNeeds)
        ? source.avoidNeeds.map(String).filter(Boolean)
        : [],
      intent: typeof source.intent === "string" ? source.intent : null,
      lastTourName:
        typeof source.lastTourName === "string" ? source.lastTourName : null,
      lastTourId:
        typeof source.lastTourId === "string" ? source.lastTourId : null,
      lastTourOptions: Array.isArray(source.lastTourOptions)
        ? source.lastTourOptions
            .map((item: any) => ({
              tourId: String(item?.tourId || ""),
              departureId: item?.departureId ? String(item.departureId) : null,
              name: String(item?.name || ""),
            }))
            .filter((item: any) => item.tourId)
        : null,
      // QUAN TRỌNG: phải hydrate lại lastDepartureOptions từ conversation.meta.
      // Nếu thiếu đoạn này, sau khi bot liệt kê lịch, user nhắn “Chọn lịch số 1”
      // thì backend không còn danh sách lịch để resolve, nên lại validate departureId cũ
      // và báo lặp: “Lịch khởi hành bạn chọn trước đó đã qua ngày đặt hợp lệ...”.
      lastDepartureOptions: Array.isArray(source.lastDepartureOptions)
        ? source.lastDepartureOptions
            .map((item: any, index: number) => ({
              tourId: String(item?.tourId || ""),
              departureId: String(item?.departureId || ""),
              index: typeof item?.index === "number" ? item.index : index + 1,
              startDate: item?.startDate ? String(item.startDate) : null,
              endDate: item?.endDate ? String(item.endDate) : null,
              adultPrice: Number(item?.adultPrice || 0),
              availableSlots: Number(item?.availableSlots || 0),
              status: String(item?.status || "open"),
            }))
            .filter((item: any) => item.tourId && item.departureId)
        : null,
      candidateTours: Array.isArray(source.candidateTours)
        ? source.candidateTours
            .map((item: any) => {
              const departures = Array.isArray(item?.departures)
                ? item.departures
                    .map((departure: any) => ({
                      departureId: String(departure?.departureId || ""),
                      departureDate: departure?.departureDate
                        ? String(departure.departureDate)
                        : null,
                      endDate: departure?.endDate
                        ? String(departure.endDate)
                        : null,
                      remainingSlots: Number(departure?.remainingSlots || 0),
                      status: String(departure?.status || ""),
                      adultPrice: Number(departure?.adultPrice || 0),
                    }))
                    .filter((departure: any) => departure.departureId)
                : [];
              return {
                tourId: String(item?.tourId || ""),
                departureIds: departures.map(
                  (departure: any) => departure.departureId,
                ),
                departures,
              };
            })
            .filter((item: any) => item.tourId && item.departures.length)
        : null,
      selectedCandidateTourId:
        typeof source.selectedCandidateTourId === "string"
          ? source.selectedCandidateTourId
          : null,
      bookingContext: this.toBookingContext((source as any).bookingContext),
      bookingDraft:
        source.bookingDraft && typeof source.bookingDraft === "object"
          ? (source.bookingDraft as ChatBookingDraft)
          : null,
      refundDraft:
        source.refundDraft && typeof source.refundDraft === "object"
          ? (source.refundDraft as ChatRefundDraft)
          : null,
      lastFailedTourSearch:
        source.lastFailedTourSearch &&
        typeof source.lastFailedTourSearch === "object" &&
        !Array.isArray(source.lastFailedTourSearch)
          ? {
              destinationId: (source.lastFailedTourSearch as any).destinationId
                ? String((source.lastFailedTourSearch as any).destinationId)
                : null,
              destinationName: (source.lastFailedTourSearch as any)
                .destinationName
                ? String((source.lastFailedTourSearch as any).destinationName)
                : null,
              durationDays:
                typeof (source.lastFailedTourSearch as any).durationDays ===
                "number"
                  ? Number((source.lastFailedTourSearch as any).durationDays)
                  : null,
              durationNights:
                typeof (source.lastFailedTourSearch as any).durationNights ===
                "number"
                  ? Number((source.lastFailedTourSearch as any).durationNights)
                  : null,
              departureFrom: (source.lastFailedTourSearch as any).departureFrom
                ? String((source.lastFailedTourSearch as any).departureFrom)
                : null,
              departureTo: (source.lastFailedTourSearch as any).departureTo
                ? String((source.lastFailedTourSearch as any).departureTo)
                : null,
              departureRangeLabel: (source.lastFailedTourSearch as any)
                .departureRangeLabel
                ? String(
                    (source.lastFailedTourSearch as any).departureRangeLabel,
                  )
                : null,
              requestedThemes: Array.isArray(
                (source.lastFailedTourSearch as any).requestedThemes,
              )
                ? (source.lastFailedTourSearch as any).requestedThemes
                    .map(String)
                    .filter(Boolean)
                : [],
            }
          : null,
      lastBookingCode:
        typeof source.lastBookingCode === "string"
          ? source.lastBookingCode
          : null,
      lastBookingPaymentStatus:
        typeof source.lastBookingPaymentStatus === "string"
          ? source.lastBookingPaymentStatus
          : null,
    };
  }

  private mergeMemory(current: MemoryState, next: MemoryState): MemoryState {
    const merged: MemoryState = { ...current };

    for (const [key, value] of Object.entries(next) as Array<
      [keyof MemoryState, MemoryState[keyof MemoryState]]
    >) {
      if (value !== undefined && value !== "") {
        merged[key] = value as never;
      }
    }

    return merged;
  }

  private toBookingContext(input: unknown): ChatBookingContext | null {
    if (!input || typeof input !== "object" || Array.isArray(input))
      return null;
    const source = input as Record<string, any>;
    const states: ChatBookingState[] = [
      "IDLE",
      "SHOWING_TOUR_LIST",
      "WAITING_TOUR_SELECTION",
      "WAITING_DEPARTURE_SELECTION",
      "WAITING_BOOKING_CONFIRMATION",
      "BOOKING_REDIRECT_READY",
    ];
    const state = states.includes(source.state) ? source.state : "IDLE";
    const displayedTours = Array.isArray(source.displayedTours)
      ? source.displayedTours
          .map((item: any, index: number) => ({
            index: Number(item?.index || index + 1),
            tourId: String(item?.tourId || ""),
            slug: item?.slug ? String(item.slug) : undefined,
            name: String(item?.name || ""),
          }))
          .filter((item: any) => item.tourId)
      : [];
    const displayedDepartures = Array.isArray(source.displayedDepartures)
      ? source.displayedDepartures
          .map((item: any, index: number) => ({
            index: Number(item?.index || index + 1),
            departureId: String(item?.departureId || ""),
            departureDate: item?.departureDate
              ? String(item.departureDate)
              : null,
            availableSeats: Number(item?.availableSeats || 0),
            status: String(item?.status || ""),
            adultPrice:
              item?.adultPrice === undefined
                ? undefined
                : Number(item.adultPrice || 0),
          }))
          .filter((item: any) => item.departureId)
      : [];

    return {
      state,
      displayedTours,
      selectedTourId: source.selectedTourId
        ? String(source.selectedTourId)
        : undefined,
      selectedTourName: source.selectedTourName
        ? String(source.selectedTourName)
        : undefined,
      selectedTourSlug: source.selectedTourSlug
        ? String(source.selectedTourSlug)
        : undefined,
      displayedDepartures,
      selectedDepartureId: source.selectedDepartureId
        ? String(source.selectedDepartureId)
        : undefined,
      selectedDepartureDate: source.selectedDepartureDate
        ? String(source.selectedDepartureDate)
        : undefined,
      updatedAt:
        typeof source.updatedAt === "string"
          ? source.updatedAt
          : new Date().toISOString(),
    };
  }

  private buildTourListBookingContext(cards: TourCard[]): ChatBookingContext {
    return {
      state: cards.length ? "WAITING_TOUR_SELECTION" : "IDLE",
      displayedTours: cards
        .slice(0, this.getMaxTourResults())
        .map((card, index) => ({
          index: index + 1,
          tourId: card.tourId,
          slug: card.slug,
          name: card.name,
        })),
      displayedDepartures: [],
      updatedAt: new Date().toISOString(),
    };
  }

  private tryBuildRuleOnlySelectionNlu(
    message: string,
    memory: MemoryState,
    fallbackIntent: string,
    fallbackEntities: MemoryState,
  ): NluResult | null {
    const context = memory.bookingContext;
    if (!context || this.isBookingContextExpired(context)) return null;
    if (this.isFreshTourSearchRequest(message)) return null;

    const state = context.state;
    const ordinal =
      state === "WAITING_DEPARTURE_SELECTION"
        ? this.extractOrdinalSelection(
            message,
            context.displayedDepartures.length,
          )
        : this.extractOrdinalSelection(message, context.displayedTours.length);

    if (
      state === "WAITING_DEPARTURE_SELECTION" &&
      this.isChangeTourRequest(message)
    ) {
      return {
        intent: "booking_create",
        entities: this.memoryToNluEntities(fallbackEntities),
        confidence: 1,
        raw: { ruleOnly: true, bookingState: state, action: "change_tour" },
      };
    }

    if (
      state === "WAITING_BOOKING_CONFIRMATION" &&
      (this.isBookingConfirmationMessage(message) ||
        this.isChangeDepartureRequest(message))
    ) {
      return {
        intent: "booking_create",
        entities: this.memoryToNluEntities(fallbackEntities),
        confidence: 1,
        raw: { ruleOnly: true, bookingState: state },
      };
    }

    if (ordinal == null) return null;

    if (
      state === "WAITING_DEPARTURE_SELECTION" ||
      state === "WAITING_TOUR_SELECTION" ||
      state === "SHOWING_TOUR_LIST"
    ) {
      return {
        intent: "booking_create",
        entities: this.memoryToNluEntities(fallbackEntities),
        confidence: 1,
        raw: { ruleOnly: true, bookingState: state, ordinal },
      };
    }

    return null;
  }

  private stripText(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeBookingPaymentMethod(_value?: unknown): "bank_transfer" {
    return "bank_transfer";
  }

  private isUnsupportedPaymentMethod(message: string) {
    const normalized = this.stripText(message);

    return /\b(momo|vi momo|ví momo|vnpay|vn pay|the|card|visa|mastercard|tien mat|tiền mặt|cash|zalopay|zalo pay)\b/.test(
      normalized,
    );
  }

  private buildOnlyBankTransferAnswer() {
    return [
      "Hiện Travela chỉ hỗ trợ thanh toán bằng chuyển khoản ngân hàng qua mã QR.",
      "Mình sẽ dùng phương thức thanh toán chuyển khoản ngân hàng cho booking này nha.",
    ].join("\n");
  }

  private isBookingConfirmationMessage(message: string) {
    const normalized = this.stripText(message);
    return /\b(xac nhan dat|xac nhan booking|xac nhan don|dong y dat|dong y tao|dat luon|chot don|chot booking|chot tour|tao booking|tao don|ok dat|oke dat|confirm)\b/.test(
      normalized,
    );
  }

  private wantsBestVoucher(message: string) {
    const normalized = this.stripText(message);
    return /\b(voucher tot nhat|ma tot nhat|ma giam gia tot nhat|ap voucher tot nhat|ap ma tot nhat|chon voucher tot nhat|giam nhieu nhat|ma nao tot|voucher nao tot|co ma nao tot|co voucher nao tot)\b/.test(
      normalized,
    );
  }

  private hasExplicitVoucherCodeSignal(message: string) {
    const normalized = this.stripText(message);

    // Các cụm này mới được xem là người dùng đang nhập mã khuyến mãi.
    // Cố tình không bắt cụm "ma" đứng một mình để tránh nhầm với "mã điểm đón".
    return /\b(voucher|coupon|ma giam gia|ma uu dai|ma voucher|code giam gia|khuyen mai|uu dai)\b/.test(
      normalized,
    );
  }

  private isVoucherInquiry(message: string) {
    const normalized = this.stripText(message);
    return /\b(toi co voucher nao|minh co voucher nao|co voucher nao|co ma giam gia nao|voucher nao dung duoc|ma nao dung duoc|kiem tra voucher|xem voucher|danh sach voucher|voucher cua toi|ma giam gia cua toi|uu dai cua toi|khuyen mai nao)\b/.test(
      normalized,
    );
  }

  private isVoucherApplicationMessage(message: string) {
    const normalized = this.stripText(message);
    return /\b(dung voucher|ap voucher|su dung voucher|nhap voucher|chon voucher|dung ma giam gia|ap ma giam gia|su dung ma giam gia|ma voucher|coupon|khong dung voucher|khong co voucher|bo qua voucher|voucher tot nhat|ma giam gia tot nhat|ap ma tot nhat)\b/.test(
      normalized,
    );
  }

  private isFreshTourAdviceMessage(message: string) {
    const normalized = this.stripText(message);
    return (
      this.isFreshTourSearchRequest(message) ||
      /\b(toi muon di|minh muon di|muon di|toi muon tour|minh muon tour|can tim|tim tour|goi y|de xuat|ngan sach|di bien|nghi duong|it di chuyen|khach san tot|chup hinh|check in|song ao|mat me|nhe nhang|phu hop cho gia dinh|phu hop gia dinh)\b/.test(
        normalized,
      )
    );
  }

  private calculateBookingAmount(
    departure: any,
    adultCount: number,
    childCount: number,
  ) {
    return (
      Number(departure?.adultPrice || 0) * adultCount +
      Number(departure?.childPrice || 0) * childCount
    );
  }

  private calculateVoucherDiscount(voucher: any, amount: number) {
    if (!voucher || amount <= 0) return 0;
    const minOrderAmount = Number(voucher.minOrderAmount || 0);
    if (amount < minOrderAmount) return 0;
    const type = String(voucher.discountType || "percent").toLowerCase();
    const value = Number(voucher.discountValue || 0);
    let discount =
      type === "fixed" || type === "amount" ? value : (amount * value) / 100;
    const maxDiscount = Number(voucher.maxDiscount || 0);
    if (maxDiscount > 0) discount = Math.min(discount, maxDiscount);
    return Math.max(0, Math.min(amount, Math.round(discount)));
  }

  /**
   * Hiển thị mô tả mức giảm của voucher.
   * Chỉ dùng để format text, không thay đổi logic tính/validate voucher.
   */
  private formatVoucherDiscount(voucher: any) {
    if (!voucher) return "";

    const discountType = String(
      voucher.discountType || voucher.discount_type || "percent",
    ).toLowerCase();

    const discountValue = Number(
      voucher.discountValue || voucher.discount_value || 0,
    );

    const maxDiscount = Number(
      voucher.maxDiscount || voucher.max_discount || 0,
    );

    if (discountType === "fixed" || discountType === "amount") {
      return `Giảm ${this.formatCurrency(discountValue)}`;
    }

    return `Giảm ${discountValue}%${
      maxDiscount ? ` tối đa ${this.formatCurrency(maxDiscount)}` : ""
    }`;
  }

  private async validateVoucherForBooking(
    user: AuthUser,
    voucherCode: string,
    amount: number,
  ): Promise<{
    valid: boolean;
    voucher?: any;
    discount: number;
    reason?: string;
  }> {
    const code = String(voucherCode || "")
      .trim()
      .toUpperCase();

    if (!code) {
      return {
        valid: false,
        discount: 0,
        reason: "Mã voucher không hợp lệ.",
      };
    }

    if (!user?.userId) {
      return {
        valid: false,
        discount: 0,
        reason: "Bạn cần đăng nhập để sử dụng voucher trong tài khoản.",
      };
    }

    const db = this.prisma as any;
    if (!db.userVoucher) {
      return {
        valid: false,
        discount: 0,
        reason: "Hệ thống chưa thể kiểm tra voucher trong tài khoản.",
      };
    }

    const now = new Date();
    const owned = await db.userVoucher.findFirst({
      where: {
        userId: user.userId,
        status: "available",
        voucher: {
          code,
          status: "active",
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: { voucher: true },
    });

    if (!owned?.voucher) {
      return {
        valid: false,
        discount: 0,
        reason: `Voucher ${code} không có trong tài khoản, đã được sử dụng hoặc hiện không còn khả dụng.`,
      };
    }

    const voucher = owned.voucher;
    const minOrderAmount = Number(voucher.minOrderAmount || 0);

    if (amount < minOrderAmount) {
      return {
        valid: false,
        voucher,
        discount: 0,
        reason: `Voucher ${code} yêu cầu đơn tối thiểu ${this.formatCurrency(
          minOrderAmount,
        )}.`,
      };
    }

    const discount = this.calculateVoucherDiscount(voucher, amount);

    if (discount <= 0) {
      return {
        valid: false,
        voucher,
        discount: 0,
        reason: `Voucher ${code} hiện không tạo được mức giảm hợp lệ cho booking này.`,
      };
    }

    return {
      valid: true,
      voucher,
      discount,
    };
  }

  private async findEligibleVouchersForBooking(
    user: AuthUser,
    amount: number,
  ): Promise<
    Array<{
      code: string;
      name: string;
      description: string | null;
      discountText: string;
      minOrderAmount: number;
      endDate: string | null;
      status: string;
      discountAmount: number;
    }>
  > {
    if (!user?.userId || amount <= 0) return [];

    const db = this.prisma as any;
    if (!db.userVoucher) return [];

    const now = new Date();

    const rows = await db.userVoucher.findMany({
      where: {
        userId: user.userId,
        status: "available",
        voucher: {
          status: "active",
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: { voucher: true },
      take: 50,
    });

    return rows
      .map((row: any) => {
        const voucher = row?.voucher;
        if (!voucher) return null;

        const minOrderAmount = Number(voucher.minOrderAmount || 0);
        const discountAmount = this.calculateVoucherDiscount(voucher, amount);

        // Chỉ voucher THỰC SỰ áp dụng được cho giá trị booking hiện tại:
        // - đơn đạt minOrderAmount
        // - tính ra discount > 0
        if (amount < minOrderAmount || discountAmount <= 0) {
          return null;
        }

        return {
          code: String(voucher.code || "").toUpperCase(),
          name: String(voucher.name || voucher.code || "Voucher"),
          description: voucher.description ? String(voucher.description) : null,
          discountText: this.formatVoucherDiscount(voucher),
          minOrderAmount,
          endDate: voucher.endDate
            ? new Date(voucher.endDate).toISOString()
            : null,
          status: String(voucher.status || "active"),
          discountAmount,
        };
      })
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          Number(b.discountAmount || 0) - Number(a.discountAmount || 0),
      );
  }

  private async findBestVoucherForBooking(user: AuthUser, amount: number) {
    if (!user?.userId || amount <= 0) return null;
    const db = this.prisma as any;
    if (!db.userVoucher) return null;
    const now = new Date();
    const rows = await db.userVoucher.findMany({
      where: {
        userId: user.userId,
        status: "available",
        voucher: {
          status: "active",
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: { voucher: true },
      take: 20,
    });
    return (
      rows
        .map((row: any) => ({
          voucher: row.voucher,
          discount: this.calculateVoucherDiscount(row.voucher, amount),
        }))
        .filter((item: any) => item.discount > 0)
        .sort((a: any, b: any) => b.discount - a.discount)[0] || null
    );
  }

  private buildBookingPreviewAnswer(input: {
    tour: any;
    departure: any;
    pickup: any;
    adultCount: number;
    childCount: number;
    originalAmount: number;
    discountAmount: number;
    finalAmount: number;
    voucherCode?: string | null;
    paymentMethod?: string | null;
    replacingBookingCode?: string | null;
    passengerLines?: string[];
  }) {
    const {
      tour,
      departure,
      pickup,
      adultCount,
      childCount,
      originalAmount,
      discountAmount,
      finalAmount,
      voucherCode,
      paymentMethod,
      replacingBookingCode,
      passengerLines,
    } = input;
    return [
      replacingBookingCode
        ? `Mình sẽ hủy booking cũ ${replacingBookingCode} và tạo lại mã QR mới với thông tin đã đổi. Bạn kiểm tra lại trước khi xác nhận nha:`
        : "Mình tóm tắt booking trước khi tạo mã QR để tránh đặt nhầm nha:",
      "",
      `Tour: ${tour.name}`,
      `Ngày khởi hành: ${this.formatDate(new Date(departure.departureDate).toISOString())}`,
      `Số khách: ${adultCount} người lớn${childCount ? `, ${childCount} trẻ em` : ""}`,
      passengerLines?.length
        ? ["", "Thông tin hành khách:", ...passengerLines].join("\n")
        : null,
      pickup
        ? `Điểm đón: ${pickup.name} - ${pickup.address}`
        : "Điểm đón: Travela sẽ liên hệ xác nhận",
      voucherCode
        ? `Voucher: ${voucherCode}${discountAmount ? `, giảm ${this.formatCurrency(discountAmount)}` : ""}`
        : "Voucher: không dùng",
      `Thanh toán: chuyển khoản ngân hàng qua mã QR`,
      `Tạm tính: ${this.formatCurrency(originalAmount)}`,
      discountAmount
        ? `Giảm giá: -${this.formatCurrency(discountAmount)}`
        : null,
      `Tổng cần thanh toán: ${this.formatCurrency(finalAmount)}`,
      "",
      "Bạn kiểm tra lại thông tin rồi chọn “Xác nhận đặt” bên dưới. Nếu cần chỉnh, bạn có thể đổi số khách, điểm đón hoặc voucher trước khi tạo booking.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private extractMemory(message: string, current: MemoryState): MemoryState {
    const normalized = this.stripText(message);

    const isActiveBookingSubstep =
      Boolean(current.bookingDraft?.started && current.bookingDraft?.tourId) &&
      (/\b(chon diem don|diem don ma|ma diem don|pickup)\b/.test(normalized) ||
        /\b(voucher|ma giam gia|khong dung voucher|dung voucher|ap voucher)\b/.test(
          normalized,
        ) ||
        this.isPartySizeMessage(message) ||
        /\b(xac nhan thong tin hanh khach|nguoi lon\s*\d+\s*ho ten|tre em\s*\d+\s*ho ten)\b/.test(
          normalized,
        ) ||
        /\b(xac nhan dat|xac nhan booking|thanh toan|qr|vietqr|sepay|chuyen khoan)\b/.test(
          normalized,
        ));

    const parsedDestination = isActiveBookingSubstep
      ? null
      : this.detectDestination(normalized);
    const isUnsupportedDestination =
      this.mentionsUnsupportedDestination(normalized);

    const mentionsHotel =
      /\b(khach san|sao|resort|cao cap|premium|luu tru|tien nghi)\b/.test(
        normalized,
      );

    const extractedBookingDraft = this.extractBookingDraft(message, current);
    const extractedRefundDraft = this.extractRefundDraft(message, current);

    const parsedBudget = this.parseBudget(normalized);
    const parsedDuration = this.parseDurationDays(normalized);
    const parsedDurationNights = this.parseDurationNights(normalized);
    const parsedMonth = this.parseDepartureMonth(normalized);

    const isSearchContext = ["tour_search", "personal_recommendation"].includes(
      String(current.intent || ""),
    );

    const isMonthOnlySearchContinuation =
      Boolean(parsedMonth) &&
      /^(?:(?:con|the|vay|roi)\s+)?thang\s+\d{1,2}(?:\s+(?:thi sao|sao|nua))?$/i.test(
        normalized,
      ) &&
      ["tour_search", "personal_recommendation", "follow_up"].includes(
        String(current.intent || ""),
      );

    const isSearchRefinement =
      isSearchContext &&
      Boolean(
        parsedBudget ||
        parsedDuration ||
        parsedMonth ||
        this.parsePartySize(normalized) ||
        /\b(toi muon di|minh muon di|muon di|tour|ngan sach|gia|ngay|dem|nguoi|bien|nghi duong|gia dinh|tre em|tre nho|mat me|chup hinh)\b/.test(
          normalized,
        ),
      );

    // Không đưa bookingDraft=null vào mergeMemory.
    // Nếu câu hiện tại chỉ là "kiểm tra voucher của tôi", "voucher nào dùng được"...
    // thì draft booking đang làm dở phải được giữ nguyên.
    // Việc xóa draft chỉ thực hiện có chủ đích ở routing/state-machine.
    //
    // Với câu rút gọn kiểu "còn tháng 10", chỉ thay tháng.
    // Các điều kiện tìm kiếm trước đó (ngân sách, số ngày, loại tour, nhu cầu...)
    // vẫn được giữ để hội thoại có tính liên tục.
    return {
      destination: isUnsupportedDestination
        ? null
        : isActiveBookingSubstep
          ? (current.destination ?? null)
          : (parsedDestination ??
            (isMonthOnlySearchContinuation || isSearchRefinement
              ? (current.destination ?? null)
              : null)),

      budgetMax:
        parsedBudget ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.budgetMax ?? null)
          : null),

      durationDays:
        parsedDuration ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.durationDays ?? null)
          : null),

      durationNights:
        parsedDurationNights ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.durationNights ?? null)
          : null),

      departureMonth:
        parsedMonth ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.departureMonth ?? null)
          : null),

      partySize:
        this.parsePartySize(normalized) ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.partySize ?? null)
          : null),

      hotelStars: mentionsHotel
        ? this.parseHotelStars(normalized)
        : isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.hotelStars ?? null)
          : null,

      tourType:
        this.detectTourType(normalized) ??
        (isMonthOnlySearchContinuation || isSearchRefinement
          ? (current.tourType ?? null)
          : null),

      softNeeds:
        this.detectSoftNeeds(normalized).length > 0
          ? this.detectSoftNeeds(normalized)
          : isMonthOnlySearchContinuation || isSearchRefinement
            ? current.softNeeds || []
            : [],

      avoidNeeds:
        this.detectAvoidNeeds(normalized).length > 0
          ? this.detectAvoidNeeds(normalized)
          : isMonthOnlySearchContinuation || isSearchRefinement
            ? current.avoidNeeds || []
            : [],
      ...(extractedBookingDraft ? { bookingDraft: extractedBookingDraft } : {}),
      ...(extractedRefundDraft ? { refundDraft: extractedRefundDraft } : {}),
    };
  }

  private memoryToNluEntities(memory: MemoryState): NluEntities {
    return {
      destination: memory.destination ?? null,
      budgetMax: memory.budgetMax ?? null,
      durationDays: memory.durationDays ?? null,
      departureMonth: memory.departureMonth ?? null,
      partySize: memory.partySize ?? null,
      hotelStars: memory.hotelStars ?? null,
      tourType: memory.tourType ?? null,
      softNeeds: memory.softNeeds || [],
      avoidNeeds: memory.avoidNeeds || [],
      paymentMethod: memory.bookingDraft?.paymentMethod ?? null,
      voucherCode: memory.bookingDraft?.voucherCode ?? null,
    };
  }

  private memoryFromNluEntities(
    entities: NluEntities = {},
    current: MemoryState,
  ): MemoryState {
    const next: MemoryState = {
      destination: entities.destination ?? undefined,
      budgetMax: entities.budgetMax ?? undefined,
      durationDays: entities.durationDays ?? undefined,
      departureMonth: entities.departureMonth ?? undefined,
      partySize: entities.partySize ?? undefined,
      hotelStars: entities.hotelStars ?? undefined,
      tourType: entities.tourType ?? undefined,
      softNeeds: this.mergeStringList(current.softNeeds, entities.softNeeds),
      avoidNeeds: this.mergeStringList(current.avoidNeeds, entities.avoidNeeds),
    };

    const hasPaymentSignal = Boolean(entities.paymentMethod);
    const hasVoucherSignal = Boolean(entities.voucherCode);

    if (hasPaymentSignal || hasVoucherSignal) {
      next.bookingDraft = {
        ...(current.bookingDraft || {}),
        ...(hasPaymentSignal
          ? { paymentMethod: "bank_transfer" as const }
          : {}),
        ...(hasVoucherSignal ? { voucherCode: entities.voucherCode } : {}),
      };
    }

    return next;
  }

  private mergeStringList(...lists: Array<string[] | undefined>) {
    return Array.from(
      new Set(
        lists
          .flatMap((list) => list || [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
  }

  private detectSoftNeeds(normalized: string) {
    const needs: string[] = [];
    if (/\b(gia dinh|ca nha|ba me|bo me)\b/.test(normalized))
      needs.push("family");
    if (/\b(tre nho|tre em|em be|be)\b/.test(normalized))
      needs.push("children");
    if (/\b(nguoi lon tuoi|ong ba|ba me lon tuoi)\b/.test(normalized))
      needs.push("elderly");
    if (/\b(nghi duong|thu gian|resort|chill)\b/.test(normalized))
      needs.push("relaxing");
    if (/\b(nhe nhang|khong met|it di chuyen|khong qua met)\b/.test(normalized))
      needs.push("light_schedule");
    if (/\b(bien|tam bien|hai san|nghi bien)\b/.test(normalized))
      needs.push("beach");
    if (/\b(dao|bien dao)\b/.test(normalized)) needs.push("island");
    if (/\b(chup hinh|song ao|check in|canh dep|view dep)\b/.test(normalized))
      needs.push("photo_spots");
    if (/\b(mat me|se lanh|san may|khong khi trong lanh)\b/.test(normalized))
      needs.push("cool_weather");
    if (/\b(am thuc|dac san|an ngon)\b/.test(normalized)) needs.push("food");
    if (/\b(van hoa|lich su|pho co|di tich)\b/.test(normalized))
      needs.push("culture");
    if (/\b(cao cap|sang|khach san tot|4 sao|5 sao|luxury)\b/.test(normalized))
      needs.push("luxury");
    return Array.from(new Set(needs));
  }

  private detectAvoidNeeds(normalized: string) {
    const avoid: string[] = [];
    if (
      /\b(khong trekking|khong leo nui|ngai leo nui|khong di bo nhieu)\b/.test(
        normalized,
      )
    )
      avoid.push("trekking");
    if (
      /\b(khong qua met|so met|it di chuyen|han che di chuyen)\b/.test(
        normalized,
      )
    )
      avoid.push("too_tired");
    return Array.from(new Set(avoid));
  }

  private normalizeGuestFullName(value: unknown) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[.;]+$/g, "")
      .trim();
  }

  private upsertGuestDraft(
    guests: ChatGuestDraft[],
    next: ChatGuestDraft,
  ): ChatGuestDraft[] {
    const existedIndex = guests.findIndex(
      (item) => item.guestType === next.guestType && item.index === next.index,
    );

    if (existedIndex >= 0) {
      const cloned = [...guests];

      cloned[existedIndex] = {
        ...cloned[existedIndex],
        ...next,
        fullName: next.fullName || cloned[existedIndex].fullName,
        idNumber: next.idNumber || cloned[existedIndex].idNumber,
        dateOfBirth: next.dateOfBirth || cloned[existedIndex].dateOfBirth,
        gender: next.gender || cloned[existedIndex].gender,
      };

      return cloned;
    }

    return [...guests, next];
  }

  private parseGuestDetailsFromMessage(
    message: string,
    draft: ChatBookingDraft,
  ): ChatGuestDraft[] {
    let guests = Array.isArray(draft.guests) ? [...draft.guests] : [];
    const raw = String(message || "");

    // Form chatbot gửi mỗi hành khách thành 1 dòng có cấu trúc.
    // Parser này chạy trước, parser câu tự nhiên cũ bên dưới vẫn được giữ lại.
    const structuredGuestPattern =
      /(?:^|\n)\s*(người\s*lớn|nguoi\s*lon|adult|trẻ\s*em|tre\s*em|child)\s*(\d+)\s*:\s*họ\s*tên\s*=\s*([^|\n]+)\|\s*ngày\s*sinh\s*=\s*(\d{4}-\d{2}-\d{2})\s*\|\s*giới\s*tính\s*=\s*(male|female|other)\s*\|\s*(?:cccd|hộ\s*chiếu|ho\s*chieu|id)\s*=\s*([A-Za-z0-9]{6,20})/gimu;

    let structuredMatch: RegExpExecArray | null;

    while ((structuredMatch = structuredGuestPattern.exec(raw))) {
      const typeRaw = this.stripText(structuredMatch[1]);
      const guestType: "adult" | "child" = /tre em|child/.test(typeRaw)
        ? "child"
        : "adult";
      const index = Number(structuredMatch[2]);
      const fullName = this.normalizeGuestFullName(structuredMatch[3]);

      if (index > 0 && fullName) {
        guests = this.upsertGuestDraft(guests, {
          guestType,
          index,
          fullName,
          dateOfBirth: String(structuredMatch[4] || "").trim(),
          gender: String(structuredMatch[5] || "")
            .trim()
            .toLowerCase(),
          idNumber: String(structuredMatch[6] || "").trim(),
        });
      }
    }

    const adultPattern =
      /(?:người\s*lớn|nguoi\s*lon|adult)\s*(\d+)\s*(?:tên\s*là|ten\s*la|:|-)?\s*([^,\n;|]+)/gi;

    const childPattern =
      /(?:trẻ\s*em|tre\s*em|bé|be|child)\s*(\d+)\s*(?:tên\s*là|ten\s*la|:|-)?\s*([^,\n;|]+)/gi;

    let match: RegExpExecArray | null;

    while ((match = adultPattern.exec(raw))) {
      const index = Number(match[1]);
      const fullName = this.normalizeGuestFullName(match[2])
        .replace(/^họ\s*tên\s*=\s*/i, "")
        .trim();

      if (index > 0 && fullName) {
        guests = this.upsertGuestDraft(guests, {
          guestType: "adult",
          index,
          fullName,
        });
      }
    }

    while ((match = childPattern.exec(raw))) {
      const index = Number(match[1]);
      const fullName = this.normalizeGuestFullName(match[2])
        .replace(/^họ\s*tên\s*=\s*/i, "")
        .trim();

      if (index > 0 && fullName) {
        guests = this.upsertGuestDraft(guests, {
          guestType: "child",
          index,
          fullName,
        });
      }
    }

    const secondAdultMatch = raw.match(
      /(?:người\s*thứ\s*hai|nguoi\s*thu\s*hai|người\s*2|nguoi\s*2)\s*(?:tên\s*là|ten\s*la|:|-)?\s*([^,\n;|]+)/i,
    );

    if (secondAdultMatch?.[1]) {
      guests = this.upsertGuestDraft(guests, {
        guestType: "adult",
        index: 2,
        fullName: this.normalizeGuestFullName(secondAdultMatch[1])
          .replace(/^họ\s*tên\s*=\s*/i, "")
          .trim(),
      });
    }

    return guests.filter((item) => this.normalizeGuestFullName(item.fullName));
  }

  private getMissingPassengerSlots(
    draft: ChatBookingDraft,
    adultCount: number,
    childCount: number,
  ) {
    const guests = Array.isArray(draft.guests) ? draft.guests : [];

    const missing: Array<{
      guestType: "adult" | "child";
      index: number;
    }> = [];

    const isComplete = (item?: ChatGuestDraft | null) =>
      Boolean(
        item &&
        this.normalizeGuestFullName(item.fullName) &&
        String(item.dateOfBirth || "").trim() &&
        ["male", "female", "other"].includes(
          String(item.gender || "")
            .trim()
            .toLowerCase(),
        ) &&
        /^[A-Za-z0-9]{6,20}$/.test(String(item.idNumber || "").trim()),
      );

    for (let i = 1; i <= adultCount; i += 1) {
      const found = guests.find(
        (item) => item.guestType === "adult" && item.index === i,
      );
      if (!isComplete(found)) {
        missing.push({ guestType: "adult", index: i });
      }
    }

    for (let i = 1; i <= childCount; i += 1) {
      const found = guests.find(
        (item) => item.guestType === "child" && item.index === i,
      );
      if (!isComplete(found)) {
        missing.push({ guestType: "child", index: i });
      }
    }

    return missing;
  }

  private buildPassengerInfoQuestion(
    tourName: string,
    draft: ChatBookingDraft,
    adultCount: number,
    childCount: number,
  ) {
    const missing = this.getMissingPassengerSlots(
      draft,
      adultCount,
      childCount,
    );

    if (!missing.length) return "";

    return [
      `Mình đã ghi nhận tour ${tourName} cho ${adultCount} người lớn${
        childCount ? `, ${childCount} trẻ em` : ""
      }.`,
      "",
      "Vui lòng kiểm tra và bổ sung thông tin hành khách trong biểu mẫu bên dưới.",
      "Người lớn 1 là người đặt tour: thông tin có sẵn trong hồ sơ đã được điền tự động; mục nào còn thiếu bạn chỉ cần nhập bổ sung.",
      "Mỗi hành khách cần đủ: họ tên, ngày sinh, giới tính và CCCD/hộ chiếu.",
    ].join("\n");
  }

  private buildGuestSummaryLines(
    draft: ChatBookingDraft,
    contactName: string,
    adultCount: number,
    childCount: number,
  ) {
    const guests = Array.isArray(draft.guests) ? draft.guests : [];
    const lines: string[] = [];

    const firstAdult = guests.find(
      (item) => item.guestType === "adult" && item.index === 1,
    );
    lines.push(
      `- Người lớn 1: ${
        this.normalizeGuestFullName(firstAdult?.fullName) || contactName
      }`,
    );

    for (let i = 2; i <= adultCount; i += 1) {
      const guest = guests.find(
        (item) => item.guestType === "adult" && item.index === i,
      );

      lines.push(`- Người lớn ${i}: ${guest?.fullName || "chưa cung cấp"}`);
    }

    for (let i = 1; i <= childCount; i += 1) {
      const guest = guests.find(
        (item) => item.guestType === "child" && item.index === i,
      );

      lines.push(`- Trẻ em ${i}: ${guest?.fullName || "chưa cung cấp"}`);
    }

    return lines;
  }

  private buildGuestsForBooking(input: {
    draft: ChatBookingDraft;
    contactName: string;
    accountIdentityNumber?: string | null;
    accountBirthDate?: Date | string | null;
    accountGender?: string | null;
    adultCount: number;
    childCount: number;
  }) {
    const {
      draft,
      contactName,
      accountIdentityNumber,
      accountBirthDate,
      accountGender,
      adultCount,
      childCount,
    } = input;

    const draftGuests = Array.isArray(draft.guests) ? draft.guests : [];

    const guests: Array<{
      fullName: string;
      dateOfBirth?: string;
      gender?: string;
      guestType: "adult" | "child";
      idNumber?: string;
    }> = [];

    const firstAdult = draftGuests.find(
      (item) => item.guestType === "adult" && item.index === 1,
    );

    guests.push({
      fullName:
        this.normalizeGuestFullName(firstAdult?.fullName) || contactName,
      dateOfBirth:
        firstAdult?.dateOfBirth ||
        (accountBirthDate
          ? new Date(accountBirthDate).toISOString().slice(0, 10)
          : undefined),
      gender: firstAdult?.gender || accountGender || undefined,
      guestType: "adult",
      idNumber: firstAdult?.idNumber || accountIdentityNumber || undefined,
    });

    for (let i = 2; i <= adultCount; i += 1) {
      const guest = draftGuests.find(
        (item) => item.guestType === "adult" && item.index === i,
      );

      guests.push({
        fullName:
          this.normalizeGuestFullName(guest?.fullName) ||
          `${contactName} - Người lớn ${i}`,
        dateOfBirth: guest?.dateOfBirth || undefined,
        gender: guest?.gender || undefined,
        guestType: "adult",
        idNumber: guest?.idNumber || undefined,
      });
    }

    for (let i = 1; i <= childCount; i += 1) {
      const guest = draftGuests.find(
        (item) => item.guestType === "child" && item.index === i,
      );

      guests.push({
        fullName:
          this.normalizeGuestFullName(guest?.fullName) ||
          `${contactName} - Trẻ em ${i}`,
        dateOfBirth: guest?.dateOfBirth || undefined,
        gender: guest?.gender || undefined,
        guestType: "child",
        idNumber: guest?.idNumber || undefined,
      });
    }

    return guests;
  }

  private extractBookingDraft(
    message: string,
    current: MemoryState,
  ): ChatBookingDraft | null {
    const normalized = this.stripText(message);
    const passengerInfoSignal =
      /\b(?:nguoi lon|người lớn|adult|tre em|trẻ em|child|be|bé)\s*\d+\s*(?::|-|ten la|tên là|la|là)?\s*[a-z]/i.test(
        normalized,
      );

    const rawMessage = String(message || "").trim();

    // Tin nhắn được gửi từ form thông tin hành khách.
    // Không được dùng các số CCCD/ngày sinh trong tin nhắn này để suy ra số khách.
    const structuredPassengerFormSignal =
      /xac nhan thong tin hanh khach/i.test(normalized) &&
      /(?:nguoi lon|tre em)\s*\d+\s*:\s*ho ten/i.test(normalized);

    const bareVoucherCodeSignal = Boolean(
      current.bookingDraft?.started &&
      /^(?=.{3,30}$)(?=.*[A-Z])[A-Z0-9_-]+$/i.test(rawMessage) &&
      !/^(ok|oke|co|khong|không|tiep_tuc|xac_nhan|dong_y)$/i.test(rawMessage),
    );

    const bookingFollowUpSignal =
      /\b(thanh toan|thanh toán|qr|vietqr|sepay|chuyen khoan|chuyển khoản|bank|momo|vnpay|vn pay|tien mat|tiền mặt|cash|the|card|chon|chọn|diem don|điểm đón|pickup|voucher|khong dung|không dùng|khong co voucher|không có voucher|bo qua|bỏ qua|tiep tuc|tiếp tục|xac nhan|xác nhận|dong y|đồng ý|ok|oke|doi thanh|đổi thành|doi so luong|đổi số lượng|doi so nguoi|đổi số người|them nguoi|thêm người|giam nguoi|giảm người|\d+\s*(nguoi|người|khach|khách|nguoi lon|người lớn|tre em|trẻ em))\b/.test(
        normalized,
      ) ||
      passengerInfoSignal ||
      bareVoucherCodeSignal;

    const hasBookingSignal =
      /\b(dat tour|dat cho|giu cho|chot tour|toi muon dat|muon dat tour|dat luon|thanh toan tour|tao booking|book tour|booking tour|lay tour|chon tour)\b/.test(
        normalized,
      ) ||
      ((Boolean(current.bookingDraft?.started) ||
        Boolean(current.lastTourId)) &&
        bookingFollowUpSignal);

    if (!hasBookingSignal) return null;

    const draft: ChatBookingDraft = {
      ...(current.bookingDraft || {}),
      started: true,
    };

    if (this.isBookingConfirmationMessage(message)) {
      draft.confirmed = true;
    }

    if (this.wantsBestVoucher(message)) {
      draft.skipVoucher = false;
      draft.voucherCode = "__BEST__";
      draft.confirmed = false;
    }

    const selectedTourOption = this.resolveTourChoiceFromMessage(
      message,
      current,
    );
    if (selectedTourOption) {
      draft.tourId = selectedTourOption.tourId;
      draft.departureId =
        selectedTourOption.departureId || draft.departureId || null;
    }

    if (!draft.tourId && current.lastTourId) draft.tourId = current.lastTourId;

    const selectedDepartureOption = this.resolveDepartureChoiceFromMessage(
      message,
      current,
    );
    if (selectedDepartureOption) {
      draft.tourId = selectedDepartureOption.tourId || draft.tourId || null;
      draft.departureId = selectedDepartureOption.departureId;
    }

    const departureMatch = normalized.match(
      /(?:lich|departure|dot|chuyen)\s*(?:so|id)?\s*(\d+)/,
    );
    if (departureMatch && !selectedDepartureOption)
      draft.departureId = departureMatch[1];

    const pickupMatch = normalized.match(
      /(?:diem don|pickup|điểm đón|ma diem don|mã điểm đón|chon diem don|chọn điểm đón)\s*(?:ma|mã|so|số|id)?\s*(\d+)/,
    );

    const pickupChooseMatch = normalized.match(
      /(?:chon|chọn)\s*(?:diem don|điểm đón|pickup)?\s*(?:ma|mã|so|số|id)?\s*(\d+)/,
    );

    if (pickupMatch) {
      draft.pickupPointId = pickupMatch[1];
    } else if (pickupChooseMatch) {
      draft.pickupPointId = pickupChooseMatch[1];
    }

    const pickupOrderMatch = normalized.match(
      /(?:chon|chọn)\s*(?:diem don|điểm đón|pickup)?\s*(?:so|số|ma|mã)?\s*(\d+)/,
    );
    if (pickupOrderMatch) draft.pickupPointId = pickupOrderMatch[1];

    const adultMatch = structuredPassengerFormSignal
      ? null
      : normalized.match(
          /(?:^|\b)(\d{1,2})\s*(?:nguoi lon|người lớn|adult|nguoi truong thanh|người trưởng thành|nl)\b/,
        );
    const childMatch = structuredPassengerFormSignal
      ? null
      : normalized.match(
          /(?:^|\b)(\d{1,2})\s*(?:tre em|trẻ em|child|em be|bé|em bé|be|te)\b/,
        );
    const peopleMatch = structuredPassengerFormSignal
      ? null
      : normalized.match(/(?:^|\b)(\d{1,2})\s*(?:nguoi|người|khach|khách)\b/);

    const previousAdultCount =
      current.bookingDraft?.adultCount == null
        ? null
        : Number(current.bookingDraft.adultCount);
    const previousChildCount =
      current.bookingDraft?.childCount == null
        ? null
        : Number(current.bookingDraft.childCount);

    if (adultMatch) {
      const parsedAdultCount = Number(adultMatch[1]);
      if (parsedAdultCount >= 1 && parsedAdultCount <= 20) {
        draft.adultCount = parsedAdultCount;
      }
    } else if (peopleMatch && !childMatch) {
      const parsedPeopleCount = Number(peopleMatch[1]);
      if (parsedPeopleCount >= 1 && parsedPeopleCount <= 20) {
        draft.adultCount = parsedPeopleCount;
      }
    }

    if (childMatch) {
      const parsedChildCount = Number(childMatch[1]);
      if (parsedChildCount >= 0 && parsedChildCount <= 20) {
        draft.childCount = parsedChildCount;
      }
    }
    if (draft.childCount == null) draft.childCount = 0;

    const countChanged =
      (Boolean(adultMatch || (peopleMatch && !childMatch)) &&
        previousAdultCount !== null &&
        Number(draft.adultCount) !== previousAdultCount) ||
      (Boolean(childMatch) &&
        previousChildCount !== null &&
        Number(draft.childCount) !== previousChildCount);

    if (countChanged) {
      const nextAdultCount = Math.max(1, Number(draft.adultCount || 1));
      const nextChildCount = Math.max(0, Number(draft.childCount || 0));

      draft.guests = (Array.isArray(draft.guests) ? draft.guests : []).filter(
        (guest) =>
          guest.guestType === "adult"
            ? guest.index >= 1 && guest.index <= nextAdultCount
            : guest.index >= 1 && guest.index <= nextChildCount,
      );

      draft.confirmed = false;
      draft.passengerInfoConfirmed = false;
    }

    draft.guests = this.parseGuestDetailsFromMessage(message, draft);

    if (
      /\b(xac nhan thong tin hanh khach|xac nhan thong tin khach|xac nhan hanh khach|du thong tin khach|dung thong tin khach|ok thong tin khach)\b/.test(
        normalized,
      )
    ) {
      draft.passengerInfoConfirmed = true;
    }
    const emailMatch = String(message).match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    );
    if (emailMatch) draft.contactEmail = emailMatch[0].toLowerCase();

    const phoneMatch = normalized.match(/\b(0\d{9,10})\b/);
    if (phoneMatch) draft.contactPhone = phoneMatch[1];

    const nameMatch = String(message).match(
      /(?:tên|ten|họ tên|ho ten)\s*(?:là|la|:)\s*([^,.;\n]+)/i,
    );
    if (nameMatch) draft.contactName = nameMatch[1].trim();

    // Chỉ nhận mã voucher khi người dùng nhắc rõ voucher/mã giảm giá.
    // Không dùng regex chung "MÃ 1234" vì sẽ bắt nhầm "điểm đón mã 1234" thành voucher.
    if (this.hasExplicitVoucherCodeSignal(message)) {
      const voucherMatch = String(message)
        .toUpperCase()
        .match(
          /(?:VOUCHER|COUPON|MÃ\s+GIẢM\s+GIÁ|MA\s+GIAM\s+GIA|MÃ\s+ƯU\s+ĐÃI|MA\s+UU\s+DAI|MÃ\s+VOUCHER|MA\s+VOUCHER)\s*(?:LÀ|LA|:|=|-)?\s*([A-Z0-9_\-]{3,30})/,
        );
      if (voucherMatch) {
        draft.voucherCode = voucherMatch[1];
        draft.skipVoucher = false;
        draft.confirmed = false;
      }
    } else if (bareVoucherCodeSignal) {
      // Khi đang có booking active, cho phép user chỉ nhắn "BRONZE4X".
      draft.voucherCode = rawMessage.toUpperCase();
      draft.skipVoucher = false;
      draft.confirmed = false;
    }

    if (
      /\b(khong dung voucher|khong co voucher|bo qua voucher|khong ap voucher|khong dung ma|khong co ma|bo qua ma)\b/.test(
        normalized,
      )
    ) {
      draft.skipVoucher = true;
    }

    if (
      /\b(tiep tuc|xac nhan|dong y|ok|oke)\b/.test(normalized) &&
      /\b(thanh toan|momo|vnpay|vn pay|chuyen khoan|bank|tien mat|cash)\b/.test(
        normalized,
      ) &&
      !draft.voucherCode
    ) {
      draft.skipVoucher = true;
    }

    if (
      /\b(khong dung voucher|khong co voucher|bo qua voucher|khong ap voucher|khong dung ma|khong co ma|khong dung khuyen mai)\b/.test(
        normalized,
      )
    ) {
      draft.skipVoucher = true;
      draft.voucherCode = null;
      draft.confirmed = false;
    }

    if (
      /\b(thanh toan|thanh toán|chuyen khoan|chuyển khoản|bank|qr|vietqr|sepay|momo|vi momo|ví momo|vnpay|vn pay|tien mat|tiền mặt|cash|the|card|visa|mastercard)\b/.test(
        normalized,
      )
    ) {
      draft.paymentMethod = "bank_transfer";
    }
    return draft;
  }

  private isNumberedTourReference(message: string) {
    const normalized = this.stripText(message);
    return /\btour\s*(?:so|số)?\s*\d+\b/.test(normalized);
  }

  private extractOrdinalSelection(
    message: string,
    max?: number,
  ): number | null {
    const normalized = this.stripText(message);
    const digit = normalized.match(
      /\b(?:so|s0|thu|stt|tour|lich|ngay|chon|dat|lay)?\s*(\d{1,2})\b/,
    );
    if (digit) return Number(digit[1]);

    const wordMap: Array<[RegExp, number | "last"]> = [
      [
        /\b(dau tien|thu nhat|so mot|mot|cai dau|tour dau|lich dau|ngay dau)\b/,
        1,
      ],
      [/\b(thu hai|so hai|hai|cai thu hai|lich thu hai|ngay thu hai)\b/, 2],
      [/\b(thu ba|so ba|ba|cai thu ba|lich thu ba|ngay thu ba)\b/, 3],
      [/\b(thu tu|so bon|bon|tu|cai thu tu)\b/, 4],
      [/\b(thu nam|so nam|nam|cai thu nam)\b/, 5],
      [/\b(cuoi cung|cuoi|sau cung|lich cuoi|ngay cuoi)\b/, "last"],
    ];
    for (const [pattern, value] of wordMap) {
      if (!pattern.test(normalized)) continue;
      if (value === "last") return max && max > 0 ? max : null;
      return value;
    }
    return null;
  }

  private isChangeTourRequest(message: string) {
    return /\b(doi tour|chon tour khac|quay lai danh sach|khong chon tour nay nua)\b/.test(
      this.stripText(message),
    );
  }

  private isChangeDepartureRequest(message: string) {
    return /\b(doi lich|chon ngay khac|chon lich khac|doi ngay)\b/.test(
      this.stripText(message),
    );
  }

  private isBookingContextExpired(context?: ChatBookingContext | null) {
    if (!context?.updatedAt) return true;
    const updatedAt = new Date(context.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) return true;
    return Date.now() - updatedAt > 30 * 60 * 1000;
  }

  private buildChoiceRangeText(count: number, noun: string) {
    if (count <= 0) return "";
    if (count === 1) return `${noun} số 1`;
    const indexes = Array.from({ length: count }, (_, index) => index + 1);
    return `${noun} số ${indexes.slice(0, -1).join(", ")} hoặc ${
      indexes[indexes.length - 1]
    }`;
  }

  private isFreshTourSearchRequest(message: string) {
    const normalized = this.stripText(message);
    const hasDestination =
      this.extractMentionedDestinations(normalized).length > 0;

    const hasTravelConstraints = Boolean(
      this.parseBudget(normalized) ||
      this.parseDurationDays(normalized) ||
      this.parseDurationNights(normalized) ||
      this.parseDepartureDateRange(normalized) ||
      /\b(ngan sach|gia|ngay|dem|nguoi|nguoi lon|tre em|tre nho|gia dinh|di cung|tuan nay|tuan sau|tuan toi|thang nay|thang sau|dau thang|giua thang|cuoi thang)\b/.test(
        normalized,
      ),
    );

    const hasFreshSearchPhrase =
      /\b(toi muon di|minh muon di|muon di|toi muon dat tour|minh muon dat tour|muon dat tour|tim tour|can tim tour|co tour nao|goi y tour|goi y cho toi|de xuat tour)\b/.test(
        normalized,
      ) ||
      (/\btour\b/.test(normalized) &&
        hasTravelConstraints &&
        !this.isNumberedTourReference(message) &&
        !/\b(tour nay|tour do|tour dau tien|tour tren)\b/.test(normalized));

    const isOnlyBookingStep =
      /\b(chon lich|lich so|chọn lịch|chon diem don|diem don ma|điểm đón mã|pickup|voucher|ma giam gia|khong dung voucher|thanh toan|momo|vnpay|vn pay|qr|chuyen khoan|xac nhan|xác nhận|dong y|đồng ý|bk\d{5,})\b/.test(
        normalized,
      ) && !hasDestination;

    return (
      (hasDestination || hasTravelConstraints) &&
      hasFreshSearchPhrase &&
      !isOnlyBookingStep
    );
  }

  private extractTourNamesFromAssistantText(content: string) {
    const names: string[] = [];
    const lines = String(content || "").split(/\r?\n/);

    for (const line of lines) {
      const match = line.match(/^\s*\d+[.)]\s*(.+?)(?::| - |,| —| –|$)/u);
      if (!match?.[1]) continue;
      const name = match[1].trim();
      if (/^tour\s+/i.test(name) && name.length >= 8) {
        names.push(name);
      }
    }

    return Array.from(new Set(names)).slice(0, 5);
  }

  private async restoreLastTourOptionsFromRecentMessages(
    memory: MemoryState,
    recentMessages: Array<{ role: string; content: string }>,
  ): Promise<MemoryState> {
    const latestAssistant = [...recentMessages]
      .reverse()
      .find(
        (item) =>
          item.role === "assistant" &&
          /\b1[.)]\s*tour\b/i.test(this.stripText(item.content || "")),
      );

    if (!latestAssistant) return memory;

    const names = this.extractTourNamesFromAssistantText(
      latestAssistant.content,
    );
    if (!names.length) return memory;

    const rows = await this.prisma.tour.findMany({
      where: {
        status: "published" as any,
        OR: names.map((name) => ({ name: { contains: name } as any })),
      } as any,
      include: {
        departures: {
          where: { status: { in: ["open", "full"] as any } },
          orderBy: { departureDate: "asc" },
          take: 1,
        },
      } as any,
      take: 10,
    });

    const options = names
      .map((name) => {
        const normalizedName = this.stripText(name);
        const row = rows.find(
          (tour: any) => this.stripText(tour.name || "") === normalizedName,
        );
        if (!row?.id) return null;
        return {
          tourId: String(row.id),
          departureId: row.departures?.[0]?.id
            ? String(row.departures[0].id)
            : null,
          name: String(row.name || name),
        };
      })
      .filter(Boolean) as NonNullable<MemoryState["lastTourOptions"]>;

    if (!options.length) return memory;

    return {
      ...memory,
      lastTourId: options[0].tourId,
      lastTourName: options[0].name,
      lastTourOptions: options,
    };
  }

  private isPartySizeMessage(message: string) {
    const normalized = this.stripText(message);

    // Tin nhắn form hành khách có CCCD/ngày sinh và nhãn "Người lớn 1",
    // không phải là câu thay đổi số lượng khách.
    if (
      /xac nhan thong tin hanh khach/.test(normalized) &&
      /(?:nguoi lon|tre em)\s*\d+\s*ho ten/.test(normalized)
    ) {
      return false;
    }

    return (
      /\b\d{1,2}\s*(?:nguoi lon|nguoi truong thanh|adult|nl)\b/.test(
        normalized,
      ) ||
      /\b\d{1,2}\s*(?:tre em|em be|be|child|te)\b/.test(normalized) ||
      /\b\d{1,2}\s*(?:nguoi|khach)\b/.test(normalized)
    );
  }

  private hasExplicitTourSelectionSignal(message: string) {
    const normalized = this.stripText(message);

    return (
      /\b(?:tour|dat tour|book tour|chon tour|lay tour|tour so|tour thu)\b/.test(
        normalized,
      ) ||
      /\b(?:dat|book|chon|lay)\s+(?:tour\s*)?(?:so|thu)?\s*\d+\b/.test(
        normalized,
      )
    );
  }

  private resolveTourChoiceFromMessage(message: string, memory: MemoryState) {
    const normalized = this.stripText(message);

    // "1 người lớn", "2 người lớn 1 trẻ em"... là dữ liệu số khách,
    // tuyệt đối không được hiểu thành "tour số 1/2".
    if (this.isPartySizeMessage(message)) {
      return null;
    }

    const activeBookingContext =
      memory.bookingContext &&
      !this.isBookingContextExpired(memory.bookingContext)
        ? memory.bookingContext
        : null;

    const waitingTourSelection = Boolean(
      activeBookingContext &&
      ["SHOWING_TOUR_LIST", "WAITING_TOUR_SELECTION"].includes(
        activeBookingContext.state,
      ),
    );

    const explicitTourSelection = this.hasExplicitTourSelectionSignal(message);

    // Chỉ cho phép resolve tour bằng số khi:
    // - đang thực sự chờ chọn tour; hoặc
    // - user nói rõ "tour số ...", "đặt tour ...".
    // Sau khi đã chọn lịch / đang nhập số khách, không được dùng số trần để chọn tour lại.
    if (!waitingTourSelection && !explicitTourSelection) {
      return null;
    }

    const contextOptions = waitingTourSelection
      ? activeBookingContext!.displayedTours.map((item) => ({
          tourId: item.tourId,
          departureId: null,
          name: item.name,
        }))
      : [];

    const options = contextOptions.length
      ? contextOptions
      : Array.isArray(memory.lastTourOptions)
        ? memory.lastTourOptions
        : [];

    if (!options.length) return null;

    let index: number | null = null;

    const ordinal = this.extractOrdinalSelection(message, options.length);
    if (ordinal != null) {
      index = ordinal - 1;
    }

    if (index == null) {
      const numberMatch = normalized.match(
        /(?:tour|chon tour|lay tour|dat tour|book tour)\s*(?:so|thu)?\s*(\d+)/,
      );
      if (numberMatch) {
        index = Number(numberMatch[1]) - 1;
      }
    }

    if (index == null && explicitTourSelection) {
      if (/\b(dau tien|thu nhat|so mot|tour dau)\b/.test(normalized)) index = 0;
      else if (/\b(thu hai|so hai|tour hai)\b/.test(normalized)) index = 1;
      else if (/\b(thu ba|so ba|tour ba)\b/.test(normalized)) index = 2;
      else if (/\b(thu tu|so bon|tour bon)\b/.test(normalized)) index = 3;
      else if (/\b(thu nam|so nam|tour nam)\b/.test(normalized)) index = 4;
    }

    if (index == null || index < 0 || index >= options.length) return null;

    return options[index];
  }

  private resolveTourChoicesFromMessage(message: string, memory: MemoryState) {
    const normalized = this.stripText(message);
    const options = Array.isArray(memory.lastTourOptions)
      ? memory.lastTourOptions
      : [];
    if (!options.length) return [];

    const indexes = new Set<number>();
    const re = /(?:tour\s*)?(?:so|số|thu|thứ)?\s*(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(normalized))) {
      const index = Number(match[1]) - 1;
      if (index >= 0 && index < options.length) indexes.add(index);
    }

    if (/\b(tour dau tien|tour mot|so mot|thu nhat)\b/.test(normalized))
      indexes.add(0);
    if (/\b(tour hai|so hai|thu hai)\b/.test(normalized)) indexes.add(1);
    if (/\b(tour ba|so ba|thu ba)\b/.test(normalized)) indexes.add(2);

    return Array.from(indexes)
      .map((index) => options[index])
      .filter(Boolean);
  }

  private resolveDepartureChoiceFromMessage(
    message: string,
    memory: MemoryState,
  ) {
    const normalized = this.stripText(message);
    const contextOptions =
      memory.bookingContext &&
      !this.isBookingContextExpired(memory.bookingContext) &&
      memory.bookingContext.state === "WAITING_DEPARTURE_SELECTION"
        ? memory.bookingContext.displayedDepartures.map((item) => ({
            tourId: memory.bookingContext?.selectedTourId || "",
            departureId: item.departureId,
            index: item.index,
            startDate: item.departureDate,
            endDate: null,
            adultPrice: Number(item.adultPrice || 0),
            availableSlots: item.availableSeats,
            status: item.status,
          }))
        : [];
    const options = contextOptions.length
      ? contextOptions
      : Array.isArray(memory.lastDepartureOptions)
        ? memory.lastDepartureOptions
        : [];
    if (!options.length) return null;

    let index: number | null = null;
    if (
      memory.bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
      !this.isBookingContextExpired(memory.bookingContext)
    ) {
      const ordinal = this.extractOrdinalSelection(message, options.length);
      if (ordinal != null) index = ordinal - 1;
    }

    const numberMatch = normalized.match(
      /(?:chon|lay|dat|lich|chuyen|dot|khoi hanh)\s*(?:lich|chuyen|dot)?\s*(?:so|thu)?\s*(\d+)/,
    );
    if (
      numberMatch &&
      /\b(lich|chuyen|dot|khoi hanh|ngay di|ngay khoi hanh)\b/.test(normalized)
    ) {
      index = Number(numberMatch[1]) - 1;
    }

    if (index == null) {
      if (
        /\b(lich dau tien|chuyen dau tien|dot dau tien|lich thu nhat|lich so mot)\b/.test(
          normalized,
        )
      )
        index = 0;
      else if (
        /\b(lich thu hai|chuyen thu hai|dot thu hai|lich so hai)\b/.test(
          normalized,
        )
      )
        index = 1;
      else if (
        /\b(lich thu ba|chuyen thu ba|dot thu ba|lich so ba)\b/.test(normalized)
      )
        index = 2;
      else if (
        /\b(lich thu tu|chuyen thu tu|dot thu tu|lich so bon)\b/.test(
          normalized,
        )
      )
        index = 3;
      else if (
        /\b(lich thu nam|chuyen thu nam|dot thu nam|lich so nam)\b/.test(
          normalized,
        )
      )
        index = 4;
    }

    if (index != null && index >= 0 && index < options.length) {
      return options[index];
    }

    const dateMatch = normalized.match(
      /(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*(?:[\/\-]\s*(\d{4}))?/,
    );
    if (dateMatch && /\b(lich|ngay|khoi hanh|di)\b/.test(normalized)) {
      const day = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const year = dateMatch[3]
        ? Number(dateMatch[3])
        : new Date().getFullYear();

      const matched = options.find((option) => {
        if (!option.startDate) return false;
        const date = new Date(option.startDate);
        return (
          date.getDate() === day &&
          date.getMonth() + 1 === month &&
          date.getFullYear() === year
        );
      });

      if (matched) return matched;
    }

    return null;
  }

  private detectDestination(normalized: string): string | null {
    for (const [destination, aliases] of Object.entries(DESTINATION_ALIASES)) {
      if (aliases.some((alias) => normalized.includes(this.stripText(alias)))) {
        return destination;
      }
    }
    return null;
  }

  private parseBudget(normalized: string): number | null {
    const millionMatch = normalized.match(
      /(?:duoi|toi da|max|khong qua|under)?\s*(\d+(?:[\.,]\d+)?)\s*(trieu|tr|cu|m)\b/,
    );
    if (millionMatch) {
      return Math.round(Number(millionMatch[1].replace(",", ".")) * 1_000_000);
    }

    const thousandMatch = normalized.match(
      /(?:duoi|toi da|max|khong qua|under)?\s*(\d+(?:[\.,]\d+)?)\s*(nghin|ngan|k)\b/,
    );
    if (thousandMatch) {
      return Math.round(Number(thousandMatch[1].replace(",", ".")) * 1_000);
    }

    const plainVndMatch = normalized.match(
      /(?:duoi|toi da|max|khong qua|under)?\s*(\d{5,9})\s*(?:d|dong|vnd)\b/,
    );
    if (plainVndMatch) return Number(plainVndMatch[1]);

    return null;
  }

  private parseDurationDays(normalized: string): number | null {
    const normalMatch = normalized.match(/(\d+)\s*(ngay|day|hom)/);
    if (normalMatch) return Number(normalMatch[1]);

    const compactMatch = normalized.match(/(\d+)\s*n\s*\d+\s*d/);
    if (compactMatch) return Number(compactMatch[1]);

    return null;
  }
  private parseDurationNights(normalized: string): number | null {
    const normalMatch = normalized.match(/(\d+)\s*(dem|night|nights)/);
    if (normalMatch) return Number(normalMatch[1]);

    const compactMatch = normalized.match(/\d+\s*n\s*(\d+)\s*d/);
    if (compactMatch) return Number(compactMatch[1]);

    return null;
  }

  private parsePartySize(normalized: string): number | null {
    const match = normalized.match(/(\d+)\s*(nguoi|ng|khach)/);
    return match ? Number(match[1]) : null;
  }

  private mentionsUnsupportedDestination(normalized: string) {
    return /\b(nhat ban|japan|han quoc|korea|trung quoc|china|thai lan|thailand|singapore|malaysia|chau au|europe|my|usa|uc|australia|phap|france|nuoc y|italy|italia)\b/.test(
      normalized,
    );
  }

  private parseHotelStars(normalized: string): number | null {
    const rangeMatch = normalized.match(
      /([3-5])\s*(?:den|toi|toi da|-)\s*([3-5])\s*(sao|star)/,
    );
    if (rangeMatch) {
      return Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
    }

    const aroundMatch = normalized.match(
      /(?:khoang|tu)\s*([3-5])\s*(?:den|toi|-)?\s*([3-5])?\s*(sao|star)/,
    );
    if (aroundMatch) {
      return Number(aroundMatch[1]);
    }

    const match = normalized.match(/([3-5])\s*(sao|star)/);
    return match ? Number(match[1]) : null;
  }

  private detectTourType(normalized: string): "group" | "private" | null {
    if (/(private|rieng|ca nhan|rieng tu)/.test(normalized)) return "private";
    if (/(group|doan|nhom|ghep)/.test(normalized)) return "group";
    return null;
  }

  private parseDepartureMonth(normalized: string): string | null {
    const now = new Date();
    if (normalized.includes("thang sau")) {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    }
    if (normalized.includes("thang nay")) {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    const yearMonth = normalized.match(
      /thang\s*(\d{1,2})(?:\s*\/\s*|\s+nam\s+)(\d{4})/,
    );
    if (yearMonth)
      return `${yearMonth[2]}-${String(Number(yearMonth[1])).padStart(2, "0")}`;
    const monthOnly = normalized.match(/thang\s*(\d{1,2})/);
    if (monthOnly) {
      const month = Number(monthOnly[1]);
      const year =
        month < now.getMonth() + 1 ? now.getFullYear() + 1 : now.getFullYear();
      return `${year}-${String(month).padStart(2, "0")}`;
    }
    return null;
  }

  private parseDepartureDateRange(
    normalized: string,
  ): { from: Date; to: Date; label: string } | null {
    const now = new Date();

    const startOfDay = (value: Date) => {
      const d = new Date(value);
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const endOfDay = (value: Date) => {
      const d = new Date(value);
      d.setHours(23, 59, 59, 999);
      return d;
    };

    const localDate = (year: number, month: number, day: number) =>
      new Date(year, month - 1, day, 0, 0, 0, 0);

    const daysInMonth = (year: number, month: number) =>
      new Date(year, month, 0).getDate();

    const labelDate = (value: Date) =>
      `${String(value.getDate()).padStart(2, "0")}/${String(
        value.getMonth() + 1,
      ).padStart(2, "0")}/${value.getFullYear()}`;

    const buildRange = (from: Date, to: Date) => ({
      from: startOfDay(from),
      to: endOfDay(to),
      label:
        labelDate(from) === labelDate(to)
          ? labelDate(from)
          : `${labelDate(from)} - ${labelDate(to)}`,
    });

    const resolveMonthYear = (
      month: number,
      explicitYear?: number | null,
    ): { month: number; year: number } | null => {
      if (!Number.isInteger(month) || month < 1 || month > 12) return null;

      if (explicitYear && explicitYear >= 2000 && explicitYear <= 2100) {
        return { month, year: explicitYear };
      }

      const currentMonth = now.getMonth() + 1;
      return {
        month,
        year: month < currentMonth ? now.getFullYear() + 1 : now.getFullYear(),
      };
    };

    // Ngày cụ thể: 15/8, 15-8-2026, ngày 15/8.
    const explicitDate = normalized.match(
      /\b(?:ngay\s*)?(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{4}))?\b/,
    );
    if (explicitDate) {
      const day = Number(explicitDate[1]);
      const resolved = resolveMonthYear(
        Number(explicitDate[2]),
        explicitDate[3] ? Number(explicitDate[3]) : null,
      );

      if (resolved) {
        const maxDay = daysInMonth(resolved.year, resolved.month);
        if (day >= 1 && day <= maxDay) {
          const date = localDate(resolved.year, resolved.month, day);
          return buildRange(date, date);
        }
      }
    }

    // "ngày 15 tháng 8", "ngày 15 tháng 8 năm 2026".
    const verbalDate = normalized.match(
      /\bngay\s*(\d{1,2})\s*thang\s*(\d{1,2})(?:\s*nam\s*(\d{4}))?\b/,
    );
    if (verbalDate) {
      const day = Number(verbalDate[1]);
      const resolved = resolveMonthYear(
        Number(verbalDate[2]),
        verbalDate[3] ? Number(verbalDate[3]) : null,
      );

      if (resolved) {
        const maxDay = daysInMonth(resolved.year, resolved.month);
        if (day >= 1 && day <= maxDay) {
          const date = localDate(resolved.year, resolved.month, day);
          return buildRange(date, date);
        }
      }
    }

    // Chuẩn tuần: Thứ Hai -> Chủ Nhật.
    const today = startOfDay(now);
    const currentDay = today.getDay();
    const daysFromMonday = currentDay === 0 ? 6 : currentDay - 1;
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - daysFromMonday);

    // "thứ 2 tuần này", "thứ hai tuần sau", "chủ nhật tuần tới".
    const weekdayWords: Array<{ pattern: RegExp; offset: number }> = [
      { pattern: /\bthu\s*(?:2|hai)\b/, offset: 0 },
      { pattern: /\bthu\s*(?:3|ba)\b/, offset: 1 },
      { pattern: /\bthu\s*(?:4|tu)\b/, offset: 2 },
      { pattern: /\bthu\s*(?:5|nam)\b/, offset: 3 },
      { pattern: /\bthu\s*(?:6|sau)\b/, offset: 4 },
      { pattern: /\bthu\s*(?:7|bay)\b/, offset: 5 },
      { pattern: /\bchu\s*nhat\b/, offset: 6 },
    ];

    const mentionsThisWeek = /\btuan\s*nay\b/.test(normalized);
    const mentionsNextWeek = /\btuan\s*(?:sau|toi|ke tiep)\b/.test(normalized);

    if (mentionsThisWeek || mentionsNextWeek) {
      const matchedWeekday = weekdayWords.find((item) =>
        item.pattern.test(normalized),
      );

      if (matchedWeekday) {
        const date = new Date(mondayThisWeek);
        date.setDate(
          mondayThisWeek.getDate() +
            (mentionsNextWeek ? 7 : 0) +
            matchedWeekday.offset,
        );
        return buildRange(date, date);
      }
    }

    // Cả tuần.
    if (mentionsNextWeek || /\bnext week\b/.test(normalized)) {
      const from = new Date(mondayThisWeek);
      from.setDate(from.getDate() + 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return buildRange(from, to);
    }

    if (mentionsThisWeek || /\bthis week\b/.test(normalized)) {
      const from = new Date(mondayThisWeek);
      const to = new Date(from);
      to.setDate(to.getDate() + 6);
      return buildRange(from, to);
    }

    // Đầu/giữa/cuối tháng.
    // Quy ước: đầu = 1-10, giữa = 11-20, cuối = 21-hết tháng.
    const monthPartMatch = normalized.match(
      /\b(dau|giua|cuoi)\s+thang\s+(nay|sau|\d{1,2})(?:\s*(?:\/|nam)\s*(\d{4}))?\b/,
    );
    if (monthPartMatch) {
      const part = monthPartMatch[1];
      const token = monthPartMatch[2];
      const explicitYear = monthPartMatch[3] ? Number(monthPartMatch[3]) : null;

      let month: number;
      let year: number;

      if (token === "nay") {
        month = now.getMonth() + 1;
        year = now.getFullYear();
      } else if (token === "sau") {
        const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        month = next.getMonth() + 1;
        year = next.getFullYear();
      } else {
        const resolved = resolveMonthYear(Number(token), explicitYear);
        if (!resolved) return null;
        month = resolved.month;
        year = resolved.year;
      }

      const lastDay = daysInMonth(year, month);
      const fromDay = part === "dau" ? 1 : part === "giua" ? 11 : 21;
      const toDay =
        part === "dau"
          ? Math.min(10, lastDay)
          : part === "giua"
            ? Math.min(20, lastDay)
            : lastDay;

      return buildRange(
        localDate(year, month, fromDay),
        localDate(year, month, toDay),
      );
    }

    // Cả tháng.
    if (/\bthang\s+nay\b/.test(normalized)) {
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      return buildRange(
        localDate(year, month, 1),
        localDate(year, month, daysInMonth(year, month)),
      );
    }

    if (/\bthang\s+sau\b/.test(normalized)) {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const year = next.getFullYear();
      const month = next.getMonth() + 1;
      return buildRange(
        localDate(year, month, 1),
        localDate(year, month, daysInMonth(year, month)),
      );
    }

    const numericMonth = normalized.match(
      /\bthang\s*(\d{1,2})(?:\s*(?:\/|nam)\s*(\d{4}))?\b/,
    );
    if (numericMonth) {
      const resolved = resolveMonthYear(
        Number(numericMonth[1]),
        numericMonth[2] ? Number(numericMonth[2]) : null,
      );

      if (resolved) {
        return buildRange(
          localDate(resolved.year, resolved.month, 1),
          localDate(
            resolved.year,
            resolved.month,
            daysInMonth(resolved.year, resolved.month),
          ),
        );
      }
    }

    return null;
  }

  private extractMentionedDestinations(normalized: string) {
    const found: string[] = [];

    for (const [destination, aliases] of Object.entries(DESTINATION_ALIASES)) {
      const candidates = [destination, ...aliases].map((item) =>
        this.stripText(item),
      );

      if (candidates.some((alias) => normalized.includes(alias))) {
        found.push(destination);
      }
    }

    return Array.from(new Set(found));
  }

  private isRefundPolicyQuestion(message: string) {
    const normalized = this.stripText(message);

    const hasPolicySignal =
      /\b(chinh sach|quy dinh|dieu kien|duoc hoan bao nhieu|hoan bao nhieu|muc hoan|ty le hoan|phi huy|bao lau duoc hoan|may ngay duoc hoan|truoc ngay khoi hanh)\b/.test(
        normalized,
      );

    const hasExplicitActionSignal =
      /\b(toi muon huy|muon huy|huy booking|huy don|huy ve|tao yeu cau hoan|gui yeu cau hoan|xin hoan tien|hoan cho toi|refund booking|request refund|xac nhan hoan)\b/.test(
        normalized,
      );

    return hasPolicySignal && !hasExplicitActionSignal;
  }

  private isExplicitRefundAction(message: string, memory: MemoryState) {
    const normalized = this.stripText(message);

    // Câu hỏi chính sách chỉ để tra cứu, tuyệt đối không được nối vào
    // refundDraft cũ rồi chuyển sang luồng yêu cầu mã booking/ngân hàng.
    if (this.isRefundPolicyQuestion(message)) return false;

    const hasBookingCode = /\bbk[a-z0-9-]+\b/i.test(normalized);
    const hasRefundWords =
      /\b(hoan|hoan tien|xin hoan|yeu cau hoan|gui yeu cau|xac nhan hoan|xac nhan hoan tien|dong y hoan|tiep tuc hoan|huy booking|huy don|refund)\b/.test(
        normalized,
      );

    if (hasBookingCode && hasRefundWords) return true;

    return Boolean(
      memory.refundDraft?.started &&
      /\b(hoan cho toi|hoan di|xac nhan|dong y|gui yeu cau|tiep tuc hoan|ngan hang|stk|so tai khoan|chu tai khoan)\b/.test(
        normalized,
      ),
    );
  }

  private detectIntent(
    message: string,
    memory: MemoryState,
    recentMessages: Array<{ role: string; content: string }>,
  ) {
    const normalized = this.stripText(message);

    const isPureSmallTalk =
      /^(xin chao|chao|hello|hi|helo|cam on|thanks|thank you|ban la ai|bot la ai|ban ho tro duoc gi|ban lam duoc gi)$/.test(
        normalized,
      );

    if (isPureSmallTalk) {
      return "small_talk";
    }

    const hasBookingCommand =
      /\b(dat tour|dat cho|giu cho|chot tour|toi muon dat|muon dat tour|dat luon|thanh toan tour|tao booking|book tour|booking tour)\b/.test(
        normalized,
      );

    const hasVoucherCommand =
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon|ma uu dai)\b/.test(
        normalized,
      );

    const hasBookingStatusCommand =
      /\b(booking|ma don|don cua toi|tinh trang don|trang thai don|da dat|thanh toan chua|don hang|kiem tra don|bk)\b/.test(
        normalized,
      );

    const hasPolicyCommand =
      /\b(huy|huy tour|huy don|huy booking|hoan tien|hoan lai tien|duoc hoan|co duoc hoan|co hoan duoc khong|lay lai tien|lay lai duoc|tra tien|refund|cancel|phi huy|mat coc|mat tien coc|doi lich|doi tour|doi thong tin|doi khach|doi nguoi|doi nguoi di|doi ten|doi sdt|doi so dien thoai|doi email|doi diem don|doi gio don|chinh sach|quy dinh|dieu kien hoan tien|du dieu kien hoan tien|bao lau duoc hoan|may ngay duoc hoan|truoc ngay khoi hanh|sat ngay di|48h|48 gio|cccd|cmnd|giay to)\b/.test(
        normalized,
      );

    const hasRefundCreateCommand =
      this.isExplicitRefundAction(message, memory) ||
      /\b(gui yeu cau hoan tien|tao yeu cau hoan tien|yeu cau hoan tien|toi muon hoan tien|muon hoan tien|xin hoan tien|hoan tien don|hoan tien booking|xac nhan hoan tien|refund booking|request refund)\b/.test(
        normalized,
      );

    const hasPickupCommand =
      /\b(diem don|don o dau|don tai dau|noi don|cho don|ben xe|pickup|xe don|gio don|dia diem don)\b/.test(
        normalized,
      );

    const hasCompareCommand =
      /\b(so sanh|khac nhau|nen chon tour nao|tour nao tot hon|tour nao hop hon|tour nao dang tien hon|tour nao tiet kiem hon|tour nao re hon|tour nao gia tot hon|tour nao nhe nhang hon)\b/.test(
        normalized,
      );

    const hasBookingChangeCommand =
      /\b(doi thong tin|sua booking|doi booking|doi diem don|doi so luong|doi so nguoi|them nguoi|giam nguoi|doi thanh|cap nhat booking|chinh sua booking|dat lai booking|tao booking moi)\b/.test(
        normalized,
      );

    // Ưu tiên tuyệt đối các câu đổi booking có mã BK hoặc có từ khóa đổi/sửa.
    // Tránh case: user đang có draft đặt tour, nhắn
    // “đổi booking BK... thành 2 người lớn” nhưng bị kéo vào booking_create
    // rồi bot hỏi điểm đón/tour cũ.
    const hasExplicitBookingChangeRequest =
      hasBookingChangeCommand ||
      (/\bbk\d{5,}\b/.test(normalized) &&
        /\b(doi|sua|cap nhat|thanh|them|giam)\b/.test(normalized));

    // Nếu đang trong draft đặt tour chưa tạo QR, câu “đổi thành 2 người lớn”
    // là chỉnh draft hiện tại, không phải đổi booking đã tồn tại.
    if (
      hasExplicitBookingChangeRequest &&
      !(memory.bookingDraft?.started && !/\bbk\d{5,}\b/.test(normalized))
    ) {
      return "booking_change";
    }

    // Câu hỏi "Tôi có voucher nào?" là tra cứu voucher, không phải tiếp tục booking.
    // Chỉ các câu áp mã rõ ràng như "dùng voucher SALE10" mới đi vào booking flow.
    if (hasVoucherCommand && this.isVoucherInquiry(message)) {
      return "voucher_check";
    }

    // User có thể đang bị kẹt draft/lịch cũ nhưng lại bắt đầu nhu cầu mới:
    // “Tôi muốn đặt tour Đà Lạt cho 2 người lớn...” phải tìm tour Đà Lạt,
    // không được dùng lại departureOptions cũ rồi hỏi chọn lịch.
    if (this.isFreshTourSearchRequest(message)) {
      return "tour_search";
    }

    if (
      (this.parseDurationDays(normalized) !== null &&
        this.parseDurationNights(normalized) !== null) ||
      (this.parseDepartureDateRange(normalized) &&
        /\b(tour|du lich|di|co tour|tim|goi y|thang|tuan|thu|ngay|dau|giua|cuoi)\b/.test(
          normalized,
        ))
    ) {
      return "tour_search";
    }

    const hasTourDetailQuestion = this.isTourDetailQuestion(message);

    if (
      this.parseDepartureMonth(normalized) &&
      (/\b(nen di dau|di dau|goi y|du lich|nen chon noi nao)\b/.test(
        normalized,
      ) ||
        /^(?:(?:con|the|vay|roi)\s+)?thang\s+\d{1,2}(?:\s+(?:thi sao|sao|nua))?$/i.test(
          normalized,
        ))
    ) {
      return "tour_search";
    }

    const passengerInfoSignal =
      /\b(?:nguoi lon|adult|tre em|child|be)\s*\d+\s*(?::|-|ten la|la)?\s*[a-z]/i.test(
        normalized,
      );

    const hasBookingFollowUpSignal =
      /\b(momo|vnpay|vn pay|chuyen khoan|bank|tien mat|cash|chon|diem don|pickup|khong dung voucher|khong co voucher|bo qua voucher|lich|ngay khoi hanh|khoi hanh|tiep tuc|xac nhan|dong y|ok|oke|doi thanh|doi so luong|doi so nguoi|them nguoi|giam nguoi|\d+\s*(nguoi|khach|nguoi lon|tre em))\b/.test(
        normalized,
      ) ||
      passengerInfoSignal ||
      this.isVoucherApplicationMessage(message);

    // Nếu đang có draft đặt tour, câu “1 người lớn”, “chọn điểm đón...”, “momo”
    // phải tiếp tục draft hiện tại trước. Không được nhảy sang booking_change chỉ
    // vì tài khoản có booking gần nhất đã thanh toán.
    if (
      (memory.bookingDraft?.started ||
        memory.intent === "booking_create" ||
        (Array.isArray(memory.lastDepartureOptions) &&
          memory.lastDepartureOptions.length > 0)) &&
      hasBookingFollowUpSignal
    ) {
      return "booking_create";
    }

    // Chỉ coi câu ngắn “1 người lớn” là đổi booking khi KHÔNG còn draft đặt tour
    // đang mở. Tránh case user vừa chọn lịch xong, nhập số khách thì bot lại đi
    // kiểm tra booking cũ đã paid.
    if (
      memory.lastBookingCode &&
      !memory.bookingDraft?.started &&
      /^\s*\d+\s*(nguoi|khach|nguoi lon|tre em)/.test(normalized)
    ) {
      return "booking_change";
    }

    const mentionedDestinations = this.extractMentionedDestinations(normalized);

    const hasDestinationCompareIntent =
      mentionedDestinations.length >= 2 &&
      /\b(hay|voi|va|so sanh|nen chon|chon noi nao|chon tour nao|tot hon|hop hon)\b/.test(
        normalized,
      );

    if (hasCompareCommand || hasDestinationCompareIntent) {
      return "tour_compare";
    }

    const hasExplicitTourPronoun =
      /\b(tour nay|tour do|tour vua goi y|tour dau tien|tour tren|lich trinh nay)\b/.test(
        normalized,
      );

    const hasSoftTravelNeed =
      /\b(bien|nghi duong|nhe nhang|chup hinh|song ao|check in|gia dinh|tre nho|tre em|nguoi lon tuoi|resort|hai san|mat me|san may)\b/.test(
        normalized,
      );

    const hasNewTourSearchIntent =
      /\b(toi muon tour|muon tour|tim tour|can tim tour|co tour nao|goi y tour|de xuat tour|toi muon di|minh muon di|muon di|can tim|tim giup|goi y cho toi|phu hop voi toi)\b/.test(
        normalized,
      ) ||
      (/\btour\b/.test(normalized) &&
        Boolean(
          this.parseBudget(normalized) || this.parseDurationDays(normalized),
        )) ||
      (!hasExplicitTourPronoun &&
        hasSoftTravelNeed &&
        (this.parseBudget(normalized) ||
          this.parseDurationDays(normalized) ||
          /\b(di|tour|du lich|gia|ngan sach|ngay|dem|nguoi)\b/.test(
            normalized,
          ))) ||
      (/\btour\b/.test(normalized) &&
        /\b(khach san tot|khach san 4|khach san 5|4 den 5 sao|4 5 sao|4 sao|5 sao|cao cap|premium|resort)\b/.test(
          normalized,
        ));

    // Các intent nghiệp vụ cụ thể phải ưu tiên trước follow_up,
    // tránh câu "điểm đón ở đâu" bị hiểu thành hỏi khách sạn/lưu trú.
    if (hasBookingChangeCommand) {
      return "booking_change";
    }

    const hasRefundFollowUpCommand =
      Boolean(memory.refundDraft?.started) &&
      /\b(ngan hang|ngân hàng|stk|so tai khoan|số tài khoản|chu tai khoan|chủ tài khoản|xac nhan hoan tien|xác nhận hoàn tiền|dong y hoan tien|đồng ý hoàn tiền|hoan cho toi|hoàn cho tôi|hoan di|hoàn đi|tiep tuc hoan|tiếp tục hoàn|gui yeu cau|gửi yêu cầu|ok hoan|oke hoan|dong y|đồng ý|xac nhan|xác nhận)\b/.test(
        normalized,
      );

    if (hasRefundCreateCommand || hasRefundFollowUpCommand) {
      return "refund_create";
    }

    // Tên hành khách là dữ liệu tiếp tục của booking, phải ưu tiên trước policy/RAG.
    // Ví dụ: “Người lớn 2: Hà Gia Huy”.
    if (memory.bookingDraft?.started && passengerInfoSignal) {
      return "booking_create";
    }

    if (hasPolicyCommand) {
      return "tour_policy";
    }

    if (hasVoucherCommand) {
      return "voucher_check";
    }

    if (hasBookingStatusCommand && !hasBookingCommand) {
      return "booking_status";
    }

    if (hasPickupCommand) {
      return "pickup_point";
    }

    if (hasNewTourSearchIntent) {
      return "tour_search";
    }

    // Chỉ coi là follow_up khi người dùng dùng đại từ tham chiếu tour cũ
    // hoặc câu hỏi chi tiết không mang ý định tìm tour mới.
    if (
      hasTourDetailQuestion &&
      hasExplicitTourPronoun &&
      (memory.lastTourId || memory.lastTourName || memory.destination)
    ) {
      return "follow_up";
    }

    if (hasTourDetailQuestion && /\btour\b/.test(normalized)) {
      return "follow_up";
    }

    if (hasBookingChangeCommand) {
      return "booking_change";
    }

    // Nếu đang trong luồng đặt tour thì ưu tiên booking_create trước.
    // Tránh câu có "voucher", "điểm đón", "momo" bị nhận nhầm thành voucher_check/pickup_point.
    if (memory.bookingDraft?.started) {
      const isBookingFollowUp =
        /\b(momo|vnpay|vn pay|chuyen khoan|bank|tien mat|cash|chon|diem don|pickup|voucher|ma giam gia|khong dung|khong co voucher|bo qua|tiep tuc|xac nhan|dong y|co|\d+\s*(nguoi|khach|nguoi lon|tre em))\b/.test(
          normalized,
        );

      if (isBookingFollowUp) {
        return "booking_create";
      }
    }

    if (hasBookingCommand) {
      return "booking_create";
    }

    if (hasRefundCreateCommand) {
      return "refund_create";
    }

    if (hasPolicyCommand) {
      return "tour_policy";
    }

    if (hasVoucherCommand) {
      return "voucher_check";
    }

    if (hasBookingStatusCommand && !hasBookingCommand) {
      return "booking_status";
    }

    if (hasPickupCommand) {
      return "pickup_point";
    }

    if (hasCompareCommand) {
      return "tour_compare";
    }

    if (
      /\b(hop voi toi|phu hop voi toi|goi y cho toi|tour nao hop|nen di dau|recommend|ca nhan hoa|goi y tour|de xuat cho toi)\b/.test(
        normalized,
      )
    ) {
      return "personal_recommendation";
    }

    if (
      /\b(xin chao|chao|hello|hi|helo|cam on|thanks|thank you|ban la ai|bot la ai)\b/.test(
        normalized,
      )
    ) {
      return "small_talk";
    }

    const shortFollowUp = normalized.split(" ").length <= 6;
    const lastAssistant = [...recentMessages]
      .reverse()
      .find((item) => item.role === "assistant");

    const mentionsDestination = this.detectDestination(normalized);
    const mentionsDuration = this.parseDurationDays(normalized);
    const mentionsDepartureMonth = this.parseDepartureMonth(normalized);

    const isTemporalTourSearchFollowUp =
      Boolean(mentionsDepartureMonth) &&
      /^(?:(?:con|còn|the|thế|vay|vậy|roi|rồi)\s+)?thang\s+\d{1,2}(?:\s+(?:thi sao|thì sao|sao|nua|nữa))?$/i.test(
        normalized,
      );

    const isExplicitNewTourSearch =
      Boolean(mentionsDestination) ||
      Boolean(mentionsDuration) ||
      Boolean(mentionsDepartureMonth) ||
      isTemporalTourSearchFollowUp ||
      /\b(di|muon di|toi muon di|minh muon di|tim|tim tour|goi y|co tour|tour)\b/.test(
        normalized,
      );

    // Câu ngắn nhưng có điểm đến/thời lượng thì phải là tìm tour mới,
    // không được hiểu là follow-up tour cũ.
    if (
      shortFollowUp &&
      memory.intent &&
      lastAssistant &&
      !isExplicitNewTourSearch
    ) {
      return "follow_up";
    }

    const hasGuideInfoCommand =
      /\b(hdv|huong dan vien|hướng dẫn viên|ai dan tour|ai dẫn tour|so dien thoai hdv|sdt hdv|lien he hdv|liên hệ hdv)\b/.test(
        normalized,
      );

    const hasPaymentQuestionCommand =
      /\b(qr|ma qr|mã qr|chuyen khoan|chuyển khoản|thanh toan|thanh toán|da thanh toan chua|đã thanh toán chưa|kiem tra thanh toan|kiểm tra thanh toán|noi dung chuyen khoan|nội dung chuyển khoản)\b/.test(
        normalized,
      );

    const hasReviewCommand =
      /\b(danh gia|đánh giá|review|binh luan|bình luận|nhan xet|nhận xét|sao|rating)\b/.test(
        normalized,
      );

    const hasImageSearchCommand =
      /\b(tim bang hinh|tìm bằng hình|tim kiem bang anh|tìm kiếm bằng ảnh|upload anh|upload ảnh|anh nay o dau|ảnh này ở đâu|hinh nay o dau|hình này ở đâu)\b/.test(
        normalized,
      );

    if (hasGuideInfoCommand || hasPaymentQuestionCommand) {
      return "booking_status";
    }

    if (hasReviewCommand) {
      return "follow_up";
    }

    if (hasImageSearchCommand) {
      return "tour_search";
    }

    if (
      memory.destination ||
      memory.budgetMax ||
      memory.durationDays ||
      /\b(tour nao|toi muon di|minh muon di|can tim|du lich|gia re|re nhat|cao cap|premium|bien|dao|bien dao|gia dinh|nghi duong|san may|di dau|phu quoc|da lat|nha trang|hoi an|can tho|an giang|ha long|sa pa|sapa|quy nhon|da nang|hue)\b/.test(
        normalized,
      )
    ) {
      return "tour_search";
    }

    return "general_consulting";
  }

  private async buildPromptContext(
    userMessage: string,
    intent: string,
    memory: MemoryState,
    conversationId: bigint,
    user: AuthUser,
    nlu: NluResult | null = null,
  ): Promise<PromptContext> {
    const [
      recentMessages,
      tours,
      faqs,
      bookings,
      vouchers,
      pickupPoints,
      ragHits,
    ] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),

      this.shouldLoadToursForIntent(intent, userMessage)
        ? intent === "personal_recommendation"
          ? this.findPersonalizedTours(user, memory)
          : this.findRelevantTours(memory, userMessage)
        : Promise.resolve([]),

      this.findRelevantFaqs(userMessage, intent),

      this.findRelevantBookings(intent, user, userMessage),

      this.findRelevantVouchers(
        this.shouldLoadVouchers(userMessage, intent, memory)
          ? "voucher_check"
          : intent,
        user,
      ),

      this.findRelevantPickupPoints(intent, memory, userMessage),

      this.findRagHits(userMessage, intent, memory),
    ]);

    return {
      intent,
      memory,
      recentMessages: recentMessages
        .reverse()
        .map((item: any) => ({ role: item.role, content: item.content })),
      tours,
      faqs,
      bookings,
      vouchers,
      pickupPoints,
      ragHits,
      bookingCheckout: null,
      refundRequest: null,
      userMessage,
      userProfile: {
        loggedIn: Boolean(user?.userId),
        fullName: user?.fullName,
      },
      nlu,
      answerConfidence: null,
    };
  }

  private isTourDetailQuestion(message: string) {
    const normalized = this.stripText(message);

    if (
      this.parseDepartureMonth(normalized) &&
      /\b(nen di dau|di dau|goi y|du lich|nen chon noi nao)\b/.test(normalized)
    ) {
      return false;
    }

    return /\b(tour nay|tour do|tour vua goi y|tour dau tien|tour tren|lich trinh nay|lich trinh|di nhung dau|ngay 1|ngay 2|ngay 3|nhe nhang|co met khong|met khong|phu hop gia dinh|phu hop tre nho|tre nho|tre em|khach san|luu tru|tien nghi|may sao|phuong tien|di bang gi|bao gom nhung gi|bao gom gi|review|danh gia|khach hang noi gi|lich khoi hanh|khoi hanh nao|con lich|ngay khoi hanh)\b/.test(
      normalized,
    );
  }

  private shouldUseRagForIntent(intent: string) {
    return [
      "tour_search",
      "tour_compare",
      "general_consulting",
      "follow_up",
      "tour_policy",
      "pickup_point",
      "personal_recommendation",
    ].includes(intent);
  }

  private async findRagHits(
    userMessage: string,
    intent: string,
    memory: MemoryState,
  ): Promise<RagHit[]> {
    if (!this.shouldUseRagForIntent(intent)) return [];

    const isTourDetailQuestion = this.isTourDetailQuestion(userMessage);

    const enrichedQuery =
      isTourDetailQuestion && (memory.lastTourName || memory.destination)
        ? [
            userMessage,
            memory.lastTourName ? `Tour đang hỏi: ${memory.lastTourName}` : "",
            memory.destination ? `Điểm đến: ${memory.destination}` : "",
            memory.durationDays
              ? `Thời lượng: ${memory.durationDays} ngày`
              : "",
            "Ưu tiên trả lời đúng tour đang hỏi, tập trung vào lịch trình, mức độ nhẹ nhàng, gia đình có trẻ nhỏ, khách sạn, tiện nghi, phương tiện, chính sách và đánh giá.",
          ]
            .filter(Boolean)
            .join(". ")
        : userMessage;

    return this.ragService
      .retrieve(enrichedQuery, {
        topK: 8,
        intent,
        memory: {
          destination: memory.destination,
          budgetMax: memory.budgetMax,
          durationDays: memory.durationDays,
          departureMonth: memory.departureMonth,
          hotelStars: memory.hotelStars,
          tourType: memory.tourType,
          softNeeds: memory.softNeeds || [],
          avoidNeeds: memory.avoidNeeds || [],
        } as any,
      })
      .catch(() => []);
  }

  private detectTravelThemes(normalized: string) {
    const themes: string[] = [];

    if (
      /\b(bien|dao|bien dao|tam bien|di bien|gan bien|resort bien|nghi bien|hai san|phu quoc|nha trang|ha long|quy nhon|con dao|vung tau|da nang|mui ne)\b/.test(
        normalized,
      )
    ) {
      themes.push("beach");
    }

    if (
      /\b(nui|san may|sapa|sa pa|da lat|dalat|moc chau|ha giang|tay bac|trekking|khi hau mat|mat me|troi mat|lanh|se lanh|cao nguyen|doi thong|thanh pho ngan hoa|nghi duong nui|mang den|khong khi trong lanh)\b/.test(
        normalized,
      )
    ) {
      themes.push("mountain");
    }

    if (
      /\b(van hoa|lich su|di tich|pho co|hoi an|hue|co do|chua|den|lang nghe|bao tang)\b/.test(
        normalized,
      )
    ) {
      themes.push("culture");
    }

    if (
      /\b(gia dinh|tre em|tre nho|ba me|bo me|nguoi lon tuoi|family|ca nha|khong qua met|nhe nhang)\b/.test(
        normalized,
      )
    ) {
      themes.push("family");
    }

    if (
      /\b(sinh thai|mien tay|song nuoc|cho noi|vuon trai cay|can tho|ca mau|an giang|thien nhien|khong khi trong lanh)\b/.test(
        normalized,
      )
    ) {
      themes.push("eco");
    }

    if (
      /\b(cao cap|sang|luxury|resort|khach san 5 sao|khach san 4 sao|premium|nghi duong|ho boi|view dep)\b/.test(
        normalized,
      )
    ) {
      themes.push("luxury");
    }

    if (
      /\b(kham pha|mao hiem|adventure|trek|leo nui|trai nghiem|van dong|the thao)\b/.test(
        normalized,
      )
    ) {
      themes.push("adventure");
    }

    return Array.from(new Set(themes));
  }

  private hasLightTripIntent(normalized: string) {
    return /\b(nhe nhang|khong qua met|khong met|it di chuyen|di cham|thu gian|thoai mai|khong di bo nhieu|phu hop tre nho|nguoi lon tuoi)\b/.test(
      normalized,
    );
  }

  private hasPhotoIntent(normalized: string) {
    return /\b(chup hinh|chup anh|song ao|check in|checkin|canh dep|view dep|nhieu goc dep|dep de chup hinh)\b/.test(
      normalized,
    );
  }

  private hasResortIntent(normalized: string) {
    return /\b(resort|nghi duong|khach san tot|khach san dep|4 sao|5 sao|cao cap|sang|premium|ho boi|gan bien)\b/.test(
      normalized,
    );
  }

  private hasFoodIntent(normalized: string) {
    return /\b(an ngon|am thuc|dac san|hai san|mon ngon|cho dem|an uong)\b/.test(
      normalized,
    );
  }

  private hasNatureIntent(normalized: string) {
    return /\b(thien nhien|canh dep|song nui|rung|bien|dao|ho|thac|doi thong|san may|khong khi trong lanh)\b/.test(
      normalized,
    );
  }

  private isCoolBeachDestinationText(value: string) {
    const text = this.stripText(value);

    return /\b(nha trang|quy nhon|da nang|hoi an|ha long|con dao|bien|dao|ven bien)\b/.test(
      text,
    );
  }

  private buildNeedProfile(normalized: string) {
    const themes = this.detectTravelThemes(normalized);

    return {
      themes,
      wantsBeach: themes.includes("beach"),
      wantsMountain: themes.includes("mountain"),
      wantsFamily: themes.includes("family"),
      wantsEco: themes.includes("eco"),
      wantsLuxury: themes.includes("luxury"),
      wantsCoolWeather: this.hasCoolWeatherIntent(normalized),
      wantsLightTrip: this.hasLightTripIntent(normalized),
      wantsPhoto: this.hasPhotoIntent(normalized),
      wantsResort: this.hasResortIntent(normalized),
      wantsFood: this.hasFoodIntent(normalized),
      wantsNature: this.hasNatureIntent(normalized),
    };
  }

  private detectSortPreference(normalized: string) {
    if (
      /\b(re nhat|gia re|tiet kiem|duoi|khong qua|toi da)\b/.test(normalized)
    ) {
      return "cheap";
    }

    if (/\b(cao cap|sang|premium|luxury|5 sao|resort)\b/.test(normalized)) {
      return "premium";
    }

    if (
      /\b(ban chay|hot|noi bat|pho bien|nhieu nguoi dat)\b/.test(normalized)
    ) {
      return "popular";
    }

    if (/\b(danh gia cao|rating cao|tot nhat|chat luong)\b/.test(normalized)) {
      return "rating";
    }

    return "relevance";
  }

  private keywordOverlapScore(message: string, text: string) {
    const stopWords = new Set([
      "toi",
      "minh",
      "muon",
      "can",
      "tim",
      "tour",
      "du",
      "lich",
      "di",
      "cho",
      "co",
      "khong",
      "gia",
      "tam",
      "duoi",
      "tren",
      "ngay",
      "dem",
      "nguoi",
      "va",
      "la",
      "o",
      "tai",
      "den",
      "voi",
      "mot",
      "cac",
      "nhung",
    ]);

    const words = this.stripText(message)
      .split(" ")
      .filter((word) => word.length >= 2 && !stopWords.has(word));

    const normalizedText = this.stripText(text);
    let score = 0;

    for (const word of words) {
      if (normalizedText.includes(word)) score += 1;
    }

    return score;
  }

  private isCoolDestinationText(value: string) {
    const text = this.stripText(value);

    return /\b(da lat|dalat|sa pa|sapa|moc chau|ha giang|tay bac|lao cai|son la|lam dong|buon ma thuot|dak lak|mang den|kon tum|cao nguyen|doi thong|san may|khi hau mat|mat me)\b/.test(
      text,
    );
  }

  private isBeachDestinationText(value: string) {
    const text = this.stripText(value);

    return /\b(phu quoc|nha trang|ha long|quy nhon|da nang|hoi an|vung tau|con dao|bien|dao|tam bien)\b/.test(
      text,
    );
  }

  private hasCoolWeatherIntent(normalized: string) {
    return /\b(mat me|khi hau mat|troi mat|lanh|se lanh|nghi duong nui|cao nguyen|san may|doi thong|thanh pho ngan hoa|khong khi mat|thoi tiet mat)\b/.test(
      normalized,
    );
  }

  private messageMentionsDestination(
    normalized: string,
    destination?: string | null,
  ) {
    if (!destination) return false;
    const destNorm = this.stripText(destination);
    if (!destNorm) return false;
    return normalized.includes(destNorm);
  }

  private shouldIgnoreMemoryDestination(
    normalizedMessage: string,
    memory: MemoryState,
    requestedThemes: string[],
  ) {
    if (!memory.destination) return false;

    const currentMessageMentionsOldDestination =
      this.messageMentionsDestination(normalizedMessage, memory.destination);

    if (currentMessageMentionsOldDestination) return false;

    // Nếu user hỏi nhu cầu mới nhưng không nhắc lại điểm đến cũ,
    // không để destination cũ kéo kết quả sai.
    if (requestedThemes.length) return true;

    if (this.hasCoolWeatherIntent(normalizedMessage)) return true;

    return false;
  }

  private async tryHandleDeterministicTourQuery(input: {
    message: string;
    conversation: any;
    memory: MemoryState;
    nlu: NluResult | null;
  }) {
    const normalized = this.stripText(input.message);

    // Guard phòng thủ: hàm này chỉ xử lý câu tìm tour.
    // Không bao giờ được nuốt câu hoàn tiền/booking/voucher chỉ vì trong câu có
    // mã booking, STK hoặc các con số khác.
    const routedIntent = String((input.nlu as any)?.intent || "");
    const hasBookingCode = Boolean(this.extractBookingCode(input.message));
    const hasRefundSignal =
      /\b(hoan tien|hoan lai|xin hoan|yeu cau hoan|gui yeu cau hoan|refund|huy booking|huy don)\b/.test(
        normalized,
      );

    if (
      (routedIntent &&
        !["tour_search", "personal_recommendation"].includes(routedIntent)) ||
      hasBookingCode ||
      hasRefundSignal
    ) {
      return null;
    }

    const asksPersonalRecommendation =
      /\b(goi y tour phu hop voi toi|goi y phu hop voi toi|tour phu hop voi toi|goi y tour cho toi|de xuat tour cho toi|goi y ca nhan|ca nhan hoa|dua tren so thich cua toi|theo so thich cua toi)\b/.test(
        normalized,
      );
    if (asksPersonalRecommendation) return null;

    const asksCheapest = this.isCheapestTourQuestion(normalized);
    const destinationName = this.detectDestination(normalized);
    const requestedThemes = this.detectTravelThemes(normalized);

    const exactDurationDays = this.parseDurationDays(normalized);
    const exactDurationNights = this.parseDurationNights(normalized);
    const departureDateRange = this.parseDepartureDateRange(normalized);

    const hasDurationCriterion =
      (exactDurationDays !== null || exactDurationNights !== null) &&
      !this.isNumberedTourReference(input.message) &&
      !/\b(tour nay|tour do|tour dau tien|tour tren)\b/.test(normalized);

    const asksExactDuration =
      exactDurationDays !== null &&
      exactDurationNights !== null &&
      hasDurationCriterion;

    const hasHardTourCriteria = Boolean(
      asksCheapest ||
      destinationName ||
      requestedThemes.length > 0 ||
      hasDurationCriterion ||
      departureDateRange,
    );

    console.log("[CHATBOT_DETERMINISTIC_TOUR_QUERY_V3]", {
      message: input.message,
      normalized,
      exactDurationDays,
      exactDurationNights,
      destinationName,
      requestedThemes,
      departureDateRange: departureDateRange?.label || null,
      hasDurationCriterion,
      hasHardTourCriteria,
    });

    if (!hasHardTourCriteria) return null;

    const isTemporalRefinementOnly =
      Boolean(departureDateRange) &&
      !destinationName &&
      exactDurationDays === null &&
      exactDurationNights === null &&
      ["tour_search", "personal_recommendation", "follow_up"].includes(
        String(input.memory.intent || ""),
      );

    const effectiveDestinationName =
      destinationName ||
      (isTemporalRefinementOnly ? input.memory.destination || null : null);

    const destination = effectiveDestinationName
      ? await this.resolveExactDestination(effectiveDestinationName)
      : null;

    if (effectiveDestinationName && !destination) return null;

    const hasOtherHardCriteria = Boolean(
      destination ||
      requestedThemes.length > 0 ||
      hasDurationCriterion ||
      departureDateRange,
    );

    const mode =
      asksCheapest && !hasOtherHardCriteria
        ? "deterministic_cheapest_search"
        : "deterministic_constrained_tour_search";

    const sortPreference = asksCheapest ? "price_asc" : "relevance";

    const cards =
      asksCheapest && !hasOtherHardCriteria
        ? await this.findCheapestBookableTours({
            destinationId: null,
            durationDays: null,
            durationNights: null,
          })
        : await this.findToursByHardCriteria({
            destinationId: destination?.id || null,
            durationDays:
              exactDurationDays !== null
                ? exactDurationDays
                : input.memory.durationDays || null,
            durationNights:
              exactDurationNights !== null
                ? exactDurationNights
                : input.memory.durationNights !== null &&
                    input.memory.durationNights !== undefined
                  ? input.memory.durationNights
                  : null,
            departureFrom: departureDateRange?.from || null,
            departureTo: departureDateRange?.to || null,
            sortByPrice: asksCheapest,
            requestedThemes,
          });

    const answer =
      asksCheapest && !hasOtherHardCriteria
        ? this.buildDeterministicTourAnswer({
            cards,
            asksCheapest: true,
            destinationName: null,
          })
        : this.buildConstrainedTourAnswer({
            cards,
            destinationName:
              destination?.name || effectiveDestinationName || null,
            durationDays: exactDurationDays,
            durationNights: exactDurationNights,
            departureRangeLabel: departureDateRange?.label || null,
            requestedThemes,
          });
    const memory: MemoryState = {
      ...input.memory,
      destination: destination?.name || effectiveDestinationName || null,
      budgetMax: asksCheapest ? (input.memory.budgetMax ?? null) : null,
      departureMonth: null,
      lastFailedTourSearch: !cards.length
        ? {
            destinationId: destination?.id ? String(destination.id) : null,
            destinationName:
              destination?.name || effectiveDestinationName || null,
            durationDays:
              exactDurationDays !== null
                ? exactDurationDays
                : (input.memory.durationDays ?? null),
            durationNights:
              exactDurationNights !== null
                ? exactDurationNights
                : (input.memory.durationNights ?? null),
            departureFrom: departureDateRange?.from
              ? departureDateRange.from.toISOString()
              : null,
            departureTo: departureDateRange?.to
              ? departureDateRange.to.toISOString()
              : null,
            departureRangeLabel: departureDateRange?.label || null,
            requestedThemes,
          }
        : null,
      durationDays:
        exactDurationDays !== null
          ? exactDurationDays
          : (input.memory.durationDays ?? null),
      durationNights:
        exactDurationNights !== null
          ? exactDurationNights
          : (input.memory.durationNights ?? null),
      lastTourId: cards[0]?.tourId || null,
      lastTourName: cards[0]?.name || null,
      lastTourOptions: cards.map((card) => ({
        tourId: card.tourId,
        departureId:
          Array.isArray(card.departures) && card.departures.length > 1
            ? null
            : card.departureId,
        name: card.name,
      })),
      lastDepartureOptions: this.flattenDepartureOptionsFromCards(cards),
      candidateTours: cards
        .filter(
          (card) => Array.isArray(card.departures) && card.departures.length,
        )
        .map((card) => ({
          tourId: card.tourId,
          departureIds: card.departures!.map(
            (departure: NonNullable<TourCard["departures"]>[number]) =>
              departure.departureId,
          ),
          departures: card.departures!,
        })),
      selectedCandidateTourId: null,
      bookingDraft: null,
      bookingContext: this.buildTourListBookingContext(cards),
    };

    await this.prisma.chatMessage.create({
      data: {
        conversationId: input.conversation.id,
        role: "user",
        content: input.message,
        intent:
          asksCheapest && !asksExactDuration
            ? "ask_cheapest_tour"
            : "tour_search",
        meta: {
          intent:
            asksCheapest && !asksExactDuration
              ? "ask_cheapest_tour"
              : "tour_search",
          mode,
          sortPreference,
          filters: {
            destinationId: destination?.id ? String(destination.id) : null,
            destinationName: destination?.name || null,
            destinationMatch: destination ? "exact" : null,
          },
        },
      },
    });

    await this.prisma.chatConversation.update({
      where: { id: input.conversation.id },
      data: {
        lastIntent: asksCheapest ? "ask_cheapest_tour" : "tour_search",
        title:
          input.conversation.title ??
          this.buildConversationTitle(input.message),
        memoryJson: memory as unknown as object,
        summary: cards.length
          ? `${cards.length} tour deterministic: ${cards.map((card) => card.name).join(", ")}`
          : `Không có tour deterministic${destination?.name ? ` cho ${destination.name}` : ""}`,
      },
    });

    await this.prisma.chatMessage.create({
      data: {
        conversationId: input.conversation.id,
        role: "assistant",
        content: answer,
        intent:
          asksCheapest && !asksExactDuration
            ? "ask_cheapest_tour"
            : "tour_search",
        meta: {
          intent: asksCheapest ? "ask_cheapest_tour" : "tour_search",
          nlu: {
            ...(input.nlu || {}),
            sortPreference,
            filters: {
              destinationId: destination?.id ? String(destination.id) : null,
              destinationName: destination?.name || null,
              destinationMatch: destination ? "exact" : null,
            },
          },
          mode,
          sortPreference,
          filters: {
            destinationId: destination?.id ? String(destination.id) : null,
            destinationName: destination?.name || null,
            destinationMatch: destination ? "exact" : null,
          },
          cards,
          suggestedReplies: cards.length
            ? ["Chọn tour số 1", "Xem lịch gần nhất", "Tìm tour khác"]
            : ["Gợi ý thay thế", "Đổi thời lượng", "Tìm điểm đến khác"],
        },
      },
    });

    return {
      conversationId: input.conversation.id.toString(),
      intent: asksCheapest ? "ask_cheapest_tour" : "tour_search",
      nlu: {
        ...(input.nlu || {}),
        sortPreference,
        filters: {
          destinationId: destination?.id ? String(destination.id) : null,
          destinationName: destination?.name || null,
          destinationMatch: destination ? "exact" : null,
        },
      },
      mode,
      sortPreference,
      filters: {
        destinationId: destination?.id ? String(destination.id) : null,
        destinationName: destination?.name || null,
      },
      answer,
      memory,
      cards,
      tours: cards,
      vouchers: [],
      bookings: [],
      pickupPoints: [],
      bookingCheckout: null,
      refundRequest: null,
      suggestedReplies: cards.length
        ? ["Chọn tour số 1", "Xem lịch gần nhất", "Tìm tour khác"]
        : ["Gợi ý thay thế", "Đổi thời lượng", "Tìm điểm đến khác"],
    };
  }

  private isAlternativeTourSuggestionMessage(message: string) {
    const normalized = this.stripText(message);
    return /^(goi y thay the|goi y gan nhat|goi y tour thay the|tour thay the)$/.test(
      normalized,
    );
  }

  private getCardDuration(card: TourCard) {
    const normalized = this.stripText(card.durationText || "");
    return {
      days: this.parseDurationDays(normalized),
      nights: this.parseDurationNights(normalized),
    };
  }

  private cardDepartureTimestamp(card: TourCard) {
    const value = card.departures?.[0]?.departureDate || card.departureDate;
    if (!value) return Number.MAX_SAFE_INTEGER;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
  }

  private async tryHandleAlternativeTourSuggestion(
    message: string,
    conversation: any,
  ) {
    if (!this.isAlternativeTourSuggestionMessage(message)) return null;

    const currentMemory = this.toMemoryState(conversation.memoryJson);
    const failed = currentMemory.lastFailedTourSearch;
    if (!failed) return null;

    const destinationId =
      failed.destinationId && /^\d+$/.test(failed.destinationId)
        ? BigInt(failed.destinationId)
        : null;
    const durationDays = failed.durationDays ?? null;
    const durationNights = failed.durationNights ?? null;
    const departureFrom = failed.departureFrom
      ? new Date(failed.departureFrom)
      : null;
    const departureTo = failed.departureTo
      ? new Date(failed.departureTo)
      : null;

    const hasValidFrom =
      departureFrom && !Number.isNaN(departureFrom.getTime());
    const hasValidTo = departureTo && !Number.isNaN(departureTo.getTime());
    const safeFrom = hasValidFrom ? departureFrom : null;
    const safeTo = hasValidTo ? departureTo : null;

    const groups: Array<{
      title: string;
      cards: TourCard[];
    }> = [];

    // Ưu tiên 1: giữ đúng điểm đến + khoảng ngày, chỉ nới thời lượng.
    if (destinationId && (safeFrom || safeTo)) {
      let sameDestinationSameTime = await this.findToursByHardCriteria({
        destinationId,
        durationDays: null,
        durationNights: null,
        departureFrom: safeFrom,
        departureTo: safeTo,
        sortByPrice: false,
        requestedThemes: [],
      });

      if (durationDays !== null || durationNights !== null) {
        sameDestinationSameTime = sameDestinationSameTime.filter((card) => {
          const parsed = this.getCardDuration(card);
          const sameDays =
            durationDays === null || parsed.days === durationDays;
          const sameNights =
            durationNights === null || parsed.nights === durationNights;
          return !(sameDays && sameNights);
        });
      }

      if (sameDestinationSameTime.length) {
        groups.push({
          title: `Cùng ${failed.destinationName || "điểm đến"} và đúng khoảng ngày, khác thời lượng`,
          cards: sameDestinationSameTime,
        });
      }
    }

    // Ưu tiên 2: giữ đúng thời lượng + khoảng ngày, chỉ nới điểm đến.
    if (
      (durationDays !== null || durationNights !== null) &&
      (safeFrom || safeTo)
    ) {
      let sameDurationSameTime = await this.findToursByHardCriteria({
        destinationId: null,
        durationDays,
        durationNights,
        departureFrom: safeFrom,
        departureTo: safeTo,
        sortByPrice: false,
        requestedThemes: [],
      });

      if (failed.destinationName) {
        const failedDestination = this.stripText(failed.destinationName);
        sameDurationSameTime = sameDurationSameTime.filter(
          (card) =>
            this.stripText(card.destination || "") !== failedDestination,
        );
      }

      if (sameDurationSameTime.length) {
        groups.push({
          title: `Cùng ${durationDays ?? "?"} ngày${durationNights !== null ? ` ${durationNights} đêm` : ""} và đúng khoảng ngày, khác điểm đến`,
          cards: sameDurationSameTime,
        });
      }
    }

    // Ưu tiên 3: giữ đúng điểm đến + thời lượng, tìm ngày gần nhất ngoài khoảng đã yêu cầu.
    if (
      destinationId &&
      (durationDays !== null || durationNights !== null) &&
      safeFrom &&
      safeTo
    ) {
      const beforeTo = new Date(safeFrom.getTime() - 1);
      const afterFrom = new Date(safeTo.getTime() + 1);
      const now = new Date();

      const [beforeCards, afterCards] = await Promise.all([
        beforeTo.getTime() >= now.getTime()
          ? this.findToursByHardCriteria({
              destinationId,
              durationDays,
              durationNights,
              departureFrom: now,
              departureTo: beforeTo,
              sortByPrice: false,
              requestedThemes: [],
            })
          : Promise.resolve([]),
        this.findToursByHardCriteria({
          destinationId,
          durationDays,
          durationNights,
          departureFrom: afterFrom,
          departureTo: null,
          sortByPrice: false,
          requestedThemes: [],
        }),
      ]);

      const nearestDateCards = [...beforeCards, ...afterCards]
        .sort((a, b) => {
          const aTime = this.cardDepartureTimestamp(a);
          const bTime = this.cardDepartureTimestamp(b);
          const distance = (time: number) =>
            time < safeFrom.getTime()
              ? safeFrom.getTime() - time
              : time - safeTo.getTime();
          return distance(aTime) - distance(bTime);
        })
        .slice(0, this.getMaxTourResults());

      if (nearestDateCards.length) {
        groups.push({
          title: `Cùng ${failed.destinationName || "điểm đến"} và đúng thời lượng, ngày khởi hành gần nhất`,
          cards: nearestDateCards,
        });
      }
    }

    const seenTourIds = new Set<string>();
    const visibleGroups = groups
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) => {
          if (seenTourIds.has(card.tourId)) return false;
          seenTourIds.add(card.tourId);
          return true;
        }),
      }))
      .filter((group) => group.cards.length > 0);

    const allCards = visibleGroups
      .flatMap((group) => group.cards)
      .slice(0, this.getMaxTourResults());
    const allowedIds = new Set(allCards.map((card) => card.tourId));
    const finalGroups = visibleGroups
      .map((group) => ({
        ...group,
        cards: group.cards.filter((card) => allowedIds.has(card.tourId)),
      }))
      .filter((group) => group.cards.length > 0);

    let globalIndex = 0;
    const answer = allCards.length
      ? [
          "Mình ưu tiên các tour gần nhất với tiêu chí bạn vừa tìm:",
          "",
          ...finalGroups.flatMap((group) => [
            `${group.title}:`,
            ...group.cards.map((card) => {
              globalIndex += 1;
              const departure = card.departures?.[0];
              return [
                `${globalIndex}. ${card.name}: ${this.formatCurrency(card.priceAdult)}/người`,
                `   - Điểm đến: ${card.destination}`,
                `   - Thời lượng: ${card.durationText}`,
                departure?.departureDate
                  ? `   - Khởi hành: ${this.formatDate(departure.departureDate)}`
                  : null,
                departure ? `   - Còn: ${departure.remainingSlots} chỗ` : null,
              ]
                .filter(Boolean)
                .join("\n");
            }),
            "",
          ]),
          "Bạn có thể chọn một tour trong danh sách hoặc tìm lại với tiêu chí khác.",
        ].join("\n")
      : [
          "Mình đã thử nới từng tiêu chí của lần tìm trước nhưng hiện vẫn chưa có tour thay thế phù hợp.",
          "Bạn có thể đổi thời lượng, đổi điểm đến hoặc chọn khoảng ngày khác.",
        ].join("\n");

    const memory: MemoryState = {
      ...currentMemory,
      intent: "tour_search",
      lastTourId: allCards[0]?.tourId || null,
      lastTourName: allCards[0]?.name || null,
      lastTourOptions: allCards.map((card) => ({
        tourId: card.tourId,
        departureId:
          Array.isArray(card.departures) && card.departures.length > 1
            ? null
            : card.departureId,
        name: card.name,
      })),
      lastDepartureOptions: this.flattenDepartureOptionsFromCards(allCards),
      candidateTours: allCards
        .filter(
          (card) => Array.isArray(card.departures) && card.departures.length,
        )
        .map((card) => ({
          tourId: card.tourId,
          departureIds: card.departures!.map(
            (departure) => departure.departureId,
          ),
          departures: card.departures!,
        })),
      selectedCandidateTourId: null,
      bookingDraft: null,
      bookingContext: this.buildTourListBookingContext(allCards),
    };

    const suggestedReplies = allCards.length
      ? ["Chọn tour số 1", "Tìm lại theo tiêu chí ban đầu", "Tìm tour khác"]
      : ["Đổi thời lượng", "Tìm điểm đến khác", "Đổi khoảng ngày"];

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
        intent: "tour_search",
        meta: { intent: "tour_search", mode: "alternative_tour_search" },
      },
    });

    await this.prisma.chatConversation.update({
      where: { id: conversation.id },
      data: {
        lastIntent: "tour_search",
        memoryJson: memory as unknown as object,
        summary: allCards.length
          ? `${allCards.length} tour thay thế gần tiêu chí lần tìm trước`
          : "Không có tour thay thế gần tiêu chí lần tìm trước",
      },
    });

    await this.prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        intent: "tour_search",
        meta: {
          intent: "tour_search",
          mode: "alternative_tour_search",
          cards: allCards,
          suggestedReplies,
        },
      },
    });

    return {
      conversationId: conversation.id.toString(),
      intent: "tour_search",
      nlu: null,
      confidence: {
        level: "high",
        shouldAnswer: true,
        reasons: ["alternative_tour_search"],
      },
      answer,
      memory,
      cards: allCards,
      tours: allCards,
      vouchers: [],
      bookings: [],
      pickupPoints: [],
      bookingCheckout: null,
      refundRequest: null,
      suggestedReplies,
    };
  }

  private isCheapestTourQuestion(normalized: string) {
    return /\b(re nhat|gia thap nhat|tour re|tour nao re nhat|tour co gia thap nhat|chi phi thap nhat|gia re nhat)\b/.test(
      normalized,
    );
  }

  private async resolveExactDestination(destinationName: string) {
    const normalized = this.stripText(destinationName);
    const rows = await this.prisma.destination.findMany({
      where: { status: "active" },
      take: 200,
    });
    return (
      rows.find((destination: any) => {
        const name = this.stripText(destination.name || "");
        const province = this.stripText(destination.province || "");
        return name === normalized || province === normalized;
      }) || null
    );
  }

  private async findCheapestBookableTours(criteria: {
    destinationId?: bigint | null;
    durationDays?: number | null;
    durationNights?: number | null;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.prisma.tour.findMany({
      where: {
        status: "published" as any,
        ...(criteria.destinationId
          ? { destinationId: criteria.destinationId }
          : {}),
        ...(criteria.durationDays
          ? { durationDays: criteria.durationDays }
          : {}),
        ...(criteria.durationNights !== null &&
        criteria.durationNights !== undefined
          ? { durationNights: criteria.durationNights }
          : {}),
        departures: {
          some: {
            status: "open" as any,
            departureDate: { gte: today },
          },
        },
      },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: {
          where: {
            status: "open" as any,
            departureDate: { gte: today },
          },
          orderBy: [{ adultPrice: "asc" }, { departureDate: "asc" }],
        },
      },
      take: 200,
    });

    const debugRecords: any[] = [];
    const departures = rows
      .flatMap((tour: any) => {
        const tourDepartures = Array.isArray(tour.departures)
          ? tour.departures
          : [];
        if (!tourDepartures.length) {
          debugRecords.push(
            this.buildCheapestTourDebugRecord(tour, null, "no_open_departures"),
          );
        }

        return tourDepartures
          .map((departure: any) => {
            const enriched = { ...departure, tour };
            const departureDate = new Date(departure?.departureDate);
            const normalizedDepartureDate = Number.isNaN(
              departureDate.getTime(),
            )
              ? null
              : new Date(departureDate);
            normalizedDepartureDate?.setHours(0, 0, 0, 0);
            const adultPriceNumber = Number(departure?.adultPrice);
            let excludedReason: string | null = null;

            if (String(departure?.status || "").toLowerCase() !== "open") {
              excludedReason = "departure_not_open";
            } else if (!normalizedDepartureDate) {
              excludedReason = "invalid_departure_date";
            } else if (normalizedDepartureDate.getTime() < today.getTime()) {
              excludedReason = "departure_not_bookable_date";
            } else if (
              !Number.isFinite(adultPriceNumber) ||
              adultPriceNumber <= 0
            ) {
              excludedReason = "invalid_adult_price";
            } else if (this.getAvailableSlots(departure) <= 0) {
              excludedReason = "no_remaining_slots";
            }

            debugRecords.push(
              this.buildCheapestTourDebugRecord(
                tour,
                departure,
                excludedReason,
              ),
            );

            return excludedReason ? null : enriched;
          })
          .filter(Boolean);
      })
      .sort((a: any, b: any) => {
        const priceDiff = Number(a.adultPrice) - Number(b.adultPrice);
        if (priceDiff !== 0) return priceDiff;
        return (
          new Date(a.departureDate || 0).getTime() -
          new Date(b.departureDate || 0).getTime()
        );
      });

    this.logCheapestTourCandidateDebug(debugRecords);
    this.logTourQueryDebug({
      intent: "ask_cheapest_tour",
      queryMode: "deterministic",
      candidateCount: rows.length,
      bookableCount: departures.length,
      cheapestConfiguredTour: this.findCheapestConfiguredTour(rows),
      cheapestBookableTour: departures[0]
        ? {
            tourId: String(
              departures[0].tourId || departures[0].tour?.id || "",
            ),
            price: Number(departures[0].adultPrice || 0),
          }
        : null,
    });

    return this.cheapestDeparturesToGroupedCards(
      departures,
      "được sắp xếp theo giá thấp đến cao",
      null,
    ).sort((a, b) => {
      const priceDiff = Number(a.priceAdult || 0) - Number(b.priceAdult || 0);
      if (priceDiff !== 0) return priceDiff;
      return (
        new Date(a.departures?.[0]?.departureDate || 0).getTime() -
        new Date(b.departures?.[0]?.departureDate || 0).getTime()
      );
    });
  }

  private cheapestDeparturesToGroupedCards(
    departures: any[],
    reason: string,
    requestedDate: string | null,
  ) {
    void requestedDate;
    const maxTours = this.getMaxTourResults();
    const maxDeparturesPerTour = this.getMaxDeparturesPerTour();
    const grouped = new Map<string, { tour: any; departures: any[] }>();
    const seenDepartureKeys = new Set<string>();

    for (const departure of departures || []) {
      const tourId = String(departure?.tourId || departure?.tour?.id || "");
      const departureId = String(departure?.id || departure?.departureId || "");
      if (!tourId || !departureId) continue;

      const duplicateKey = `${tourId}:${departureId}`;
      if (seenDepartureKeys.has(duplicateKey)) continue;
      seenDepartureKeys.add(duplicateKey);

      if (!grouped.has(tourId)) {
        grouped.set(tourId, { tour: departure.tour || null, departures: [] });
      }
      grouped.get(tourId)!.departures.push(departure);
    }

    return Array.from(grouped.values())
      .map((group) => {
        const sortedDepartures = group.departures
          .slice()
          .sort((a, b) => {
            const priceDiff = Number(a.adultPrice) - Number(b.adultPrice);
            if (priceDiff !== 0) return priceDiff;
            return (
              new Date(a.departureDate || 0).getTime() -
              new Date(b.departureDate || 0).getTime()
            );
          })
          .slice(0, maxDeparturesPerTour);
        const firstDeparture = sortedDepartures[0] || null;
        const card = this.toTourCard(group.tour, firstDeparture, [reason]);
        const departureSummaries = sortedDepartures.map((departure) => ({
          departureId: String(departure?.id || ""),
          departureDate: departure?.departureDate
            ? new Date(departure.departureDate).toISOString()
            : null,
          endDate: departure?.endDate
            ? new Date(departure.endDate).toISOString()
            : null,
          remainingSlots: this.getAvailableSlots(departure),
          status: String(departure?.status || ""),
          adultPrice: Number(departure?.adultPrice),
        }));
        const priceFrom = Number(
          firstDeparture?.adultPrice || card.priceAdult || 0,
        );

        return {
          ...card,
          departureId: card.departureId,
          departureDate: card.departureDate,
          departures: departureSummaries,
          priceAdult: priceFrom,
          priceFrom,
        };
      })
      .sort((a, b) => {
        const priceDiff = Number(a.priceAdult || 0) - Number(b.priceAdult || 0);
        if (priceDiff !== 0) return priceDiff;
        return (
          new Date(a.departures?.[0]?.departureDate || 0).getTime() -
          new Date(b.departures?.[0]?.departureDate || 0).getTime()
        );
      })
      .slice(0, maxTours);
  }

  private buildCheapestTourDebugRecord(
    tour: any,
    departure: any | null,
    excludedReason: string | null,
  ) {
    const adultPriceRaw = departure?.adultPrice ?? null;
    return {
      tourId: tour?.id ? String(tour.id) : null,
      tourName: tour?.name || null,
      tourStatus: tour?.status || null,
      departureId: departure?.id ? String(departure.id) : null,
      departureDate: departure?.departureDate
        ? new Date(departure.departureDate).toISOString()
        : null,
      departureStatus: departure?.status || null,
      adultPriceRaw,
      adultPriceNumber: adultPriceRaw === null ? null : Number(adultPriceRaw),
      totalSlots: Number(departure?.totalSlots || 0),
      bookedSlots: Number(departure?.bookedSlots || 0),
      heldSlots: Number(departure?.heldSlots || 0),
      remainingSlots: departure ? this.getAvailableSlots(departure) : null,
      excludedReason,
    };
  }

  private logCheapestTourCandidateDebug(records: any[]) {
    const enabled =
      String(
        this.configService.get<string>("CHATBOT_TOUR_QUERY_DEBUG") ||
          process.env.CHATBOT_TOUR_QUERY_DEBUG ||
          "",
      ).toLowerCase() === "true";
    if (!enabled) return;

    console.log(
      "[chatbot.tourQuery.cheapest.candidates]",
      JSON.stringify(records, null, 2),
    );

    const nhaTrangRecords = records.filter((record) =>
      this.stripText(record?.tourName || "").includes(
        "tour van hoa nha trang 4n3d",
      ),
    );
    if (nhaTrangRecords.length) {
      console.log(
        "[chatbot.tourQuery.cheapest.nhaTrangCulture]",
        JSON.stringify(nhaTrangRecords, null, 2),
      );
    }
  }

  private matchesHardTravelThemes(tour: any, requestedThemes: string[]) {
    if (!Array.isArray(requestedThemes) || requestedThemes.length === 0) {
      return true;
    }

    const text = this.stripText(
      [
        tour?.name,
        tour?.shortDescription,
        tour?.fullDescription,
        tour?.tourTheme,
        tour?.destination?.name,
        tour?.destination?.province,
      ]
        .filter(Boolean)
        .join(" "),
    );

    return requestedThemes.every((theme) => {
      if (theme === "beach") {
        return /\b(bien|dao|tam bien|nghi bien|hai san|phu quoc|nha trang|ha long|quy nhon|da nang|hoi an|vung tau|con dao|mui ne)\b/.test(
          text,
        );
      }
      if (theme === "mountain") {
        return /\b(nui|san may|da lat|dalat|sa pa|sapa|moc chau|ha giang|cao nguyen|doi thong|mang den)\b/.test(
          text,
        );
      }
      if (theme === "culture") {
        return /\b(van hoa|lich su|di tich|pho co|hoi an|hue|co do|chua|den|lang nghe|bao tang)\b/.test(
          text,
        );
      }
      if (theme === "family") {
        return /\b(gia dinh|tre em|tre nho|family|ca nha|nhe nhang)\b/.test(
          text,
        );
      }
      if (theme === "eco") {
        return /\b(sinh thai|mien tay|song nuoc|cho noi|vuon trai cay|can tho|ca mau|an giang|thien nhien)\b/.test(
          text,
        );
      }
      if (theme === "luxury") {
        return /\b(cao cap|luxury|premium|resort|5 sao|4 sao|nghi duong)\b/.test(
          text,
        );
      }
      if (theme === "adventure") {
        return /\b(kham pha|mao hiem|adventure|trek|trekking|leo nui|van dong)\b/.test(
          text,
        );
      }
      return true;
    });
  }

  private async findToursByHardCriteria(criteria: {
    destinationId?: bigint | null;
    durationDays?: number | null;
    durationNights?: number | null;
    departureFrom?: Date | null;
    departureTo?: Date | null;
    sortByPrice?: boolean;
    requestedThemes?: string[];
  }): Promise<TourCard[]> {
    const now = new Date();

    const departureDateFilter: any = {
      gte: criteria.departureFrom || now,
    };
    if (criteria.departureTo) {
      departureDateFilter.lte = criteria.departureTo;
    }

    const departureWhere: any = {
      status: "open" as any,
      departureDate: departureDateFilter,
    };

    const rows = await this.prisma.tour.findMany({
      where: {
        status: "published" as any,
        ...(criteria.destinationId
          ? { destinationId: criteria.destinationId }
          : {}),
        ...(criteria.durationDays !== null &&
        criteria.durationDays !== undefined
          ? { durationDays: criteria.durationDays }
          : {}),
        ...(criteria.durationNights !== null &&
        criteria.durationNights !== undefined
          ? { durationNights: criteria.durationNights }
          : {}),
        departures: {
          some: departureWhere,
        },
      },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: {
          where: departureWhere,
          orderBy: criteria.sortByPrice
            ? [{ adultPrice: "asc" }, { departureDate: "asc" }]
            : [{ departureDate: "asc" }, { adultPrice: "asc" }],
          take: this.getMaxDeparturesPerTour(),
        },
      },
      take: 100,
    });

    const hardFilteredRows =
      Array.isArray(criteria.requestedThemes) && criteria.requestedThemes.length
        ? rows.filter((tour: any) =>
            this.matchesHardTravelThemes(tour, criteria.requestedThemes || []),
          )
        : rows;

    const departures = hardFilteredRows
      .flatMap((tour: any) =>
        (tour.departures || [])
          .filter(
            (departure: any) =>
              this.getAvailableSlots(departure) > 0 &&
              this.isDepartureBookable(departure),
          )
          .map((departure: any) => ({ ...departure, tour })),
      )
      .sort((a: any, b: any) => {
        if (criteria.sortByPrice) {
          const priceDiff =
            Number(a.adultPrice || 0) - Number(b.adultPrice || 0);
          if (priceDiff !== 0) return priceDiff;
        }
        return (
          new Date(a.departureDate || 0).getTime() -
          new Date(b.departureDate || 0).getTime()
        );
      });

    return this.departuresToGroupedCards(
      departures,
      "khớp đúng các tiêu chí bạn yêu cầu",
      criteria.departureFrom ? criteria.departureFrom.toISOString() : null,
    ).slice(0, this.getMaxTourResults());
  }

  private async findToursByExactDestination(criteria: {
    destinationId: bigint;
  }) {
    const now = new Date();
    const rows = await this.prisma.tour.findMany({
      where: {
        status: "published" as any,
        destinationId: criteria.destinationId,
      },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        departures: {
          where: {
            status: "open" as any,
            departureDate: { gt: now },
          },
          orderBy: [{ departureDate: "asc" }, { adultPrice: "asc" }],
          take: 8,
        },
      },
      orderBy: [
        { isBestDeal: "desc" },
        { isTrending: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    const departures = rows.flatMap((tour: any) =>
      (tour.departures || [])
        .filter((departure: any) => this.getAvailableSlots(departure) > 0)
        .map((departure: any) => ({ ...departure, tour })),
    );

    return this.departuresToGroupedCards(
      departures,
      "đúng điểm đến bạn yêu cầu",
      null,
    );
  }

  private departuresToGroupedCards(
    departures: any[],
    reason: string,
    requestedDate: string | null,
  ) {
    const groups = groupDeparturesByTour(departures, {
      maxTours: this.getMaxTourResults(),
      maxDeparturesPerTour: this.getMaxDeparturesPerTour(),
      requestedDate,
    });

    return groups.map((group: any) => {
      const firstDeparture = group.departures?.[0] || null;
      const card = this.toTourCard(group.tour, firstDeparture, [reason]);
      return {
        ...card,
        departureId:
          group.departureSummaries.length === 1 ? card.departureId : null,
        departureDate:
          group.departureSummaries.length === 1 ? card.departureDate : null,
        departures: group.departureSummaries,
        priceAdult: group.priceFrom || card.priceAdult,
        priceFrom: group.priceFrom || card.priceAdult,
      };
    });
  }

  private buildConstrainedTourAnswer(input: {
    cards: TourCard[];
    destinationName: string | null;
    durationDays: number | null;
    durationNights: number | null;
    departureRangeLabel: string | null;
    requestedThemes?: string[];
  }) {
    const {
      cards,
      destinationName,
      durationDays,
      durationNights,
      departureRangeLabel,
      requestedThemes = [],
    } = input;

    const themeLabels: Record<string, string> = {
      beach: "biển/đảo",
      mountain: "núi/khí hậu mát",
      culture: "văn hóa/lịch sử",
      family: "gia đình",
      eco: "sinh thái",
      luxury: "nghỉ dưỡng cao cấp",
      adventure: "khám phá/mạo hiểm",
    };

    const filters = [
      requestedThemes.length
        ? `chủ đề ${requestedThemes.map((theme) => themeLabels[theme] || theme).join(", ")}`
        : null,
      destinationName ? `điểm đến ${destinationName}` : null,
      durationDays !== null && durationNights !== null
        ? `${durationDays} ngày ${durationNights} đêm`
        : durationDays !== null
          ? `${durationDays} ngày`
          : null,
      departureRangeLabel
        ? `khởi hành trong khoảng ${departureRangeLabel}`
        : null,
    ].filter(Boolean);

    if (!cards.length) {
      return [
        `Mình đã hiểu yêu cầu: ${filters.join(", ")}.`,
        "",
        "Hiện Travela chưa có tour đang mở bán khớp đồng thời tất cả các điều kiện này. Mình không lấy tour sai thời lượng, sai điểm đến hoặc sai khoảng ngày để thay thế.",
      ].join("\n");
    }

    const visibleCards = cards.slice(0, this.getMaxTourResults());

    return [
      `Mình đã hiểu yêu cầu: ${filters.join(", ")}.`,
      `Mình tìm thấy ${visibleCards.length} tour khớp đúng:`,
      "",
      ...visibleCards.map((card, index) => {
        const firstDeparture = card.departures?.[0];
        return [
          `${index + 1}. ${card.name}: ${this.formatCurrency(
            card.priceAdult,
          )}/người`,
          `   - Điểm đến: ${card.destination}`,
          `   - Thời lượng: ${card.durationText}`,
          firstDeparture?.departureDate
            ? `   - Khởi hành: ${this.formatDate(firstDeparture.departureDate)}`
            : null,
          firstDeparture
            ? `   - Còn: ${firstDeparture.remainingSlots} chỗ`
            : null,
        ]
          .filter(Boolean)
          .join("\n");
      }),
      "",
      visibleCards.length >= this.getMaxTourResults()
        ? `Mình chỉ hiển thị tối đa ${this.getMaxTourResults()} tour phù hợp nhất.`
        : "Đây là toàn bộ tour đang mở bán khớp đúng các tiêu chí hiện tại.",
    ].join("\n");
  }

  private buildExactDurationTourAnswer(
    cards: TourCard[],
    durationDays: number,
    durationNights: number,
    destinationName: string | null,
  ) {
    if (!cards.length) {
      return `Hiện Travela chưa có tour đang mở bán đúng ${durationDays} ngày ${durationNights} đêm${
        destinationName ? ` tại ${destinationName}` : ""
      }. Mình không lấy tour sai thời lượng để thay thế.`;
    }

    const visibleCards = cards.slice(0, this.getMaxTourResults());

    const lines = visibleCards.map((card, index) => {
      const firstDeparture = card.departures?.[0];
      return [
        `${index + 1}. ${card.name}: ${this.formatCurrency(
          card.priceAdult,
        )}/người, ${card.durationText}${
          firstDeparture?.departureDate
            ? `, khởi hành ${this.formatDate(firstDeparture.departureDate)}`
            : ""
        }`,
        firstDeparture
          ? `   - Còn khoảng ${firstDeparture.remainingSlots} chỗ`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return [
      `Mình tìm thấy ${visibleCards.length} tour đúng ${durationDays} ngày ${durationNights} đêm${
        destinationName ? ` tại ${destinationName}` : ""
      }:`,
      "",
      ...lines,
      "",
      visibleCards.length >= this.getMaxTourResults()
        ? `Mình chỉ hiển thị tối đa ${this.getMaxTourResults()} tour phù hợp nhất.`
        : "Đây là toàn bộ tour đang mở bán khớp đúng thời lượng bạn yêu cầu.",
    ].join("\n");
  }

  private buildDeterministicTourAnswer(input: {
    cards: TourCard[];
    asksCheapest: boolean;
    destinationName: string | null;
  }) {
    const { cards, asksCheapest, destinationName } = input;
    if (!cards.length) {
      if (destinationName) {
        return [
          `Hiện Travela chưa có tour ${destinationName} đang mở bán phù hợp.`,
          "",
          "Bạn có muốn xem:",
          "1. Tour ở điểm đến khác",
          `2. Tour ${destinationName} ở thời lượng khác`,
          `3. Lịch ${destinationName} sắp mở`,
        ].join("\n");
      }
      return "Hiện Travela chưa có tour đang mở bán, còn chỗ và có lịch khởi hành tương lai phù hợp.";
    }

    const lines = cards.map((card, index) => {
      const firstDeparture = card.departures?.[0];
      return [
        `${index + 1}. ${card.name} - ${this.formatCurrency(card.priceAdult)}/người`,
        `   - Điểm đến: ${card.destination}`,
        `   - Thời lượng: ${card.durationText}`,
        firstDeparture?.departureDate
          ? `   - Lịch gần nhất: ${this.formatDate(firstDeparture.departureDate)}`
          : null,
        firstDeparture
          ? `   - Còn: ${firstDeparture.remainingSlots} chỗ`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
    });

    if (asksCheapest) {
      return [
        destinationName
          ? `Tour ${destinationName} rẻ nhất đang mở bán hiện tại, được sắp xếp theo giá thấp đến cao:`
          : "Tour rẻ nhất đang mở bán hiện tại, được sắp xếp theo giá thấp đến cao:",
        "",
        ...lines,
      ].join("\n");
    }

    return [
      `Mình tìm thấy ${cards.length} tour tại ${destinationName}:`,
      "",
      ...lines,
      "",
      "Danh sách chính chỉ gồm tour đúng điểm đến bạn yêu cầu.",
    ].join("\n");
  }

  private flattenDepartureOptionsFromCards(cards: TourCard[]) {
    return cards
      .flatMap((card, cardIndex) =>
        (card.departures || []).map((departure, index) => ({
          tourId: card.tourId,
          departureId: departure.departureId,
          index: cardIndex * this.getMaxDeparturesPerTour() + index + 1,
          startDate: departure.departureDate,
          endDate: departure.endDate,
          adultPrice: departure.adultPrice,
          availableSlots: departure.remainingSlots,
          status: departure.status,
        })),
      )
      .filter((item) => item.tourId && item.departureId);
  }

  private findCheapestConfiguredTour(tours: any[]) {
    const cheapest = [...tours].sort(
      (a: any, b: any) =>
        Number(a.basePriceAdult || 0) - Number(b.basePriceAdult || 0),
    )[0];
    return cheapest
      ? {
          tourId: String(cheapest.id),
          price: Number(cheapest.basePriceAdult || 0),
        }
      : null;
  }

  private logTourQueryDebug(payload: Record<string, unknown>) {
    const enabled = ["1", "true", "yes", "on"].includes(
      String(
        this.configService.get<string>("CHATBOT_TOUR_QUERY_DEBUG") ||
          process.env.CHATBOT_TOUR_QUERY_DEBUG ||
          "false",
      ).toLowerCase(),
    );
    if (enabled) console.log("[chatbot.tourQuery.debug]", payload);
  }

  private async findRelevantTours(
    memory: MemoryState,
    userMessage: string,
  ): Promise<TourCard[]> {
    const normalizedMessage = this.stripText(userMessage);
    if (this.mentionsUnsupportedDestination(normalizedMessage)) {
      return [];
    }
    const needProfile = this.buildNeedProfile(normalizedMessage);
    const requestedThemes = needProfile.themes;
    const sortPreference = this.detectSortPreference(normalizedMessage);

    const wantsCoolWeather = needProfile.wantsCoolWeather;
    const wantsBeach = needProfile.wantsBeach;
    const wantsMountain = needProfile.wantsMountain;
    const wantsFamily = needProfile.wantsFamily;
    const wantsLightTrip = needProfile.wantsLightTrip;
    const wantsPhoto = needProfile.wantsPhoto;
    const wantsResort = needProfile.wantsResort;
    const wantsFood = needProfile.wantsFood;
    const wantsNature = needProfile.wantsNature;
    const wantsCoolBeach = wantsBeach && wantsCoolWeather;
    const explicitDestination = this.detectDestination(normalizedMessage);

    const wantsGlobalCheapest =
      /\b(tour re nhat|re nhat|gia re nhat|tour nao re nhat|tour gia re nhat)\b/.test(
        normalizedMessage,
      ) && !explicitDestination;

    const ignoreMemoryDestination =
      this.shouldIgnoreMemoryDestination(
        normalizedMessage,
        memory,
        requestedThemes,
      ) || wantsGlobalCheapest;

    const rows = await this.prisma.tour.findMany({
      where: { status: "published" as any },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        reviews: {
          where: { status: "approved" as any },
          select: { rating: true },
        },
        bookings: {
          select: { id: true },
        },
        departures: {
          where: { status: { in: ["open", "full"] as any } },
          orderBy: { departureDate: "asc" },
          take: 8,
        },
      },
      orderBy: [
        { isBestDeal: "desc" },
        { isTrending: "desc" },
        { createdAt: "desc" },
      ],
      take: 100,
    });

    const monthFilter = memory.departureMonth ?? null;

    const scored = rows.map((tour: any) => {
      const destinationNorm = this.stripText(tour.destination?.name || "");
      const provinceNorm = this.stripText(tour.destination?.province || "");
      const tourNameNorm = this.stripText(tour.name || "");
      const themeNorm = this.stripText(tour.tourTheme || "");
      const requestedDestinationNorm = explicitDestination
        ? this.stripText(explicitDestination)
        : memory.destination && !ignoreMemoryDestination
          ? this.stripText(memory.destination)
          : null;

      const departures = (tour.departures || []).filter((item: any) => {
        if (!monthFilter) return true;

        const date = new Date(item.departureDate);
        const dateKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1,
        ).padStart(2, "0")}`;

        return dateKey === monthFilter;
      });

      const nextDeparture = monthFilter
        ? (departures[0] ?? null)
        : (departures[0] ?? tour.departures?.[0] ?? null);

      const cheapestAdultPrice = nextDeparture
        ? Number(nextDeparture.adultPrice)
        : Number(tour.basePriceAdult || 0);

      const avgRating = this.averageRating(tour.reviews || []);
      const bookingCount = Array.isArray(tour.bookings)
        ? tour.bookings.length
        : 0;

      let score = 0;
      const reasons: string[] = [];

      const fullTourText = [
        tour.name,
        tour.shortDescription,
        tour.fullDescription,
        tour.destination?.name,
        tour.destination?.province,
        tour.tourTheme,
      ]
        .filter(Boolean)
        .join(" ");

      const destinationFullText = [
        tour.destination?.name,
        tour.destination?.province,
        tour.name,
        tour.shortDescription,
        tour.fullDescription,
        tour.tourTheme,
      ]
        .filter(Boolean)
        .join(" ");

      const isCoolDestination = this.isCoolDestinationText(destinationFullText);
      const isBeachDestination =
        this.isBeachDestinationText(destinationFullText);
      const isCoolBeachDestination =
        this.isCoolBeachDestinationText(destinationFullText);

      // 1. Điểm đến là yếu tố quan trọng nhất
      if (requestedDestinationNorm) {
        if (
          destinationNorm.includes(requestedDestinationNorm) ||
          requestedDestinationNorm.includes(destinationNorm) ||
          provinceNorm.includes(requestedDestinationNorm)
        ) {
          score += 80;
          reasons.push("đúng điểm đến bạn đang quan tâm");
        } else {
          score -= 35;
        }
      }

      // 2. Nếu user gõ trực tiếp tên điểm đến trong câu
      if (normalizedMessage) {
        if (destinationNorm && normalizedMessage.includes(destinationNorm)) {
          score += 35;
          reasons.push(`khớp điểm đến ${tour.destination?.name}`);
        }

        if (provinceNorm && normalizedMessage.includes(provinceNorm)) {
          score += 18;
          reasons.push(`khớp khu vực ${tour.destination?.province}`);
        }

        if (
          tourNameNorm &&
          this.keywordOverlapScore(normalizedMessage, tourNameNorm) >= 2
        ) {
          score += 12;
        }

        score += this.keywordOverlapScore(normalizedMessage, fullTourText) * 2;
      }

      // 3. Theme du lịch: biển đảo, gia đình, nghỉ dưỡng, văn hóa...
      if (requestedThemes.length) {
        const matchedTheme = requestedThemes.some((theme) => {
          if (theme === themeNorm) return true;

          if (theme === "beach") {
            return /phu quoc|nha trang|ha long|quy nhon|bien|dao/.test(
              `${destinationNorm} ${tourNameNorm}`,
            );
          }

          if (theme === "mountain") {
            return /da lat|sa pa|sapa|moc chau|ha giang|nui|san may/.test(
              `${destinationNorm} ${tourNameNorm}`,
            );
          }

          if (theme === "eco") {
            return /can tho|mien tay|ca mau|an giang|sinh thai|song nuoc/.test(
              `${destinationNorm} ${tourNameNorm}`,
            );
          }

          if (theme === "luxury") {
            return Number(tour.hotelStars || 0) >= 4;
          }

          return false;
        });

        if (matchedTheme) {
          score += 22;
          reasons.push("phù hợp phong cách du lịch bạn nhắc tới");
        } else {
          score -= 5;
        }
      }

      // 4. Số ngày
      if (memory.durationDays) {
        const diff = Math.abs(Number(tour.durationDays) - memory.durationDays);

        if (diff === 0) {
          score += 24;
          reasons.push(`đúng ${memory.durationDays} ngày`);
        } else if (diff === 1) {
          score += 10;
          reasons.push("thời lượng khá gần nhu cầu");
        } else {
          score -= 4;
        }
      }

      // 5. Ngân sách
      if (memory.budgetMax) {
        if (cheapestAdultPrice <= memory.budgetMax) {
          score += 24;
          reasons.push("giá nằm trong ngân sách bạn nhắc tới");
        } else if (cheapestAdultPrice <= memory.budgetMax * 1.15) {
          score += 8;
          reasons.push("giá hơi nhỉnh hơn ngân sách một chút");
        } else {
          score -= 18;
        }
      }

      // 6. Khách sạn
      if (memory.hotelStars) {
        if (Number(tour.hotelStars || 0) >= memory.hotelStars) {
          score += 10;
          reasons.push(`khách sạn từ ${memory.hotelStars} sao`);
        } else {
          score -= 5;
        }
      }

      // 7. Loại tour
      if (memory.tourType && tour.tourType === memory.tourType) {
        score += 8;
        reasons.push(
          memory.tourType === "private"
            ? "đúng kiểu tour riêng"
            : "đúng kiểu ghép đoàn",
        );
      }

      // 8. Tháng khởi hành
      if (monthFilter) {
        if (nextDeparture) {
          score += 12;
          reasons.push("có lịch khởi hành đúng tháng bạn muốn");
        } else {
          score -= 12;
        }
      }

      // 9. Ý định mềm theo khí hậu / phong cách điểm đến.
      // Câu "mát mẻ" phải kéo Đà Lạt/Sa Pa/Mộc Châu lên, không để giá rẻ kéo sang biển.
      if (wantsCoolWeather || wantsMountain) {
        if (isCoolDestination) {
          score += 55;
          reasons.push("phù hợp nhu cầu đi nơi mát mẻ/nghỉ dưỡng");
        } else if (isBeachDestination && !wantsBeach) {
          score -= 45;
        } else {
          score -= 12;
        }
      }

      // Câu "đi biển" phải kéo Phú Quốc/Nha Trang/Hạ Long/Quy Nhơn lên.
      if (wantsBeach) {
        if (isBeachDestination) {
          score += 55;
          reasons.push("phù hợp nhu cầu đi biển/biển đảo");
        } else if (isCoolDestination) {
          score -= 25;
        }
      }

      // 9.1. Nhu cầu kết hợp: biển + mát mẻ.
      // Ưu tiên các điểm biển có tính nghỉ dưỡng, dễ chịu, nhiều cảnh đẹp.
      if (wantsCoolBeach) {
        if (isCoolBeachDestination) {
          score += 28;
          reasons.push("phù hợp nhu cầu đi biển và nghỉ dưỡng dễ chịu");
        } else if (isBeachDestination) {
          score += 12;
          reasons.push("có yếu tố biển/biển đảo");
        } else {
          score -= 18;
        }
      }

      // 9.2. Nhu cầu đi nhẹ nhàng, không quá mệt.
      if (wantsLightTrip) {
        const duration = Number(tour.durationDays || 0);
        const themeText = this.stripText(
          `${tour.tourTheme || ""} ${tour.name || ""} ${tour.shortDescription || ""}`,
        );

        if (
          themeText.includes("family") ||
          themeText.includes("nghi duong") ||
          themeText.includes("eco") ||
          duration <= 3
        ) {
          score += 22;
          reasons.push("lịch trình phù hợp nhu cầu đi nhẹ nhàng");
        } else if (
          themeText.includes("adventure") ||
          themeText.includes("mao hiem")
        ) {
          score -= 25;
        }
      }

      // 9.3. Nhu cầu chụp ảnh, cảnh đẹp, check-in.
      if (wantsPhoto) {
        const text = this.stripText(destinationFullText);

        if (
          /\b(da lat|sapa|sa pa|nha trang|quy nhon|da nang|hoi an|ha long|phu quoc|ninh binh|moc chau|ha giang|bien|dao|san may|pho co)\b/.test(
            text,
          )
        ) {
          score += 18;
          reasons.push("có nhiều cảnh đẹp phù hợp chụp hình");
        }
      }

      // 9.4. Nhu cầu resort/khách sạn tốt/nghỉ dưỡng.
      if (wantsResort) {
        if (Number(tour.hotelStars || 0) >= 4) {
          score += 24;
          reasons.push("khách sạn/resort phù hợp nhu cầu nghỉ dưỡng");
        } else {
          score -= 6;
        }
      }

      // 9.5. Nhu cầu gia đình.
      if (wantsFamily) {
        const text = this.stripText(
          `${tour.tourTheme || ""} ${tour.name || ""} ${tour.shortDescription || ""}`,
        );

        if (text.includes("family") || text.includes("gia dinh")) {
          score += 45;
          reasons.unshift("phù hợp nhóm gia đình");
        } else if (Number(tour.durationDays || 0) <= 3) {
          score += 14;
          reasons.push("thời lượng phù hợp gia đình");
        }
      }

      // 9.6. Nhu cầu ăn uống/đặc sản.
      if (wantsFood) {
        const text = this.stripText(destinationFullText);

        if (
          /\b(nha trang|phu quoc|da nang|hoi an|hue|can tho|mien tay|da lat|hai san|dac san|am thuc)\b/.test(
            text,
          )
        ) {
          score += 10;
          reasons.push("phù hợp trải nghiệm ẩm thực/đặc sản");
        }
      }

      // 9.7. Nhu cầu thiên nhiên.
      if (wantsNature) {
        if (isCoolDestination || isBeachDestination) {
          score += 12;
          reasons.push("phù hợp nhu cầu cảnh đẹp thiên nhiên");
        }
      }

      // 10. Điểm kinh doanh chỉ là phụ
      if (tour.isBestDeal) {
        score += 4;
        reasons.push("đang có ưu đãi tốt");
      }

      if (tour.isTrending) {
        score += 3;
        reasons.push("được nhiều khách quan tâm");
      }

      score += avgRating * 0.8;
      score += Math.log10(bookingCount + 1) * 1.5;

      // 10. Điều chỉnh theo ý định sắp xếp
      if (sortPreference === "cheap") {
        score += Math.max(0, 12 - cheapestAdultPrice / 1_000_000);
      }

      if (sortPreference === "premium") {
        score += Number(tour.hotelStars || 0) * 2;
      }

      if (sortPreference === "popular") {
        score += bookingCount * 0.8 + (tour.isTrending ? 8 : 0);
      }

      if (sortPreference === "rating") {
        score += avgRating * 3;
      }

      return {
        tour,
        score,
        nextDeparture,
        cheapestAdultPrice,
        reasons,
      };
    });

    const hasStrongFilter = Boolean(
      (!ignoreMemoryDestination && memory.destination) ||
      memory.budgetMax ||
      memory.durationDays ||
      memory.departureMonth ||
      requestedThemes.length ||
      normalizedMessage,
    );

    const scoredDepartures = scored
      .filter((item) => {
        if (hasStrongFilter && item.score <= 0) return false;

        if (
          memory.budgetMax &&
          Number(item.cheapestAdultPrice || 0) > Number(memory.budgetMax)
        ) {
          return false;
        }

        if (
          memory.durationDays &&
          Number(item.tour?.durationDays || 0) !== Number(memory.durationDays)
        ) {
          return false;
        }

        if (
          memory.durationNights !== null &&
          memory.durationNights !== undefined &&
          Number(item.tour?.durationNights || 0) !==
            Number(memory.durationNights)
        ) {
          return false;
        }

        if (monthFilter && !item.nextDeparture) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortPreference === "cheap") {
          return a.cheapestAdultPrice - b.cheapestAdultPrice;
        }
        return b.score - a.score;
      })
      .slice(0, Math.max(this.getMaxTourResults() * 3, 3))
      .map((item) => {
        const departures = monthFilter
          ? (item.tour.departures || []).filter((departure: any) => {
              const date = new Date(departure.departureDate);
              const dateKey = `${date.getFullYear()}-${String(
                date.getMonth() + 1,
              ).padStart(2, "0")}`;
              return dateKey === monthFilter;
            })
          : (item.tour.departures || []).length
            ? item.tour.departures
            : item.nextDeparture
              ? [item.nextDeparture]
              : [];
        return departures.map((departure: any) => ({
          ...departure,
          tour: item.tour,
          _chatbotReasons: this.pickTopReasons(item.reasons),
          _chatbotScore: item.score,
        }));
      })
      .flat();

    const groups = groupDeparturesByTour(scoredDepartures, {
      maxTours: this.getMaxTourResults(),
      maxDeparturesPerTour: this.getMaxDeparturesPerTour(),
      requestedDate: memory.departureMonth
        ? `${memory.departureMonth}-01`
        : null,
    });

    return groups.map((group: any) => {
      const firstDeparture = group.departures?.[0] || null;
      const reasons = firstDeparture?._chatbotReasons || [
        "tour phù hợp với tiêu chí bạn đang tìm",
      ];
      const card = this.toTourCard(group.tour, firstDeparture, reasons);
      return {
        ...card,
        departureId:
          group.departureSummaries.length === 1 ? card.departureId : null,
        departureDate:
          group.departureSummaries.length === 1 ? card.departureDate : null,
        departures: group.departureSummaries,
        priceAdult: group.priceFrom || card.priceAdult,
        priceFrom: group.priceFrom || card.priceAdult,
      };
    });
  }

  private resolveCandidateTourFromOption(
    option: { tourId?: string | null },
    memory: MemoryState,
  ) {
    const groups = Array.isArray(memory.candidateTours)
      ? memory.candidateTours
      : [];
    return (
      groups.find((group) => String(group.tourId) === String(option?.tourId)) ||
      null
    );
  }

  private resolveCandidateDepartureChoiceFromMessage(
    message: string,
    memory: MemoryState,
  ) {
    const context = memory.bookingContext;
    const waitingDeparture =
      context?.state === "WAITING_DEPARTURE_SELECTION" &&
      !this.isBookingContextExpired(context);

    // Khi chatbot vừa hiển thị danh sách lịch đã được lọc theo trạng thái/chỗ trống
    // và loại các lịch trùng booking, phải resolve "lịch số N" đúng trên chính
    // displayedDepartures mà người dùng đang nhìn thấy. Không dùng candidateTours
    // ở bước này vì candidateTours có thể còn chứa lịch cũ/chưa qua bộ lọc xung đột.
    if (waitingDeparture && context?.selectedTourId) {
      const displayedDepartures = Array.isArray(context.displayedDepartures)
        ? context.displayedDepartures
        : [];

      if (!displayedDepartures.length) return null;

      const ordinal = this.extractOrdinalSelection(
        message,
        displayedDepartures.length,
      );
      if (ordinal == null) return null;

      const index = ordinal - 1;
      if (index < 0 || index >= displayedDepartures.length) return null;

      const departure = displayedDepartures[index];
      if (!departure?.departureId) return null;

      return {
        tourId: String(context.selectedTourId),
        departureId: String(departure.departureId),
        index: ordinal,
        startDate: departure.departureDate || null,
      };
    }

    const selectedTourId = memory.selectedCandidateTourId;
    if (!selectedTourId) return null;

    const group = (memory.candidateTours || []).find(
      (item) => String(item.tourId) === String(selectedTourId),
    );
    if (!group?.departures?.length) return null;

    const ordinal = this.extractOrdinalSelection(
      message,
      group.departures.length,
    );
    if (ordinal == null) return null;

    const index = ordinal - 1;
    if (index < 0 || index >= group.departures.length) return null;

    const departure = group.departures[index];
    if (!departure?.departureId) return null;

    return {
      tourId: String(group.tourId),
      departureId: String(departure.departureId),
      index: ordinal,
      startDate: departure.departureDate || null,
    };
  }

  private async findPersonalizedTours(
    user: AuthUser,
    memory: MemoryState,
  ): Promise<TourCard[]> {
    try {
      // Dùng trực tiếp hệ thống gợi ý Hybrid đang chạy ở trang chủ để chatbot
      // và giao diện trả cùng một kết quả, tránh duy trì hai thuật toán khác nhau.
      const result = await this.recommendationsService.recommend(
        user?.userId,
        5,
        false,
      );

      const rows = Array.isArray((result as any)?.data)
        ? (result as any).data
        : [];

      const cards = rows
        .filter((tour: any) => tour?.id)
        .map((tour: any) => {
          const departure = Array.isArray(tour.departures)
            ? tour.departures.find((item: any) => {
                const remaining =
                  Number(item?.totalSlots || 0) -
                  Number(item?.bookedSlots || 0) -
                  Number(item?.heldSlots || 0);
                return remaining > 0;
              }) || tour.departures[0]
            : null;

          const reasons = Array.isArray(tour.recommendationReasons)
            ? tour.recommendationReasons.filter(Boolean)
            : [];

          return this.toTourCard(
            tour,
            departure,
            reasons.length
              ? reasons.slice(0, 3)
              : [
                  user?.userId
                    ? "phù hợp với hành vi và sở thích gần đây của bạn"
                    : "tour nổi bật đang có lịch khởi hành",
                ],
          );
        });

      if (cards.length) return cards;
    } catch (error: any) {
      console.error(
        "[Chatbot personalized recommendation error]",
        error?.message || error,
      );
    }

    // Fallback an toàn khi recommendation service tạm lỗi hoặc chưa có dữ liệu.
    return this.findRelevantTours(memory, "");
  }

  private async findRelevantFaqs(
    userMessage: string,
    intent: string,
  ): Promise<FaqPreview[]> {
    if (!["tour_policy", "general_consulting", "follow_up"].includes(intent))
      return [];
    const keyword = this.stripText(userMessage)
      .split(" ")
      .filter((w) => w.length >= 3)
      .slice(0, 5);
    const rows = await this.prisma.faq.findMany({
      where: {
        status: "active",
        ...(keyword.length
          ? {
              OR: keyword.flatMap((word) => [
                { question: { contains: word } },
                { answer: { contains: word } },
                { topic: { contains: word } },
              ]),
            }
          : {}),
      },
      orderBy: { displayOrder: "asc" },
      take: 5,
    });
    if (rows.length)
      return rows.map((item: any) => ({
        question: item.question,
        answer: item.answer,
        topic: item.topic || null,
      }));

    const fallback = await this.prisma.faq.findMany({
      where: { status: "active" },
      orderBy: { displayOrder: "asc" },
      take: 4,
    });
    return fallback.map((item: any) => ({
      question: item.question,
      answer: item.answer,
      topic: item.topic || null,
    }));
  }

  private extractBookingCode(message: string) {
    const match = String(message)
      .toUpperCase()
      .match(/BK[A-Z0-9\-]+/);
    return match?.[0] || "";
  }

  private async findRelevantBookings(
    intent: string,
    user: AuthUser,
    userMessage: string,
  ): Promise<BookingCard[]> {
    if (!["booking_status", "booking_change", "tour_policy"].includes(intent))
      return [];
    if (!user?.userId) return [];
    const bookingCode = this.extractBookingCode(userMessage);
    const rows = await this.prisma.booking.findMany({
      where: {
        userId: user.userId,
        ...(bookingCode
          ? { bookingCode }
          : {
              bookingStatus: {
                notIn: [
                  "cancelled",
                  "cancelled_by_customer",
                  "cancelled_by_operator",
                  "expired",
                ],
              },
            }),
      },
      include: {
        tour: { include: { destination: true } },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        pickupPoint: true,
      },
      orderBy: { createdAt: "desc" },
      take: bookingCode ? 1 : 3,
    });
    return rows.map((booking: any) => this.toBookingCard(booking));
  }

  private async findRelevantVouchers(
    intent: string,
    user: AuthUser,
  ): Promise<VoucherCard[]> {
    if (
      !["voucher_check", "booking_create", "booking_change"].includes(intent)
    ) {
      return [];
    }

    if (!user?.userId) return [];

    const db = this.prisma as any;
    if (!db.userVoucher) return [];

    const now = new Date();

    const rows = await db.userVoucher.findMany({
      where: {
        userId: user.userId,
        status: "available",
        voucher: {
          status: "active",
          startDate: { lte: now },
          endDate: { gte: now },
        },
      },
      include: { voucher: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    return rows.map((row: any) => this.toVoucherCard(row.voucher, row.status));
  }

  private async findRelevantPickupPoints(
    intent: string,
    memory: MemoryState,
    userMessage: string,
  ): Promise<PickupPointCard[]> {
    if (intent !== "pickup_point") return [];
    const db = this.prisma as any;
    if (!db.tourPickupPoint) return [];

    const normalized = this.stripText(userMessage);
    const provinceKeyword = this.detectProvinceKeyword(normalized);
    const destination = memory.destination
      ? this.stripText(memory.destination)
      : "";

    const points = await db.tourPickupPoint.findMany({
      where: {
        status: "active",
        ...(provinceKeyword ? { province: { contains: provinceKeyword } } : {}),
        ...(destination
          ? {
              tour: {
                OR: [
                  { name: { contains: memory.destination } },
                  { destination: { name: { contains: memory.destination } } },
                ],
              },
            }
          : {}),
      },
      include: {
        tour: {
          include: {
            destination: true,
          },
        },
      },
      orderBy: [{ province: "asc" }, { pickupTime: "asc" }],
      take: 8,
    });

    return points.map((point: any) => ({
      id: String(point.id),
      tourName: point.tour?.name || "Tour Travela",
      province: point.province || "",
      name: point.name || "",
      address: point.address || "",
      pickupTime: point.pickupTime
        ? new Date(point.pickupTime).toISOString()
        : null,
      note: point.note || null,
    }));
  }

  private detectProvinceKeyword(normalized: string) {
    const known = [
      "can tho",
      "cần thơ",
      "rach gia",
      "rạch giá",
      "an giang",
      "da lat",
      "đà lạt",
      "ho chi minh",
      "hồ chí minh",
      "ha noi",
      "hà nội",
    ];
    const found = known.find((item) =>
      normalized.includes(this.stripText(item)),
    );
    if (!found) return "";
    const map: Record<string, string> = {
      "can tho": "Cần Thơ",
      "cần thơ": "Cần Thơ",
      "rach gia": "Rạch Giá",
      "rạch giá": "Rạch Giá",
      "an giang": "An Giang",
      "da lat": "Đà Lạt",
      "đà lạt": "Đà Lạt",
      "ho chi minh": "Hồ Chí Minh",
      "hồ chí minh": "Hồ Chí Minh",
      "ha noi": "Hà Nội",
      "hà nội": "Hà Nội",
    };
    return map[found] || found;
  }

  private isChangePartySizeUiRequest(message: string) {
    const normalized = this.stripText(message);
    return /\b(doi so khach|doi so luong khach|doi so nguoi|thay doi so khach)\b/.test(
      normalized,
    );
  }

  private isChangePickupUiRequest(message: string) {
    const normalized = this.stripText(message);
    return /\b(doi diem don|chon lai diem don|thay doi diem don)\b/.test(
      normalized,
    );
  }

  private isChangeVoucherUiRequest(message: string) {
    const normalized = this.stripText(message);
    return /\b(doi voucher|chon lai voucher|thay doi voucher|doi ma giam gia)\b/.test(
      normalized,
    );
  }

  private async processBookingFlow(
    ctx: PromptContext,
    memory: MemoryState,
    user: AuthUser,
  ): Promise<{
    answer: string;
    memory?: Partial<MemoryState>;
    bookingCheckout?: BookingCheckoutCard;
    suggestedReplies?: string[];
  } | null> {
    if (ctx.intent !== "booking_create") {
      return null;
    }

    const draft: ChatBookingDraft = {
      ...(memory.bookingDraft || {}),
      started: true,
    };
    const bookingContext = memory.bookingContext;

    if (
      bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
      !this.isBookingContextExpired(bookingContext) &&
      this.isChangeTourRequest(ctx.userMessage) &&
      bookingContext.displayedTours.length
    ) {
      return {
        answer: [
          "Mình quay lại danh sách tour gần nhất nha:",
          "",
          ...bookingContext.displayedTours.map(
            (tour) => `${tour.index}. ${tour.name}`,
          ),
          "",
          `Bạn vui lòng chọn ${this.buildChoiceRangeText(
            bookingContext.displayedTours.length,
            "tour",
          )}.`,
        ].join("\n"),
        memory: {
          bookingContext: {
            ...bookingContext,
            state: "WAITING_TOUR_SELECTION",
            selectedTourId: undefined,
            selectedTourName: undefined,
            selectedTourSlug: undefined,
            displayedDepartures: [],
            selectedDepartureId: undefined,
            selectedDepartureDate: undefined,
            updatedAt: new Date().toISOString(),
          },
          bookingDraft: { ...draft, tourId: null, departureId: null },
        },
      };
    }

    if (this.isBookingConfirmationMessage(ctx.userMessage)) {
      draft.confirmed = true;
    }

    if (this.wantsBestVoucher(ctx.userMessage)) {
      draft.skipVoucher = false;
      draft.voucherCode = "__BEST__";
      draft.confirmed = false;
    }

    if (this.isChangePartySizeUiRequest(ctx.userMessage)) {
      draft.adultCount = null;
      draft.childCount = 0;
      draft.confirmed = false;
      draft.passengerInfoConfirmed = false;
      draft.guests = [];

      return {
        answer: "Bạn chọn lại số lượng người lớn và trẻ em bên dưới nha.",
        memory: { bookingDraft: draft },
      };
    }

    if (this.isChangePickupUiRequest(ctx.userMessage)) {
      draft.pickupPointId = null;
      draft.confirmed = false;
    }

    if (this.isChangeVoucherUiRequest(ctx.userMessage)) {
      draft.voucherCode = null;
      draft.skipVoucher = false;
      draft.confirmed = false;
    }

    const normalizedBookingMessage = this.stripText(ctx.userMessage);

    const isBookingSubstepAction =
      Boolean(draft.started && draft.tourId) &&
      (/\b(chon diem don|diem don ma|ma diem don|pickup)\b/.test(
        normalizedBookingMessage,
      ) ||
        /\b(voucher|ma giam gia|khong dung voucher|dung voucher|ap voucher)\b/.test(
          normalizedBookingMessage,
        ) ||
        this.isPartySizeMessage(ctx.userMessage) ||
        /\b(xac nhan thong tin hanh khach|nguoi lon\s*\d+\s*ho ten|tre em\s*\d+\s*ho ten)\b/.test(
          normalizedBookingMessage,
        ) ||
        /\b(xac nhan dat|xac nhan booking|thanh toan|qr|vietqr|sepay|chuyen khoan)\b/.test(
          normalizedBookingMessage,
        ));

    // Chỉ coi tên địa danh là "đổi điểm đến/tour" khi user thực sự đang
    // tìm/chọn tour mới. Tên tỉnh nằm trong tên/địa chỉ điểm đón không được
    // phép đổi tour đang đặt.
    const explicitDestination = isBookingSubstepAction
      ? null
      : this.detectDestination(normalizedBookingMessage);

    const activeBookingContext =
      bookingContext && !this.isBookingContextExpired(bookingContext)
        ? bookingContext
        : null;

    const shouldResolveTourChoice =
      !this.isPartySizeMessage(ctx.userMessage) &&
      (!activeBookingContext ||
        ["SHOWING_TOUR_LIST", "WAITING_TOUR_SELECTION"].includes(
          activeBookingContext.state,
        ) ||
        this.hasExplicitTourSelectionSignal(ctx.userMessage));

    const selectedTourOption = shouldResolveTourChoice
      ? this.resolveTourChoiceFromMessage(ctx.userMessage, memory)
      : null;
    if (selectedTourOption) {
      // Guard phòng thủ: dữ liệu số khách không bao giờ được phép reset tour/lịch.
      if (this.isPartySizeMessage(ctx.userMessage)) {
        return {
          answer:
            "Mình đã nhận số lượng khách. Mình tiếp tục xử lý booking hiện tại nha.",
          memory: { bookingDraft: draft },
        };
      }

      // Khi user nhắn “đặt tour 1/đặt tour số 1”, xem như bắt đầu một đơn mới.
      // Không kéo lại số khách, voucher, điểm đón, phương thức thanh toán từ đơn cũ.
      draft.tourId = selectedTourOption.tourId;
      draft.departureId = selectedTourOption.departureId || null;
      draft.pickupPointId = null;
      draft.voucherCode = null;
      draft.skipVoucher = false;
      draft.paymentMethod = null;
      draft.adultCount = null;
      draft.childCount = 0;
      draft.confirmed = false;

      const candidateTour = this.resolveCandidateTourFromOption(
        selectedTourOption,
        memory,
      );

      // Không dùng danh sách lịch cache trên TourCard để đặt.
      // Sau khi bấm "Đặt tour", luôn query lại lịch thật đang mở và
      // loại lịch trùng với booking hiện có của người dùng.
      const selectedTourId = BigInt(selectedTourOption.tourId);
      const validDepartures = await this.findBookableDepartureOptions(
        selectedTourId,
        user?.userId || null,
      );

      const departureOptions = validDepartures
        .slice(0, this.getMaxDeparturesPerTour())
        .map((departure: any, index: number) =>
          this.toDepartureMemoryOption(selectedTourId, departure, index),
        );

      const nextBookingContext: ChatBookingContext = {
        ...(bookingContext || this.buildTourListBookingContext([])),
        state: "WAITING_DEPARTURE_SELECTION",
        displayedTours: bookingContext?.displayedTours?.length
          ? bookingContext.displayedTours
          : (memory.lastTourOptions || []).map((item, index) => ({
              index: index + 1,
              tourId: item.tourId,
              name: item.name,
            })),
        selectedTourId: String(selectedTourId),
        selectedTourName: String(selectedTourOption.name || ""),
        selectedTourSlug: bookingContext?.displayedTours?.find(
          (item) => String(item.tourId) === String(selectedTourId),
        )?.slug,
        displayedDepartures: departureOptions.map((item) => ({
          index: item.index,
          departureId: item.departureId,
          departureDate: item.startDate,
          availableSeats: item.availableSlots,
          status: item.status,
          adultPrice: item.adultPrice,
        })),
        selectedDepartureId: undefined,
        selectedDepartureDate: undefined,
        updatedAt: new Date().toISOString(),
      };

      if (!departureOptions.length) {
        return {
          answer: [
            `Tour ${selectedTourOption.name || ""} hiện không có lịch khởi hành nào bạn có thể đặt.`,
            "Các lịch đã hết hạn/đóng bán/hết chỗ hoặc bị trùng thời gian với tour bạn đã đặt sẽ không được hiển thị.",
            "Bạn có thể chọn tour khác hoặc kiểm tra lại các booking hiện có.",
          ].join("\n"),
          memory: {
            bookingDraft: {
              ...draft,
              tourId: String(selectedTourId),
              departureId: null,
            },
            selectedCandidateTourId: String(selectedTourId),
            lastDepartureOptions: [],
            bookingContext: nextBookingContext,
          },
        };
      }

      // Luôn để user chọn lịch bằng nút, kể cả chỉ còn đúng 1 lịch hợp lệ.
      return {
        answer: [
          `Mình tìm thấy ${departureOptions.length} lịch khởi hành hiện còn hợp lệ cho tour này.`,
          "Các lịch trùng với tour/booking đang còn hiệu lực của bạn đã được loại bỏ.",
          "Bạn chọn một lịch bên dưới để tiếp tục đặt tour nha.",
        ].join("\n"),
        memory: {
          bookingDraft: {
            ...draft,
            tourId: String(selectedTourId),
            departureId: null,
          },
          selectedCandidateTourId: String(selectedTourId),
          lastDepartureOptions: departureOptions,
          bookingContext: nextBookingContext,
        },
      };
    }

    // Ưu tiên xử lý “chọn lịch số 1/2/3” trước khi validate departure cũ.
    // Nếu không, draft.departureId cũ sẽ bị kiểm tra trước và bot cứ lặp lại danh sách lịch.
    const selectedCandidateDeparture =
      this.resolveCandidateDepartureChoiceFromMessage(ctx.userMessage, memory);
    if (selectedCandidateDeparture) {
      draft.tourId = selectedCandidateDeparture.tourId || draft.tourId || null;
      draft.departureId = selectedCandidateDeparture.departureId;

      if (
        bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
        !this.isBookingContextExpired(bookingContext)
      ) {
        memory.bookingContext = {
          ...bookingContext,
          state: "WAITING_BOOKING_CONFIRMATION",
          selectedDepartureId: selectedCandidateDeparture.departureId,
          selectedDepartureDate: selectedCandidateDeparture.startDate || null,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (
      bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
      !this.isBookingContextExpired(bookingContext)
    ) {
      const ordinal = this.extractOrdinalSelection(
        ctx.userMessage,
        bookingContext.displayedDepartures.length,
      );
      if (
        ordinal != null &&
        (ordinal < 1 || ordinal > bookingContext.displayedDepartures.length)
      ) {
        return {
          answer: `Tour này chỉ có ${
            bookingContext.displayedDepartures.length
          } lịch khởi hành đang mở bán. Bạn vui lòng chọn ${this.buildChoiceRangeText(
            bookingContext.displayedDepartures.length,
            "lịch",
          )}.`,
          memory: { bookingDraft: draft, bookingContext },
        };
      }
    }

    const selectedDepartureOption = this.resolveDepartureChoiceFromMessage(
      ctx.userMessage,
      memory,
    );
    if (!selectedCandidateDeparture && selectedDepartureOption) {
      draft.tourId = selectedDepartureOption.tourId || draft.tourId || null;
      draft.departureId = selectedDepartureOption.departureId;
      if (
        bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
        !this.isBookingContextExpired(bookingContext)
      ) {
        memory.bookingContext = {
          ...bookingContext,
          state: "WAITING_BOOKING_CONFIRMATION",
          selectedDepartureId: selectedDepartureOption.departureId,
          selectedDepartureDate: selectedDepartureOption.startDate,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    // Nếu câu hiện tại có nhắc rõ điểm đến, ưu tiên tour tìm được từ câu hiện tại.
    // Không dùng lastTourId cũ để tránh đặt Nha Trang nhưng tạo nhầm Phú Quốc.
    if (
      explicitDestination &&
      ctx.tours[0]?.tourId &&
      (this.isFreshTourSearchRequest(ctx.userMessage) ||
        this.hasExplicitTourSelectionSignal(ctx.userMessage))
    ) {
      draft.tourId = ctx.tours[0].tourId;
      if (!selectedCandidateDeparture && !selectedDepartureOption) {
        draft.departureId = ctx.tours[0].departureId;
      }
    } else {
      if (!draft.tourId && memory.lastTourId) draft.tourId = memory.lastTourId;
      if (!draft.tourId && ctx.tours[0]?.tourId)
        draft.tourId = ctx.tours[0].tourId;
      const waitingDepartureSelection =
        memory.bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
        !this.isBookingContextExpired(memory.bookingContext);

      if (
        !waitingDepartureSelection &&
        !draft.departureId &&
        ctx.tours[0]?.departureId
      ) {
        draft.departureId = ctx.tours[0].departureId;
      }
    }

    // Không tự lấy partySize/memory cũ làm số khách khi tạo booking.
    // Số khách phải do user xác nhận rõ trong luồng đặt vé để tránh tạo nhầm 3 người lớn, 4 người lớn...
    if (draft.childCount == null) draft.childCount = 0;
    // Không tự mặc định thanh toán Momo. User phải chọn rõ Momo/VNPay/... để tránh bot tự thêm thông tin.

    if (!user?.userId) {
      return {
        answer:
          "Mình có thể hỗ trợ đặt tour ngay trong chatbot, nhưng bạn cần đăng nhập trước để hệ thống giữ chỗ, kiểm tra CCCD/số điện thoại và tạo mã thanh toán an toàn. Sau khi đăng nhập, bạn nhắn lại: ‘Đặt tour này cho tôi’.",
        memory: { bookingDraft: draft },
      };
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        identityNumber: true,
        birthDate: true,
        gender: true,
        refundBankName: true,
        refundAccountNo: true,
        refundAccountName: true,
        status: true,
        role: true,
      },
    });

    if (!account) {
      return {
        answer:
          "Mình chưa tìm thấy tài khoản của bạn. Bạn đăng nhập lại rồi đặt tour giúp mình nha.",
        memory: { bookingDraft: draft },
      };
    }

    if (account.status !== "active") {
      return {
        answer:
          "Tài khoản của bạn hiện chưa ở trạng thái hoạt động nên chưa thể đặt tour qua chatbot.",
        memory: { bookingDraft: draft },
      };
    }

    if (!account.phone) {
      return {
        answer:
          "Để đặt tour qua chatbot, bạn cần cập nhật số điện thoại trong hồ sơ trước để Travela có thể liên hệ và giữ chỗ đúng người.",
        memory: { bookingDraft: draft },
      };
    }

    // CCCD/ngày sinh/giới tính nếu hồ sơ còn thiếu sẽ được nhập trực tiếp
    // tại form thông tin hành khách của chatbot, giống form đặt tour thường.

    const tourId =
      draft.tourId && /^\d+$/.test(draft.tourId) ? BigInt(draft.tourId) : null;
    if (!tourId) {
      return {
        answer:
          "Bạn muốn đặt tour nào nè? Bạn có thể hỏi ‘Gợi ý tour Đà Lạt 3 ngày’, sau đó nhắn ‘Đặt tour này cho tôi’. Mình sẽ lấy đúng tour vừa tư vấn để tạo booking.",
        memory: { bookingDraft: draft },
      };
    }

    const tour = await this.prisma.tour.findFirst({
      where: { id: tourId, status: "published" as any },
      include: { destination: true },
    });

    if (!tour) {
      return {
        answer:
          "Tour bạn muốn đặt hiện không còn mở bán hoặc chưa được công bố. Bạn chọn tour khác giúp mình nha.",
        memory: { bookingDraft: { ...draft, tourId: null } },
      };
    }

    if (
      explicitDestination &&
      (this.isFreshTourSearchRequest(ctx.userMessage) ||
        this.hasExplicitTourSelectionSignal(ctx.userMessage))
    ) {
      const tourDestination = this.stripText(tour.destination?.name || "");
      const requestedDestination = this.stripText(explicitDestination);
      if (
        tourDestination &&
        requestedDestination &&
        !tourDestination.includes(requestedDestination) &&
        !requestedDestination.includes(tourDestination)
      ) {
        return {
          answer: `Mình thấy bạn muốn đặt tour ${explicitDestination}, nhưng dữ liệu hiện tại đang trỏ sang tour ${tour.name}. Mình sẽ không tạo booking để tránh đặt nhầm. Bạn nhắn lại “gợi ý tour ${explicitDestination}” rồi chọn tour muốn đặt nha.`,
          memory: { bookingDraft: null },
        };
      }
    }

    const openDepartures = await this.findBookableDepartureOptions(
      tour.id,
      user?.userId || null,
    );
    const departureOptionsForMemory = openDepartures
      .slice(0, this.getMaxDeparturesPerTour())
      .map((item: any, index: number) =>
        this.toDepartureMemoryOption(tour.id, item, index),
      );
    const departureBookingContext: ChatBookingContext = {
      ...(memory.bookingContext || this.buildTourListBookingContext([])),
      state: "WAITING_DEPARTURE_SELECTION",
      displayedTours: memory.bookingContext?.displayedTours?.length
        ? memory.bookingContext.displayedTours
        : memory.lastTourOptions?.map((item, index) => ({
            index: index + 1,
            tourId: item.tourId,
            name: item.name,
          })) || [],
      selectedTourId: String(tour.id),
      selectedTourName: String(tour.name || ""),
      selectedTourSlug: (tour as any).slug
        ? String((tour as any).slug)
        : undefined,
      displayedDepartures: departureOptionsForMemory.map((item) => ({
        index: item.index,
        departureId: item.departureId,
        departureDate: item.startDate,
        availableSeats: item.availableSlots,
        status: item.status,
        adultPrice: item.adultPrice,
      })),
      selectedDepartureId: undefined,
      selectedDepartureDate: undefined,
      updatedAt: new Date().toISOString(),
    };

    let departure = null as any;
    let selectedDepartureExpired = false;

    if (draft.departureId && /^\d+$/.test(draft.departureId)) {
      const selectedDeparture = await this.prisma.tourDeparture.findFirst({
        where: {
          id: BigInt(draft.departureId),
          tourId: tour.id,
          status: { in: ["open", "full"] as any },
        },
        orderBy: { departureDate: "asc" },
      });

      if (selectedDeparture && this.isDepartureBookable(selectedDeparture)) {
        departure = selectedDeparture;
        departureBookingContext.state = "WAITING_BOOKING_CONFIRMATION";
        departureBookingContext.selectedDepartureId = String(
          selectedDeparture.id,
        );
        departureBookingContext.selectedDepartureDate =
          selectedDeparture.departureDate
            ? new Date(selectedDeparture.departureDate).toISOString()
            : null;
      } else if (selectedDeparture) {
        selectedDepartureExpired = true;
        draft.departureId = null;
      }
    }

    if (!departure && openDepartures.length >= 1) {
      const reason = selectedDepartureExpired
        ? "Lịch khởi hành bạn chọn trước đó không còn hợp lệ hoặc đang trùng với booking hiện có."
        : "Các lịch bên dưới đang mở, còn chỗ và không trùng với booking hiện có của bạn.";
      return {
        answer: [
          reason,
          "",
          `Bạn chọn lịch muốn đi của tour ${tour.name} nha:`,
          "",
          ...openDepartures
            .slice(0, this.getMaxDeparturesPerTour())
            .map((item: any, index: number) => {
              const available = this.getAvailableSlots(item);
              return `${index + 1}. ${this.formatDate(
                new Date(item.departureDate).toISOString(),
              )} - ${this.formatDate(
                item.endDate ? new Date(item.endDate).toISOString() : null,
              )}, giá từ ${this.formatCurrency(
                Number(item.adultPrice || tour.basePriceAdult || 0),
              )}/người, còn khoảng ${available} chỗ, trạng thái ${item.status}.`;
            }),
          "",
          "Bạn có thể nhắn: “chọn lịch số 1, điểm đón mã 35, dùng voucher BRONZE3X, thanh toán chuyển khoản, 1 người lớn”.",
        ].join("\n"),
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
          bookingContext: departureBookingContext,
        },
      };
    }

    if (!departure) {
      return {
        answer: `Tour ${tour.name} hiện chưa có lịch khởi hành còn mở để đặt. Bạn chọn tour khác hoặc hỏi mình tìm tour tương tự nha.`,
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
          bookingContext: departureBookingContext,
        },
      };
    }

    if (!draft.adultCount || Number(draft.adultCount) <= 0) {
      return {
        answer: [
          `Mình đã ghi nhận tour ${tour.name}${draft.pickupPointId ? `, điểm đón mã ${draft.pickupPointId}` : ""}${draft.voucherCode ? `, voucher ${draft.voucherCode}` : draft.skipVoucher ? ", không dùng voucher" : ""}${draft.paymentMethod ? ` và thanh toán ${draft.paymentMethod}` : ""}.`,
          "Bạn đi mấy người lớn, mấy trẻ em để mình tính đúng giá và giữ chỗ nha?",
          "Ví dụ: “1 người lớn” hoặc “2 người lớn, 1 trẻ em”.",
        ].join("\n"),
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
          bookingContext: departureBookingContext,
        },
      };
    }

    const adultCount = Math.max(Number(draft.adultCount || 1), 1);
    const childCount = Math.max(Number(draft.childCount || 0), 0);
    const requestedSlots = adultCount + childCount;
    const availableSlots = this.getAvailableSlots(departure);

    if (requestedSlots > availableSlots) {
      return {
        answer: `Lịch khởi hành ${this.formatDate(
          new Date(departure.departureDate).toISOString(),
        )} của tour ${tour.name} hiện chỉ còn ${availableSlots} chỗ, chưa đủ cho ${requestedSlots} khách. Bạn giảm số khách hoặc chọn lịch khác nha.`,
        memory: { bookingDraft: draft },
      };
    }

    // Đồng bộ Người lớn 1 với hồ sơ của người đặt tour.
    // Dữ liệu user đã nhập trong chatbot luôn được ưu tiên;
    // hồ sơ chỉ dùng để điền sẵn các field đang thiếu.
    const existingFirstAdult = (
      Array.isArray(draft.guests) ? draft.guests : []
    ).find((guest) => guest.guestType === "adult" && Number(guest.index) === 1);

    const accountBirthDate = account.birthDate
      ? new Date(account.birthDate).toISOString().slice(0, 10)
      : null;

    draft.guests = this.upsertGuestDraft(
      Array.isArray(draft.guests) ? draft.guests : [],
      {
        guestType: "adult",
        index: 1,
        fullName:
          this.normalizeGuestFullName(existingFirstAdult?.fullName) ||
          this.normalizeGuestFullName(account.fullName) ||
          this.normalizeGuestFullName(user?.fullName) ||
          null,
        dateOfBirth:
          existingFirstAdult?.dateOfBirth || accountBirthDate || null,
        gender: existingFirstAdult?.gender || account.gender || null,
        idNumber:
          existingFirstAdult?.idNumber || account.identityNumber || null,
      },
    );

    const missingPassengerSlots = this.getMissingPassengerSlots(
      draft,
      adultCount,
      childCount,
    );

    if (missingPassengerSlots.length > 0) {
      return {
        answer: this.buildPassengerInfoQuestion(
          tour.name,
          draft,
          adultCount,
          childCount,
        ),
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
          bookingContext: departureBookingContext,
        },
      };
    }

    const pickupOptions = await this.findPickupOptionsForBooking(
      tour.id,
      departure.id,
    );

    if (!draft.pickupPointId && pickupOptions.length) {
      return {
        answer: [
          `Tour ${tour.name} có các điểm đón sau:`,
          "",
          ...pickupOptions.map(
            (point: any, index: number) =>
              `${index + 1}. ${point.name} - ${point.address}${
                point.pickupTime
                  ? `, giờ đón ${this.formatTimeForChat(point.pickupTime)}`
                  : ""
              } (mã điểm đón: ${String(point.id)})`,
          ),
          "",
          `Bạn chọn một điểm đón bằng nút bên dưới để tiếp tục nha.`,
          `Bạn vẫn có thể nhập mã điểm đón bằng tay nếu muốn.`,
        ].join("\n"),
        memory: { bookingDraft: draft },
        suggestedReplies: pickupOptions.slice(0, 8).map((point: any) => {
          const time = point.pickupTime
            ? ` - ${this.formatTimeForChat(point.pickupTime)}`
            : "";
          return `Chọn điểm đón mã ${String(point.id)} - ${point.name}${time}`;
        }),
      };
    }

    if (!draft.voucherCode && !draft.skipVoucher) {
      const currentBookingAmount = this.calculateBookingAmount(
        departure,
        adultCount,
        childCount,
      );

      const availableVouchers = await this.findEligibleVouchersForBooking(
        user,
        currentBookingAmount,
      );

      if (availableVouchers.length) {
        return {
          answer: [
            `Bạn hiện có ${availableVouchers.length} voucher khả dụng:`,
            "",
            ...availableVouchers.map(
              (voucher, index) =>
                `${index + 1}. ${voucher.code} - ${voucher.discountText}${
                  voucher.minOrderAmount
                    ? `, áp dụng cho đơn từ ${this.formatCurrency(
                        voucher.minOrderAmount,
                      )}`
                    : ""
                }`,
            ),
            "",
            `Bạn chọn voucher bằng nút bên dưới, hoặc chọn “Không dùng voucher” để tiếp tục.`,
          ].join("\n"),
          memory: { bookingDraft: draft },
          suggestedReplies: [
            ...availableVouchers
              .slice(0, 6)
              .map(
                (voucher) =>
                  `Dùng voucher ${voucher.code} - ${voucher.discountText}`,
              ),
            "Không dùng voucher",
          ],
        };
      }

      return {
        answer: [
          `Bạn có muốn áp dụng voucher cho booking này không?`,
          `Hiện mình chưa thấy voucher khả dụng trong tài khoản hoặc voucher chưa đủ điều kiện.`,
          `Nếu có mã voucher riêng, hãy nhắn: “dùng voucher SALE10”.`,
          `Nếu không dùng voucher, hãy nhắn: “không dùng voucher”.`,
        ].join("\n"),
        memory: { bookingDraft: draft },
        suggestedReplies: ["Không dùng voucher", "Tôi muốn nhập mã voucher"],
      };
    }

    let pickup = null as any;
    if (draft.pickupPointId && /^\d+$/.test(draft.pickupPointId)) {
      pickup = await (this.prisma as any).tourPickupPoint?.findFirst({
        where: {
          id: BigInt(draft.pickupPointId),
          tourId: tour.id,
          status: "active",
          OR: [{ departureId: departure.id }, { departureId: null }],
        },
      });

      if (!pickup) {
        const selectedIndex = Number(draft.pickupPointId) - 1;
        const selectedByOrder = pickupOptions[selectedIndex];
        if (selectedByOrder) pickup = selectedByOrder;
      }
    }

    if (!pickup && (this.prisma as any).tourPickupPoint) {
      pickup = await (this.prisma as any).tourPickupPoint.findFirst({
        where: {
          tourId: tour.id,
          status: "active",
          OR: [{ departureId: departure.id }, { departureId: null }],
        },
        orderBy: [{ departureId: "desc" }, { pickupTime: "asc" }],
      });
    }

    if (!draft.paymentMethod) {
      draft.paymentMethod = "bank_transfer";
    }

    const unsupportedPaymentNote = this.isUnsupportedPaymentMethod(
      ctx.userMessage,
    )
      ? `${this.buildOnlyBankTransferAnswer()}\n\n`
      : "";

    const originalAmount = this.calculateBookingAmount(
      departure,
      adultCount,
      childCount,
    );
    let previewDiscountAmount = 0;

    if (draft.voucherCode === "__BEST__") {
      const best = await this.findBestVoucherForBooking(user, originalAmount);
      if (best?.voucher?.code) {
        draft.voucherCode = String(best.voucher.code).toUpperCase();
        draft.skipVoucher = false;
        previewDiscountAmount = Number(best.discount || 0);
      } else {
        draft.voucherCode = null;
        draft.skipVoucher = true;
      }
    }

    if (draft.voucherCode && draft.voucherCode !== "__BEST__") {
      const requestedVoucherCode = String(draft.voucherCode).toUpperCase();
      const validation = await this.validateVoucherForBooking(
        user,
        requestedVoucherCode,
        originalAmount,
      );

      if (!validation.valid) {
        const availableVouchers = await this.findEligibleVouchersForBooking(
          user,
          originalAmount,
        );

        // Chỉ bỏ voucher sai; giữ nguyên tour, lịch, số khách, hành khách,
        // điểm đón và phương thức thanh toán.
        draft.voucherCode = null;
        draft.skipVoucher = false;
        draft.confirmed = false;

        return {
          answer: [
            validation.reason ||
              `Voucher ${requestedVoucherCode} hiện không dùng được.`,
            "",
            "Booking hiện tại vẫn được giữ nguyên, bạn không cần chọn lại tour hoặc lịch.",
            `- Tour: ${tour.name}`,
            `- Ngày khởi hành: ${this.formatDate(
              new Date(departure.departureDate).toISOString(),
            )}`,
            `- Số khách: ${adultCount} người lớn${
              childCount ? `, ${childCount} trẻ em` : ""
            }`,
            pickup
              ? `- Điểm đón: ${pickup.name} - ${pickup.address}`
              : "- Điểm đón: đang giữ theo lựa chọn hiện tại",
            "",
            ...(availableVouchers.length
              ? [
                  "Voucher đáp ứng điều kiện của booking hiện tại:",
                  ...availableVouchers.map(
                    (voucher, index) =>
                      `${index + 1}. ${voucher.code} - ${voucher.discountText}`,
                  ),
                  "",
                  `Bạn có thể nhắn “dùng voucher ${availableVouchers[0].code}”, chỉ nhắn mã như “${availableVouchers[0].code}”, hoặc nhắn “không dùng voucher”.`,
                ]
              : [
                  "Hiện không còn voucher nào khác đáp ứng điều kiện của booking này.",
                  "Bạn có thể nhắn “không dùng voucher” để tiếp tục.",
                ]),
          ].join("\n"),
          memory: {
            bookingDraft: draft,
            lastDepartureOptions: departureOptionsForMemory,
            bookingContext: departureBookingContext,
          },
          suggestedReplies: [
            ...availableVouchers
              .slice(0, 6)
              .map(
                (voucher) =>
                  `Dùng voucher ${voucher.code} - ${voucher.discountText}`,
              ),
            "Không dùng voucher",
          ],
        };
      }

      previewDiscountAmount = Number(validation.discount || 0);
    }

    const previewFinalAmount = Math.max(
      0,
      originalAmount - previewDiscountAmount,
    );

    if (!draft.confirmed) {
      return {
        answer:
          unsupportedPaymentNote +
          this.buildBookingPreviewAnswer({
            tour,
            departure,
            pickup,
            adultCount,
            childCount,
            originalAmount,
            discountAmount: previewDiscountAmount,
            finalAmount: previewFinalAmount,
            voucherCode: draft.voucherCode,
            paymentMethod: draft.paymentMethod,
            replacingBookingCode: draft.replacingBookingCode || null,
            passengerLines: this.buildGuestSummaryLines(
              draft,
              account.fullName || user?.fullName || "Khách Travela",
              adultCount,
              childCount,
            ),
          }),
        memory: {
          bookingDraft: { ...draft, confirmed: false },
          lastDepartureOptions: departureOptionsForMemory,
        },
        suggestedReplies: [
          "Xác nhận đặt",
          "Đổi số khách",
          "Đổi điểm đón",
          "Đổi voucher",
        ],
      };
    }

    const existingBookingBeforeCreate =
      await this.findExistingBookingForChatbot(
        user?.userId || null,
        departure.id,
      );

    if (existingBookingBeforeCreate) {
      const existingPayment =
        (existingBookingBeforeCreate as any).payments?.[0] || null;
      const existingPaymentStatus = String(
        existingPayment?.paymentStatus || "",
      ).toLowerCase();
      const existingBookingStatus = String(
        (existingBookingBeforeCreate as any).bookingStatus || "",
      ).toLowerCase();
      const existingIsPaidOrConfirmed =
        ["paid", "success", "completed"].includes(existingPaymentStatus) ||
        ["confirmed", "completed"].includes(existingBookingStatus);

      if (existingIsPaidOrConfirmed) {
        return {
          answer: [
            `Bạn đã có booking ${existingBookingBeforeCreate.bookingCode} cho lịch khởi hành này và đơn đã thanh toán/xác nhận.`,
            `Mình không tạo thêm đơn trùng hoặc tự đổi số khách để tránh sai lệch vé. Nếu muốn đổi thông tin, bạn liên hệ admin để xử lý theo chính sách nha.`,
          ].join("\n"),
          memory: {
            bookingDraft: null,
            lastBookingCode: String(existingBookingBeforeCreate.bookingCode),
          },
        };
      }

      const sameAdultCount =
        Number((existingBookingBeforeCreate as any).adultCount || 0) ===
        adultCount;
      const sameChildCount =
        Number((existingBookingBeforeCreate as any).childCount || 0) ===
        childCount;
      const samePickupPoint =
        String((existingBookingBeforeCreate as any).pickupPointId || "") ===
        String(pickup?.id || "");
      const sameVoucher =
        String(
          (existingBookingBeforeCreate as any).voucherCode || "",
        ).toUpperCase() === String(draft.voucherCode || "").toUpperCase();

      if (sameAdultCount && sameChildCount && samePickupPoint && sameVoucher) {
        const existingCheckout = this.buildCheckoutFromExistingBooking(
          existingBookingBeforeCreate,
        );

        if (existingCheckout) {
          return {
            answer: [
              `Bạn đã có booking ${existingBookingBeforeCreate.bookingCode} cho lịch khởi hành này rồi nên mình không tạo thêm đơn trùng.`,
              `Mình gửi lại mã QR thanh toán của booking hiện tại bên dưới.`,
              `Nếu muốn đổi số khách khi chưa thanh toán, bạn chỉ cần nhắn ví dụ: “1 người lớn” hoặc “đổi booking ${existingBookingBeforeCreate.bookingCode} thành 2 người lớn”.`,
            ].join("\n"),
            bookingCheckout: existingCheckout,
            memory: {
              bookingDraft: null,
              lastBookingCode: String(existingBookingBeforeCreate.bookingCode),
              lastBookingPaymentStatus: existingCheckout.paymentStatus,
            },
          };
        }
      }

      await this.bookingsService.adminUpdateStatus(
        Number((existingBookingBeforeCreate as any).id),
        {
          bookingStatus: "cancelled" as any,
          reason: "User changed pending chatbot booking before payment",
        } as any,
        user.userId,
      );
    }

    try {
      const adultGuestCount = Math.max(1, Number(adultCount || 1));
      const childGuestCount = Math.max(0, Number(childCount || 0));

      const safeContactName = String(
        draft.contactName ||
          account.fullName ||
          user.fullName ||
          "Khách Travela",
      ).trim();

      const safeContactEmail = String(
        draft.contactEmail || account.email || user.email || "",
      ).trim();

      const safeContactPhone = String(
        draft.contactPhone || account.phone || "",
      ).trim();

      const safeVoucherCode =
        draft.voucherCode && draft.voucherCode !== "__BEST__"
          ? String(draft.voucherCode).toUpperCase()
          : undefined;

      const guests = this.buildGuestsForBooking({
        draft,
        contactName: safeContactName,
        accountIdentityNumber: account.identityNumber,
        accountBirthDate: account.birthDate,
        accountGender: account.gender,
        adultCount: adultGuestCount,
        childCount: childGuestCount,
      });

      const created = await this.bookingsService.create(
        {
          departureId: Number(departure.id),
          pickupPointId: pickup?.id ? Number(pickup.id) : undefined,
          voucherCode: safeVoucherCode,
          adultCount: adultGuestCount,
          childCount: childGuestCount,
          contactName: safeContactName,
          contactEmail: safeContactEmail,
          contactPhone: safeContactPhone,
          note: "Booking được tạo từ chatbot Travela AI",
          guests,
        },
        account.id,
      );

      const payment = await this.paymentsService.initiatePayment(
        Number(created.id),
        "bank_transfer",
        {
          userId: user.userId,
          email: account.email,
          role: account.role === "admin" ? "admin" : "user",
        },
      );

      const rawPaymentUrl =
        String(payment.paymentUrl || "") ||
        `/mobile-payment/${encodeURIComponent(
          String(
            payment.transactionCode || payment.internalTransactionCode || "",
          ),
        )}`;

      const mobilePaymentUrl = this.buildPublicFrontendUrl(rawPaymentUrl);

      const transactionCode = String(
        payment.transactionCode || payment.internalTransactionCode || "",
      );
      const checkoutAmount = Number(
        payment.finalAmount || payment.amount || created.finalAmount || 0,
      );
      const bankInfo = this.getSepayBankInfo();
      const sepayQrCodeUrl = this.buildSepayQrCodeUrl(
        checkoutAmount,
        transactionCode,
      );
      const fallbackQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
        mobilePaymentUrl,
      )}`;
      const qrCodeUrl = sepayQrCodeUrl || fallbackQrCodeUrl;

      const checkout: BookingCheckoutCard = {
        type: "booking_checkout",
        bookingId: String(payment.bookingId || created.id),
        bookingCode: String(payment.bookingCode || created.bookingCode),
        amount: Number(
          payment.amount || payment.finalAmount || created.finalAmount || 0,
        ),
        finalAmount: checkoutAmount,
        holdExpiresAt: payment.holdExpiresAt
          ? new Date(payment.holdExpiresAt as any).toISOString()
          : created.holdExpiresAt
            ? new Date(created.holdExpiresAt as any).toISOString()
            : null,
        paymentUrl: mobilePaymentUrl,
        mobilePaymentUrl,
        qrCodeUrl,
        transactionCode,
        paymentMethod: String(payment.paymentMethod || draft.paymentMethod),
        paymentStatus: String(payment.paymentStatus || "pending"),
        tourName: String(tour.name || ""),
        departureDate: departure.departureDate
          ? new Date(departure.departureDate).toISOString()
          : null,
        endDate: departure.endDate
          ? new Date(departure.endDate).toISOString()
          : null,
        pickupName: pickup?.name ? String(pickup.name) : null,
        pickupAddress: pickup?.address ? String(pickup.address) : null,
        pickupTime: pickup?.pickupTime
          ? new Date(pickup.pickupTime).toISOString()
          : null,
        bankCode: bankInfo.bankCode,
        accountNo: bankInfo.accountNo,
        accountName: bankInfo.accountName,
        transferContent: this.sanitizeSepayTransferContent(transactionCode),
        qrProvider: sepayQrCodeUrl ? "sepay" : "internal",
      };

      return {
        answer: [
          draft.replacingBookingCode
            ? `Mình đã hủy booking cũ ${draft.replacingBookingCode} và tạo booking mới ${checkout.bookingCode} cho tour ${tour.name}.`
            : `Mình đã tạo booking ${checkout.bookingCode} cho tour ${tour.name}.`,
          `Số khách: ${adultCount} người lớn${childCount ? `, ${childCount} trẻ em` : ""}.`,
          `Khởi hành: ${this.formatDate(new Date(departure.departureDate).toISOString())}.`,
          pickup
            ? `Điểm đón: ${pickup.name} - ${pickup.address}.`
            : "Điểm đón: Travela sẽ liên hệ xác nhận.",
          `Tổng tiền: ${this.formatCurrency(checkout.finalAmount)}. Mình đã tạo mã QR SePay/VietQR bên dưới, bạn mở app ngân hàng để quét mã và chuyển khoản đúng nội dung ${checkout.transferContent || checkout.transactionCode}.`,
        ].join("\n"),
        bookingCheckout: checkout,
        memory: {
          bookingDraft: null,
          lastDepartureOptions: null,
          lastBookingCode: checkout.bookingCode,
          lastBookingPaymentStatus: checkout.paymentStatus,
        },
      };
    } catch (error: any) {
      const message = String(error?.message || "");
      const normalizedError = this.stripText(message);

      if (
        /\b(voucher|ma giam gia|coupon)\b/.test(normalizedError) &&
        !/\b(booking trung|da ton tai booking)\b/.test(normalizedError)
      ) {
        const invalidVoucherCode =
          draft.voucherCode && draft.voucherCode !== "__BEST__"
            ? String(draft.voucherCode).toUpperCase()
            : null;

        const availableVouchers = await this.findRelevantVouchers(
          "booking_create",
          user,
        );

        draft.voucherCode = null;
        draft.skipVoucher = false;
        draft.confirmed = false;

        return {
          answer: [
            invalidVoucherCode
              ? `Voucher ${invalidVoucherCode} không thể áp dụng khi tạo booking. ${message}`
              : message || "Voucher hiện không thể áp dụng cho booking này.",
            "",
            "Mình vẫn giữ nguyên tour, lịch, số khách, thông tin hành khách và điểm đón. Bạn chỉ cần chọn voucher khác hoặc bỏ qua voucher.",
            ...(availableVouchers.length
              ? [
                  "",
                  "Voucher đang khả dụng:",
                  ...availableVouchers.map(
                    (voucher, index) =>
                      `${index + 1}. ${voucher.code} - ${voucher.discountText}`,
                  ),
                  "",
                  `Bạn có thể nhắn “dùng voucher ${availableVouchers[0].code}” hoặc “không dùng voucher”.`,
                ]
              : [
                  "",
                  "Hiện không còn voucher khả dụng khác. Bạn có thể nhắn “không dùng voucher”.",
                ]),
          ].join("\n"),
          memory: {
            bookingDraft: draft,
            lastDepartureOptions: departureOptionsForMemory,
            bookingContext: departureBookingContext,
          },
        };
      }

      if (
        message.includes("Đã tồn tại booking") ||
        message.toLowerCase().includes("booking trùng")
      ) {
        const existingBooking = await this.findExistingBookingForChatbot(
          user?.userId || null,
          departure.id,
        );

        if (existingBooking) {
          const existingCheckout =
            this.buildCheckoutFromExistingBooking(existingBooking);

          if (existingCheckout) {
            return {
              answer: [
                `Bạn đã có booking ${existingBooking.bookingCode} cho lịch khởi hành này rồi nên mình không tạo thêm đơn trùng.`,
                `Mình gửi lại mã QR thanh toán của booking hiện tại bên dưới.`,
                `Nếu bạn muốn đổi số khách hoặc điểm đón khi chưa thanh toán, hãy nhắn: “đổi booking ${existingBooking.bookingCode} thành 2 người lớn” hoặc “đổi booking ${existingBooking.bookingCode} điểm đón mã ...”.`,
              ].join("\n"),
              bookingCheckout: existingCheckout,
              memory: { bookingDraft: null },
            };
          }

          return {
            answer: [
              `Bạn đã có booking ${existingBooking.bookingCode} cho lịch khởi hành này rồi.`,
              `Trạng thái hiện tại: ${existingBooking.bookingStatus}.`,
              `Nếu booking đã thanh toán/xác nhận, chatbot không tự sửa trực tiếp. Bạn cần liên hệ admin hoặc đặt lịch khởi hành khác để tránh sai lệch vé và thanh toán.`,
            ].join("\n"),
            memory: { bookingDraft: null },
          };
        }

        return {
          answer:
            "Bạn đã có booking cho lịch khởi hành này rồi nên mình không tạo thêm booking trùng. Bạn có thể nhắn “Kiểm tra booking của tôi” để xem đơn hiện tại, hoặc chọn lịch khởi hành khác nếu muốn đặt thêm.",
          memory: { bookingDraft: null },
        };
      }

      return {
        answer:
          message ||
          "Mình chưa tạo được booking qua chatbot. Bạn kiểm tra lại số khách, lịch khởi hành hoặc thử đặt trong trang chi tiết tour nha.",
        memory: { bookingDraft: null },
      };
    }
  }

  private async processBookingChangeFlow(
    ctx: PromptContext,
    memory: MemoryState,
    user: AuthUser,
  ): Promise<{
    answer: string;
    memory?: Partial<MemoryState>;
    bookingCheckout?: BookingCheckoutCard;
  } | null> {
    if (!user?.userId) {
      return {
        answer:
          "Bạn cần đăng nhập để mình kiểm tra booking và tạo mã QR mới khi đổi thông tin.",
        memory: { bookingDraft: null },
      };
    }

    const bookingCode =
      this.extractBookingCode(ctx.userMessage) ||
      memory.lastBookingCode ||
      null;
    if (!bookingCode) {
      return {
        answer:
          "Bạn muốn đổi booking nào? Bạn gửi mã booking dạng BK... giúp mình nha. Ví dụ: “Đổi booking BK123 thành 2 người lớn”.",
        memory: { bookingDraft: null },
      };
    }

    const oldBooking = await this.prisma.booking.findFirst({
      where: { bookingCode, userId: user.userId },
      include: {
        tour: {
          include: {
            destination: true,
            media: { where: { isCover: true }, take: 1 },
          },
        },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        pickupPoint: true,
      } as any,
    });

    if (!oldBooking) {
      return {
        answer:
          "Mình chưa tìm thấy booking này trong tài khoản của bạn. Bạn kiểm tra lại mã booking giúp mình nha.",
        memory: { bookingDraft: null },
      };
    }

    const latestPayment = (oldBooking as any).payments?.[0] || null;
    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();
    const bookingStatus = String(
      (oldBooking as any).bookingStatus || "",
    ).toLowerCase();

    if (
      paymentStatus === "paid" ||
      paymentStatus === "success" ||
      bookingStatus === "confirmed" ||
      bookingStatus === "completed"
    ) {
      return {
        answer: [
          `Booking ${bookingCode} đã thanh toán/xác nhận nên chatbot không tự hủy hoặc sửa trực tiếp để tránh sai lệch vé và thanh toán.`,
          `Bạn có thể đặt booking mới cho lịch khác, hoặc liên hệ admin để xử lý đổi thông tin/hoàn tiền theo chính sách.`,
        ].join("\n"),
        memory: { bookingDraft: null },
      };
    }

    const normalized = this.stripText(ctx.userMessage);
    const adultMatch = normalized.match(
      /(\d+)\s*(?:nguoi lon|adult|nguoi truong thanh|nl)/,
    );
    const peopleMatch = normalized.match(/(\d+)\s*(?:nguoi|khach)\b/);
    const childMatch = normalized.match(/(\d+)\s*(?:tre em|child|em be|be|te)/);
    const pickupMatch = normalized.match(
      /(?:diem don|pickup)\s*(?:so|id|ma|mã)?\s*(\d+)/,
    );

    const adultCount = adultMatch
      ? Number(adultMatch[1])
      : peopleMatch
        ? Number(peopleMatch[1])
        : Number((oldBooking as any).adultCount || 1);
    const childCount = childMatch
      ? Number(childMatch[1])
      : Number((oldBooking as any).childCount || 0);

    const paymentMethod: "bank_transfer" = "bank_transfer";

    const draft: ChatBookingDraft = {
      tourId: String((oldBooking as any).tourId),
      departureId: String((oldBooking as any).departureId),
      pickupPointId:
        pickupMatch?.[1] ||
        ((oldBooking as any).pickupPointId
          ? String((oldBooking as any).pickupPointId)
          : null),
      adultCount,
      childCount,
      contactName: (oldBooking as any).contactName,
      contactEmail: (oldBooking as any).contactEmail,
      contactPhone: (oldBooking as any).contactPhone,
      paymentMethod,
      skipVoucher: true,
      confirmed: true,
      replacingBookingCode: bookingCode,
      started: true,
    };

    if (
      [
        "pending_payment",
        "waiting_payment",
        "waiting_confirmation",
        "draft",
        "created",
      ].includes(bookingStatus)
    ) {
      await this.bookingsService.adminUpdateStatus(
        Number((oldBooking as any).id),
        {
          bookingStatus: "cancelled" as any,
          reason: "User requested booking change via Travela AI",
        } as any,
        user.userId,
      );
    }

    return this.processBookingFlow(
      {
        ...ctx,
        intent: "booking_create",
        tours: [
          this.toTourCard(
            (oldBooking as any).tour,
            (oldBooking as any).departure,
            ["đặt lại từ booking cũ với thông tin mới"],
          ),
        ],
      },
      {
        ...memory,
        bookingDraft: draft,
        lastTourId: String((oldBooking as any).tourId),
      },
      user,
    );
  }

  private async generateLlmAnswer(ctx: PromptContext): Promise<string> {
    const { systemInstruction, prompt } = this.buildLlmPrompt(ctx);

    // Rule/local đã xử lý trước đó. Đến đây mới gọi LLM theo thứ tự:
    // 1) Groq/OpenAI-compatible chính
    // 2) OpenRouter fallback
    // 3) Phản hồi nội bộ nếu cả hai provider không khả dụng
    const primaryProvider = this.getProviderName("CHATBOT_PROVIDER", "groq");
    const fallbackProvider = this.getProviderName(
      "CHATBOT_FALLBACK_PROVIDER",
      "openrouter",
    );

    const primaryAnswer = await this.callOpenAICompatibleLlm(
      systemInstruction,
      prompt,
      primaryProvider,
    );
    if (primaryAnswer) return primaryAnswer;

    if (fallbackProvider && fallbackProvider !== primaryProvider) {
      const fallbackAnswer = await this.callOpenAICompatibleLlm(
        systemInstruction,
        prompt,
        fallbackProvider,
      );
      if (fallbackAnswer) return fallbackAnswer;
    }

    return String(this.generateNaturalAnswer(ctx));
  }

  private buildLlmPrompt(ctx: PromptContext): {
    systemInstruction: string;
    prompt: string;
  } {
    const systemInstruction = `
Bạn là Travela AI, trợ lý tư vấn tour du lịch thông minh của website Travela.

Vai trò:
- Tư vấn tour như một nhân viên tư vấn du lịch chuyên nghiệp.
- Hiểu nhu cầu người dùng từ ngôn ngữ tự nhiên.
- Dựa trên dữ liệu thật trong CONTEXT để trả lời.
- Có thể hỗ trợ tìm tour, so sánh tour, kiểm tra voucher, booking, điểm đón và chính sách.

Các nhóm nhu cầu du lịch thường gặp:
- "biển, đảo, tắm biển, hải sản, resort biển" => ưu tiên tour biển đảo như Nha Trang, Phú Quốc, Quy Nhơn, Hạ Long, Đà Nẵng, Côn Đảo nếu có trong CONTEXT.
- "mát mẻ, không khí trong lành, săn mây, đồi thông" => ưu tiên Đà Lạt, Sa Pa, Mộc Châu hoặc tour miền núi nếu có trong CONTEXT.
- "biển nhưng mát mẻ, biển dễ chịu, nghỉ dưỡng ven biển" => ưu tiên các tour biển có tính nghỉ dưỡng, cảnh đẹp, lịch trình không quá nặng.
- "gia đình, trẻ nhỏ, ba mẹ, người lớn tuổi" => ưu tiên tour family, thời lượng vừa phải, lịch trình nhẹ, khách sạn tốt, điểm đón thuận tiện.
- "không quá mệt, đi nhẹ nhàng, nghỉ dưỡng" => tránh tour adventure/trekking; ưu tiên tour nghỉ dưỡng, family, eco hoặc lịch trình ngắn.
- "chụp hình, sống ảo, cảnh đẹp, check-in" => ưu tiên tour có điểm đến nhiều cảnh đẹp, lịch trình tham quan rõ ràng.
- "ẩm thực, ăn ngon, đặc sản, hải sản" => ưu tiên điểm đến có đặc sản hoặc hải sản.
- "miền Tây, sông nước, chợ nổi" => ưu tiên Cần Thơ, An Giang, Cà Mau nếu có trong CONTEXT.

Quy tắc bắt buộc:
- Luôn trả lời bằng tiếng Việt, tự nhiên, thân thiện, rõ ràng.
- Chỉ dùng dữ liệu có trong CONTEXT. Không tự bịa tour, giá, lịch khởi hành, voucher, booking, điểm đón hoặc chính sách.
- Không nêu tên nhà cung cấp hoặc tên mô hình. Hãy nói mình là Travela AI.
- Chỉ liệt kê 2-3 tour phù hợp khi người dùng đang hỏi tìm tour mới.
- Nếu người dùng hỏi "tour này", "lịch trình này", "khách sạn", "tiện nghi", "phương tiện", "có nhẹ nhàng không", "có phù hợp gia đình/trẻ nhỏ không", thì đây là câu hỏi chi tiết về tour đã gợi ý trước đó. Khi đó KHÔNG được liệt kê lại danh sách tour.
- Nếu câu hỏi là lịch trình hoặc mức độ nhẹ nhàng, ưu tiên thông tin từ ragHits có phần "Lịch trình chi tiết".
- Nếu câu hỏi là khách sạn/tiện nghi/lưu trú, ưu tiên thông tin từ ragHits có phần "Lưu trú/khách sạn".
- Nếu câu hỏi là phương tiện, ưu tiên thông tin từ ragHits có phần "Phương tiện di chuyển".
- Không nói "hệ thống chưa có thông tin voucher, booking, điểm đón" nếu người dùng không hỏi voucher, booking hoặc điểm đón.
- Nếu người dùng hỏi tour nhưng thiếu thông tin quan trọng, hãy vừa gợi ý tour gần đúng vừa hỏi thêm tối đa 1 câu để làm rõ.
- Nếu người dùng hỏi booking/voucher nhưng chưa đăng nhập hoặc không có dữ liệu, nói rõ cần đăng nhập hoặc chưa tìm thấy.
- Nếu có bookingCheckout trong CONTEXT, hãy nhắc người dùng quét mã QR thanh toán bên dưới. Không nói đã thanh toán thành công khi paymentStatus chưa phải paid.
- Không trả lời quá dài. Ưu tiên 1 đoạn ngắn + gạch đầu dòng khi cần.
- Không liệt kê JSON, không nhắc đến CONTEXT, prompt, userMessage, intent, memory, recentMessages hoặc dữ liệu nội bộ.
- Không mở đầu bằng “Dựa trên thông tin từ...”. Hãy trả lời như nhân viên tư vấn thật.
- Khi intent là booking_create, nếu CONTEXT không có vouchers thì không được khẳng định người dùng không có voucher. Chỉ nói: “Bạn có muốn dùng voucher không?” hoặc “Bạn có thể nhập mã voucher nếu có”.
- Chỉ được nói “quét mã QR bên dưới” khi CONTEXT có bookingCheckout và bookingCheckout.qrCodeUrl.
- Nếu không có bookingCheckout trong CONTEXT thì tuyệt đối không được nói đã tạo QR, đã tạo mã thanh toán hoặc yêu cầu quét QR.
- Khi người dùng hỏi về hoàn tiền/hủy tour:
  + Trả lời rõ 2 điều kiện chính: gửi yêu cầu trong vòng 48 giờ sau khi đặt tour và phải còn ít nhất 3 ngày trước ngày khởi hành.
  + Nói rõ booking cần ở trạng thái đã thanh toán hoặc đã xác nhận.
  + Không hứa chắc chắn hoàn tiền; chỉ nói “có thể gửi yêu cầu hoàn tiền để admin duyệt”.
  + Nếu người dùng có mã booking dạng BK..., hãy hướng dẫn gửi mã hoặc dùng dữ liệu booking trong CONTEXT để kiểm tra cụ thể.
- Khi người dùng muốn đặt tour:
  + Nếu đã có tour/lịch khởi hành trong memory hoặc CONTEXT thì không hỏi lại ngân sách/ngày đi nữa; chỉ hỏi đúng thông tin còn thiếu để tạo booking.
  + Hiểu câu tự nhiên có nhiều thông tin cùng lúc: điểm đến, số người lớn, số trẻ em, ngân sách, ngày đi, điểm đón, voucher, phương thức thanh toán.
  + Nếu thiếu tour hoặc lịch khởi hành thì hỏi lại đúng 1 câu.
  + Nếu thiếu điểm đón thì liệt kê điểm đón có mã để người dùng chọn.
  + Nếu thiếu voucher thì hỏi người dùng có muốn dùng voucher không, không tự bịa voucher.
  + Nếu tạo booking thành công và có bookingCheckout.qrCodeUrl thì mới nói quét QR.
- Nếu CONTEXT có ragHits, hãy ưu tiên dùng ragHits để bổ sung thông tin ngữ nghĩa.
- ragHits chỉ dùng để hỗ trợ trả lời, không được bịa thêm dữ liệu ngoài ragHits và dữ liệu nghiệp vụ.
- Nếu ragHits mâu thuẫn với dữ liệu bookings/vouchers/bookingCheckout thì ưu tiên dữ liệu nghiệp vụ trực tiếp.
- Không nói "hệ thống chưa có thông tin voucher, booking, điểm đón" nếu người dùng không hỏi về voucher, booking hoặc điểm đón.
- Với câu hỏi về lịch trình, chỉ tập trung trả lời lịch trình; không lôi voucher/booking/điểm đón vào nếu không liên quan.
- Chỉ hỏi người dùng có muốn dùng voucher không khi intent là booking_create hoặc khi người dùng đang chuẩn bị đặt tour. Không hỏi voucher trong câu hỏi về lịch trình, khách sạn, phương tiện, review hoặc tư vấn chung.
`;

    const compactContext = {
      intent: ctx.intent,
      userMessage: ctx.userMessage,
      memory: ctx.memory,
      nlu: ctx.nlu,
      answerConfidence: ctx.answerConfidence,
      userProfile: ctx.userProfile,
      tours: ctx.tours,
      vouchers: ctx.vouchers,
      bookings: ctx.bookings,
      pickupPoints: ctx.pickupPoints,
      bookingCheckout: ctx.bookingCheckout,
      faqs: ctx.faqs,
      recentMessages: ctx.recentMessages.slice(-6),
      ragHits: ctx.ragHits,
    };

    const prompt = `
CONTEXT HỆ THỐNG:
${JSON.stringify(compactContext, null, 2)}

YÊU CẦU TRẢ LỜI:
1. Hiểu ý định người dùng, nhưng tuyệt đối không được nhắc các từ kỹ thuật như userMessage, intent, memory, recentMessages, CONTEXT, JSON.
2. Nếu user hỏi tìm tour mới thì chọn các tour phù hợp nhất để tư vấn.
3. Nếu user hỏi chi tiết về "tour này", "lịch trình này", khách sạn, tiện nghi, phương tiện, review hoặc mức độ phù hợp gia đình/trẻ nhỏ thì phải trả lời trực tiếp câu hỏi đó dựa trên ragHits và memory.lastTourName. Không được liệt kê lại danh sách tour.
4. Nếu câu hỏi là "lịch trình này có nhẹ nhàng không", hãy đánh giá dựa trên số ngày, các hoạt động trong lịch trình, nhịp độ di chuyển và đối tượng gia đình/trẻ nhỏ. Nếu dữ liệu chưa đủ, nói "theo dữ liệu hiện có".
5. Nếu câu hỏi là khách sạn/tiện nghi, trả lời tên khách sạn, số sao, vị trí và tiện nghi nếu ragHits có dữ liệu.
6. Nếu câu hỏi là chính sách/bao gồm, ưu tiên phần "Chính sách tour" hoặc faqs.
7. Chỉ khi user đang hỏi tìm tour mới thì mới liệt kê danh sách tour phù hợp.
8. Khi nhắc tour, hãy nói rõ tên tour, giá từ, thời lượng và lý do phù hợp.
9. Nếu có vouchers, bookings, pickupPoints hoặc bookingCheckout thì tóm tắt đúng dữ liệu đó.
10. Nếu thiếu dữ liệu, hãy nói rõ hệ thống chưa có thông tin và hỏi thêm 1 câu ngắn.
11. Không bịa dữ liệu ngoài CONTEXT.
12. Với câu hỏi chính sách hoàn tiền, ưu tiên trả lời ngắn gọn theo luật: 48 giờ sau khi đặt + trước ngày khởi hành ít nhất 3 ngày + cần admin duyệt.
13. Với luồng đặt tour, hãy gom thông tin người dùng đã nói, không hỏi lại thông tin đã có trong memory.
14. Nếu user hỏi bằng nhu cầu tự nhiên như “đi đâu có biển mát mẻ”, “không quá mệt”, “có cảnh đẹp chụp hình”, hãy suy luận thành tiêu chí tour rồi chọn tour trong CONTEXT. Không hỏi lại quá nhiều nếu đã có thể gợi ý 2-3 tour phù hợp.
15. Khi gợi ý tour theo nhu cầu tự nhiên, phải giải thích lý do bằng các tiêu chí người dùng đã nói, ví dụ: biển, mát mẻ, nghỉ dưỡng, gia đình, nhẹ nhàng, cảnh đẹp, ngân sách.

`;

    return { systemInstruction, prompt };
  }

  private getProviderName(key: string, fallback = "groq") {
    return String(
      this.configService.get<string>(key) || process.env[key] || fallback,
    )
      .trim()
      .toLowerCase();
  }

  private isEnvEnabled(key: string, defaultValue = false) {
    const raw = this.configService.get<string>(key) ?? process.env[key];
    if (raw === undefined || raw === null || raw === "") return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
  }

  private getOpenAIProviderConfig(provider: string) {
    const name = String(provider || "groq").toLowerCase();

    if (name === "openrouter") {
      return {
        name,
        apiKey:
          this.configService.get<string>("OPENROUTER_API_KEY") ||
          process.env.OPENROUTER_API_KEY ||
          "",
        baseUrl: (
          this.configService.get<string>("OPENROUTER_BASE_URL") ||
          process.env.OPENROUTER_BASE_URL ||
          "https://openrouter.ai/api/v1"
        ).replace(/\/$/, ""),
        model:
          this.configService.get<string>("OPENROUTER_MODEL") ||
          process.env.OPENROUTER_MODEL ||
          "openrouter/free",
      };
    }

    if (name === "groq") {
      return {
        name,
        apiKey:
          this.configService.get<string>("GROQ_API_KEY") ||
          process.env.GROQ_API_KEY ||
          this.configService.get<string>("CHATBOT_API_KEY") ||
          process.env.CHATBOT_API_KEY ||
          "",
        baseUrl: (
          this.configService.get<string>("GROQ_BASE_URL") ||
          process.env.GROQ_BASE_URL ||
          "https://api.groq.com/openai/v1"
        ).replace(/\/$/, ""),
        model:
          this.configService.get<string>("GROQ_MODEL") ||
          process.env.GROQ_MODEL ||
          this.configService.get<string>("CHATBOT_MODEL") ||
          process.env.CHATBOT_MODEL ||
          "openai/gpt-oss-20b",
      };
    }

    return {
      name: "custom",
      apiKey:
        this.configService.get<string>("CHATBOT_API_KEY") ||
        process.env.CHATBOT_API_KEY ||
        "",
      baseUrl: (
        this.configService.get<string>("CHATBOT_BASE_URL") ||
        process.env.CHATBOT_BASE_URL ||
        "https://api.groq.com/openai/v1"
      ).replace(/\/$/, ""),
      model:
        this.configService.get<string>("CHATBOT_MODEL") ||
        process.env.CHATBOT_MODEL ||
        "openai/gpt-oss-20b",
    };
  }

  private async callOpenAICompatibleLlm(
    systemInstruction: string,
    prompt: string,
    provider = "groq",
  ): Promise<string | null> {
    const cfg = this.getOpenAIProviderConfig(provider);

    if (!cfg.apiKey) {
      console.warn(`[Travela AI] Missing API key for provider=${cfg.name}`);
      return null;
    }

    try {
      console.log(
        `[Travela AI] Calling provider=${cfg.name}, model=${cfg.model}`,
      );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      };

      // OpenRouter khuyến nghị thêm 2 header này để dễ theo dõi app.
      if (cfg.name === "openrouter") {
        headers["HTTP-Referer"] =
          this.configService.get<string>("FRONTEND_PUBLIC_URL") ||
          this.configService.get<string>("FRONTEND_URL") ||
          "http://localhost:3000";
        headers["X-Title"] = "Travela Chatbot";
      }

      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt },
          ],
          temperature: 0.6,
          top_p: 0.9,
          max_tokens: 900,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(
          `[OpenAI-compatible chatbot error] provider=${cfg.name}`,
          response.status,
          body,
        );
        return null;
      }

      const payload = await response.json();
      const text = payload?.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch (error: any) {
      console.error(
        `[OpenAI-compatible chatbot exception] provider=${cfg.name}`,
        error?.message || error,
      );
      return null;
    }
  }

  private extractSectionFromRagContent(content: string, labels: string[]) {
    const text = String(content || "").trim();
    if (!text) return "Hệ thống chưa có thông tin chi tiết cho mục này.";

    for (const label of labels) {
      const index = text.indexOf(label);
      if (index >= 0) {
        const section = text.slice(index);

        const nextSectionMatch = section
          .slice(label.length)
          .search(
            /\n(?:Lịch trình chi tiết:|Chính sách tour:|Lưu trú\/khách sạn:|Phương tiện di chuyển:|Đánh giá khách hàng:|Độ phổ biến:)/,
          );

        if (nextSectionMatch >= 0) {
          return section.slice(0, label.length + nextSectionMatch).trim();
        }

        return section.slice(0, 1200).trim();
      }
    }

    return text.slice(0, 1200);
  }

  private policyLabel(type: string) {
    const key = this.stripText(type).replace(/_/g, " ");

    const map: Record<string, string> = {
      "cancel policy": "Chính sách hủy/hoàn tiền",
      cancel_policy: "Chính sách hủy/hoàn tiền",
      cancel: "Chính sách hủy/hoàn tiền",

      refund: "Chính sách hoàn tiền",
      refund_policy: "Chính sách hoàn tiền",

      included: "Dịch vụ bao gồm",
      include: "Dịch vụ bao gồm",

      excluded: "Dịch vụ không bao gồm",
      exclude: "Dịch vụ không bao gồm",

      note: "Lưu ý",

      "child policy": "Chính sách trẻ em",
      child_policy: "Chính sách trẻ em",

      "children policy": "Chính sách trẻ em",
      children_policy: "Chính sách trẻ em",

      "pickup policy": "Chính sách điểm đón",
      pickup_policy: "Chính sách điểm đón",

      "payment policy": "Chính sách thanh toán",
      payment_policy: "Chính sách thanh toán",
    };

    return map[key] || String(type || "Thông tin").replace(/_/g, " ");
  }

  private async generateFollowUpAnswer(ctx: PromptContext): Promise<string> {
    const normalized = this.stripText(ctx.userMessage);
    const tourName = ctx.memory.lastTourName || "tour này";

    let tour: any = null;

    if (ctx.memory.lastTourId && /^\d+$/.test(ctx.memory.lastTourId)) {
      tour = await this.prisma.tour.findFirst({
        where: {
          id: BigInt(ctx.memory.lastTourId),
          status: "published" as any,
        },
        include: {
          destination: true,
          itinerary: {
            orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
          },
          accommodations: {
            where: { status: "active" as any },
          },
          transports: {
            where: { status: "active" as any },
          },
          policies: {
            orderBy: { displayOrder: "asc" },
          },
          reviews: {
            where: { status: "approved" as any },
            select: { rating: true, comment: true },
            take: 5,
          },
        } as any,
      });
    }

    if (!tour && ctx.memory.lastTourName) {
      tour = await this.prisma.tour.findFirst({
        where: {
          name: { contains: ctx.memory.lastTourName },
          status: "published" as any,
        },
        include: {
          destination: true,
          itinerary: {
            orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
          },
          accommodations: {
            where: { status: "active" as any },
          },
          transports: {
            where: { status: "active" as any },
          },
          policies: {
            orderBy: { displayOrder: "asc" },
          },
          reviews: {
            where: { status: "approved" as any },
            select: { rating: true, comment: true },
            take: 5,
          },
        } as any,
      });
    }

    const ragContent = ctx.ragHits
      .map((hit: any) => `${hit.title || ""}\n${hit.content || ""}`)
      .join("\n\n");

    const effectiveTourName = tour?.name || tourName;

    if (
      /\b(nhe nhang|co met khong|met khong|phu hop gia dinh|phu hop tre nho|tre nho|tre em)\b/.test(
        normalized,
      )
    ) {
      const itineraryItems = tour?.itinerary || [];

      if (itineraryItems.length) {
        const days = itineraryItems
          .map(
            (item: any) =>
              `- Ngày ${item.dayNumber}: ${item.title}${
                item.locationName ? ` tại ${item.locationName}` : ""
              }${item.description ? ` - ${item.description}` : ""}`,
          )
          .join("\n");

        return [
          `Theo dữ liệu hiện có về ${effectiveTourName}, lịch trình này nhìn chung khá phù hợp để gia đình có trẻ nhỏ cân nhắc.`,
          "",
          days,
          "",
          "Lý do: tour đã có lịch trình theo ngày, phù hợp đi theo kế hoạch sẵn. Tuy nhiên nếu đi cùng trẻ nhỏ, bạn nên xác nhận thêm giờ đón, thời gian di chuyển và các điểm tham quan có cần đi bộ nhiều không trước khi đặt.",
        ].join("\n");
      }

      return [
        `Theo dữ liệu hiện có về ${effectiveTourName}, mình chưa thấy lịch trình chi tiết theo ngày trong DB.`,
        "Vì vậy mình chưa thể đánh giá chắc chắn tour có nhẹ nhàng hay không. Bạn nên mở chi tiết tour hoặc liên hệ Travela để xác nhận cường độ di chuyển trước khi đi cùng trẻ nhỏ.",
      ].join("\n");
    }

    if (
      /\b(lich trinh|lich trinh nay|di dau|di nhung dau|ngay 1|ngay 2|ngay 3)\b/.test(
        normalized,
      )
    ) {
      const itineraryItems = tour?.itinerary || [];

      if (itineraryItems.length) {
        const days = itineraryItems
          .map(
            (item: any) =>
              `- Ngày ${item.dayNumber}: ${item.title}${
                item.locationName ? ` tại ${item.locationName}` : ""
              }${item.description ? ` - ${item.description}` : ""}`,
          )
          .join("\n");

        return [`Lịch trình của ${effectiveTourName} gồm:`, "", days].join(
          "\n",
        );
      }

      if (ragContent) {
        return [
          `Theo dữ liệu RAG hiện có về ${effectiveTourName}, mình tìm thấy thông tin lịch trình như sau:`,
          "",
          this.extractSectionFromRagContent(ragContent, [
            "Lịch trình chi tiết:",
            "Lịch trình:",
          ]),
        ].join("\n");
      }

      return `Mình chưa tìm thấy lịch trình chi tiết của ${effectiveTourName} trong dữ liệu hiện có. Bạn mở trang chi tiết tour hoặc cập nhật thêm dữ liệu tour_itinerary rồi rebuild RAG nha.`;
    }

    if (/\b(khach san|luu tru|o dau|tien nghi|may sao)\b/.test(normalized)) {
      const accommodations = tour?.accommodations || [];

      if (accommodations.length) {
        const lines = accommodations
          .map(
            (item: any) =>
              `- ${item.name || "Khách sạn"}: ${
                item.starRating || tour?.hotelStars || "đang cập nhật"
              } sao${
                item.address ? `, địa chỉ ${item.address}` : ""
              }${item.amenities ? `, tiện nghi: ${item.amenities}` : ""}`,
          )
          .join("\n");

        return [
          `Thông tin lưu trú/khách sạn của ${effectiveTourName}:`,
          "",
          lines,
        ].join("\n");
      }

      if (tour?.hotelStars) {
        return `${effectiveTourName} hiện có tiêu chuẩn khách sạn khoảng ${tour.hotelStars} sao. Tuy nhiên hệ thống chưa có danh sách tiện nghi chi tiết cho tour này.`;
      }

      if (ragContent) {
        return [
          `Theo dữ liệu RAG hiện có về ${effectiveTourName}, thông tin lưu trú như sau:`,
          "",
          this.extractSectionFromRagContent(ragContent, [
            "Lưu trú/khách sạn:",
            "Khách sạn:",
            "Lưu trú:",
          ]),
        ].join("\n");
      }

      return `Mình chưa tìm thấy thông tin khách sạn/tiện nghi của ${effectiveTourName} trong dữ liệu hiện có.`;
    }

    if (/\b(phuong tien|di bang gi|xe|may bay|di chuyen)\b/.test(normalized)) {
      const transports = tour?.transports || [];

      if (transports.length) {
        const lines = transports
          .map(
            (item: any) =>
              `- ${item.name || "Phương tiện"}${
                item.transportType ? ` (${item.transportType})` : ""
              }${item.origin ? `, xuất phát từ ${item.origin}` : ""}${
                item.destinationLabel ? ` đến ${item.destinationLabel}` : ""
              }${
                item.durationHours
                  ? `, thời gian khoảng ${item.durationHours} giờ`
                  : ""
              }`,
          )
          .join("\n");

        return [
          `Thông tin phương tiện di chuyển của ${effectiveTourName}:`,
          "",
          lines,
        ].join("\n");
      }

      return `Mình chưa tìm thấy thông tin phương tiện di chuyển của ${effectiveTourName} trong dữ liệu hiện có.`;
    }

    if (/\b(bao gom nhung gi|bao gom gi|chinh sach)\b/.test(normalized)) {
      const policies = tour?.policies || [];

      if (policies.length) {
        const lines = policies
          .map(
            (item: any) =>
              `- ${this.policyLabel(item.policyType)}: ${item.content}`,
          )
          .join("\n");

        return [
          `Thông tin chính sách/bao gồm của ${effectiveTourName}:`,
          "",
          lines,
        ].join("\n");
      }

      return `Mình chưa tìm thấy chính sách chi tiết của ${effectiveTourName} trong dữ liệu hiện có.`;
    }

    if (/\b(review|danh gia|khach hang noi gi)\b/.test(normalized)) {
      const reviews = (tour?.reviews || []).filter((item: any) => item.comment);

      if (reviews.length) {
        const lines = reviews
          .map((item: any) => `- ${item.rating || 0} sao: ${item.comment}`)
          .join("\n");

        return [
          `Một số đánh giá khách hàng về ${effectiveTourName}:`,
          "",
          lines,
        ].join("\n");
      }

      return `Mình chưa tìm thấy đánh giá có nội dung bình luận cho ${effectiveTourName}.`;
    }

    if (ragContent) {
      return [
        `Theo dữ liệu hiện có về ${effectiveTourName}, mình tìm thấy thông tin liên quan:`,
        "",
        ragContent.slice(0, 1200),
      ].join("\n");
    }

    return `Mình chưa tìm thấy đủ dữ liệu chi tiết cho ${effectiveTourName}. Bạn hỏi rõ hơn về lịch trình, khách sạn, phương tiện hoặc chính sách nha.`;
  }

  private async generateCompareAnswer(ctx: PromptContext): Promise<string> {
    const normalized = this.stripText(ctx.userMessage);
    const destinations = this.extractMentionedDestinations(normalized);
    const durationDays =
      this.parseDurationDays(normalized) || ctx.memory.durationDays;
    const isFamily = /\b(gia dinh|tre nho|tre em|ca nha|ba me|bo me)\b/.test(
      normalized,
    );

    // So sánh theo số thứ tự phải dùng lastTourOptions vừa hiển thị cho user.
    // Không được search lại theo text "tour số 1" vì có thể lấy nhầm tour khác.
    const selectedOptions = this.resolveTourChoicesFromMessage(
      ctx.userMessage,
      ctx.memory,
    ).slice(0, 2);

    if (selectedOptions.length >= 2) {
      const orderedIds = selectedOptions
        .map((item) => String(item.tourId || ""))
        .filter((id) => /^\d+$/.test(id));

      const tours = await this.prisma.tour.findMany({
        where: {
          id: { in: orderedIds.map((id) => BigInt(id)) },
          status: "published" as any,
        },
        include: {
          destination: true,
          departures: {
            where: { status: { in: ["open", "full"] as any } },
            orderBy: { departureDate: "asc" },
            take: 1,
          },
          accommodations: {
            where: { status: "active" as any },
            take: 1,
          },
          itinerary: {
            orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
            take: 6,
          },
          pickupPoints: {
            where: { status: "active" as any },
            take: 3,
          } as any,
          reviews: {
            where: { status: "approved" as any },
            select: { rating: true, comment: true },
            take: 5,
          },
        } as any,
      });

      const orderedTours = orderedIds
        .map((id) => tours.find((tour: any) => String(tour.id) === id))
        .filter(Boolean) as any[];

      if (orderedTours.length >= 2) {
        const lines = orderedTours.map((tour: any, index: number) => {
          const departure = tour.departures?.[0] || null;
          const price = Number(
            departure?.adultPrice || tour.basePriceAdult || 0,
          );
          const accommodation = tour.accommodations?.[0] || null;
          const pickup = tour.pickupPoints?.[0] || null;
          const itinerarySummary = (tour.itinerary || [])
            .slice(0, 3)
            .map((i: any) => `Ngày ${i.dayNumber}: ${i.title}`)
            .join("; ");

          return [
            `**Tour ${index + 1}: ${tour.name}**`,
            `- Điểm đến: ${tour.destination?.name || "đang cập nhật"}`,
            `- Giá từ: ${this.formatCurrency(price)}/người`,
            `- Thời lượng: ${tour.durationDays} ngày ${tour.durationNights} đêm`,
            `- Chủ đề: ${tour.tourTheme || "đang cập nhật"}`,
            `- Khách sạn: ${
              accommodation
                ? `${accommodation.name}, ${accommodation.starRating || tour.hotelStars || "đang cập nhật"} sao`
                : tour.hotelStars
                  ? `${tour.hotelStars} sao`
                  : "đang cập nhật"
            }`,
            `- Điểm đón: ${pickup ? `${pickup.name} - ${pickup.address}` : "đang cập nhật"}`,
            `- Lịch trình: ${itinerarySummary || "đang cập nhật"}`,
          ].join("\n");
        });

        const familyTour = orderedTours.find((tour: any) =>
          this.stripText(tour.tourTheme || "").includes("family"),
        );
        const recommendation = familyTour
          ? `Nếu đi cùng gia đình/trẻ nhỏ, mình nghiêng về **${familyTour.name}** vì tour có định hướng gia đình rõ hơn.`
          : "Nếu đi cùng trẻ nhỏ, bạn nên ưu tiên tour có lịch trình ít di chuyển, điểm đón thuận tiện và thời lượng khớp nhu cầu hơn.";

        return [
          "Mình so sánh nhanh 2 tour bạn vừa chọn như sau:",
          "",
          ...lines,
          "",
          `**Gợi ý chọn:** ${recommendation}`,
        ].join("\n\n");
      }
    }

    const asksCheapest =
      /\b(tiet kiem hon|re hon|gia tot hon|gia mem hon|it tien hon|cheap|cheapest)\b/.test(
        normalized,
      );
    if (
      asksCheapest &&
      Array.isArray(ctx.memory.lastTourOptions) &&
      ctx.memory.lastTourOptions.length >= 2
    ) {
      const ids = ctx.memory.lastTourOptions
        .map((item: any) => String(item.tourId || ""))
        .filter((id) => /^\d+$/.test(id));
      const tours = await this.prisma.tour.findMany({
        where: {
          id: { in: ids.map((id) => BigInt(id)) },
          status: "published" as any,
        },
        include: {
          destination: true,
          departures: {
            where: { status: { in: ["open", "full"] as any } },
            orderBy: { departureDate: "asc" },
            take: 1,
          },
        } as any,
      });
      const rows = ids
        .map((id, idx) => {
          const tour: any = tours.find((t: any) => String(t.id) === id);
          if (!tour) return null;
          const departure = tour.departures?.[0] || null;
          const price = Number(
            departure?.adultPrice || tour.basePriceAdult || 0,
          );
          return { index: idx + 1, tour, price };
        })
        .filter(Boolean) as Array<{ index: number; tour: any; price: number }>;
      if (rows.length >= 2) {
        const sorted = [...rows].sort((a, b) => a.price - b.price);
        const lines = rows.map(
          (item) =>
            `${item.index}. ${item.tour.name}: ${this.formatCurrency(item.price)}/người`,
        );
        return [
          "Trong các tour mình vừa gợi ý, tour tiết kiệm nhất là:",
          "",
          `**Tour số ${sorted[0].index}: ${sorted[0].tour.name}** - ${this.formatCurrency(sorted[0].price)}/người.`,
          "",
          "So sánh nhanh giá:",
          ...lines,
          "",
          "Nếu ưu tiên tiết kiệm, bạn nên chọn tour này. Nếu đi gia đình/trẻ nhỏ, mình vẫn khuyên xem thêm thời lượng và lịch trình để tránh chọn tour quá gấp.",
        ].join("");
      }
    }

    if (destinations.length < 2) {
      return "Bạn muốn so sánh những tour nào? Ví dụ: “So sánh tour số 1 và số 2” sau khi mình đã gợi ý danh sách tour, hoặc “So sánh tour Đà Lạt và Nha Trang”.";
    }

    const compared = await Promise.all(
      destinations.slice(0, 2).map(async (destination) => {
        const rows = await this.prisma.tour.findMany({
          where: {
            status: "published" as any,
            destination: {
              name: { contains: destination },
            },
          },
          include: {
            destination: true,
            departures: {
              where: { status: { in: ["open", "full"] as any } },
              orderBy: { departureDate: "asc" },
              take: 1,
            },
            accommodations: {
              where: { status: "active" as any },
              take: 1,
            },
            itinerary: {
              orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
              take: 6,
            },
            pickupPoints: {
              where: { status: "active" as any },
              take: 3,
            } as any,
            reviews: {
              where: { status: "approved" as any },
              select: { rating: true, comment: true },
              take: 5,
            },
          } as any,
          take: 20,
        });

        const scored = rows
          .map((tour: any) => {
            const departure = tour.departures?.[0] || null;
            const price = Number(
              departure?.adultPrice || tour.basePriceAdult || 0,
            );
            const durationDiff = durationDays
              ? Math.abs(Number(tour.durationDays || 0) - durationDays)
              : 0;
            const familyScore =
              isFamily &&
              this.stripText(tour.tourTheme || "").includes("family")
                ? 20
                : 0;

            const score =
              100 -
              durationDiff * 10 +
              familyScore +
              Number(tour.hotelStars || 0) * 2 +
              this.averageRating(tour.reviews || []) * 2 -
              price / 1_000_000;

            return { tour, departure, score, price };
          })
          .sort((a, b) => b.score - a.score);

        return scored[0] || null;
      }),
    );

    const valid = compared.filter(Boolean) as any[];

    if (valid.length < 2) {
      return "Mình chưa tìm thấy đủ dữ liệu tour để so sánh hai điểm đến này trong hệ thống.";
    }

    const lines = valid.map((item) => {
      const tour = item.tour;
      const accommodation = tour.accommodations?.[0] || null;
      const pickup = tour.pickupPoints?.[0] || null;
      const itinerarySummary = (tour.itinerary || [])
        .slice(0, 3)
        .map((i: any) => `Ngày ${i.dayNumber}: ${i.title}`)
        .join("; ");

      return [
        `**${tour.destination?.name} - ${tour.name}**`,
        `- Giá từ: ${this.formatCurrency(item.price)}/người`,
        `- Thời lượng: ${tour.durationDays} ngày ${tour.durationNights} đêm`,
        `- Chủ đề: ${tour.tourTheme || "đang cập nhật"}`,
        `- Khách sạn: ${
          accommodation
            ? `${accommodation.name}, ${accommodation.starRating || tour.hotelStars || "đang cập nhật"} sao`
            : tour.hotelStars
              ? `${tour.hotelStars} sao`
              : "đang cập nhật"
        }`,
        `- Điểm đón: ${pickup ? `${pickup.name} - ${pickup.address}` : "đang cập nhật"}`,
        `- Lịch trình: ${itinerarySummary || "đang cập nhật"}`,
      ].join("\n");
    });

    let recommendation = "";

    if (isFamily) {
      const familyTour = valid.find((item) =>
        this.stripText(item.tour.tourTheme || "").includes("family"),
      );

      recommendation = familyTour
        ? `Nếu đi gia đình có trẻ nhỏ, mình nghiêng về **${familyTour.tour.destination?.name} - ${familyTour.tour.name}** vì tour có định hướng gia đình rõ hơn. Tuy nhiên bạn vẫn nên kiểm tra thời gian di chuyển và điểm tham quan có phải đi bộ nhiều không.`
        : `Nếu đi gia đình có trẻ nhỏ, bạn nên chọn tour có lịch trình ít di chuyển liên tục, khách sạn tốt và điểm đón thuận tiện. Trong hai lựa chọn này, hãy ưu tiên tour có thời lượng phù hợp và lịch trình nhẹ hơn.`;
    } else {
      recommendation =
        "Nếu bạn thích khí hậu mát mẻ, chụp ảnh và nghỉ dưỡng nhẹ nhàng thì Đà Lạt thường dễ hợp hơn. Nếu thích biển, đảo, hoạt động ngoài trời và nghỉ dưỡng biển thì Nha Trang phù hợp hơn.";
    }

    return [
      `Mình so sánh nhanh ${destinations.slice(0, 2).join(" và ")} như sau:`,
      "",
      ...lines,
      "",
      `**Gợi ý chọn:** ${recommendation}`,
    ].join("\n\n");
  }

  private async tryEarlyBusinessAnswer(
    ctx: PromptContext,
    intent: string,
    user: AuthUser,
  ): Promise<string | null> {
    const normalized = this.stripText(ctx.userMessage);
    const bookingCode = this.extractBookingCode(ctx.userMessage);

    // Điểm đến chưa hỗ trợ: chặn trước mọi luồng gợi ý/booking.
    if (this.mentionsUnsupportedDestination(normalized)) {
      return "Hiện hệ thống Travela chưa có tour cho điểm đến này trong dữ liệu. Bạn có thể thử các tour trong nước như Đà Lạt, Nha Trang, Phú Quốc, Đà Nẵng, Sa Pa, Cần Thơ hoặc Hạ Long nha.";
    }

    // User nói rõ tour chưa có trong hệ thống thì không được kéo memory cũ để đặt tour.
    if (
      /\b(chua co trong he thong|khong co trong he thong|tour chua co|tour khong co|tour moi chua co)\b/.test(
        normalized,
      )
    ) {
      return "Hiện mình chỉ có thể hỗ trợ đặt các tour đang có trong hệ thống Travela. Bạn hãy chọn một tour có trong danh sách trước, hoặc nhắn điểm đến/ngân sách/số ngày để mình lọc tour phù hợp nha.";
    }

    // Hoạt động đặc biệt không có dữ liệu thì không biến thành gợi ý tour chung.
    if (
      /\b(khinh khi cau|nhay du|lan bien|tau ngam|du thuyen rieng|may bay truc thang)\b/.test(
        normalized,
      )
    ) {
      const dest =
        ctx.memory.destination ||
        this.detectDestination(normalized) ||
        "điểm đến này";
      return `Mình chưa thấy dữ liệu chắc chắn rằng tour ${dest} trong hệ thống có hoạt động bạn hỏi. Mình không tự xác nhận hoạt động đó nếu DB/RAG chưa có. Bạn có thể mở chi tiết tour hoặc hỏi Travela để xác nhận trước khi đặt.`;
    }

    // Ngân sách vô lý quá thấp thì không gợi ý tour lệch.
    const parsedBudget = this.parseBudget(normalized);
    if (parsedBudget && parsedBudget < 500_000) {
      const destination =
        this.detectDestination(normalized) || ctx.memory.destination;
      return `Mình chưa tìm thấy tour${destination ? ` ${destination}` : ""} phù hợp với mức giá ${this.formatCurrency(parsedBudget)} trong dữ liệu hiện có. Bạn có thể tăng ngân sách hoặc cho mình khoảng giá thực tế hơn để mình lọc tour đúng hơn nha.`;
    }

    // Voucher ảo theo phần trăm phải chặn trước khi generateNaturalAnswer list voucher thường.
    if (
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon)\b/.test(
        normalized,
      ) ||
      intent === "voucher_check"
    ) {
      const requestedPercent = normalized.match(
        /(?:giam)\s*(\d{1,3})(?:\s*%|\s*phan tram)?/,
      )?.[1];

      if (requestedPercent) {
        const percent = Number(requestedPercent);
        const matched = (ctx.vouchers || []).filter((voucher) => {
          const text = this.stripText(
            `${voucher.code} ${voucher.name} ${voucher.discountText}`,
          );
          return (
            text.includes(`giam ${percent}`) ||
            text.includes(`${percent} phan tram`)
          );
        });

        if (!matched.length) {
          return `Mình chưa tìm thấy voucher giảm ${percent}% khả dụng trong tài khoản/dữ liệu hiện tại. Các voucher chỉ được dùng đúng theo mã và điều kiện đang có trong hệ thống, mình không tự tạo mã giảm ${percent}% áp dụng mọi tour được.`;
        }
      }
    }

    // Câu hoàn tiền theo mã booking phải kiểm tra booking, không trả policy tour gần nhất.
    if (
      intent !== "refund_create" &&
      bookingCode &&
      /\b(hoan tien|hoan|duoc hoan|refund|huy|huy tour|huy don|cancel|lay lai tien|lay lai duoc|tra tien|du dieu kien|dieu kien|co duoc hoan khong|co lay lai duoc khong)\b/.test(
        normalized,
      )
    ) {
      return this.generatePolicyAnswer(ctx, user);
    }

    return null;
  }

  private async tryDirectBusinessAnswer(
    ctx: PromptContext,
    intent: string,
  ): Promise<string | null> {
    const normalized = this.stripText(ctx.userMessage);

    // Câu có mã booking phải để generatePolicyAnswer / booking_status xử lý,
    // không được lấy chính sách của tour gần nhất trong memory.
    if (this.extractBookingCode(ctx.userMessage)) return null;

    // 0. Chặn điểm đến chưa có trong hệ thống trước khi confidence fallback hỏi lại chung chung.
    if (this.mentionsUnsupportedDestination(normalized)) {
      return "Hiện hệ thống Travela chưa có tour cho điểm đến này trong dữ liệu. Bạn có thể thử các tour trong nước như Đà Lạt, Nha Trang, Phú Quốc, Đà Nẵng, Sa Pa, Cần Thơ hoặc Hạ Long nha.";
    }

    // 1. Chặn các yêu cầu người dùng tự nói là chưa có trong hệ thống.
    if (
      /\b(chua co trong he thong|khong co trong he thong|tour chua co|tour khong co|tour moi chua co)\b/.test(
        normalized,
      )
    ) {
      return "Hiện mình chỉ có thể hỗ trợ đặt các tour đang có trong hệ thống Travela. Bạn hãy chọn một tour có trong danh sách trước, hoặc nhắn điểm đến/ngân sách/số ngày để mình lọc tour phù hợp nha.";
    }

    // 2. Không biến câu hỏi về hoạt động đặc biệt thành gợi ý tour chung.
    if (
      /\b(khinh khi cau|nhay du|lan bien|tau ngam|du thuyen rieng|may bay truc thang)\b/.test(
        normalized,
      )
    ) {
      const dest =
        ctx.memory.destination ||
        this.detectDestination(normalized) ||
        "điểm đến này";
      return `Mình chưa thấy dữ liệu chắc chắn rằng tour ${dest} trong hệ thống có hoạt động bạn hỏi. Mình không tự xác nhận hoạt động đó nếu DB/RAG chưa có. Bạn có thể mở chi tiết tour hoặc hỏi Travela để xác nhận trước khi đặt.`;
    }

    // 3. Voucher có mức giảm cụ thể nhưng không tồn tại thì phải nói không có, không list chung chung.
    // Không phụ thuộc 100% vào intent vì LLM NLU đôi lúc phân loại câu này thành tư vấn chung.
    if (
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon)\b/.test(
        normalized,
      ) ||
      intent === "voucher_check"
    ) {
      const requestedPercent = normalized.match(
        /(?:giam)\s*(\d{1,3})(?:\s*%|\s*phan tram)?/,
      )?.[1];
      const requestedVoucherCode = this.extractVoucherCodeFromMessage(
        ctx.userMessage,
      );
      if (requestedPercent) {
        const percent = Number(requestedPercent);
        const matched = (ctx.vouchers || []).filter((voucher) => {
          const text = this.stripText(
            `${voucher.code} ${voucher.name} ${voucher.discountText}`,
          );
          return (
            text.includes(`giam ${percent}%`) ||
            text.includes(`${percent}%`) ||
            text.includes(`${percent} phan tram`)
          );
        });
        if (!matched.length) {
          return `Mình chưa tìm thấy voucher giảm ${percent}% khả dụng trong tài khoản/dữ liệu hiện tại. Các voucher chỉ được dùng đúng theo mã và điều kiện đang có trong hệ thống, mình không tự tạo mã giảm ${percent}% áp dụng mọi tour được.`;
        }
      }
      if (requestedVoucherCode && ctx.vouchers.length) return null;
    }

    // Với câu đang tìm/gợi ý tour mới, không trả lời trực tiếp lịch trình/khách sạn của tour cũ.
    // Ví dụ: "Tôi muốn đi biển, chụp hình đẹp..." hoặc "Tôi muốn nghỉ dưỡng, khách sạn tốt..."
    // phải trả danh sách tour phù hợp, không phải lịch trình/khách sạn của memory cũ.
    if (
      ["tour_search", "personal_recommendation"].includes(String(intent)) &&
      this.isFreshTourAdviceMessage(ctx.userMessage)
    ) {
      return null;
    }

    const sectionIntent = this.detectTourSectionIntent(normalized, intent);
    if (!sectionIntent) return null;

    // Câu hỏi chính sách chung như "chính sách hoàn tiền" không được lấy
    // tour gần nhất trong memory rồi trả thành "Chính sách của <tên tour>".
    const asksGeneralRefundPolicy =
      sectionIntent === "policy" &&
      /^(chinh sach hoan tien|chinh sach huy hoan tien|chinh sach huy tour|huy tour duoc hoan bao nhieu|hoan tien nhu the nao|quy dinh hoan tien)$/.test(
        normalized,
      );

    if (asksGeneralRefundPolicy) {
      return [
        "Chính sách hủy tour và hoàn tiền của Travela:",
        "",
        "- Yêu cầu hủy chỉ được tiếp nhận từ thứ Hai đến thứ Sáu và không thuộc ngày nghỉ lễ.",
        "- Hủy trong vòng 24 giờ kể từ thời điểm thanh toán thành công, đồng thời tour còn trên 24 giờ mới khởi hành: hoàn 70% giá trị booking sau voucher.",
        "- Đã quá 24 giờ kể từ lúc thanh toán và còn ít nhất 7 ngày trước ngày khởi hành: hoàn 50%.",
        "- Còn từ 3 ngày đến dưới 7 ngày trước ngày khởi hành: hoàn 30%.",
        "- Còn dưới 3 ngày, trong vòng 24 giờ trước ngày khởi hành hoặc tour đã khởi hành: không hoàn tiền.",
        "- Booking phải ở trạng thái đã thanh toán hoặc đã xác nhận và chưa có yêu cầu hủy đang xử lý.",
        "- Số tiền hoàn do hệ thống tự tính từ giá trị booking sau voucher.",
      ].join("\n");
    }

    const tour = await this.findTourForDirectAnswer(ctx);
    if (!tour) return null;

    if (sectionIntent === "pickup") {
      const points = tour.pickupPoints || [];
      if (!points.length) {
        return `Mình đã tìm thấy ${tour.name}, nhưng tour này chưa có điểm đón active trong dữ liệu hiện tại.`;
      }
      const lines = points.slice(0, 8).map((point: any, index: number) => {
        const time = point.pickupTime
          ? `, giờ đón ${this.formatTimeForChat(point.pickupTime)}`
          : "";
        return `${index + 1}. ${point.name} - ${point.address}${time} (mã điểm đón: ${String(point.id)})`;
      });
      return [
        `Tour ${tour.name} có các điểm đón sau:`,
        "",
        ...lines,
        "",
        "Khi đặt tour, bạn có thể nhắn: “chọn điểm đón mã ...”.",
      ].join("\n");
    }

    if (sectionIntent === "departure") {
      const departures = await this.findBookableDepartureOptions(
        BigInt(tour.id),
      );
      if (!departures.length) {
        return `Mình đã tìm thấy ${tour.name}, nhưng hiện chưa có lịch khởi hành còn mở để đặt.`;
      }
      const lines = departures.slice(0, 5).map((d: any, index: number) => {
        const price = Number(d.adultPrice || tour.basePriceAdult || 0);
        const slots = this.getAvailableSlots(d);
        return `${index + 1}. ${this.formatDate(new Date(d.departureDate).toISOString())} - ${this.formatDate(d.endDate ? new Date(d.endDate).toISOString() : null)}, giá từ ${this.formatCurrency(price)}/người, còn khoảng ${Math.max(0, slots)} chỗ, trạng thái ${d.status}.`;
      });
      return [
        `Lịch khởi hành gần nhất của ${tour.name}:`,
        "",
        ...lines,
        "",
        "Khi đặt, bạn có thể nhắn: “chọn lịch số 1, điểm đón mã ..., dùng voucher ..., thanh toán chuyển khoản, 1 người lớn”.",
      ].join("\n");
    }

    if (sectionIntent === "policy") {
      const policies = tour.policies || [];
      const cancelPolicies = policies.filter((p: any) =>
        /cancel|huy|refund|hoan/i.test(`${p.policyType} ${p.content}`),
      );
      const selected = cancelPolicies.length ? cancelPolicies : policies;
      if (selected.length) {
        return [
          `Chính sách của ${tour.name}:`,
          "",
          ...selected.map(
            (p: any) => `- ${this.policyLabel(p.policyType)}: ${p.content}`,
          ),
        ].join("\n");
      }
      return [
        `Mình đã tìm thấy ${tour.name}, nhưng tour này chưa có chính sách riêng trong bảng tour_policies.`,
        "Bạn có thể áp dụng chính sách chung của Travela với các mức hoàn 70%, 50%, 30% tùy thời điểm thanh toán và số ngày còn lại trước khởi hành.",
      ].join("\n");
    }

    if (sectionIntent === "hotel") {
      const hotels = tour.accommodations || [];
      if (!hotels.length)
        return `Mình đã tìm thấy ${tour.name}, nhưng chưa có dữ liệu khách sạn/lưu trú active cho tour này.`;
      return [
        `Thông tin lưu trú/khách sạn của ${tour.name}:`,
        "",
        ...hotels
          .slice(0, 5)
          .map(
            (h: any) =>
              `- ${h.name}: ${h.starRating || tour.hotelStars || "đang cập nhật"} sao${h.address ? `, địa chỉ ${h.address}` : ""}${h.amenities ? `, tiện nghi: ${h.amenities}` : ""}`,
          ),
      ].join("\n");
    }

    if (sectionIntent === "itinerary") {
      const items = tour.itinerary || [];
      if (!items.length)
        return `Mình đã tìm thấy ${tour.name}, nhưng chưa có lịch trình chi tiết trong bảng tour_itinerary.`;
      return [
        `Lịch trình của ${tour.name} gồm:`,
        "",
        ...items.map(
          (item: any) =>
            `- Ngày ${item.dayNumber}: ${item.title}${item.locationName ? ` tại ${item.locationName}` : ""}${item.description ? ` - ${item.description}` : ""}`,
        ),
      ].join("\n");
    }

    return null;
  }

  private detectTourSectionIntent(
    normalized: string,
    intent: string,
  ): "pickup" | "departure" | "policy" | "hotel" | "itinerary" | null {
    const isTemporalDiscovery =
      ["tour_search", "personal_recommendation"].includes(String(intent)) &&
      (Boolean(this.parseDepartureMonth(normalized)) ||
        /\b(nen di dau|goi y.*di dau|thang\s+\d{1,2})\b/.test(normalized));

    if (isTemporalDiscovery) {
      return null;
    }

    if (
      intent === "pickup_point" ||
      /\b(diem don|don o dau|don tai dau|cho don|gio don|pickup|xe don)\b/.test(
        normalized,
      )
    )
      return "pickup";
    if (
      intent === "tour_policy" ||
      /\b(chinh sach|huy|hoan tien|refund|cancel|doi lich|doi tour|phi huy|truoc ngay khoi hanh|truoc ngay di|bao nhieu ngay|duoc hoan)\b/.test(
        normalized,
      )
    )
      return "policy";
    if (
      /\b(lich khoi hanh|khoi hanh nao|ngay khoi hanh|con lich|lich gan nhat|con cho|ngay di)\b/.test(
        normalized,
      )
    )
      return "departure";
    if (
      /\b(khach san|luu tru|resort|o dau|tien nghi|may sao)\b/.test(normalized)
    )
      return "hotel";
    if (
      /\b(lich trinh|lich trinh nay|di nhung dau)\b/.test(normalized) ||
      /\bngay\s*[123](?!\s*dem)\b/.test(normalized) ||
      (String(intent) === "follow_up" &&
        /\b(di dau|tour nay di dau|tour do di dau)\b/.test(normalized))
    )
      return "itinerary";
    return null;
  }

  private async findTourForDirectAnswer(
    ctx: PromptContext,
  ): Promise<any | null> {
    const db = this.prisma as any;
    if (!db.tour) return null;

    const include = {
      destination: true,
      itinerary: { orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }] },
      accommodations: { where: { status: "active" } },
      transports: { where: { status: "active" } },
      policies: { orderBy: { displayOrder: "asc" } },
      departures: {
        where: { status: { in: ["open", "full"] } },
        orderBy: { departureDate: "asc" },
        take: 8,
      },
      pickupPoints: {
        where: { status: "active" },
        orderBy: [{ departureId: "desc" }, { pickupTime: "asc" }],
        take: 8,
      },
    } as any;

    const message = ctx.userMessage || "";
    const normalized = this.stripText(message);
    const isPronounFollowUp =
      /\b(tour nay|tour do|tour vua goi y|tour dau tien|tour tren|lich trinh nay)\b/.test(
        normalized,
      );

    // Với câu "tour này/tour đó", bắt buộc ưu tiên memory.lastTourId.
    // Không lấy ctx.tours[0] vì tour_search có thể trả một tour khác và làm lệch ngữ cảnh.
    const id = isPronounFollowUp
      ? ctx.memory.lastTourId || ctx.tours?.[0]?.tourId
      : ctx.tours?.[0]?.tourId || ctx.memory.lastTourId;

    if (id && /^\d+$/.test(String(id))) {
      const byId = await db.tour.findFirst({
        where: { id: BigInt(id), status: "published" },
        include,
      });
      if (byId) return byId;
    }

    const nameKeywords = normalized
      .split(" ")
      .filter(
        (word) =>
          word.length >= 3 &&
          ![
            "tour",
            "lich",
            "trinh",
            "diem",
            "don",
            "chinh",
            "sach",
            "khach",
            "san",
            "ngay",
            "dem",
            "nhu",
            "the",
            "nao",
          ].includes(word),
      )
      .slice(0, 8);

    if (nameKeywords.length) {
      const rows = await db.tour.findMany({
        where: {
          status: "published",
          OR: nameKeywords.flatMap((word) => [
            { name: { contains: word } },
            { slug: { contains: word } },
            { code: { contains: word.toUpperCase() } },
            { destination: { name: { contains: word } } },
          ]),
        },
        include,
        take: 20,
      });
      const scored = rows
        .map((tour: any) => {
          const text = this.stripText(
            `${tour.name} ${tour.slug} ${tour.destination?.name || ""}`,
          );
          const score = nameKeywords.reduce(
            (sum, word) => sum + (text.includes(word) ? 1 : 0),
            0,
          );
          return { tour, score };
        })
        .filter((item: any) => item.score > 0)
        .sort((a: any, b: any) => b.score - a.score);
      if (scored[0]?.score >= 2) return scored[0].tour;
    }

    if (ctx.memory.lastTourName) {
      const byMemoryName = await db.tour.findFirst({
        where: {
          name: { contains: ctx.memory.lastTourName },
          status: "published",
        },
        include,
      });

      if (byMemoryName) return byMemoryName;
    }

    return null;
  }

  private async createRefundRequestFromChatbot(
    bookingCode: string,
    user: AuthUser,
    reasonText: string,
    receiver?: {
      refundBankName?: string | null;
      refundAccountNo?: string | null;
      refundAccountName?: string | null;
      refundQrUrl?: string | null;
    },
  ): Promise<{ refundRequest: RefundRequestCard | null; answer: string }> {
    if (!user?.userId) {
      return {
        refundRequest: null,
        answer: [
          `Mình thấy bạn muốn hoàn tiền booking ${bookingCode}.`,
          "Bạn cần đăng nhập đúng tài khoản đã đặt tour để mình tạo yêu cầu hoàn tiền.",
        ].join("\n"),
      };
    }

    const booking = await this.prisma.booking.findFirst({
      where: { bookingCode, userId: user.userId },
      include: {
        tour: { include: { destination: true } },
        departure: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!booking) {
      return {
        refundRequest: null,
        answer: `Mình không tìm thấy booking ${bookingCode} trong tài khoản của bạn. Bạn kiểm tra lại mã booking hoặc đăng nhập đúng tài khoản đã đặt tour nha.`,
      };
    }

    try {
      const refund = await this.refundsService.create(user.userId, {
        bookingId: Number(booking.id),
        reason:
          reasonText?.trim() ||
          `Khách yêu cầu hoàn tiền qua Travela AI cho booking ${bookingCode}`,
        refundBankName: receiver?.refundBankName || undefined,
        refundAccountNo: receiver?.refundAccountNo || undefined,
        refundAccountName: receiver?.refundAccountName || undefined,
        refundQrUrl: receiver?.refundQrUrl || undefined,
      } as any);

      const card: RefundRequestCard = {
        id: String((refund as any).id),
        bookingCode,
        tourName:
          (refund as any).booking?.tour?.name ||
          (booking as any).tour?.name ||
          "Tour Travela",
        refundAmount: Number(
          (refund as any).refundAmount || (booking as any).finalAmount || 0,
        ),
        status: String((refund as any).status || "pending"),
        createdAt: (refund as any).createdAt
          ? new Date((refund as any).createdAt).toISOString()
          : null,
        reason: (refund as any).reason || null,
      };

      return {
        refundRequest: card,
        answer: [
          `Mình đã tạo yêu cầu hoàn tiền cho booking ${bookingCode}.`,
          `Tour: ${card.tourName}.`,
          `Số tiền đề nghị hoàn: ${this.formatCurrency(card.refundAmount)}.`,
          "Trạng thái: chờ admin duyệt.",
          "Admin sẽ kiểm tra điều kiện hoàn tiền và cập nhật kết quả trong mục Hoàn tiền của bạn.",
        ].join("\n"),
      };
    } catch (error: any) {
      const friendlyReason = String(
        error?.response?.message ||
          error?.message ||
          "Không đủ điều kiện hoàn tiền.",
      );

      return {
        refundRequest: null,
        answer: [
          `Mình đã kiểm tra booking ${bookingCode}.`,
          "",
          "❌ Booking này chưa đủ điều kiện hoàn tiền.",
          `Lý do: ${friendlyReason}`,
          "",
          "Lưu ý: yêu cầu hoàn tiền vẫn cần admin kiểm tra và duyệt trước khi cập nhật trạng thái.",
        ].join("\n"),
      };
    }
  }

  private isRefundConfirmMessage(message: string) {
    const normalized = this.stripText(message);

    return /\b(xac nhan hoan tien|dong y hoan tien|gui yeu cau hoan tien|tao yeu cau hoan tien|xac nhan huy|dong y huy|ok hoan tien|oke hoan tien|hoan cho toi|hoàn cho tôi|hoan di|hoàn đi|tiep tuc hoan|tiếp tục hoàn|gui yeu cau|gửi yêu cầu|ok hoan|oke hoan)\b/.test(
      normalized,
    );
  }

  private extractRefundReceiverInfo(message: string) {
    const raw = String(message || "");

    const bankMatch = raw.match(
      /(?:ngân hàng|ngan hang|bank)\s*(?:là|la|:)?\s*([^,;\n]+)/i,
    );

    const accountNoMatch = raw.match(
      /(?:số tài khoản|so tai khoan|stk|account no|account)\s*(?:là|la|:)?\s*([0-9A-Za-z_.-]{4,50})/i,
    );

    const accountNameMatch = raw.match(
      /(?:chủ tài khoản|chu tai khoan|tên tài khoản|ten tai khoan|account name)\s*(?:là|la|:)?\s*([^,;\n]+)/i,
    );

    return {
      refundBankName: bankMatch?.[1]?.trim() || null,
      refundAccountNo: accountNoMatch?.[1]?.trim() || null,
      refundAccountName: accountNameMatch?.[1]?.trim() || null,
    };
  }

  private extractRefundDraft(
    message: string,
    current: MemoryState,
  ): ChatRefundDraft | null {
    const normalized = this.stripText(message);

    // Không tạo hoặc nối tiếp refundDraft khi người dùng chỉ hỏi chính sách.
    if (this.isRefundPolicyQuestion(message)) {
      return current.refundDraft || null;
    }

    const hasRefundSignal =
      /\b(hoan tien|hoan lai|refund|huy don|huy booking|huy tour|lay lai tien|tra tien)\b/.test(
        normalized,
      ) || Boolean(current.refundDraft?.started);

    if (!hasRefundSignal) return current.refundDraft || null;

    const previous = current.refundDraft || {};

    const bookingCode =
      this.extractBookingCode(message) ||
      previous.bookingCode ||
      current.lastBookingCode ||
      null;

    const receiver = this.extractRefundReceiverInfo(message);

    const reasonMatch = String(message).match(
      /(?:lý do|ly do|reason)\s*(?:là|la|:)?\s*([^;\n]+)/i,
    );

    return {
      ...previous,
      started: true,
      bookingCode,
      confirmed: this.isRefundConfirmMessage(message)
        ? true
        : previous.confirmed || false,
      reason:
        reasonMatch?.[1]?.trim() ||
        previous.reason ||
        "Khách yêu cầu hoàn tiền qua Travela AI",
      refundBankName:
        receiver.refundBankName || previous.refundBankName || null,
      refundAccountNo:
        receiver.refundAccountNo || previous.refundAccountNo || null,
      refundAccountName:
        receiver.refundAccountName || previous.refundAccountName || null,
    };
  }

  private buildRefundMissingInfoAnswer(draft: ChatRefundDraft) {
    const missing: string[] = [];

    if (!draft.bookingCode) missing.push("- Mã booking, ví dụ: BK123456");
    if (!draft.refundBankName) missing.push("- Ngân hàng nhận tiền");
    if (!draft.refundAccountNo) missing.push("- Số tài khoản nhận tiền");
    if (!draft.refundAccountName) missing.push("- Tên chủ tài khoản");

    return [
      "Mình có thể hỗ trợ bạn tạo yêu cầu hoàn tiền, nhưng cần đủ thông tin để admin chuyển khoản lại.",
      "",
      "Bạn còn thiếu:",
      ...missing,
      "",
      "Bạn nhắn theo mẫu này nha:",
      "Hoàn tiền booking BK123456, ngân hàng MBBank, STK 0123456789, chủ tài khoản NGUYEN VAN A, lý do: đổi kế hoạch.",
    ].join("\n");
  }

  private async processRefundFlow(
    ctx: PromptContext,
    memory: MemoryState,
    user: AuthUser,
  ): Promise<{
    answer: string;
    memory?: Partial<MemoryState>;
    refundRequest?: RefundRequestCard | null;
  } | null> {
    if (ctx.intent !== "refund_create") return null;

    const draft: ChatRefundDraft = {
      ...(memory.refundDraft || {}),
      ...(this.extractRefundDraft(ctx.userMessage, memory) || {}),
      started: true,
    };

    if (!draft.bookingCode) {
      return {
        answer: [
          "Bạn muốn hủy booking nào?",
          "Bạn gửi mã booking dạng BK... giúp mình nha.",
          "Ví dụ: “Hủy booking BK123456”.",
        ].join("\n"),
        memory: { refundDraft: draft },
      };
    }

    if (!user?.userId) {
      return {
        answer: [
          `Mình thấy bạn muốn hủy booking ${draft.bookingCode}.`,
          "Bạn cần đăng nhập đúng tài khoản đã đặt tour để mình kiểm tra điều kiện hủy/hoàn tiền.",
        ].join("\n"),
        memory: { refundDraft: draft },
      };
    }

    const eligible = await this.checkRefundEligibilityForChatbot(
      draft.bookingCode,
      user.userId,
    );

    if (!eligible.eligible) {
      if (eligible.code === "UNPAID" && eligible.booking?.id) {
        if (!draft.confirmed) {
          return {
            answer: [
              `Booking ${draft.bookingCode} chưa thanh toán nên không phát sinh tiền hoàn.`,
              "Bạn có thể hủy booking này trực tiếp và hệ thống sẽ trả lại chỗ đang giữ.",
              "",
              "Nếu đồng ý, hãy nhắn: “xác nhận hủy booking”.",
            ].join("\n"),
            memory: {
              refundDraft: {
                ...draft,
                confirmed: false,
              },
            },
          };
        }

        try {
          await this.bookingsService.cancelMyBooking(
            Number(eligible.booking.id),
            user.userId,
          );

          return {
            answer: [
              `Đã hủy booking ${draft.bookingCode}.`,
              "Booking chưa thanh toán nên không có yêu cầu hoàn tiền.",
              "Chỗ đang giữ đã được trả lại cho lịch khởi hành.",
            ].join("\n"),
            memory: {
              refundDraft: null,
              lastBookingCode: draft.bookingCode,
              lastBookingPaymentStatus: null,
            },
          };
        } catch (error: any) {
          return {
            answer:
              String(error?.response?.message || error?.message || "") ||
              "Mình chưa hủy được booking này. Bạn thử lại hoặc liên hệ Travela.",
            memory: { refundDraft: null },
          };
        }
      }

      return {
        answer: [
          `Mình đã kiểm tra booking ${draft.bookingCode}.`,
          "",
          "❌ Booking này chưa đủ điều kiện hủy/hoàn tiền.",
          `Lý do: ${eligible.reason}`,
          "",
          eligible.code === "WRONG_ACCOUNT"
            ? "Bạn hãy đăng nhập đúng tài khoản đã đặt tour rồi thử lại."
            : "Nếu cần hỗ trợ thêm, bạn có thể liên hệ admin Travela.",
        ].join("\n"),
        memory: { refundDraft: null },
      };
    }

    const refundProfile = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        refundBankName: true,
        refundAccountNo: true,
        refundAccountName: true,
      },
    });

    draft.refundBankName =
      draft.refundBankName || refundProfile?.refundBankName || null;
    draft.refundAccountNo =
      draft.refundAccountNo || refundProfile?.refundAccountNo || null;
    draft.refundAccountName =
      draft.refundAccountName || refundProfile?.refundAccountName || null;

    if (
      !draft.refundBankName ||
      !draft.refundAccountNo ||
      !draft.refundAccountName
    ) {
      return {
        answer: [
          `Booking ${draft.bookingCode} đủ điều kiện gửi yêu cầu hoàn tiền.`,
          eligible.preview?.policyLabel
            ? `Chính sách áp dụng: ${eligible.preview.policyLabel}.`
            : eligible.reason,
          eligible.preview?.refundAmount != null
            ? `Số tiền dự kiến hoàn: ${this.formatCurrency(
                Number(eligible.preview.refundAmount || 0),
              )}.`
            : "",
          "",
          this.buildRefundMissingInfoAnswer(draft),
        ]
          .filter(Boolean)
          .join("\n"),
        memory: { refundDraft: draft },
      };
    }

    if (!draft.confirmed) {
      return {
        answer: [
          `Mình đã kiểm tra booking ${draft.bookingCode}.`,
          "",
          "✅ Booking này có thể gửi yêu cầu hoàn tiền.",
          eligible.preview?.policyLabel
            ? `Chính sách: ${eligible.preview.policyLabel}.`
            : `Kết quả kiểm tra: ${eligible.reason}`,
          eligible.preview?.refundAmount != null
            ? `Số tiền dự kiến hoàn: ${this.formatCurrency(
                Number(eligible.preview.refundAmount || 0),
              )}.`
            : "",
          "",
          "Thông tin nhận hoàn tiền:",
          `- Ngân hàng: ${draft.refundBankName}`,
          `- Số tài khoản: ${draft.refundAccountNo}`,
          `- Chủ tài khoản: ${draft.refundAccountName}`,
          `- Lý do: ${draft.reason || "Khách yêu cầu hoàn tiền"}`,
          "",
          "Bạn có thể sửa ngân hàng/STK/lý do ngay lúc này.",
          "Nếu thông tin đã đúng, nhắn “xác nhận hoàn tiền” để gửi admin duyệt.",
        ]
          .filter(Boolean)
          .join("\n"),
        memory: {
          refundDraft: {
            ...draft,
            confirmed: false,
          },
        },
      };
    }

    const result = await this.createRefundRequestFromChatbot(
      draft.bookingCode,
      user,
      draft.reason || "Khách yêu cầu hoàn tiền qua Travela AI",
      {
        refundBankName: draft.refundBankName,
        refundAccountNo: draft.refundAccountNo,
        refundAccountName: draft.refundAccountName,
        refundQrUrl: draft.refundQrUrl || null,
      },
    );

    return {
      answer: result.answer,
      refundRequest: result.refundRequest,
      memory: { refundDraft: null },
    };
  }

  private generateNaturalAnswer(ctx: PromptContext): string {
    const name = ctx.userProfile.fullName ? ` ${ctx.userProfile.fullName}` : "";

    if (ctx.intent === "small_talk") {
      return `Chào${name}! Mình là Travela AI. Bạn có thể hỏi mình tìm tour theo ngân sách/số ngày, kiểm tra voucher, tra booking, hoặc hỏi điểm đón. Bạn muốn đi đâu trước nè?`;
    }

    if (ctx.intent === "personal_recommendation") {
      if (ctx.tours.length) {
        return ctx.userProfile.loggedIn
          ? `Dựa trên lịch sử xem, tìm kiếm, yêu thích và đặt tour của bạn, mình đã chọn ${ctx.tours.length} tour phù hợp nhất. Bạn có thể mở chi tiết hoặc yêu cầu mình so sánh.`
          : `Bạn đang dùng Travela với tư cách khách vãng lai nên mình chưa thể cá nhân hóa theo lịch sử xem, yêu thích hoặc đặt tour. Trước mắt, mình gửi ${ctx.tours.length} tour nổi bật đang còn lịch khởi hành để bạn tham khảo. Hãy đăng nhập để nhận gợi ý riêng theo sở thích, hoặc nói thêm điểm đến, ngân sách và số ngày để mình lọc chính xác hơn.`;
      }

      return ctx.userProfile.loggedIn
        ? "Mình chưa có đủ dữ liệu cá nhân hóa hoặc hiện chưa có tour còn lịch phù hợp. Bạn hãy xem/yêu thích vài tour, hoặc nói điểm đến, số ngày và ngân sách để mình lọc tiếp nha."
        : "Hiện mình chưa tìm được tour còn lịch để gợi ý. Bạn nói thêm điểm đến, ngân sách hoặc số ngày muốn đi để mình kiểm tra lại nha.";
    }

    if (ctx.intent === "booking_create") {
      return "Mình có thể hỗ trợ bạn đặt tour ngay trong chatbot. Bạn hãy nhắn rõ số người lớn, số trẻ em. Hệ thống hiện chỉ hỗ trợ thanh toán chuyển khoản ngân hàng qua mã QR.";
    }
    if (ctx.intent === "voucher_check") {
      if (!ctx.userProfile.loggedIn) {
        return "Bạn cần đăng nhập để mình kiểm tra voucher trong tài khoản.";
      }

      const requestedVoucherCode = this.extractVoucherCodeFromMessage(
        ctx.userMessage,
      );

      if (requestedVoucherCode && ctx.vouchers.length) {
        const found = ctx.vouchers.find(
          (voucher) => voucher.code.toUpperCase() === requestedVoucherCode,
        );

        if (found) {
          return [
            `Mã voucher ${found.code} có trong tài khoản của bạn.`,
            `${found.discountText}${
              found.minOrderAmount
                ? `, áp dụng cho đơn từ ${this.formatCurrency(found.minOrderAmount)}`
                : ""
            }${found.endDate ? `, HSD: ${this.formatDate(found.endDate)}` : ""}.`,
            "",
            "Để dùng voucher này, bạn cần chọn tour trước. Bạn có thể nhắn:",
            `“Đặt tour Nha Trang 2 người lớn, dùng voucher ${found.code}, thanh toán chuyển khoản”.`,
          ].join("\n");
        }

        return [
          `Mình chưa thấy voucher ${requestedVoucherCode} trong danh sách voucher khả dụng của tài khoản này.`,
          "Bạn có thể hỏi “Tôi có voucher nào?” để xem danh sách mã còn dùng được.",
        ].join("\n");
      }

      if (ctx.vouchers.length) {
        const lines = ctx.vouchers.map(
          (voucher, index) =>
            `${index + 1}. ${voucher.code} - ${voucher.discountText}${
              voucher.minOrderAmount
                ? `, áp dụng cho đơn từ ${this.formatCurrency(voucher.minOrderAmount)}`
                : ""
            }${voucher.endDate ? `, HSD: ${this.formatDate(voucher.endDate)}` : ""}`,
        );

        return [
          `Bạn hiện có ${ctx.vouchers.length} voucher khả dụng:`,
          "",
          ...lines,
          "",
          "Khi đặt tour qua chatbot, bạn có thể nhắn: “dùng voucher BRONZE2X” hoặc “không dùng voucher”.",
        ].join("\n");
      }

      return "Mình chưa tìm thấy voucher khả dụng trong tài khoản này. Nếu trên trang hồ sơ vẫn có voucher available, bạn kiểm tra lại token đăng nhập khi gọi API chatbot.";
    }

    if (ctx.intent === "booking_status") {
      if (!ctx.userProfile.loggedIn)
        return "Bạn cần đăng nhập để mình kiểm tra đơn đặt tour. Nếu có mã booking dạng BK..., bạn gửi mã đó để mình tra nhanh hơn.";
      if (ctx.bookings.length)
        return `Mình tìm thấy ${ctx.bookings.length} booking gần nhất của bạn. Bạn xem trạng thái, ngày đi, điểm đón và thanh toán trong thẻ bên dưới nha.`;
      return "Mình chưa tìm thấy booking trong tài khoản này. Bạn kiểm tra lại tài khoản đăng nhập hoặc gửi mã booking dạng BK... để mình tra chính xác hơn.";
    }

    if (ctx.intent === "pickup_point") {
      if (ctx.pickupPoints.length)
        return `Mình tìm thấy một số điểm đón phù hợp. Khi đặt tour, bạn có thể chọn điểm đón trong form đặt tour; nếu chưa có điểm gần bạn, Travela sẽ liên hệ để xác nhận.`;
      return "Hiện mình chưa thấy điểm đón khớp với câu hỏi. Bạn cho mình biết rõ tour/điểm đến và tỉnh thành bạn muốn được đón, ví dụ: “đi Phú Quốc, tôi ở Cần Thơ”.";
    }

    if (ctx.intent === "tour_policy") {
      const normalized = this.stripText(ctx.userMessage);

      if (
        /\b(hoan tien|refund|huy|huy tour|huy don|cancel)\b/.test(normalized)
      ) {
        return [
          "Chính sách hoàn tiền của Travela hiện áp dụng như sau:",
          "",
          "- Khách chỉ có thể gửi yêu cầu hoàn tiền trong vòng 48 giờ sau khi đặt tour.",
          "- Không hỗ trợ hoàn tiền nếu còn dưới 3 ngày trước ngày khởi hành.",
          "- Booking phải ở trạng thái đã xác nhận hoặc đã thanh toán.",
          "- Booking đã hủy, đã hoàn thành, đã hoàn tiền hoặc chưa thanh toán sẽ không đủ điều kiện hoàn.",
          "- Nếu đã có yêu cầu hoàn tiền đang chờ duyệt hoặc đã được duyệt, hệ thống sẽ không cho gửi thêm yêu cầu mới.",
          "- Yêu cầu hoàn tiền cần admin xem xét và duyệt trước khi cập nhật trạng thái.",
          "",
          "Nếu bạn đã đặt tour rồi, hãy gửi mã booking dạng BK... để mình kiểm tra điều kiện hoàn tiền cụ thể cho đơn của bạn.",
        ].join("\n");
      }

      if (ctx.faqs.length) {
        return `Mình tóm tắt theo chính sách Travela: ${ctx.faqs[0].answer}\n\nNếu trường hợp của bạn liên quan booking đã đặt, hãy gửi mã đơn để mình kiểm tra cụ thể hơn.`;
      }

      return "Về chính sách hủy/đổi/hoàn tiền, Travela xử lý theo trạng thái booking, thời điểm khởi hành và phương thức thanh toán. Bạn gửi mã đơn hoặc tình huống cụ thể để mình tư vấn chính xác hơn.";
    }

    if (ctx.intent === "follow_up") {
      const normalized = this.stripText(ctx.userMessage);
      const tourName = ctx.memory.lastTourName || "tour này";
      const content = ctx.ragHits
        .map((hit: any) => `${hit.title || ""}\n${hit.content || ""}`)
        .join("\n\n");

      if (!ctx.ragHits.length || !content.trim()) {
        return `Mình chưa tìm thấy đủ dữ liệu chi tiết cho ${tourName}. Bạn hỏi lại rõ hơn tên tour hoặc bấm vào thẻ tour để xem lịch trình, khách sạn và phương tiện nha.`;
      }

      if (
        /\b(nhe nhang|co met khong|met khong|phu hop gia dinh|phu hop tre nho|tre nho|tre em)\b/.test(
          normalized,
        )
      ) {
        const itinerary = this.extractSectionFromRagContent(content, [
          "Lịch trình chi tiết:",
          "Lịch trình:",
        ]);

        return [
          `Theo dữ liệu hiện có về ${tourName}, lịch trình này nhìn chung có thể phù hợp cho gia đình có trẻ nhỏ nếu gia đình muốn đi theo tour có sẵn và lịch trình được tổ chức sẵn.`,
          "",
          itinerary
            ? `Một số thông tin lịch trình liên quan:\n${itinerary}`
            : "Tuy nhiên, hệ thống chưa có đủ chi tiết từng hoạt động để đánh giá chính xác mức độ di chuyển nhiều hay ít.",
          "",
          "Nếu đi cùng trẻ nhỏ, bạn nên ưu tiên chọn lịch trình ít di chuyển liên tục, có thời gian nghỉ và xác nhận thêm với Travela về điểm đón/giờ khởi hành trước khi đặt.",
        ].join("\n");
      }

      if (
        /\b(lich trinh|lich trinh nay|di dau|di nhung dau|ngay 1|ngay 2|ngay 3)\b/.test(
          normalized,
        )
      ) {
        return [
          `Theo dữ liệu hiện có về ${tourName}, mình tìm thấy thông tin lịch trình trong hệ thống.`,
          "",
          this.extractSectionFromRagContent(content, [
            "Lịch trình chi tiết:",
            "Lịch trình:",
          ]),
        ].join("\n");
      }

      if (/\b(khach san|luu tru|o dau|tien nghi|may sao)\b/.test(normalized)) {
        return [
          `Theo dữ liệu hiện có về ${tourName}, thông tin lưu trú/khách sạn như sau:`,
          "",
          this.extractSectionFromRagContent(content, [
            "Lưu trú/khách sạn:",
            "Khách sạn:",
            "Lưu trú:",
          ]),
        ].join("\n");
      }

      if (
        /\b(phuong tien|di bang gi|xe|may bay|di chuyen)\b/.test(normalized)
      ) {
        return [
          `Theo dữ liệu hiện có về ${tourName}, thông tin phương tiện di chuyển như sau:`,
          "",
          this.extractSectionFromRagContent(content, [
            "Phương tiện di chuyển:",
            "Phương tiện:",
          ]),
        ].join("\n");
      }

      if (/\b(bao gom nhung gi|bao gom gi|chinh sach)\b/.test(normalized)) {
        return [
          `Theo dữ liệu hiện có về ${tourName}, thông tin chính sách/bao gồm như sau:`,
          "",
          this.extractSectionFromRagContent(content, [
            "Chính sách tour:",
            "Chính sách:",
          ]),
        ].join("\n");
      }

      return [
        `Theo dữ liệu hiện có về ${tourName}, mình tìm thấy thông tin liên quan trong hệ thống.`,
        "",
        content.slice(0, 1200),
      ].join("\n");
    }

    if (ctx.intent === "tour_search") {
      const normalizedUserMessage = this.stripText(ctx.userMessage);

      if (this.mentionsUnsupportedDestination(normalizedUserMessage)) {
        return "Hiện hệ thống Travela chưa có tour cho điểm đến này trong dữ liệu. Bạn có thể thử các tour trong nước như Đà Lạt, Nha Trang, Phú Quốc, Đà Nẵng, Sa Pa, Cần Thơ hoặc Hạ Long nha.";
      }

      const needProfile = this.buildNeedProfile(normalizedUserMessage);
      const wantsCoolWeather = needProfile.wantsCoolWeather;
      const wantsBeach = needProfile.wantsBeach;
      const wantsCoolBeach = wantsBeach && wantsCoolWeather;
      const wantsLightTrip = needProfile.wantsLightTrip;
      const wantsPhoto = needProfile.wantsPhoto;
      const wantsResort = needProfile.wantsResort;
      const wantsFamily = needProfile.wantsFamily;

      if (ctx.tours.length) {
        let searchLabel = "";

        const explicitDestination = this.detectDestination(
          normalizedUserMessage,
        );

        if (explicitDestination) {
          searchLabel = ` cho ${explicitDestination}`;
        }

        if (!searchLabel && wantsCoolBeach) {
          searchLabel = " theo nhu cầu biển, thời tiết dễ chịu và nghỉ dưỡng";
        } else if (!searchLabel && wantsBeach && wantsResort) {
          searchLabel = " theo nhu cầu đi biển và nghỉ dưỡng";
        } else if (!searchLabel && wantsResort) {
          searchLabel =
            " theo nhu cầu nghỉ dưỡng cao cấp, khách sạn/resort tốt";
        } else if (!searchLabel && wantsBeach) {
          searchLabel = " theo nhu cầu đi biển";
        } else if (!searchLabel && wantsCoolWeather) {
          searchLabel = " theo nhu cầu đi nơi mát mẻ";
        } else if (!searchLabel && wantsFamily) {
          searchLabel = " theo nhu cầu đi gia đình";
        } else if (!searchLabel && wantsLightTrip) {
          searchLabel = " theo nhu cầu đi nhẹ nhàng, không quá mệt";
        } else if (!searchLabel && wantsPhoto) {
          searchLabel = " theo nhu cầu cảnh đẹp để chụp hình";
        }

        const lines = ctx.tours.slice(0, 3).map((tour, index) => {
          return `${index + 1}. ${tour.name}: ${this.formatCurrency(
            tour.priceAdult,
          )}/người, ${tour.durationText}${
            tour.departureDate
              ? `, khởi hành ${this.formatDate(tour.departureDate)}`
              : ""
          } — ${tour.reason || "phù hợp để tham khảo"}`;
        });

        const monthAdviceIntro = ctx.memory.departureMonth
          ? `Nếu bạn đang cân nhắc đi trong tháng ${Number(
              String(ctx.memory.departureMonth).split("-")[1] || 0,
            )}, mình ưu tiên các tour đang có lịch khởi hành thật trong tháng này, sau đó xếp theo mức độ phù hợp với nhu cầu, giá, ưu đãi và mức quan tâm của khách.`
          : null;

        return [
          monthAdviceIntro,
          `Mình tìm thấy ${Math.min(
            ctx.tours.length,
            3,
          )} tour${searchLabel} phù hợp nhất:`,
          "",
          ...lines,
          "",
          ctx.memory.departureMonth
            ? "Nếu bạn nói thêm ngân sách, số ngày hoặc thích biển/nghỉ dưỡng/mát mẻ, mình sẽ lọc tiếp để chọn tour hợp nhất cho tháng này."
            : "Bạn có thể bấm “Xem tour” ở thẻ bên dưới để xem lịch khởi hành, điểm đón và đặt tour.",
        ]
          .filter(Boolean)
          .join("\n");
      }

      if (
        ctx.memory.hotelStars &&
        /\b(khach san|4 sao|5 sao|4 den 5 sao|cao cap|premium|resort)\b/.test(
          normalizedUserMessage,
        )
      ) {
        return `Mình chưa tìm thấy tour phù hợp với tiêu chuẩn khách sạn từ ${ctx.memory.hotelStars} sao trong dữ liệu hiện có. Bạn có thể giảm tiêu chí khách sạn hoặc cho mình thêm điểm đến/ngân sách để lọc lại chính xác hơn.`;
      }

      if (
        ctx.memory.durationDays &&
        ctx.memory.durationNights !== null &&
        ctx.memory.durationNights !== undefined
      ) {
        return `Hiện mình chưa tìm thấy tour đang mở bán đúng ${ctx.memory.durationDays} ngày ${ctx.memory.durationNights} đêm trong dữ liệu. Mình không lấy tour sai thời lượng để thay thế.`;
      }

      return "Mình chưa tìm thấy tour thật sự khớp trong dữ liệu hiện có. Bạn thử nói rõ hơn điểm đến, số ngày, ngân sách hoặc tháng khởi hành nhé. Ví dụ: “Đà Lạt 3 ngày dưới 6 triệu”.";
    }

    return "Mình có thể hỗ trợ bạn tìm tour, kiểm tra booking, voucher, điểm đón và chính sách. Bạn có thể hỏi tự nhiên như: “Tôi muốn đi Phú Quốc 3 ngày dưới 7 triệu” hoặc “Đơn của tôi thanh toán chưa?”.";
  }

  private buildSuggestedReplies(ctx: PromptContext): string[] {
    if (ctx.intent === "booking_create") {
      const bookingContext = ctx.memory.bookingContext;

      if (
        bookingContext?.state === "WAITING_DEPARTURE_SELECTION" &&
        Array.isArray(bookingContext.displayedDepartures) &&
        bookingContext.displayedDepartures.length
      ) {
        return bookingContext.displayedDepartures
          .slice(0, 5)
          .map((departure) => {
            const date = departure.departureDate
              ? this.formatDate(departure.departureDate)
              : "đang cập nhật";
            return `Chọn lịch số ${departure.index} - ${date} - còn ${Number(
              departure.availableSeats || 0,
            )} chỗ`;
          });
      }

      if (
        ctx.memory.bookingDraft?.started &&
        !ctx.memory.bookingDraft?.confirmed
      ) {
        return [
          "Xác nhận đặt",
          "Đổi thành 2 người lớn",
          "Không dùng voucher",
          "Dùng voucher tốt nhất",
        ];
      }

      return [
        "Kiểm tra booking của tôi",
        "Tôi muốn đổi số khách",
        "Tôi muốn chọn lịch khác",
      ];
    }

    if (ctx.intent === "refund_create") {
      const draft = ctx.memory.refundDraft || {};

      if (draft.started && !draft.confirmed) {
        return [
          "Xác nhận hoàn tiền",
          "Chính sách hoàn tiền",
          "Kiểm tra booking của tôi",
        ];
      }

      return ["Chính sách hoàn tiền", "Kiểm tra booking của tôi"];
    }

    if (ctx.intent === "voucher_check")
      return [
        "Gợi ý tour dùng được voucher",
        "Tour nào đang giá tốt?",
        "Kiểm tra booking của tôi",
      ];

    if (ctx.intent === "booking_status")
      return [
        "Điểm đón của đơn này?",
        "Tôi muốn thanh toán",
        "Chính sách hoàn tiền sao?",
      ];

    if (ctx.intent === "pickup_point")
      return [
        "Tôi ở Cần Thơ",
        "Có điểm đón gần tôi không?",
        "Gợi ý tour Phú Quốc",
      ];

    if (ctx.intent === "personal_recommendation")
      return ["Tour nào rẻ nhất?", "Có voucher không?", "So sánh 2 tour đầu"];

    if (ctx.intent === "tour_policy")
      return [
        "Tôi muốn đổi ngày",
        "Tôi muốn hoàn tiền",
        "Kiểm tra đơn của tôi",
      ];

    return [
      "Gợi ý tour cho tôi",
      "Tôi có voucher nào?",
      "Kiểm tra booking của tôi",
      "Điểm đón ở Cần Thơ",
    ];
  }

  private buildSummary(ctx: PromptContext) {
    return [
      `intent=${ctx.intent}`,
      ctx.memory.destination ? `destination=${ctx.memory.destination}` : null,
      ctx.memory.budgetMax ? `budget=${ctx.memory.budgetMax}` : null,
      ctx.memory.durationDays ? `days=${ctx.memory.durationDays}` : null,
      ctx.memory.durationNights !== null &&
      ctx.memory.durationNights !== undefined
        ? `nights=${ctx.memory.durationNights}`
        : null,
    ]
      .filter(Boolean)
      .join("; ");
  }

  private async trackAskAi(
    user: AuthUser,
    message: string,
    intent: string,
    memory: MemoryState,
  ) {
    if (!user?.userId) return;
    await this.prisma.userBehavior.create({
      data: {
        userId: user.userId,
        tourId:
          memory.lastTourId && /^\d+$/.test(memory.lastTourId)
            ? BigInt(memory.lastTourId)
            : null,
        action: "ask_ai",
        score: ACTION_SCORE.ask_ai,
        keyword: message.slice(0, 255),
        meta: { intent },
      } as any,
    });
  }

  private averageRating(reviews: any[]) {
    if (!reviews.length) return 0;
    return (
      reviews.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
      reviews.length
    );
  }

  private toTourCard(
    tour: any,
    departure: any,
    reasons: string[] = [],
  ): TourCard {
    const priceAdult = departure
      ? Number(departure.adultPrice)
      : Number(tour.basePriceAdult || 0);
    const coverMedia =
      tour.media?.find?.((item: any) => item?.isCover || item?.is_cover) ||
      tour.media?.[0] ||
      null;
    const imageUrl =
      coverMedia?.fileUrl ||
      coverMedia?.file_url ||
      coverMedia?.url ||
      tour.imageUrl ||
      tour.thumbnailUrl ||
      tour.destination?.coverImage ||
      tour.destination?.cover_image ||
      null;
    const tags = [
      tour.destination?.name,
      `${tour.durationDays}N${tour.durationNights}Đ`,
      tour.tourTheme,
      tour.isBestDeal ? "Giá tốt" : null,
      tour.isTrending ? "Bán chạy" : null,
    ].filter(Boolean);

    return {
      type: "tour",
      tourId: String(tour.id),
      slug: tour.slug,
      name: tour.name,
      destination: tour.destination?.name || "Điểm đến",
      priceAdult,
      durationText: `${tour.durationDays} ngày ${tour.durationNights} đêm`,
      departureId: departure?.id ? String(departure.id) : null,
      departureDate: departure?.departureDate
        ? new Date(departure.departureDate).toISOString()
        : null,
      imageUrl,
      shortDescription: tour.shortDescription || null,
      reason: reasons.length ? reasons.join(", ") : "phù hợp để bạn tham khảo",
      tags,
    };
  }

  private toVoucherCard(voucher: any, status = "available"): VoucherCard {
    const discountType = voucher.discountType || voucher.discount_type;
    const value = Number(voucher.discountValue || voucher.discount_value || 0);
    const max = Number(voucher.maxDiscount || voucher.max_discount || 0);
    const discountText =
      discountType === "fixed"
        ? `Giảm ${this.formatCurrency(value)}`
        : `Giảm ${value}%${max ? ` tối đa ${this.formatCurrency(max)}` : ""}`;
    return {
      code: voucher.code,
      name: voucher.name,
      description: voucher.description || null,
      discountText,
      minOrderAmount: Number(
        voucher.minOrderAmount || voucher.min_order_amount || 0,
      ),
      endDate: voucher.endDate ? new Date(voucher.endDate).toISOString() : null,
      status,
    };
  }

  private toBookingCard(booking: any): BookingCard {
    const payment = booking.payments?.[0] || null;
    return {
      id: String(booking.id),
      bookingId: String(booking.id),
      bookingCode: booking.bookingCode,
      status: booking.bookingStatus,
      paymentStatus: payment?.paymentStatus || null,
      tourName: booking.tour?.name || "Tour Travela",
      destination: booking.tour?.destination?.name || null,
      departureDate: booking.departure?.departureDate
        ? new Date(booking.departure.departureDate).toISOString()
        : null,
      endDate: booking.departure?.endDate
        ? new Date(booking.departure.endDate).toISOString()
        : null,
      amount: Number(booking.finalAmount || 0),
      pickupName: booking.pickupName || booking.pickupPoint?.name || null,
      pickupAddress:
        booking.pickupAddress || booking.pickupPoint?.address || null,
      pickupTime: booking.pickupTime
        ? new Date(booking.pickupTime).toISOString()
        : null,
    };
  }

  private async findExistingBookingForChatbot(
    userId: bigint | null,
    departureId: bigint,
  ) {
    if (!userId) return null;

    const rows = await this.prisma.booking.findMany({
      where: { userId, departureId },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        tour: true,
        departure: true,
        pickupPoint: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const activeBookings = rows.filter((booking: any) => {
      const status = String(booking.bookingStatus || "").toLowerCase();
      return ![
        "cancelled",
        "canceled",
        "expired",
        "refunded",
        "completed",
        "failed",
      ].includes(status);
    });

    return activeBookings[0] || null;
  }

  private sanitizeSepayTransferContent(value: string) {
    const raw = String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toUpperCase();

    return raw.replace(/[^A-Z0-9]/g, "").slice(0, 80);
  }

  private buildSepayQrCodeUrl(amount: number, transferContent: string) {
    const accountNo =
      this.configService.get<string>("SEPAY_ACCOUNT_NO") ||
      process.env.SEPAY_ACCOUNT_NO ||
      "";
    const bankCode =
      this.configService.get<string>("SEPAY_BANK_CODE") ||
      process.env.SEPAY_BANK_CODE ||
      "";

    const safeAccountNo = String(accountNo || "").trim();
    const safeBankCode = String(bankCode || "").trim();
    const safeAmount = Math.max(0, Math.round(Number(amount || 0)));
    const safeContent = this.sanitizeSepayTransferContent(transferContent);

    if (!safeAccountNo || !safeBankCode || !safeContent) return "";

    const params = new URLSearchParams({
      acc: safeAccountNo,
      bank: safeBankCode,
      amount: String(safeAmount),
      des: safeContent,
      template: "compact",
    });

    return `https://qr.sepay.vn/img?${params.toString()}`;
  }

  private getSepayBankInfo() {
    return {
      bankCode:
        this.configService.get<string>("SEPAY_BANK_CODE") ||
        process.env.SEPAY_BANK_CODE ||
        null,
      accountNo:
        this.configService.get<string>("SEPAY_ACCOUNT_NO") ||
        process.env.SEPAY_ACCOUNT_NO ||
        null,
      accountName:
        this.configService.get<string>("SEPAY_ACCOUNT_NAME") ||
        process.env.SEPAY_ACCOUNT_NAME ||
        null,
    };
  }

  private buildCheckoutFromExistingBooking(
    booking: any,
  ): BookingCheckoutCard | null {
    const payment = booking.payments?.[0] || null;
    if (!payment) return null;

    const paymentStatus = String(payment.paymentStatus || "").toLowerCase();
    if (["paid", "success", "completed"].includes(paymentStatus)) return null;

    const paymentUrl = String(payment.paymentUrl || "");
    const transactionCode = String(
      payment.transactionCode || payment.internalTransactionCode || "",
    );
    if (!paymentUrl && !transactionCode) return null;

    const rawMobilePaymentUrl =
      paymentUrl || `/mobile-payment/${encodeURIComponent(transactionCode)}`;
    const mobilePaymentUrl = this.buildPublicFrontendUrl(rawMobilePaymentUrl);
    const checkoutAmount = Number(payment.amount || booking.finalAmount || 0);
    const bankInfo = this.getSepayBankInfo();
    const sepayQrCodeUrl = this.buildSepayQrCodeUrl(
      checkoutAmount,
      transactionCode,
    );
    const fallbackQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
      mobilePaymentUrl,
    )}`;
    const qrCodeUrl = sepayQrCodeUrl || fallbackQrCodeUrl;

    return {
      type: "booking_checkout",
      bookingId: String(booking.id),
      bookingCode: String(booking.bookingCode),
      amount: checkoutAmount,
      finalAmount: checkoutAmount,
      holdExpiresAt: booking.holdExpiresAt
        ? new Date(booking.holdExpiresAt).toISOString()
        : null,
      paymentUrl: mobilePaymentUrl,
      mobilePaymentUrl,
      qrCodeUrl,
      transactionCode,
      paymentMethod: String(payment.paymentMethod || "bank_transfer"),
      paymentStatus: paymentStatus || "pending",
      tourName: booking.tour?.name ? String(booking.tour.name) : null,
      departureDate: booking.departure?.departureDate
        ? new Date(booking.departure.departureDate).toISOString()
        : null,
      endDate: booking.departure?.endDate
        ? new Date(booking.departure.endDate).toISOString()
        : null,
      pickupName: booking.pickupPoint?.name
        ? String(booking.pickupPoint.name)
        : null,
      pickupAddress: booking.pickupPoint?.address
        ? String(booking.pickupPoint.address)
        : null,
      pickupTime: booking.pickupPoint?.pickupTime
        ? new Date(booking.pickupPoint.pickupTime).toISOString()
        : null,
      bankCode: bankInfo.bankCode,
      accountNo: bankInfo.accountNo,
      accountName: bankInfo.accountName,
      transferContent: this.sanitizeSepayTransferContent(transactionCode),
      qrProvider: sepayQrCodeUrl ? "sepay" : "internal",
    };
  }

  private buildPublicFrontendUrl(pathOrUrl: string) {
    const raw = String(pathOrUrl || "").trim();
    if (!raw) return "";

    if (/^https?:\/\//i.test(raw)) {
      if (!raw.includes("localhost") && !raw.includes("127.0.0.1")) {
        return raw;
      }

      const publicBase =
        this.configService.get<string>("FRONTEND_PUBLIC_URL") ||
        this.configService.get<string>("FRONTEND_URL") ||
        process.env.FRONTEND_PUBLIC_URL ||
        process.env.FRONTEND_URL ||
        "";

      if (!publicBase) return raw;
      const url = new URL(raw);
      return `${publicBase.replace(/\/$/, "")}${url.pathname}${url.search}`;
    }

    const publicBase =
      this.configService.get<string>("FRONTEND_PUBLIC_URL") ||
      this.configService.get<string>("FRONTEND_URL") ||
      process.env.FRONTEND_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3000";

    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return `${publicBase.replace(/\/$/, "")}${path}`;
  }

  private getAvailableSlots(departure: any) {
    return (
      Number(departure?.totalSlots || 0) -
      Number(departure?.bookedSlots || 0) -
      Number(departure?.heldSlots || 0)
    );
  }

  private getMaxTourResults() {
    const value = Number(
      this.configService.get<string>("CHATBOT_MAX_TOUR_RESULTS") || 3,
    );
    const parsed = Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
    return Math.min(parsed, 3);
  }

  private getMaxDeparturesPerTour() {
    const value = Number(
      this.configService.get<string>("CHATBOT_MAX_DEPARTURES_PER_TOUR") || 3,
    );
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3;
  }

  private isDepartureBookable(departure: any) {
    if (!departure) return false;

    const status = String(departure.status || "").toLowerCase();
    if (status !== "open") return false;

    const now = new Date();

    const departureDate = new Date(departure.departureDate);
    if (Number.isNaN(departureDate.getTime())) return false;
    if (departureDate.getTime() <= now.getTime()) return false;

    const bookingDeadlineValue =
      departure.bookingDeadline ||
      departure.bookingDeadlineAt ||
      departure.bookingEndAt ||
      departure.closeBookingAt ||
      null;

    if (bookingDeadlineValue) {
      const bookingDeadline = new Date(bookingDeadlineValue);
      if (
        !Number.isNaN(bookingDeadline.getTime()) &&
        bookingDeadline.getTime() <= now.getTime()
      ) {
        return false;
      }
    }

    return this.getAvailableSlots(departure) > 0;
  }

  private rangesOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
    return (
      startA.getTime() <= endB.getTime() && endA.getTime() >= startB.getTime()
    );
  }

  private async findActiveBookingDateRanges(userId: bigint | null) {
    if (!userId) return [];

    const rows = await this.prisma.booking.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        bookingCode: true,
        bookingStatus: true,
        departureId: true,
        departure: {
          select: {
            id: true,
            departureDate: true,
            endDate: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return rows
      .filter((booking: any) => {
        const status = String(booking.bookingStatus || "").toLowerCase();

        // Chỉ các booking còn hiệu lực mới chặn lịch khác.
        return ![
          "cancelled",
          "canceled",
          "cancelled_by_operator",
          "canceled_by_operator",
          "expired",
          "refunded",
          "completed",
          "failed",
          "rejected",
        ].includes(status);
      })
      .map((booking: any) => {
        const start = booking.departure?.departureDate
          ? new Date(booking.departure.departureDate)
          : null;
        const end = booking.departure?.endDate
          ? new Date(booking.departure.endDate)
          : start;

        return {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          departureId: booking.departureId,
          start,
          end,
        };
      })
      .filter(
        (item: any) =>
          item.start &&
          item.end &&
          !Number.isNaN(item.start.getTime()) &&
          !Number.isNaN(item.end.getTime()),
      );
  }

  private async filterDeparturesAgainstUserBookings(
    departures: any[],
    userId: bigint | null,
  ) {
    if (!userId || !departures.length) return departures;

    const occupiedRanges = await this.findActiveBookingDateRanges(userId);
    if (!occupiedRanges.length) return departures;

    return departures.filter((departure: any) => {
      const start = departure?.departureDate
        ? new Date(departure.departureDate)
        : null;
      const end = departure?.endDate ? new Date(departure.endDate) : start;

      if (
        !start ||
        !end ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        return false;
      }

      return !occupiedRanges.some((booking: any) => {
        // Chính departure đã có booking cũng phải loại.
        if (
          booking.departureId &&
          String(booking.departureId) === String(departure.id)
        ) {
          return true;
        }

        return this.rangesOverlap(start, end, booking.start, booking.end);
      });
    });
  }

  private async findBookableDepartureOptions(
    tourId: bigint,
    userId: bigint | null = null,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await this.prisma.tourDeparture.findMany({
      where: {
        tourId,
        status: { in: ["open", "full"] as any },
        departureDate: { gte: today },
      },
      orderBy: { departureDate: "asc" },
      take: 20,
    });

    const bookable = rows.filter((item: any) => this.isDepartureBookable(item));

    // Khi đang đặt tour qua chatbot, loại luôn những lịch giao nhau
    // với booking còn hiệu lực của chính khách hàng.
    return this.filterDeparturesAgainstUserBookings(bookable, userId);
  }

  private toDepartureMemoryOption(
    tourId: bigint,
    departure: any,
    index: number,
  ) {
    return {
      tourId: String(tourId),
      departureId: String(departure.id),
      index: index + 1,
      startDate: departure.departureDate
        ? new Date(departure.departureDate).toISOString()
        : null,
      endDate: departure.endDate
        ? new Date(departure.endDate).toISOString()
        : null,
      adultPrice: Number(departure.adultPrice || 0),
      availableSlots: this.getAvailableSlots(departure),
      status: String(departure.status || ""),
    };
  }

  private async findPickupOptionsForBooking(
    tourId: bigint,
    departureId: bigint,
  ) {
    const db = this.prisma as any;
    if (!db.tourPickupPoint) return [];

    return db.tourPickupPoint.findMany({
      where: {
        tourId,
        status: "active",
        OR: [{ departureId }, { departureId: null }],
      },
      orderBy: [{ departureId: "desc" }, { pickupTime: "asc" }],
      take: 6,
    });
  }

  private formatTimeForChat(value: Date | string | null) {
    if (!value) return "liên hệ";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "liên hệ";

    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  }

  private formatDate(value: string | null) {
    if (!value) return "đang cập nhật";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "đang cập nhật";

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  private async checkRefundEligibilityForChatbot(
    bookingCode: string,
    userId: bigint,
  ): Promise<{
    eligible: boolean;
    reason: string;
    code:
      | "ELIGIBLE"
      | "NOT_FOUND"
      | "WRONG_ACCOUNT"
      | "UNPAID"
      | "EXISTING_REFUND"
      | "NOT_ELIGIBLE";
    booking?: any;
    preview?: any;
  }> {
    const normalizedBookingCode = String(bookingCode || "")
      .trim()
      .toUpperCase();

    /*
     * Bước 1: tìm booking chỉ theo bookingCode để phân biệt:
     * - mã không tồn tại;
     * - booking tồn tại nhưng không thuộc tài khoản hiện tại;
     * - booking đúng tài khoản nhưng chưa thanh toán.
     *
     * Không đưa userId/paymentStatus vào cùng một where ngay từ đầu,
     * vì như vậy nhiều trường hợp khác nhau đều bị biến thành "không tìm thấy".
     */
    const booking = await this.prisma.booking.findUnique({
      where: {
        bookingCode: normalizedBookingCode,
      },
      include: {
        departure: true,
        payments: {
          orderBy: { createdAt: "desc" },
        },
        refundRequests: {
          where: {
            status: { in: ["pending", "approved"] as any },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      } as any,
    });

    if (!booking) {
      return {
        eligible: false,
        code: "NOT_FOUND",
        reason:
          "Mã booking này không tồn tại trong hệ thống. Bạn kiểm tra lại mã booking rồi thử lại.",
      };
    }

    if (!booking.userId || String(booking.userId) !== String(userId)) {
      return {
        eligible: false,
        code: "WRONG_ACCOUNT",
        reason:
          "Booking này không thuộc tài khoản đang đăng nhập. Bạn cần đăng nhập đúng tài khoản đã tạo booking.",
      };
    }

    const bookingStatus = String(
      (booking as any).bookingStatus || "",
    ).toLowerCase();

    const payments = Array.isArray((booking as any).payments)
      ? (booking as any).payments
      : [];

    const hasPaidSignal = payments.some((payment: any) =>
      ["paid", "waiting_confirmation"].includes(
        String(payment?.paymentStatus || "").toLowerCase(),
      ),
    );

    /*
     * pending_payment/draft + chưa có tín hiệu thanh toán:
     * booking có thật, nhưng KHÔNG có tiền để hoàn.
     *
     * Đây chính là trường hợp trước đây chatbot báo sai thành
     * "Không tìm thấy booking trong tài khoản".
     */
    if (
      ["draft", "pending_payment"].includes(bookingStatus) &&
      !hasPaidSignal
    ) {
      return {
        eligible: false,
        code: "UNPAID",
        booking,
        reason:
          "Booking này có tồn tại nhưng chưa thanh toán nên không phát sinh khoản tiền để hoàn. Nếu bạn không tiếp tục đặt tour, hãy hủy booking chưa thanh toán thay vì tạo yêu cầu hoàn tiền.",
      };
    }

    const existingRefund = (booking as any).refundRequests?.[0];
    if (existingRefund) {
      return {
        eligible: false,
        code: "EXISTING_REFUND",
        booking,
        reason:
          "Booking này đã có yêu cầu hoàn tiền đang chờ xử lý hoặc đã được duyệt.",
      };
    }

    /*
     * Bước 2: dùng RefundsService.preview() làm nguồn nghiệp vụ duy nhất.
     * Chatbot không tự lặp lại công thức/ngưỡng hoàn tiền nữa.
     * Nhờ vậy chính sách chatbot luôn khớp API refund thật:
     * cuối tuần/ngày lễ, 24h sau thanh toán, mốc 7 ngày, 3 ngày...
     */
    try {
      const preview = await this.refundsService.preview(
        userId,
        (booking as any).id,
      );

      if (!preview?.eligible) {
        return {
          eligible: false,
          code: "NOT_ELIGIBLE",
          booking,
          preview,
          reason:
            String(preview?.message || "").trim() ||
            "Booking hiện chưa đủ điều kiện gửi yêu cầu hoàn tiền.",
        };
      }

      return {
        eligible: true,
        code: "ELIGIBLE",
        booking,
        preview,
        reason:
          String(preview?.message || "").trim() ||
          "Booking đủ điều kiện gửi yêu cầu hoàn tiền. Yêu cầu vẫn cần admin duyệt.",
      };
    } catch (error: any) {
      const friendlyReason = String(
        error?.response?.message ||
          error?.message ||
          "Booking hiện chưa đủ điều kiện gửi yêu cầu hoàn tiền.",
      );

      return {
        eligible: false,
        code: "NOT_ELIGIBLE",
        booking,
        reason: friendlyReason,
      };
    }
  }

  private async generatePolicyAnswer(
    ctx: PromptContext,
    user: AuthUser,
  ): Promise<string> {
    const normalized = this.stripText(ctx.userMessage);
    const bookingCode = this.extractBookingCode(ctx.userMessage);

    if (
      bookingCode &&
      user?.userId &&
      /\b(hoan tien|hoan|duoc hoan|refund|huy|huy tour|huy don|cancel|lay lai tien|lay lai duoc|tra tien|du dieu kien|dieu kien|co duoc hoan khong|co lay lai duoc khong)\b/.test(
        normalized,
      )
    ) {
      const result = await this.checkRefundEligibilityForChatbot(
        bookingCode,
        user.userId,
      );

      if (result.code === "UNPAID") {
        return [
          `Mình đã kiểm tra booking ${bookingCode}.`,
          "",
          "Booking này có tồn tại nhưng chưa thanh toán.",
          "Vì chưa phát sinh giao dịch thanh toán thành công nên không có khoản tiền để hoàn.",
          "Nếu bạn không tiếp tục, hãy hủy booking chưa thanh toán thay vì gửi yêu cầu hoàn tiền.",
        ].join("\n");
      }

      return [
        `Mình đã kiểm tra booking ${bookingCode}.`,
        "",
        result.eligible
          ? `✅ Booking này có thể gửi yêu cầu hoàn tiền.`
          : `❌ Booking này chưa đủ điều kiện hoàn tiền.`,
        `Lý do: ${result.reason}`,
        "",
        "Lưu ý: yêu cầu hoàn tiền vẫn cần admin kiểm tra và duyệt trước khi cập nhật trạng thái.",
      ].join("\n");
    }

    if (bookingCode && !user?.userId) {
      return [
        `Mình thấy bạn đang hỏi về booking ${bookingCode}.`,
        "Bạn cần đăng nhập đúng tài khoản đã đặt tour để mình kiểm tra điều kiện hoàn tiền cụ thể.",
        "",
        "Chính sách chung: Travela hỗ trợ gửi yêu cầu hoàn tiền trong vòng 48 giờ sau khi đặt tour và phải còn ít nhất 3 ngày trước ngày khởi hành.",
      ].join("\n");
    }

    if (
      /\b(hoan tien|refund|huy|huy tour|huy don|cancel|lay lai tien|tra tien)\b/.test(
        normalized,
      )
    ) {
      return [
        "Chính sách hoàn tiền của Travela hiện áp dụng như sau:",
        "",
        "- Khách có thể gửi yêu cầu hoàn tiền trong vòng 48 giờ sau khi đặt tour.",
        "- Chỉ áp dụng khi còn ít nhất 3 ngày trước ngày khởi hành.",
        "- Booking cần ở trạng thái đã thanh toán hoặc đã xác nhận.",
        "- Booking đã hủy, đã hoàn thành, đã hoàn tiền hoặc chưa thanh toán sẽ không đủ điều kiện.",
        "- Yêu cầu hoàn tiền cần admin kiểm tra và duyệt trước khi cập nhật trạng thái.",
        "",
        "Nếu bạn đã đặt tour rồi, hãy gửi mã booking dạng BK... để mình kiểm tra cụ thể.",
      ].join("\n");
    }

    if (ctx.faqs.length) {
      return `Mình tóm tắt theo chính sách Travela: ${ctx.faqs[0].answer}`;
    }

    return "Bạn muốn hỏi về chính sách hủy, đổi lịch, đổi điểm đón hay hoàn tiền? Bạn nói rõ tình huống hoặc gửi mã booking dạng BK... để mình kiểm tra chính xác hơn.";
  }

  private shouldLoadVouchers(
    userMessage: string,
    intent: string,
    memory: MemoryState,
  ) {
    const normalized = this.stripText(userMessage);

    return (
      ["voucher_check", "booking_create", "booking_change"].includes(intent) ||
      Boolean(memory.bookingDraft?.started) ||
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon|ma uu dai)\b/.test(
        normalized,
      )
    );
  }

  private shouldLoadToursForIntent(intent: string, userMessage = "") {
    const normalized = this.stripText(userMessage);
    const hasConcreteTourText =
      /\btour\b/.test(normalized) &&
      !this.isNumberedTourReference(userMessage) &&
      !/\b(tour nay|tour do|tour dau tien|tour tren)\b/.test(normalized);

    if (["pickup_point", "tour_policy"].includes(intent)) return true;

    // Nếu câu follow-up có nhắc tên tour cụ thể thì vẫn load tour để lấy đúng DB.
    // Nếu chỉ nói "tour này/tour đó" thì dùng memory + direct DB lookup.
    if (intent === "follow_up" && this.isTourDetailQuestion(userMessage)) {
      return hasConcreteTourText;
    }

    return [
      "tour_search",
      "tour_compare",
      "personal_recommendation",
      "booking_create",
      "booking_change",
    ].includes(intent);
  }

  private extractVoucherCodeFromMessage(message: string) {
    const raw = String(message || "").trim();
    const normalized = this.stripText(raw);

    // Các câu bỏ qua voucher không được hiểu nhầm thành mã voucher = "VOUCHER".
    if (
      /\b(khong dung voucher|khong co voucher|bo qua voucher|khong ap voucher|khong dung ma|khong co ma|bo qua ma|khong dung khuyen mai)\b/.test(
        normalized,
      )
    ) {
      return "";
    }

    const upper = raw.toUpperCase();

    // Bắt đúng các dạng: "voucher BRONZE3X", "dùng voucher BRONZE3X", "mã BRONZE3X".
    // Không dùng pattern chung "DUNG <code>" vì sẽ làm "không dùng voucher" thành code VOUCHER.
    const match = upper.match(
      /(?:VOUCHER|MÃ|MA|DÙNG\s+VOUCHER|DUNG\s+VOUCHER|ÁP\s+VOUCHER|AP\s+VOUCHER)\s*[:\-]?\s*([A-Z0-9_\-]{4,30})/,
    );

    const code = match?.[1] || "";
    if (["VOUCHER", "MA", "MÃ", "DUNG", "DÙNG", "AP", "ÁP"].includes(code)) {
      return "";
    }

    return code;
  }

  private pickTopReasons(reasons: string[]) {
    const priority = [
      "phù hợp nhóm gia đình",
      "phù hợp nhu cầu đi biển/biển đảo",
      "khách sạn/resort phù hợp nhu cầu nghỉ dưỡng",
      "phù hợp nhu cầu đi biển và nghỉ dưỡng dễ chịu",
      "lịch trình phù hợp nhu cầu đi nhẹ nhàng",
      "có nhiều cảnh đẹp phù hợp chụp hình",
      "đúng điểm đến bạn đang quan tâm",
      "giá nằm trong ngân sách bạn nhắc tới",
    ];

    const unique = Array.from(new Set(reasons));

    return unique
      .sort((a, b) => {
        const ai = priority.indexOf(a);
        const bi = priority.indexOf(b);

        const ap = ai >= 0 ? ai : 999;
        const bp = bi >= 0 ? bi : 999;

        return ap - bp;
      })
      .slice(0, 3);
  }
}
