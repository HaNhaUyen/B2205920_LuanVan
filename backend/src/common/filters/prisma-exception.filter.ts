import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const mapped = this.mapException(exception);
    const status = mapped.getStatus();
    const body = mapped.getResponse();

    response.status(status).json(
      typeof body === "string"
        ? {
            statusCode: status,
            message: body,
            error: mapped.name,
          }
        : body,
    );
  }

  private mapException(error: Prisma.PrismaClientKnownRequestError): HttpException {
    if (error.code === "P2002") {
      return new ConflictException(this.uniqueMessage(error));
    }

    if (error.code === "P2003") {
      return new ConflictException(
        "Không thể thực hiện vì dữ liệu đang được sử dụng.",
      );
    }

    if (error.code === "P2025") {
      return new NotFoundException("Không tìm thấy dữ liệu cần xử lý.");
    }

    return new ConflictException("Không thể xử lý dữ liệu hiện tại.");
  }

  private uniqueMessage(error: Prisma.PrismaClientKnownRequestError) {
    const target = Array.isArray((error.meta as any)?.target)
      ? ((error.meta as any).target as string[])
      : [];

    if (target.includes("active_key") || target.includes("activeKey")) {
      return "Booking này đã có yêu cầu hoàn tiền đang được xử lý.";
    }

    return "Dữ liệu đã tồn tại trong hệ thống.";
  }
}
