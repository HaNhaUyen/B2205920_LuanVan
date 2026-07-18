import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { unlink } from "fs/promises";
import { join, normalize } from "path";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { AdminUpsertReviewDto } from "./dto/admin-upsert-review.dto";

type ReviewListQuery = {
  page?: string;
  pageSize?: string;
  rating?: string;
  hasMedia?: string;
  userId?: bigint;
};

type AdminReviewQuery = ReviewListQuery & {
  search?: string;
  status?: string;
  tourId?: string;
  sortBy?: string;
  sortOrder?: string;
};

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  private calculateMemberTier(points: number) {
    const safePoints = Math.max(Number(points || 0), 0);

    if (safePoints >= 4000) return "diamond";
    if (safePoints >= 1500) return "gold";
    if (safePoints >= 500) return "silver";

    return "bronze";
  }

  private toBool(value?: string) {
    return ["1", "true", "yes", "y"].includes(
      String(value || "").toLowerCase(),
    );
  }

  private pageParams(page?: string, pageSize?: string) {
    const safePage = Math.max(Number(page || 1), 1);
    const safePageSize = Math.min(Math.max(Number(pageSize || 6), 1), 50);

    return {
      page: safePage,
      pageSize: safePageSize,
      skip: (safePage - 1) * safePageSize,
    };
  }

  private mapMedia(item: any) {
    return {
      id: String(item.id),
      reviewId: String(item.reviewId || item.review_id),
      fileUrl: item.fileUrl || item.file_url,
      mediaType: item.mediaType || item.media_type || "image",
      displayOrder: Number(item.displayOrder || item.display_order || 1),
      createdAt: item.createdAt || item.created_at,
    };
  }

  private mapReview(item: any) {
    return {
      ...item,
      id: String(item.id),
      tourId: item.tourId ? String(item.tourId) : null,
      userId: item.userId ? String(item.userId) : null,
      bookingId: item.bookingId ? String(item.bookingId) : null,
      media: (item.media || []).map((media: any) => this.mapMedia(media)),
      user: item.user
        ? {
            ...item.user,
            id: item.user.id ? String(item.user.id) : undefined,
          }
        : null,
      tour: item.tour
        ? {
            ...item.tour,
            id: item.tour.id ? String(item.tour.id) : undefined,
          }
        : null,
    };
  }

  private async loadMediaMap(reviewIds: bigint[]) {
    const map = new Map<string, any[]>();

    if (!reviewIds.length) return map;

    const placeholders = reviewIds.map(() => "?").join(",");
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT 
        id,
        review_id AS reviewId,
        file_url AS fileUrl,
        media_type AS mediaType,
        display_order AS displayOrder,
        created_at AS createdAt
      FROM review_media
      WHERE review_id IN (${placeholders})
      ORDER BY review_id ASC, display_order ASC, id ASC
      `,
      ...reviewIds.map((id) => id.toString()),
    );

    for (const row of rows || []) {
      const key = String(row.reviewId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(row);
    }

    return map;
  }

  private async attachMediaToReviews(items: any[]) {
    const ids = items.map((item) => BigInt(item.id));
    const mediaMap = await this.loadMediaMap(ids);

    return items.map((item) => ({
      ...item,
      media: mediaMap.get(String(item.id)) || [],
    }));
  }

  private async getReviewIdsWithMediaForTour(tourId: number) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT DISTINCT rm.review_id AS reviewId
      FROM review_media rm
      INNER JOIN reviews r ON r.id = rm.review_id
      WHERE r.tour_id = ?
      `,
      String(tourId),
    );

    return (rows || []).map((row) => BigInt(row.reviewId));
  }

  private async getReviewIdsWithMediaAll() {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT DISTINCT review_id AS reviewId
      FROM review_media
      `,
    );

    return (rows || []).map((row) => BigInt(row.reviewId));
  }

  private async countReviewsWithMedia(reviewIds: bigint[]) {
    if (!reviewIds.length) return 0;

    const placeholders = reviewIds.map(() => "?").join(",");
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `
      SELECT COUNT(DISTINCT review_id) AS total
      FROM review_media
      WHERE review_id IN (${placeholders})
      `,
      ...reviewIds.map((id) => id.toString()),
    );

    return Number(rows?.[0]?.total || 0);
  }

  private async buildSummary(tourId: number, userId?: bigint) {
    const baseWhere: any = {
      tourId: BigInt(tourId),
      OR: userId
        ? [
            { status: "approved" },
            { userId, status: { in: ["pending", "approved"] } },
          ]
        : [{ status: "approved" }],
    };

    const [rows, reviewRows] = await Promise.all([
      this.prisma.review.groupBy({
        by: ["rating"],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.review.findMany({
        where: baseWhere,
        select: { id: true },
      }),
    ]);

    const starCounts: Record<string, number> = {
      "5": 0,
      "4": 0,
      "3": 0,
      "2": 0,
      "1": 0,
    };

    let total = 0;
    let ratingSum = 0;

    for (const row of rows as any[]) {
      const rating = Number(row.rating || 0);
      const count = Number(row._count?._all || 0);

      if (rating >= 1 && rating <= 5) {
        starCounts[String(rating)] = count;
        total += count;
        ratingSum += rating * count;
      }
    }

    const mediaCount = await this.countReviewsWithMedia(
      reviewRows.map((item) => BigInt(item.id)),
    );

    return {
      averageRating: total ? Number((ratingSum / total).toFixed(1)) : 0,
      total,
      starCounts,
      mediaCount,
    };
  }

  async findByTour(tourId: number, query: ReviewListQuery = {}) {
    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });

    if (!tour) throw new NotFoundException("Tour not found");

    const { page, pageSize, skip } = this.pageParams(
      query.page,
      query.pageSize,
    );

    const where: any = {
      tourId: BigInt(tourId),
      OR: query.userId
        ? [
            { status: "approved" },
            { userId: query.userId, status: { in: ["pending", "approved"] } },
          ]
        : [{ status: "approved" }],
    };

    const rating = Number(query.rating || 0);
    if (rating >= 1 && rating <= 5) where.rating = rating;

    if (this.toBool(query.hasMedia)) {
      const ids = await this.getReviewIdsWithMediaForTour(tourId);

      if (!ids.length) {
        const summary = await this.buildSummary(tourId, query.userId);
        return {
          summary,
          items: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
          },
        };
      }

      where.id = { in: ids };
    }

    const [rawItems, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.review.count({ where }),
      this.buildSummary(tourId, query.userId),
    ]);

    const items = await this.attachMediaToReviews(rawItems);

    return {
      summary,
      items: items.map((item) => this.mapReview(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  private async removeUploadedFile(fileUrl?: string | null) {
    if (!fileUrl) return;

    const raw = String(fileUrl).trim();
    if (!raw.startsWith("/uploads/reviews/")) return;

    const uploadsRoot = join(process.cwd(), "uploads");
    const relativePath = normalize(raw.replace(/^\/uploads\/?/, ""));
    const absolutePath = join(uploadsRoot, relativePath);

    if (!absolutePath.startsWith(uploadsRoot)) return;

    await unlink(absolutePath).catch(() => null);
  }

  private isPaidBooking(booking: any) {
    const payments: any[] = Array.isArray(booking?.payments)
      ? booking.payments
      : [];

    return payments.some((payment: any) =>
      ["paid", "success", "completed"].includes(
        String(payment?.paymentStatus || "").toLowerCase(),
      ),
    );
  }

  private isFinishedBooking(booking: any) {
    const status = String(booking?.bookingStatus || "").toLowerCase();

    if (status === "completed") return true;

    if (
      ["cancelled", "canceled", "expired", "refunded", "failed"].includes(
        status,
      )
    ) {
      return false;
    }

    const endDateValue = booking?.departure?.endDate;
    if (!endDateValue) return false;

    const endDate = new Date(endDateValue);
    if (Number.isNaN(endDate.getTime())) return false;

    endDate.setHours(23, 59, 59, 999);

    return endDate.getTime() < Date.now();
  }

  private mapEligibleReviewBooking(
    booking: any,
    reviewedMap: Map<string, boolean>,
  ) {
    return {
      id: String(booking.id),
      bookingId: String(booking.id),
      bookingCode: booking.bookingCode,
      bookingStatus: booking.bookingStatus,
      tourId: booking.tourId ? String(booking.tourId) : null,
      tourName: booking.tour?.name || null,
      departureDate: booking.departure?.departureDate || null,
      endDate: booking.departure?.endDate || null,
      finalAmount: Number(booking.finalAmount || 0),
      reviewed: reviewedMap.get(String(booking.id)) || false,
    };
  }

  async findEligibleBookingsForReview(tourId: number, userId: bigint) {
    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    const bookings = await this.prisma.booking.findMany({
      where: {
        tourId: BigInt(tourId),
        userId,
        bookingStatus: {
          in: ["confirmed", "completed"],
        } as any,
      },
      include: {
        tour: {
          select: {
            id: true,
            name: true,
          },
        },
        departure: {
          select: {
            id: true,
            departureDate: true,
            endDate: true,
          },
        },
        payments: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const bookingIds = bookings.map((item) => BigInt(item.id));

    const existedReviews = bookingIds.length
      ? await this.prisma.review.findMany({
          where: {
            userId,
            bookingId: {
              in: bookingIds,
            },
          },
          select: {
            bookingId: true,
          },
        })
      : [];

    const reviewedMap = new Map<string, boolean>();
    for (const item of existedReviews) {
      if (item.bookingId) reviewedMap.set(String(item.bookingId), true);
    }

    return bookings
      .filter((booking) => this.isPaidBooking(booking))
      .filter((booking) => this.isFinishedBooking(booking))
      .map((booking) => this.mapEligibleReviewBooking(booking, reviewedMap));
  }

  async create(
    dto: CreateReviewDto,
    userId: bigint,
    files: Array<Express.Multer.File> = [],
  ) {
    const tourId = Number(dto.tourId);
    const rating = Number(dto.rating);

    if (!tourId || Number.isNaN(tourId)) {
      throw new BadRequestException("Mã tour không hợp lệ.");
    }

    if (!rating || rating < 1 || rating > 5) {
      throw new BadRequestException("Số sao đánh giá phải từ 1 đến 5.");
    }

    if (files.length > 5) {
      throw new BadRequestException("Mỗi đánh giá chỉ được tải tối đa 5 ảnh.");
    }

    const tour = await this.prisma.tour.findUnique({
      where: { id: BigInt(tourId) },
      select: { id: true },
    });

    if (!tour) {
      throw new NotFoundException("Tour not found");
    }

    let booking: any = null;

    if (dto.bookingId) {
      booking = await this.prisma.booking.findFirst({
        where: {
          id: BigInt(dto.bookingId),
          tourId: BigInt(tourId),
          userId,
        },
        include: {
          departure: true,
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });

      if (!booking) {
        throw new BadRequestException(
          "Không tìm thấy booking hợp lệ thuộc tài khoản của bạn.",
        );
      }
    } else {
      const eligibleBookings = await this.prisma.booking.findMany({
        where: {
          tourId: BigInt(tourId),
          userId,
          bookingStatus: {
            in: ["confirmed", "completed"],
          } as any,
        },
        include: {
          departure: true,
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      for (const item of eligibleBookings) {
        const existed = await this.prisma.review.findFirst({
          where: {
            bookingId: item.id,
            userId,
          },
          select: {
            id: true,
          },
        });

        if (
          this.isPaidBooking(item) &&
          this.isFinishedBooking(item) &&
          !existed
        ) {
          booking = item;
          break;
        }
      }
    }

    if (!booking) {
      throw new BadRequestException(
        "Bạn chỉ có thể đánh giá sau khi đã đặt tour, thanh toán thành công và chuyến đi đã kết thúc.",
      );
    }

    const invalidStatus = [
      "cancelled",
      "canceled",
      "expired",
      "refunded",
      "failed",
    ];

    if (
      invalidStatus.includes(String(booking.bookingStatus || "").toLowerCase())
    ) {
      throw new BadRequestException(
        "Booking đã hủy, hết hạn hoặc hoàn tiền nên không thể đánh giá.",
      );
    }

    if (!this.isPaidBooking(booking)) {
      throw new BadRequestException(
        "Bạn chỉ có thể đánh giá sau khi thanh toán tour thành công.",
      );
    }

    if (!this.isFinishedBooking(booking)) {
      throw new BadRequestException(
        "Bạn chỉ có thể đánh giá sau khi chuyến đi đã kết thúc.",
      );
    }

    const existed = await this.prisma.review.findFirst({
      where: {
        bookingId: booking.id,
        userId,
      },
      select: {
        id: true,
      },
    });

    if (existed) {
      throw new BadRequestException("Bạn đã đánh giá booking này rồi.");
    }

    const created = await this.prisma.review.create({
      data: {
        tourId: BigInt(tourId),
        bookingId: booking.id,
        userId,
        rating,
        comment: dto.comment?.trim() || null,
        status: "approved" as any,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO review_media 
          (review_id, file_url, media_type, display_order)
        VALUES 
          (?, ?, 'image', ?)
        `,
        String(created.id),
        `/uploads/reviews/${file.filename}`,
        index + 1,
      );
    }

    const reviewPoints = 50 + (files.length > 0 ? 20 : 0);

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { memberPoints: true, memberTier: true },
      });

      if (!currentUser) return null;

      const nextPoints = Number(currentUser.memberPoints || 0) + reviewPoints;
      const nextTier = this.calculateMemberTier(nextPoints);

      const user = await tx.user.update({
        where: { id: userId },
        data: {
          memberPoints: nextPoints,
          memberTier: nextTier as any,
        },
        select: { memberPoints: true, memberTier: true },
      });

      await tx.notification.create({
        data: {
          title: `Cảm ơn bạn đã đánh giá tour`,
          message: `Bạn được cộng ${reviewPoints} điểm thành viên.`,
          content: `Cảm ơn bạn đã đánh giá tour. Travela đã cộng ${reviewPoints} điểm thành viên vào tài khoản của bạn. Tổng điểm hiện tại: ${nextPoints}. Hạng thành viên: ${nextTier}.`,
          targetRole: "user",
          targetUserId: userId,
          isPublished: true,
        },
      });

      return user;
    });

    const withMedia = await this.attachMediaToReviews([created]);

    return {
      ...this.mapReview(withMedia[0]),
      membershipReward: {
        earnedPoints: reviewPoints,
        totalPoints: Number(updatedUser?.memberPoints || 0),
        memberTier: updatedUser?.memberTier || "bronze",
      },
    };
  }

  async adminList(query: AdminReviewQuery) {
    const { page, pageSize, skip } = this.pageParams(
      query.page,
      query.pageSize,
    );

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.tourId) where.tourId = BigInt(query.tourId);

    const rating = Number(query.rating || 0);
    if (rating >= 1 && rating <= 5) where.rating = rating;

    if (query.hasMedia === "true" || query.hasMedia === "1") {
      const ids = await this.getReviewIdsWithMediaAll();

      if (!ids.length) {
        return {
          items: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 1,
          },
        };
      }

      where.id = { in: ids };
    } else if (query.hasMedia === "false" || query.hasMedia === "0") {
      const ids = await this.getReviewIdsWithMediaAll();
      if (ids.length) {
        where.id = { notIn: ids };
      }
    }

    if (query.search) {
      where.OR = [
        { comment: { contains: query.search } },
        { adminReply: { contains: query.search } },
        { tour: { is: { name: { contains: query.search } } } },
        { user: { is: { fullName: { contains: query.search } } } },
        { user: { is: { email: { contains: query.search } } } },
      ];
    }

    const allowedSortFields = new Set([
      "createdAt",
      "rating",
      "status",
      "updatedAt",
    ]);
    const requestedSortBy = String(query.sortBy || "createdAt");
    const sortBy = allowedSortFields.has(requestedSortBy)
      ? requestedSortBy
      : "createdAt";
    const sortOrder =
      String(query.sortOrder || "desc").toLowerCase() === "asc"
        ? "asc"
        : "desc";

    const [rawItems, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        // Sắp xếp toàn bộ dữ liệu trước khi skip/take.
        orderBy: [{ [sortBy]: sortOrder } as any, { id: sortOrder }],
        include: {
          tour: { select: { id: true, name: true } },
          user: {
            select: { id: true, fullName: true, email: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const items = await this.attachMediaToReviews(rawItems);

    return {
      items: items.map((item) => this.mapReview(item)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async adminReply(id: number, dto: AdminUpsertReviewDto) {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException("Mã đánh giá không hợp lệ.");
    }

    const existing = await this.prisma.review.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) throw new NotFoundException("Review not found");

    const reply = dto.adminReply?.trim() || null;
    const nextStatus = dto.status || (reply ? "approved" : existing.status);

    const updated = await this.prisma.review.update({
      where: { id: BigInt(id) },
      data: {
        adminReply: reply,
        adminReplyAt: reply ? new Date() : null,
        status: nextStatus as any,
      },
      include: {
        tour: { select: { id: true, name: true } },
        user: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
    });

    const withMedia = await this.attachMediaToReviews([updated]);

    return this.mapReview(withMedia[0]);
  }

  async adminDelete(id: number) {
    if (!id || Number.isNaN(id)) {
      throw new BadRequestException("Mã đánh giá không hợp lệ.");
    }

    const existing = await this.prisma.review.findUnique({
      where: { id: BigInt(id) },
    });

    if (!existing) throw new NotFoundException("Review not found");

    const mediaMap = await this.loadMediaMap([BigInt(id)]);
    const mediaItems = mediaMap.get(String(id)) || [];

    await this.prisma.review.delete({
      where: { id: BigInt(id) },
    });

    for (const media of mediaItems) {
      await this.removeUploadedFile(media.fileUrl || media.file_url);
    }

    return { success: true };
  }
}
