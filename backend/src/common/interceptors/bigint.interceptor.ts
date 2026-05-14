import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { map, Observable } from 'rxjs';

function normalizeScalar(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Decimal) {
    const text = value.toString();
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : text;
  }

  return value;
}

function normalizePayload(value: unknown): unknown {
  const normalizedScalar = normalizeScalar(value);
  if (normalizedScalar !== value) return normalizedScalar;

  if (value instanceof Date) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizePayload);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        normalizePayload(nested),
      ]),
    );
  }

  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => normalizePayload(data)));
  }
}
