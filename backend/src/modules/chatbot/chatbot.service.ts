import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI } from "@google/genai";
import { PrismaService } from "../../prisma/prisma.service";
import { ChatMessageDto } from "./dto/chat-message.dto";
import { BookingsService } from "../bookings/bookings.service";
import { PaymentsService } from "../payments/payments.service";
import { RagService } from "./rag.service";
import type { RagHit } from "./rag.service";
import { ChatbotNluService } from "./chatbot-nlu.service";
import type { NluResult, NluEntities } from "./chatbot-nlu.service";
import { ChatbotConfidenceService } from "./chatbot-confidence.service";
import type { AnswerConfidence } from "./chatbot-confidence.service";

type AuthUser = {
  userId?: bigint;
  fullName?: string;
  email?: string;
  role?: "admin" | "user" | string;
} | null;

type MemoryState = {
  destination?: string | null;
  budgetMax?: number | null;
  durationDays?: number | null;
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
  bookingDraft?: ChatBookingDraft | null;
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
  paymentMethod?: "momo" | "vnpay" | "card" | "bank_transfer" | "cash" | null;
  started?: boolean;
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
  "Phú Quốc": ["phu quoc", "phú quốc", "dao ngoc", "đảo ngọc"],
  "Nha Trang": ["nha trang"],
  "Đà Lạt": ["da lat", "đà lạt", "dalat", "san may", "săn mây"],
  "Đà Nẵng": ["da nang", "đà nẵng", "danang"],
  "Hội An": ["hoi an", "hội an", "pho co", "phố cổ"],
  "Sa Pa": ["sa pa", "sapa"],
  "Quy Nhơn": ["quy nhon", "quy nhơn"],
  "Hạ Long": ["ha long", "hạ long", "vinh ha long", "vịnh hạ long"],
  "Cần Thơ": [
    "can tho",
    "cần thơ",
    "mien tay",
    "miền tây",
    "cho noi",
    "chợ nổi",
  ],
  Huế: ["hue", "huế", "co do", "cố đô"],
  "Ninh Bình": ["ninh binh", "ninh bình", "trang an", "tràng an"],
  "An Giang": ["an giang", "châu đốc", "chau doc"],
};

