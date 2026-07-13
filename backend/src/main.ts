import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";

import { AppModule } from "./app.module";
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
    }),
  );

  app.useGlobalInterceptors(new BigIntInterceptor());

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
