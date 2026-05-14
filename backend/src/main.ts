import { ValidationPipe } from "@nestjs/common";
import { BigIntInterceptor } from "./common/interceptors/bigint.interceptor";
import { NestFactory } from "@nestjs/core";
import { join } from "path";
import { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  app.useStaticAssets(join(process.cwd(), "uploads"), {
    prefix: "/uploads",
  });

  app.setGlobalPrefix("api");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalInterceptors(new BigIntInterceptor());

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  const port = Number(process.env.PORT || 3001);
  const host = "0.0.0.0";

  await app.listen(port, host);

  console.log(`Backend running on http://localhost:${port}/api`);
  console.log(`Backend LAN access: http://YOUR_IPV4_ADDRESS:${port}/api`);
}

bootstrap();