@Injectable()
export class ChatbotService {
  private readonly gemini: GoogleGenAI | null;
  private readonly geminiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly ragService: RagService,
    private readonly nluService: ChatbotNluService,
    private readonly confidenceService: ChatbotConfidenceService,
  ) {
    const apiKey = this.configService.get<string>("GEMINI_API_KEY");
    this.geminiModel =
      this.configService.get<string>("GEMINI_MODEL") || "gemini-2.5-flash";

    this.gemini = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async message(dto: ChatMessageDto, user: AuthUser) {
    const userMessage = String(dto.message || "").trim();
    const conversation = await this.getOrCreateConversation(
      dto.conversationId,
      user,
      userMessage,
    );

    const recentMessages = await this.prisma.chatMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 12,
    });

    const currentMemory = this.toMemoryState(conversation.memoryJson);
    const ruleMemory = this.extractMemory(userMessage, currentMemory);
    const preliminaryMemory = this.mergeMemory(currentMemory, ruleMemory);
    const recentForNlu = recentMessages.map((item: any) => ({
      role: item.role,
      content: item.content,
    }));

    const fallbackIntent = this.detectIntent(
      userMessage,
      preliminaryMemory,
      recentForNlu,
    );

    const nlu = await this.nluService.analyze({
      message: userMessage,
      memory: preliminaryMemory,
      recentMessages: recentForNlu,
      fallbackIntent: fallbackIntent as any,
      fallbackEntities: this.memoryToNluEntities(ruleMemory),
    });

    const mergedMemory = this.mergeMemory(
      preliminaryMemory,
      this.memoryFromNluEntities(nlu.entities, preliminaryMemory),
    );

    let intent = nlu.intent || fallbackIntent;
    const normalizedForIntentGuard = this.stripText(userMessage);

    // Guard quan trọng cho luồng đặt tour:
    // Nếu rule-based đã nhận đây là bước tiếp theo của booking thì KHÔNG để Gemini NLU
    // bẻ sang voucher_check/pickup_point/general_consulting. Nếu không, câu như
    // “chọn điểm đón mã 40, không dùng voucher, thanh toán momo” sẽ chỉ bị trả lời tư vấn,
    // memory bookingDraft không được lưu, và câu sau “1 người lớn” sẽ hỏi lặp lại điểm đón.
    if (fallbackIntent === "booking_create") {
      intent = "booking_create";
      (nlu as any).intent = intent;
    }

    // Guard: Gemini NLU đôi lúc nhận nhầm câu tìm tour mới thành follow_up
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

    // Guard: câu hỏi voucher có % giảm cụ thể phải đi vào voucher_check,
    // không để NLU chuyển thành tư vấn chung rồi liệt kê voucher thường.
    if (
      fallbackIntent === "voucher_check" &&
      /\b(voucher|ma giam gia|giam gia|khuyen mai|uu dai|coupon)\b/.test(
        normalizedForIntentGuard,
      )
    ) {
      intent = "voucher_check";
      (nlu as any).intent = intent;
    }

    // Guard: câu so sánh/"nên chọn A hay B" phải ưu tiên tour_compare.
    if (
      fallbackIntent === "tour_compare" &&
      ["tour_search", "general_consulting", "follow_up", "small_talk"].includes(
        String(intent),
      )
    ) {
      intent = "tour_compare";
      (nlu as any).intent = intent;
    }

    mergedMemory.intent = intent;

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
    if (
      promptContext.tours[0] &&
      !["booking_create", "booking_change"].includes(intent)
    ) {
      mergedMemory.lastTourId = promptContext.tours[0].tourId;
      mergedMemory.lastTourName = promptContext.tours[0].name;
      mergedMemory.lastTourOptions = promptContext.tours
        .slice(0, 5)
        .map((tour) => ({
          tourId: tour.tourId,
          departureId: tour.departureId,
          name: tour.name,
        }));
    }

    let bookingFlow: {
      answer: string;
      memory?: Partial<MemoryState>;
      bookingCheckout?: BookingCheckoutCard;
    } | null = null;

    // Các câu cần chặn/tra cứu nghiệp vụ phải chạy trước booking flow.
    // Nếu không, câu như "Tôi muốn đặt tour chưa có trong hệ thống" có thể bị kéo memory cũ
    // rồi nhảy sang hỏi điểm đón của tour cũ.
    const earlyDirectBusinessAnswer = await this.tryEarlyBusinessAnswer(
      promptContext,
      intent,
      user,
    );

    if (earlyDirectBusinessAnswer) {
      mergedMemory.bookingDraft = null;
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
    } else {
      mergedMemory.bookingDraft = null;
    }

    if (bookingFlow?.memory) {
      Object.assign(mergedMemory, bookingFlow.memory);
      promptContext.memory = mergedMemory;
    }
    if (bookingFlow?.bookingCheckout) {
      promptContext.bookingCheckout = bookingFlow.bookingCheckout;
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
    const directResolvedTour = await this.findTourForDirectAnswer(
      promptContext,
    ).catch(() => null);
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
    // Nếu để directBusinessAnswer/Gemini chen vào, bot sẽ nói kiểu “để mình kiểm tra...”
    // hoặc quay lại liệt kê điểm đón dù user đã chọn đủ thông tin.
    if (bookingFlow?.answer) {
      answer = bookingFlow.answer;
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
      answer = await this.generateGeminiAnswer(promptContext);
    }
    const suggestedReplies = this.buildSuggestedReplies(promptContext);

    // Khi state-machine booking đang trả lời, không gửi kèm voucher/booking cũ
    // không liên quan về frontend. Nếu không, sau câu “1 người lớn” giao diện có
    // thể hiện hàng loạt voucher + booking đã thanh toán làm người dùng tưởng bot
    // đang xử lý nhầm đơn cũ.
    const isBookingStateAnswer = Boolean(bookingFlow?.answer);
    const responseTours = isBookingStateAnswer ? [] : promptContext.tours;
    const responseVouchers =
      intent === "voucher_check" && !isBookingStateAnswer
        ? promptContext.vouchers
        : [];
    const responseBookings =
      intent === "booking_status" && !isBookingStateAnswer
        ? promptContext.bookings
        : [];
    const responsePickupPoints = isBookingStateAnswer
      ? []
      : promptContext.pickupPoints;

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
      cards: responseTours,
      tours: responseTours,
      vouchers: responseVouchers,
      bookings: responseBookings,
      pickupPoints: responsePickupPoints,
      bookingCheckout: promptContext.bookingCheckout,
      suggestedReplies,
    };
  }

  private async getOrCreateConversation(
    conversationId: string | undefined,
    user: AuthUser,
    firstMessage: string,
  ) {
    if (conversationId) {
      if (!/^\d+$/.test(conversationId)) {
        throw new NotFoundException("Mã hội thoại không hợp lệ.");
      }
      const conversation = await this.prisma.chatConversation.findUnique({
        where: { id: BigInt(conversationId) },
      });
      if (!conversation)
        throw new NotFoundException("Không tìm thấy hội thoại chat.");
      return conversation;
    }

    return this.prisma.chatConversation.create({
      data: {
        userId: user?.userId ?? null,
        title: this.buildConversationTitle(firstMessage),
        summary: null,
        lastIntent: null,
        memoryJson: {},
      },
    });
  }

  private buildConversationTitle(message: string) {
    return message.trim().slice(0, 80) || "Tư vấn tour mới";
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
      bookingDraft:
        source.bookingDraft && typeof source.bookingDraft === "object"
          ? (source.bookingDraft as ChatBookingDraft)
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

  private extractMemory(message: string, current: MemoryState): MemoryState {
    const normalized = this.stripText(message);

    const parsedDestination = this.detectDestination(normalized);
    const isUnsupportedDestination =
      this.mentionsUnsupportedDestination(normalized);

    const mentionsHotel =
      /\b(khach san|sao|resort|cao cap|premium|luu tru|tien nghi)\b/.test(
        normalized,
      );

    return {
      destination: isUnsupportedDestination
        ? null
        : (parsedDestination ?? current.destination ?? null),
      budgetMax: this.parseBudget(normalized) ?? null,
      durationDays: this.parseDurationDays(normalized) ?? null,
      departureMonth: this.parseDepartureMonth(normalized) ?? null,
      partySize: this.parsePartySize(normalized) ?? null,
      hotelStars: mentionsHotel ? this.parseHotelStars(normalized) : null,
      tourType: this.detectTourType(normalized) ?? null,
      softNeeds: this.detectSoftNeeds(normalized),
      avoidNeeds: this.detectAvoidNeeds(normalized),
      bookingDraft: this.extractBookingDraft(message, current),
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

    if (entities.paymentMethod || entities.voucherCode) {
      next.bookingDraft = {
        ...(current.bookingDraft || {}),
        ...(entities.paymentMethod
          ? { paymentMethod: entities.paymentMethod }
          : {}),
        ...(entities.voucherCode ? { voucherCode: entities.voucherCode } : {}),
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

  private extractBookingDraft(
    message: string,
    current: MemoryState,
  ): ChatBookingDraft | null {
    const normalized = this.stripText(message);
    const bookingFollowUpSignal =
      /\b(momo|vnpay|vn pay|chuyen khoan|bank|tien mat|cash|chon|diem don|pickup|voucher|khong dung|khong co voucher|bo qua|tiep tuc|xac nhan|dong y|ok|oke|\d+\s*(nguoi|khach|nguoi lon|tre em))\b/.test(
        normalized,
      );

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

    const adultMatch = normalized.match(
      /(\d+)\s*(?:nguoi lon|người lớn|adult|nguoi truong thanh|người trưởng thành|nl)/,
    );
    const childMatch = normalized.match(
      /(\d+)\s*(?:tre em|trẻ em|child|em be|bé|em bé|be|te)/,
    );
    const peopleMatch = normalized.match(
      /(\d+)\s*(?:nguoi|người|khach|khách)\b/,
    );

    if (adultMatch) draft.adultCount = Number(adultMatch[1]);
    else if (peopleMatch && !childMatch)
      draft.adultCount = Number(peopleMatch[1]);

    if (childMatch) draft.childCount = Number(childMatch[1]);
    if (draft.childCount == null) draft.childCount = 0;

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

    const voucherMatch = String(message)
      .toUpperCase()
      .match(/(?:VOUCHER|MÃ|MA)\s*[:\-]?\s*([A-Z0-9_\-]{4,30})/);
    if (voucherMatch) draft.voucherCode = voucherMatch[1];

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
    }

    if (/\b(vnpay|vn pay)\b/.test(normalized)) draft.paymentMethod = "vnpay";
    else if (/\b(momo|vi momo|ví momo)\b/.test(normalized))
      draft.paymentMethod = "momo";
    else if (/\b(chuyen khoan|chuyển khoản|bank)\b/.test(normalized))
      draft.paymentMethod = "bank_transfer";
    else if (/\b(tien mat|tiền mặt|cash)\b/.test(normalized))
      draft.paymentMethod = "cash";
    else if (/\b(the|card)\b/.test(normalized)) draft.paymentMethod = "card";

    return draft;
  }

  private resolveTourChoiceFromMessage(message: string, memory: MemoryState) {
    const normalized = this.stripText(message);
    const options = Array.isArray(memory.lastTourOptions)
      ? memory.lastTourOptions
      : [];
    if (!options.length) return null;

    let index: number | null = null;

    const numberMatch = normalized.match(
      /(?:tour|chon|lay|dat|so|thu)\s*(?:so|thu)?\s*(\d+)/,
    );
    if (numberMatch) index = Number(numberMatch[1]) - 1;

    if (index == null) {
      if (/\b(dau tien|thu nhat|so mot|tour dau)\b/.test(normalized)) index = 0;
      else if (/\b(thu hai|so hai|tour hai)\b/.test(normalized)) index = 1;
      else if (/\b(thu ba|so ba|tour ba)\b/.test(normalized)) index = 2;
      else if (/\b(thu tu|so bon|tour bon)\b/.test(normalized)) index = 3;
      else if (/\b(thu nam|so nam|tour nam)\b/.test(normalized)) index = 4;
    }

    if (index == null || index < 0 || index >= options.length) return null;
    return options[index];
  }

  private resolveDepartureChoiceFromMessage(
    message: string,
    memory: MemoryState,
  ) {
    const normalized = this.stripText(message);
    const options = Array.isArray(memory.lastDepartureOptions)
      ? memory.lastDepartureOptions
      : [];
    if (!options.length) return null;

    let index: number | null = null;

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

  private parsePartySize(normalized: string): number | null {
    const match = normalized.match(/(\d+)\s*(nguoi|ng|khach)/);
    return match ? Number(match[1]) : null;
  }

  private mentionsUnsupportedDestination(normalized: string) {
    return /\b(nhat ban|japan|han quoc|korea|trung quoc|china|thai lan|thailand|singapore|malaysia|chau au|europe|my|usa|uc|australia|phap|france|y|italy)\b/.test(
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

    const hasPickupCommand =
      /\b(diem don|don o dau|don tai dau|noi don|cho don|ben xe|pickup|xe don|gio don|dia diem don)\b/.test(
        normalized,
      );

    const hasCompareCommand =
      /\b(so sanh|khac nhau|nen chon tour nao|tour nao tot hon|tour nao hop hon|tour nao dang tien hon)\b/.test(
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

    if (hasExplicitBookingChangeRequest) {
      return "booking_change";
    }

    const hasTourDetailQuestion = this.isTourDetailQuestion(message);

    const hasBookingFollowUpSignal =
      /\b(momo|vnpay|vn pay|chuyen khoan|bank|tien mat|cash|chon|diem don|pickup|khong dung voucher|khong co voucher|bo qua voucher|voucher|lich|ngay khoi hanh|khoi hanh|tiep tuc|xac nhan|dong y|ok|oke|\d+\s*(nguoi|khach|nguoi lon|tre em))\b/.test(
        normalized,
      );

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

    const isExplicitNewTourSearch =
      Boolean(mentionsDestination) ||
      Boolean(mentionsDuration) ||
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

    return /\b(tour nay|tour do|tour vua goi y|tour dau tien|tour tren|lich trinh nay|lich trinh|di dau|di nhung dau|ngay 1|ngay 2|ngay 3|nhe nhang|co met khong|met khong|phu hop gia dinh|phu hop tre nho|tre nho|tre em|khach san|luu tru|tien nghi|may sao|phuong tien|di bang gi|bao gom nhung gi|bao gom gi|review|danh gia|khach hang noi gi|lich khoi hanh|khoi hanh nao|con lich|ngay khoi hanh)\b/.test(
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

      const nextDeparture = departures[0] ?? tour.departures?.[0] ?? null;

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

    return scored
      .filter((item) => (hasStrongFilter ? item.score > 0 : true))
      .sort((a, b) => {
        if (sortPreference === "cheap") {
          return a.cheapestAdultPrice - b.cheapestAdultPrice;
        }
        return b.score - a.score;
      })
      .slice(0, 3)
      .map((item) =>
        this.toTourCard(
          item.tour,
          item.nextDeparture,
          this.pickTopReasons(item.reasons),
        ),
      );
  }

  private async findPersonalizedTours(
    user: AuthUser,
    memory: MemoryState,
  ): Promise<TourCard[]> {
    if (!user?.userId) return this.findRelevantTours(memory, "");

    const since = new Date();
    since.setDate(since.getDate() - 60);

    const behaviors = await this.prisma.userBehavior.findMany({
      where: { userId: user.userId, createdAt: { gte: since } },
      include: { tour: { include: { destination: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    });

    if (!behaviors.length) return this.findRelevantTours(memory, "");

    const destinations = await this.prisma.destination.findMany({
      where: { status: "active" },
    });
    const tourScore: Record<string, number> = {};
    const destinationScore: Record<string, number> = {};
    const themeScore: Record<string, number> = {};

    const add = (map: Record<string, number>, key: any, score: number) => {
      if (!key) return;
      const safe = String(key);
      map[safe] = (map[safe] || 0) + score;
    };

    for (const behavior of behaviors as any[]) {
      const score = Number(
        behavior.score || ACTION_SCORE[behavior.action] || 1,
      );
      if (behavior.tour) {
        add(tourScore, behavior.tour.id, score * 1.5);
        add(destinationScore, behavior.tour.destinationId, score * 2);
        add(themeScore, behavior.tour.tourTheme, score * 1.2);
      }

      const keyword = this.stripText(behavior.keyword || "");
      if (keyword) {
        for (const dest of destinations as any[]) {
          const destName = this.stripText(dest.name);
          const province = this.stripText(dest.province || "");
          if (
            keyword.includes(destName) ||
            destName.includes(keyword) ||
            (province && keyword.includes(province))
          ) {
            add(destinationScore, dest.id, score * 2.5);
          }
        }
        if (/bien|dao|phu quoc|nha trang|quy nhon|ha long/.test(keyword))
          add(themeScore, "beach", score * 1.5);
        if (/da lat|sapa|sa pa|san may|nui|trek/.test(keyword))
          add(themeScore, "mountain", score * 1.5);
        if (/van hoa|pho co|di tich|hue|hoi an/.test(keyword))
          add(themeScore, "culture", score * 1.5);
        if (/gia dinh|family|tre em/.test(keyword))
          add(themeScore, "family", score * 1.5);
      }
    }

    const rows = await this.prisma.tour.findMany({
      where: { status: "published" as any },
      include: {
        destination: true,
        media: { where: { isCover: true }, take: 1 },
        reviews: {
          where: { status: "approved" as any },
          select: { rating: true },
        },
        departures: {
          where: { status: { in: ["open", "full"] as any } },
          orderBy: { departureDate: "asc" },
          take: 2,
        },
      },
      take: 80,
    });

    return rows
      .map((tour: any) => {
        const nextDeparture = tour.departures?.[0] ?? null;
        const score =
          Number(tourScore[String(tour.id)] || 0) * 1.6 +
          Number(destinationScore[String(tour.destinationId)] || 0) * 2.2 +
          Number(themeScore[String(tour.tourTheme)] || 0) * 1.4 +
          (tour.isTrending ? 0.3 : 0) +
          (tour.isBestDeal ? 0.25 : 0) +
          this.averageRating(tour.reviews || []) * 0.08;
        return { tour, nextDeparture, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) =>
        this.toTourCard(item.tour, item.nextDeparture, [
          "phù hợp với lịch sử tìm kiếm/xem tour gần đây của bạn",
        ]),
      );
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
      where: { userId: user.userId, ...(bookingCode ? { bookingCode } : {}) },
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

  private async processBookingFlow(
    ctx: PromptContext,
    memory: MemoryState,
    user: AuthUser,
  ): Promise<{
    answer: string;
    memory?: Partial<MemoryState>;
    bookingCheckout?: BookingCheckoutCard;
  } | null> {
    if (ctx.intent !== "booking_create") {
      return null;
    }

    const draft: ChatBookingDraft = {
      ...(memory.bookingDraft || {}),
      started: true,
    };

    const explicitDestination = this.detectDestination(
      this.stripText(ctx.userMessage),
    );

    const selectedTourOption = this.resolveTourChoiceFromMessage(
      ctx.userMessage,
      memory,
    );
    if (selectedTourOption) {
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
    }

    // Ưu tiên xử lý “chọn lịch số 1/2/3” trước khi validate departure cũ.
    // Nếu không, draft.departureId cũ sẽ bị kiểm tra trước và bot cứ lặp lại danh sách lịch.
    const selectedDepartureOption = this.resolveDepartureChoiceFromMessage(
      ctx.userMessage,
      memory,
    );
    if (selectedDepartureOption) {
      draft.tourId = selectedDepartureOption.tourId || draft.tourId || null;
      draft.departureId = selectedDepartureOption.departureId;
    }

    // Nếu câu hiện tại có nhắc rõ điểm đến, ưu tiên tour tìm được từ câu hiện tại.
    // Không dùng lastTourId cũ để tránh đặt Nha Trang nhưng tạo nhầm Phú Quốc.
    if (explicitDestination && ctx.tours[0]?.tourId) {
      draft.tourId = ctx.tours[0].tourId;
      if (!selectedDepartureOption) {
        draft.departureId = ctx.tours[0].departureId;
      }
    } else {
      if (!draft.tourId && memory.lastTourId) draft.tourId = memory.lastTourId;
      if (!draft.tourId && ctx.tours[0]?.tourId)
        draft.tourId = ctx.tours[0].tourId;
      if (!draft.departureId && ctx.tours[0]?.departureId)
        draft.departureId = ctx.tours[0].departureId;
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

    if (!account.phone || !account.identityNumber) {
      return {
        answer:
          "Để đặt tour qua chatbot, bạn cần cập nhật số điện thoại và CCCD trong hồ sơ trước. Đây là ràng buộc để xuất thông tin booking và giữ chỗ đúng người.",
        memory: { bookingDraft: draft },
      };
    }

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

    if (explicitDestination) {
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

    const openDepartures = await this.findBookableDepartureOptions(tour.id);
    const departureOptionsForMemory = openDepartures
      .slice(0, 5)
      .map((item: any, index: number) =>
        this.toDepartureMemoryOption(tour.id, item, index),
      );

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
      } else if (selectedDeparture) {
        selectedDepartureExpired = true;
        draft.departureId = null;
      }
    }

    if (!departure && openDepartures.length === 1) {
      departure = openDepartures[0];
      draft.departureId = String(departure.id);
    }

    if (!departure && openDepartures.length > 1) {
      const reason = selectedDepartureExpired
        ? "Lịch khởi hành bạn chọn trước đó đã qua ngày đặt hợp lệ hoặc không còn mở để giữ chỗ."
        : "Tour này có nhiều lịch khởi hành còn mở.";
      return {
        answer: [
          reason,
          "",
          `Bạn chọn lịch muốn đi của tour ${tour.name} nha:`,
          "",
          ...openDepartures.slice(0, 5).map((item: any, index: number) => {
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
          "Bạn có thể nhắn: “chọn lịch số 1, điểm đón mã 35, dùng voucher BRONZE3X, thanh toán momo, 1 người lớn”.",
        ].join("\n"),
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
        },
      };
    }

    if (!departure) {
      return {
        answer: `Tour ${tour.name} hiện chưa có lịch khởi hành còn mở để đặt. Bạn chọn tour khác hoặc hỏi mình tìm tour tương tự nha.`,
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
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
          `Bạn muốn chọn điểm đón nào? Bạn hãy nhắn: “chọn điểm đón mã ...”.`,
          `Nếu có voucher, bạn cũng có thể nhắn kèm mã voucher, ví dụ: “chọn điểm đón mã ${String(pickupOptions[0]?.id || "...")}, dùng voucher ${draft.voucherCode || "SILVER2X"}, thanh toán momo”.`,
        ].join("\n"),
        memory: { bookingDraft: draft },
      };
    }

    if (!draft.voucherCode && !draft.skipVoucher) {
      const availableVouchers = await this.findRelevantVouchers(
        "booking_create",
        user,
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
            `Bạn muốn dùng voucher nào? Bạn có thể nhắn: “dùng voucher ${availableVouchers[0].code}”.`,
            `Nếu không dùng voucher, hãy nhắn: “không dùng voucher”.`,
          ].join("\n"),
          memory: { bookingDraft: draft },
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
      return {
        answer: [
          `Mình đã ghi nhận tour ${tour.name}${pickup ? `, điểm đón ${pickup.name}` : draft.pickupPointId ? `, điểm đón mã ${draft.pickupPointId}` : ""}${draft.voucherCode ? `, voucher ${draft.voucherCode}` : draft.skipVoucher ? ", không dùng voucher" : ""}.`,
          "Bạn muốn thanh toán bằng phương thức nào: Momo hay VNPay?",
          "Bạn có thể nhắn: “thanh toán momo” hoặc “thanh toán vnpay”.",
        ].join("\n"),
        memory: {
          bookingDraft: draft,
          lastDepartureOptions: departureOptionsForMemory,
        },
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
      const created = await this.bookingsService.create(
        {
          departureId: Number(departure.id),
          pickupPointId: pickup?.id ? Number(pickup.id) : undefined,
          voucherCode: draft.voucherCode || undefined,
          adultCount,
          childCount,
          contactName: draft.contactName || account.fullName || "Khách Travela",
          contactEmail: draft.contactEmail || account.email,
          contactPhone: draft.contactPhone || account.phone || "",
          note: "Booking được tạo từ chatbot Travela AI",
        },
        user.userId,
      );

      const payment = await this.paymentsService.initiatePayment(
        Number(created.id),
        draft.paymentMethod,
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

      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
        mobilePaymentUrl,
      )}`;

      const checkout: BookingCheckoutCard = {
        type: "booking_checkout",
        bookingId: String(payment.bookingId || created.id),
        bookingCode: String(payment.bookingCode || created.bookingCode),
        amount: Number(
          payment.amount || payment.finalAmount || created.finalAmount || 0,
        ),
        finalAmount: Number(
          payment.finalAmount || payment.amount || created.finalAmount || 0,
        ),
        holdExpiresAt: payment.holdExpiresAt
          ? new Date(payment.holdExpiresAt as any).toISOString()
          : created.holdExpiresAt
            ? new Date(created.holdExpiresAt as any).toISOString()
            : null,
        paymentUrl: mobilePaymentUrl,
        mobilePaymentUrl,
        qrCodeUrl,
        transactionCode: String(
          payment.transactionCode || payment.internalTransactionCode || "",
        ),
        paymentMethod: String(payment.paymentMethod || draft.paymentMethod),
        paymentStatus: String(payment.paymentStatus || "pending"),
      };

      return {
        answer: [
          `Mình đã tạo booking ${checkout.bookingCode} cho tour ${tour.name}.`,
          `Số khách: ${adultCount} người lớn${childCount ? `, ${childCount} trẻ em` : ""}.`,
          `Khởi hành: ${this.formatDate(new Date(departure.departureDate).toISOString())}.`,
          pickup
            ? `Điểm đón: ${pickup.name} - ${pickup.address}.`
            : "Điểm đón: Travela sẽ liên hệ xác nhận.",
          `Tổng tiền: ${this.formatCurrency(checkout.finalAmount)}. Mình đã tạo mã QR thanh toán bên dưới, bạn vui lòng quét QR để hoàn tất trong thời gian giữ chỗ.`,
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

    const adultMatch = normalized.match(
      /(\d+)\s*(?:nguoi lon|adult|nguoi truong thanh)/,
    );
    const peopleMatch = normalized.match(/(\d+)\s*(?:nguoi|khach)\b/);
    const childMatch = normalized.match(/(\d+)\s*(?:tre em|child|em be|be)/);
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

    const oldPaymentMethod = String(
      latestPayment?.paymentMethod || "momo",
    ).toLowerCase();
    const paymentMethod = /\b(vnpay|vn pay)\b/.test(normalized)
      ? "vnpay"
      : /\b(chuyen khoan|bank)\b/.test(normalized)
        ? "bank_transfer"
        : /\b(tien mat|cash)\b/.test(normalized)
          ? "cash"
          : /\bmomo\b/.test(normalized)
            ? "momo"
            : oldPaymentMethod || "momo";

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
      paymentMethod: paymentMethod as any,
      skipVoucher: true,
      started: true,
    };

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

  private async generateGeminiAnswer(ctx: PromptContext): Promise<string> {
    const { systemInstruction, prompt } = this.buildLlmPrompt(ctx);

    // 1) Ưu tiên Gemini
    const geminiAnswer = await this.callGemini(systemInstruction, prompt);
    if (geminiAnswer) return geminiAnswer;

    // 2) Nếu Gemini hết quota/lỗi/quá tải thì qua Groq hoặc OpenAI-compatible API
    const groqAnswer = await this.callOpenAICompatibleLlm(
      systemInstruction,
      prompt,
    );
    if (groqAnswer) return groqAnswer;

    // 3) Nếu cả 2 API đều lỗi thì trả lời local để chatbot không chết
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
- Không nói mình là Google, Gemini, Groq hoặc Llama. Hãy nói mình là Travela AI.
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

  private async callGemini(
    systemInstruction: string,
    prompt: string,
  ): Promise<string | null> {
    if (!this.gemini) return null;

    // Không để gemini-1.5-flash trong fallback vì project của bạn đang báo 404.
    const modelsToTry = [
      this.geminiModel || "gemini-2.0-flash",
      "gemini-2.0-flash",
    ].filter((model, index, arr) => model && arr.indexOf(model) === index);

    for (const model of modelsToTry) {
      try {
        console.log("[Travela AI] Calling Gemini model:", model);

        const response = await this.gemini.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.55,
            topP: 0.9,
            maxOutputTokens: 900,
          },
        });

        const text = response.text?.trim();
        if (text) return text;
      } catch (error: any) {
        const status = error?.status || error?.code || "unknown";
        const message = error?.message || String(error);
        console.error(`[Gemini chatbot error] model=${model}`, status, message);

        // 429: hết quota/rate limit, 503: quá tải, 404: sai/không còn model.
        // Các lỗi này đều cho qua Groq hoặc local fallback.
        continue;
      }
    }

    return null;
  }

  private async callOpenAICompatibleLlm(
    systemInstruction: string,
    prompt: string,
  ): Promise<string | null> {
    const apiKey =
      this.configService.get<string>("CHATBOT_API_KEY") ||
      process.env.CHATBOT_API_KEY ||
      "";

    if (!apiKey) return null;

    const baseUrl = (
      this.configService.get<string>("CHATBOT_BASE_URL") ||
      process.env.CHATBOT_BASE_URL ||
      "https://api.groq.com/openai/v1"
    ).replace(/\/$/, "");

    const model =
      this.configService.get<string>("CHATBOT_MODEL") ||
      process.env.CHATBOT_MODEL ||
      "llama-3.3-70b-versatile";

    try {
      console.log("[Travela AI] Calling OpenAI-compatible model:", model);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
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
          "[OpenAI-compatible chatbot error]",
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
        "[OpenAI-compatible chatbot exception]",
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

    if (destinations.length < 2) {
      return "Bạn muốn so sánh những tour nào? Ví dụ: “So sánh tour Đà Lạt 3N2Đ và Nha Trang 3N2Đ”.";
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
    // Không phụ thuộc 100% vào intent vì Gemini NLU đôi lúc phân loại câu này thành tư vấn chung.
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

    const sectionIntent = this.detectTourSectionIntent(normalized, intent);
    if (!sectionIntent) return null;

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
        "Khi đặt, bạn có thể nhắn: “chọn lịch số 1, điểm đón mã ..., dùng voucher ..., thanh toán momo, 1 người lớn”.",
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
        "Bạn có thể áp dụng chính sách chung: gửi yêu cầu hoàn tiền trong 48 giờ sau khi đặt, không hỗ trợ hoàn nếu còn dưới 3 ngày trước ngày khởi hành, và yêu cầu cần admin duyệt.",
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
    if (
      intent === "pickup_point" ||
      /\b(diem don|don o dau|don tai dau|cho don|gio don|pickup|xe don)\b/.test(
        normalized,
      )
    )
      return "pickup";
    if (
      /\b(lich khoi hanh|khoi hanh nao|ngay khoi hanh|con lich|lich gan nhat|con cho|ngay di)\b/.test(
        normalized,
      )
    )
      return "departure";
    if (
      intent === "tour_policy" ||
      /\b(chinh sach|huy|hoan tien|refund|cancel|doi lich|doi tour|phi huy)\b/.test(
        normalized,
      )
    )
      return "policy";
    if (
      /\b(khach san|luu tru|resort|o dau|tien nghi|may sao)\b/.test(normalized)
    )
      return "hotel";
    if (
      /\b(lich trinh|di dau|di nhung dau)\b/.test(normalized) ||
      /\bngay\s*[123](?!\s*dem)\b/.test(normalized)
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

  private generateNaturalAnswer(ctx: PromptContext): string {
    const name = ctx.userProfile.fullName ? ` ${ctx.userProfile.fullName}` : "";

    if (ctx.intent === "small_talk") {
      return `Chào${name}! Mình là Travela AI. Bạn có thể hỏi mình tìm tour theo ngân sách/số ngày, kiểm tra voucher, tra booking, hoặc hỏi điểm đón. Bạn muốn đi đâu trước nè?`;
    }

    if (ctx.intent === "personal_recommendation") {
      if (!ctx.userProfile.loggedIn) {
        return "Bạn cần đăng nhập để mình xem lịch sử tìm kiếm/xem tour và gợi ý cá nhân hóa. Trước mắt, mình gửi bạn vài tour nổi bật để tham khảo nha.";
      }
      if (ctx.tours.length) {
        return `Dựa trên hành vi gần đây của bạn, mình gợi ý ${ctx.tours.length} tour phù hợp nhất. Bạn có thể bấm “Xem tour” hoặc hỏi mình so sánh giữa các tour này.`;
      }
      return "Mình chưa có đủ dữ liệu cá nhân hóa. Bạn hãy xem/yêu thích vài tour, hoặc nói cho mình điểm đến, số ngày và ngân sách để mình lọc chính xác hơn.";
    }

    if (ctx.intent === "booking_create") {
      return "Mình có thể hỗ trợ bạn đặt tour ngay trong chatbot. Bạn hãy nhắn rõ số người lớn, số trẻ em và phương thức thanh toán, ví dụ: “Đặt tour này cho tôi 2 người lớn bằng MoMo”.";
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
            `“Đặt tour Nha Trang 2 người lớn, dùng voucher ${found.code}, thanh toán momo”.`,
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

        return [
          `Mình tìm thấy ${Math.min(
            ctx.tours.length,
            3,
          )} tour${searchLabel} phù hợp nhất:`,
          "",
          ...lines,
          "",
          "Bạn có thể bấm “Xem tour” ở thẻ bên dưới để xem lịch khởi hành, điểm đón và đặt tour.",
        ].join("\n");
      }

      if (
        ctx.memory.hotelStars &&
        /\b(khach san|4 sao|5 sao|4 den 5 sao|cao cap|premium|resort)\b/.test(
          normalizedUserMessage,
        )
      ) {
        return `Mình chưa tìm thấy tour phù hợp với tiêu chuẩn khách sạn từ ${ctx.memory.hotelStars} sao trong dữ liệu hiện có. Bạn có thể giảm tiêu chí khách sạn hoặc cho mình thêm điểm đến/ngân sách để lọc lại chính xác hơn.`;
      }

      return "Mình chưa tìm thấy tour thật sự khớp trong dữ liệu hiện có. Bạn thử nói rõ hơn điểm đến, số ngày, ngân sách hoặc tháng khởi hành nhé. Ví dụ: “Đà Lạt 3 ngày dưới 6 triệu”.";
    }

    return "Mình có thể hỗ trợ bạn tìm tour, kiểm tra booking, voucher, điểm đón và chính sách. Bạn có thể hỏi tự nhiên như: “Tôi muốn đi Phú Quốc 3 ngày dưới 7 triệu” hoặc “Đơn của tôi thanh toán chưa?”.";
  }

  private buildSuggestedReplies(ctx: PromptContext): string[] {
    if (ctx.intent === "booking_create")
      return [
        "Kiểm tra booking của tôi",
        "Tôi muốn đổi số khách",
        "Tôi muốn chọn lịch khác",
      ];

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
    const imageUrl =
      tour.media?.[0]?.fileUrl || tour.destination?.coverImage || null;
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
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
      mobilePaymentUrl,
    )}`;

    return {
      type: "booking_checkout",
      bookingId: String(booking.id),
      bookingCode: String(booking.bookingCode),
      amount: Number(payment.amount || booking.finalAmount || 0),
      finalAmount: Number(payment.amount || booking.finalAmount || 0),
      holdExpiresAt: booking.holdExpiresAt
        ? new Date(booking.holdExpiresAt).toISOString()
        : null,
      paymentUrl: mobilePaymentUrl,
      mobilePaymentUrl,
      qrCodeUrl,
      transactionCode,
      paymentMethod: String(payment.paymentMethod || "momo"),
      paymentStatus: paymentStatus || "pending",
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

  private async findBookableDepartureOptions(tourId: bigint) {
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

    return rows.filter((item: any) => this.isDepartureBookable(item));
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
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        bookingCode,
        userId,
      },
      include: {
        departure: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        refundRequests: {
          orderBy: { createdAt: "desc" },
          take: 1,
        } as any,
      } as any,
    });

    if (!booking) {
      return {
        eligible: false,
        reason: "Không tìm thấy booking trong tài khoản của bạn.",
      };
    }

    const createdAt = new Date((booking as any).createdAt);
    const now = new Date();
    const hoursAfterBooking =
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    const departureDate = new Date((booking as any).departure.departureDate);
    const daysBeforeDeparture =
      (departureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    const bookingStatus = String(
      (booking as any).bookingStatus || "",
    ).toLowerCase();
    const latestPayment = (booking as any).payments?.[0];
    const paymentStatus = String(
      latestPayment?.paymentStatus || "",
    ).toLowerCase();

    if (hoursAfterBooking > 48) {
      return {
        eligible: false,
        reason:
          "Booking đã quá 48 giờ kể từ lúc đặt nên không đủ điều kiện gửi yêu cầu hoàn tiền.",
      };
    }

    if (daysBeforeDeparture < 3) {
      return {
        eligible: false,
        reason:
          "Ngày khởi hành còn dưới 3 ngày nên không đủ điều kiện hoàn tiền.",
      };
    }

    if (
      !["confirmed", "waiting_confirmation"].includes(bookingStatus) &&
      !["paid", "success"].includes(paymentStatus)
    ) {
      return {
        eligible: false,
        reason: "Booking chưa ở trạng thái đã thanh toán hoặc đã xác nhận.",
      };
    }

    const latestRefund = (booking as any).refundRequests?.[0];
    if (
      latestRefund &&
      ["pending", "approved"].includes(
        String(latestRefund.status).toLowerCase(),
      )
    ) {
      return {
        eligible: false,
        reason:
          "Booking đã có yêu cầu hoàn tiền đang xử lý hoặc đã được duyệt.",
      };
    }

    return {
      eligible: true,
      reason:
        "Booking đủ điều kiện gửi yêu cầu hoàn tiền. Yêu cầu vẫn cần admin kiểm tra và duyệt.",
    };
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
