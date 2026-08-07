import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { createHash } from "node:crypto";

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T extends Record<string, any>>(input: {
    userId?: bigint | null;
    key?: string | null;
    operation: string;
    payload: unknown;
    handler: () => Promise<T>;
    resourceType?: string;
    resourceIdSelector?: (response: T) => bigint | number | string | null | undefined;
  }): Promise<T> {
    const key = String(input.key || "").trim();
    if (!key) return input.handler();

    const userId = input.userId ?? BigInt(0);
    const requestHash = this.hashPayload(input.payload);
    const existing = await this.prisma.idempotencyRequest.findUnique({
      where: {
        userId_key_operation: {
          userId,
          key,
          operation: input.operation,
        },
      },
    });

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException(
          "Idempotency-Key đã được sử dụng với nội dung yêu cầu khác.",
        );
      }
      if (existing.responseBody) return existing.responseBody as T;
      throw new ConflictException("Yêu cầu đang được xử lý, vui lòng thử lại.");
    }

    await this.prisma.idempotencyRequest.create({
      data: {
        userId,
        key,
        operation: input.operation,
        requestHash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    try {
      const response = await input.handler();
      const resourceId = input.resourceIdSelector?.(response);
      await this.prisma.idempotencyRequest.update({
        where: {
          userId_key_operation: {
            userId,
            key,
            operation: input.operation,
          },
        },
        data: {
          responseStatus: 200,
          responseBody: response as any,
          resourceType: input.resourceType || null,
          resourceId:
            resourceId === undefined || resourceId === null
              ? null
              : BigInt(resourceId),
        },
      });
      return response;
    } catch (error) {
      await this.prisma.idempotencyRequest.delete({
        where: {
          userId_key_operation: {
            userId,
            key,
            operation: input.operation,
          },
        },
      }).catch(() => null);
      throw error;
    }
  }

  private hashPayload(payload: unknown) {
    return createHash("sha256")
      .update(JSON.stringify(this.stable(payload)))
      .digest("hex");
  }

  private stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.stable(item));
    if (!value || typeof value !== "object") return value;
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = this.stable((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
}
