import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RagService } from "./rag.service";

function money(value: any) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

@Injectable()
export class RagIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
  ) {}

  async rebuildAll() {
    await (this.prisma as any).ragDocument.deleteMany({});

    const [tourCount, faqCount, pickupCount, voucherCount] = await Promise.all([
      this.indexTours(),
      this.indexFaqs(),
      this.indexPickupPoints(),
      this.indexVouchers(),
    ]);

    return {
      message:
        "Đã rebuild RAG index gồm tour mở rộng, FAQ, điểm đón và voucher.",
      tourCount,
      faqCount,
      pickupCount,
      voucherCount,
    };
  }

  private async upsertDocument(input: {
    sourceType: string;
    sourceId?: bigint | number | string | null;
    title: string;
    content: string;
    metadata?: any;
  }) {
    const embedding = await this.ragService
      .embedText(input.content)
      .catch(() => []);

    return (this.prisma as any).ragDocument.create({
      data: {
        sourceType: input.sourceType,
        sourceId: input.sourceId ? BigInt(input.sourceId) : null,
        title: input.title,
        content: input.content,
        metadata: input.metadata || {},
        embedding,
        status: "active",
      },
    });
  }

  private async indexTours() {
    const tours = await this.prisma.tour.findMany({
      where: { status: "published" },
      include: {
        destination: true,
        departures: {
          where: { status: { in: ["open", "full"] as any } },
          orderBy: { departureDate: "asc" },
          take: 8,
        },
        pickupPoints: true,
        itinerary: {
          orderBy: [{ dayNumber: "asc" }, { itemOrder: "asc" }],
        },
        policies: {
          orderBy: { displayOrder: "asc" },
        },
        accommodations: {
          where: { status: "active" as any },
        },
        transports: {
          where: { status: "active" as any },
        },
        reviews: {
          where: { status: "approved" as any },
          select: { rating: true, comment: true },
          take: 10,
        },
        bookings: {
          where: { bookingStatus: { in: ["confirmed", "completed"] as any } },
          select: { id: true },
        },
      } as any,
    });

    for (const tour of tours as any[]) {
      const avgRating = tour.reviews?.length
        ? tour.reviews.reduce(
            (sum: number, item: any) => sum + Number(item.rating || 0),
            0,
          ) / tour.reviews.length
        : 0;

      const baseMetadata = {
        title: tour.name,
        slug: tour.slug,
        destination: tour.destination?.name,
        province: tour.destination?.province,
        theme: tour.tourTheme,
        tourType: tour.tourType,
        durationDays: tour.durationDays,
        durationNights: tour.durationNights,
        priceAdult: Number(tour.basePriceAdult || 0),
        priceChild: Number(tour.basePriceChild || 0),
        hotelStars: Number(tour.hotelStars || 0),
        isBestDeal: Boolean(tour.isBestDeal),
        isTrending: Boolean(tour.isTrending),
        avgRating,
        successfulBookingCount: Array.isArray(tour.bookings)
          ? tour.bookings.length
          : 0,
        reviewCount: tour.reviews?.length || 0,
      };

      const departureText = (tour.departures || [])
        .map(
          (d: any) =>
            `khởi hành ${new Date(d.departureDate).toLocaleDateString("vi-VN")}, giá người lớn ${money(d.adultPrice)}, còn khoảng ${Number(d.totalSlots || 0) - Number(d.bookedSlots || 0) - Number(d.heldSlots || 0)} chỗ`,
        )
        .join("; ");

      const pickupText = (tour.pickupPoints || [])
        .map(
          (p: any) =>
            `điểm đón ${p.name} tại ${p.province}, địa chỉ ${p.address}${p.pickupTime ? `, giờ đón ${p.pickupTime}` : ""}`,
        )
        .join("; ");

      const itineraryText = (tour.itinerary || [])
        .map(
          (item: any) =>
            `Ngày ${item.dayNumber}: ${item.title}${
              item.locationName ? ` tại ${item.locationName}` : ""
            }${item.description ? ` - ${item.description}` : ""}`,
        )
        .join("; ");

      const policyText = (tour.policies || [])
        .map((item: any) => `${item.policyType}: ${item.content}`)
        .join("; ");

      const accommodationText = (tour.accommodations || [])
        .map(
          (item: any) =>
            `${item.name}, loại ${item.accommodationType || "khách sạn"}, ${
              item.starRating || tour.hotelStars || 0
            } sao, địa chỉ ${item.address || "đang cập nhật"}${
              item.amenities ? `, tiện nghi: ${item.amenities}` : ""
            }`,
        )
        .join("; ");

      const transportText = (tour.transports || [])
        .map(
          (item: any) =>
            `${item.name}, phương tiện ${item.transportType || "đang cập nhật"}${
              item.origin ? `, xuất phát từ ${item.origin}` : ""
            }${item.destinationLabel ? ` đến ${item.destinationLabel}` : ""}${
              item.durationHours
                ? `, thời gian khoảng ${item.durationHours} giờ`
                : ""
            }`,
        )
        .join("; ");

      const reviewText = (tour.reviews || [])
        .filter((item: any) => item.comment)
        .map((item: any) => `${item.rating || 0} sao: ${item.comment}`)
        .join("; ");

      const overview = [
        `Tour: ${tour.name}.`,
        `Điểm đến: ${tour.destination?.name || "Đang cập nhật"}, ${tour.destination?.province || ""}.`,
        `Chủ đề: ${tour.tourTheme}. Loại tour: ${tour.tourType}.`,
        `Thời lượng: ${tour.durationDays} ngày ${tour.durationNights} đêm.`,
        `Giá người lớn từ ${money(tour.basePriceAdult)}, giá trẻ em từ ${money(tour.basePriceChild)}.`,
        `Khách sạn: ${tour.hotelStars || 0} sao. Đánh giá trung bình: ${avgRating.toFixed(1)} sao.`,
        tour.isBestDeal ? "Tour đang có ưu đãi tốt." : "",
        tour.isTrending ? "Tour đang được nhiều khách quan tâm." : "",
        tour.shortDescription || "",
        tour.fullDescription || "",
      ]
        .filter(Boolean)
        .join("\n");

      const documents = [
        {
          sourceType: "tour_overview",
          section: "overview",
          title: `${tour.name} - Tổng quan`,
          content: overview,
        },
        departureText
          ? {
              sourceType: "tour_departure",
              section: "departure",
              title: `${tour.name} - Lịch khởi hành và giá`,
              content: `Tour: ${tour.name}. Lịch khởi hành: ${departureText}.`,
            }
          : null,
        pickupText
          ? {
              sourceType: "tour_pickup",
              section: "pickup",
              title: `${tour.name} - Điểm đón`,
              content: `Tour: ${tour.name}. Điểm đón: ${pickupText}.`,
            }
          : null,
        itineraryText
          ? {
              sourceType: "tour_itinerary",
              section: "itinerary",
              title: `${tour.name} - Lịch trình chi tiết`,
              content: `Tour: ${tour.name}. Lịch trình chi tiết: ${itineraryText}. Phù hợp để đánh giá tour có nhẹ nhàng không, có phù hợp gia đình/trẻ nhỏ/người lớn tuổi không, có nhiều điểm chụp hình hay không.`,
            }
          : null,
        accommodationText
          ? {
              sourceType: "tour_accommodation",
              section: "accommodation",
              title: `${tour.name} - Lưu trú khách sạn`,
              content: `Tour: ${tour.name}. Lưu trú/khách sạn: ${accommodationText}.`,
            }
          : null,
        transportText
          ? {
              sourceType: "tour_transport",
              section: "transport",
              title: `${tour.name} - Phương tiện`,
              content: `Tour: ${tour.name}. Phương tiện di chuyển: ${transportText}.`,
            }
          : null,
        policyText
          ? {
              sourceType: "tour_policy",
              section: "policy",
              title: `${tour.name} - Chính sách`,
              content: `Tour: ${tour.name}. Chính sách tour: ${policyText}.`,
            }
          : null,
        reviewText
          ? {
              sourceType: "tour_review",
              section: "review",
              title: `${tour.name} - Đánh giá khách hàng`,
              content: `Tour: ${tour.name}. Đánh giá khách hàng: ${reviewText}.`,
            }
          : null,
      ].filter(Boolean) as Array<{
        sourceType: string;
        section: string;
        title: string;
        content: string;
      }>;

      // Vẫn tạo 1 doc sourceType=tour tổng hợp để tương thích code cũ/card cũ.
      await this.upsertDocument({
        sourceType: "tour",
        sourceId: tour.id,
        title: tour.name,
        content: [
          overview,
          departureText,
          pickupText,
          itineraryText,
          policyText,
          accommodationText,
          transportText,
          reviewText,
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          ...baseMetadata,
          section: "all",
          hasItinerary: Boolean(tour.itinerary?.length),
          hasAccommodation: Boolean(tour.accommodations?.length),
          hasTransport: Boolean(tour.transports?.length),
        },
      });

      for (const doc of documents) {
        await this.upsertDocument({
          sourceType: doc.sourceType,
          sourceId: tour.id,
          title: doc.title,
          content: doc.content,
          metadata: {
            ...baseMetadata,
            section: doc.section,
          },
        });
      }
    }

    return tours.length;
  }

  private async indexFaqs() {
    const faqs = await this.prisma.faq.findMany({
      where: { status: "active" as any },
    });

    for (const faq of faqs as any[]) {
      await this.upsertDocument({
        sourceType: "faq",
        sourceId: faq.id,
        title: faq.question,
        content: `FAQ: ${faq.question}\nTrả lời: ${faq.answer}\nChủ đề: ${faq.topic || "chung"}`,
        metadata: { topic: faq.topic },
      });
    }

    return faqs.length;
  }

  private async indexPickupPoints() {
    const points = await (this.prisma as any).tourPickupPoint.findMany({
      include: { tour: { include: { destination: true } } },
    });

    for (const point of points as any[]) {
      await this.upsertDocument({
        sourceType: "pickup_point",
        sourceId: point.id,
        title: `Điểm đón ${point.name}`,
        content: [
          `Điểm đón: ${point.name}.`,
          `Tỉnh/thành: ${point.province}.`,
          `Địa chỉ: ${point.address}.`,
          `Tour áp dụng: ${point.tour?.name || "Đang cập nhật"}.`,
          `Điểm đến tour: ${point.tour?.destination?.name || "Đang cập nhật"}.`,
          point.note ? `Ghi chú: ${point.note}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          province: point.province,
          tourId: point.tourId ? String(point.tourId) : null,
          tourName: point.tour?.name,
          destination: point.tour?.destination?.name,
        },
      });
    }

    return points.length;
  }

  private async indexVouchers() {
    const vouchers = await (this.prisma as any).voucher.findMany({
      where: { status: "active" },
    });

    for (const voucher of vouchers as any[]) {
      await this.upsertDocument({
        sourceType: "voucher",
        sourceId: voucher.id,
        title: `Voucher ${voucher.code}`,
        content: [
          `Voucher: ${voucher.code} - ${voucher.name}.`,
          voucher.description || "",
          `Loại giảm: ${voucher.discountType}. Giá trị giảm: ${voucher.discountValue}.`,
          `Đơn tối thiểu: ${money(voucher.minOrderAmount)}.`,
          voucher.maxDiscount
            ? `Giảm tối đa: ${money(voucher.maxDiscount)}.`
            : "",
          voucher.endDate
            ? `Hạn dùng đến ${new Date(voucher.endDate).toLocaleDateString("vi-VN")}.`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        metadata: {
          code: voucher.code,
          discountType: voucher.discountType,
          discountValue: Number(voucher.discountValue || 0),
          minOrderAmount: Number(voucher.minOrderAmount || 0),
          maxDiscount: Number(voucher.maxDiscount || 0),
        },
      });
    }

    return vouchers.length;
  }
}
