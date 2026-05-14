import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertFaqDto } from './dto/upsert-faq.dto';

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.faq.findMany({
      where: { status: 'active' },
      orderBy: [{ displayOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async adminList(query: { page?: string; pageSize?: string; search?: string; status?: string; topic?: string }) {
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || 10), 1), 100);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.topic) where.topic = { contains: query.topic };
    if (query.search) {
      where.OR = [
        { question: { contains: query.search } },
        { answer: { contains: query.search } },
        { topic: { contains: query.search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.faq.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ displayOrder: 'asc' }, { updatedAt: 'desc' }],
      }),
      this.prisma.faq.count({ where }),
    ]);

    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  adminCreate(dto: UpsertFaqDto) {
    return this.prisma.faq.create({
      data: {
        question: dto.question,
        answer: dto.answer,
        topic: dto.topic,
        status: dto.status ?? 'active',
        displayOrder: dto.displayOrder ?? 1,
      },
    });
  }

  async adminUpdate(id: number, dto: UpsertFaqDto) {
    const existing = await this.prisma.faq.findUnique({ where: { id: BigInt(id) } });
    if (!existing) throw new NotFoundException('FAQ not found');

    return this.prisma.faq.update({
      where: { id: BigInt(id) },
      data: {
        question: dto.question,
        answer: dto.answer,
        topic: dto.topic,
        status: dto.status ?? existing.status,
        displayOrder: dto.displayOrder ?? existing.displayOrder,
      },
    });
  }

  async adminDelete(id: number) {
    const existing = await this.prisma.faq.findUnique({ where: { id: BigInt(id) } });
    if (!existing) throw new NotFoundException('FAQ not found');
    await this.prisma.faq.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }
}
