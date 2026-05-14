import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { AdminUpsertReviewDto } from './dto/admin-upsert-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTour(tourId: number, userId?: bigint) {
    const items = await this.prisma.review.findMany({
      where: {
        tourId: BigInt(tourId),
        OR: userId
          ? [{ status: 'approved' }, { userId, status: { in: ['pending', 'approved'] } }]
          : [{ status: 'approved' }],
      },
      include: { user: { select: { fullName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const unique = new Map<string, any>();
    for (const item of items) unique.set(String(item.id), item);
    return Array.from(unique.values());
  }

  async create(dto: CreateReviewDto, userId?: bigint) {
    const tour = await this.prisma.tour.findUnique({ where: { id: BigInt(dto.tourId) } });
    if (!tour) throw new NotFoundException('Tour not found');
    if (dto.bookingId) {
      const booking = await this.prisma.booking.findUnique({ where: { id: BigInt(dto.bookingId) } });
      if (!booking) throw new NotFoundException('Booking not found');
      if (userId && booking.userId && String(booking.userId) !== String(userId)) {
        throw new BadRequestException('Bạn chỉ được đánh giá booking của chính mình.');
      }
    }
    return this.prisma.review.create({
      data: {
        tourId: BigInt(dto.tourId),
        bookingId: dto.bookingId ? BigInt(dto.bookingId) : null,
        userId,
        rating: dto.rating,
        comment: dto.comment,
        status: 'pending',
      },
    });
  }

  async adminList(query: { page?: string; pageSize?: string; search?: string; status?: string; tourId?: string }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.tourId) where.tourId = BigInt(query.tourId);
    if (query.search) {
      where.OR = [
        { comment: { contains: query.search } },
        { adminReply: { contains: query.search } },
        { tour: { is: { name: { contains: query.search } } } },
        { user: { is: { fullName: { contains: query.search } } } },
        { user: { is: { email: { contains: query.search } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { tour: { select: { id: true, name: true } }, user: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async adminReply(id: number, dto: AdminUpsertReviewDto) {
    const existing = await this.prisma.review.findUnique({ where: { id: BigInt(id) } });
    if (!existing) throw new NotFoundException('Review not found');

    const reply = dto.adminReply?.trim() || null;
    const nextStatus = dto.status || (reply ? 'approved' : existing.status);

    return this.prisma.review.update({
      where: { id: BigInt(id) },
      data: {
        adminReply: reply,
        adminReplyAt: reply ? new Date() : null,
        status: nextStatus,
      },
      include: { tour: { select: { id: true, name: true } }, user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async adminDelete(id: number) {
    const existing = await this.prisma.review.findUnique({ where: { id: BigInt(id) } });
    if (!existing) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }
}
