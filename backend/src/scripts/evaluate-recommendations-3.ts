import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RecommendationEvalService } from "../modules/recommendations/recommendation-eval.service";

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function main() {
  const k = parsePositiveInteger(process.argv[2], 10);
  const outputPath = resolve(
    process.cwd(),
    process.argv[3] || "scripts/recommendation_metrics_real.json",
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const evaluator = app.get(RecommendationEvalService);
    const result = await evaluator.evaluate(k);

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify(
        result,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
      "utf8",
    );

    console.log("\nĐÁNH GIÁ THẬT TỪ DATABASE");
    console.table(result.result);
    console.log(`\nĐã ghi kết quả vào: ${outputPath}`);
    console.log(`Số tour đang xuất bản: ${result.dataset.activeTours}`);
    console.log(`Số hành vi đã đọc: ${result.dataset.loadedBehaviors}`);
    console.log(
      `Số người dùng được đánh giá: ${result.dataset.evaluatedUsers}`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("Đánh giá hệ thống gợi ý thất bại:", error);
  process.exitCode = 1;
});
