import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { RecommendationEvalService } from "../modules/recommendations/recommendation-eval.service";

function parseKValues(value: string | undefined): number[] {
  const values = String(value || "3,5,10")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0 && item <= 100);

  return values.length ? [...new Set(values)] : [3, 5, 10];
}

async function main() {
  const kValues = parseKValues(process.argv[2]);
  const outputPath = resolve(
    process.cwd(),
    process.argv[3] || "scripts/recommendation_metrics_real.json",
  );

  // Chỉ chọn một K mục tiêu cho production để tránh mỗi K trả về một bộ trọng số khác nhau.
  // Mặc định K=3 vì giao diện Travela hiển thị 3 tour gợi ý.
  const productionK = Number(process.env.RECO_PRODUCTION_TOP_K || 3);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const evaluator = app.get(RecommendationEvalService);
    const runs = [];

    for (const k of kValues) {
      console.log(`\nĐang đánh giá K=${k}...`);
      const result = await evaluator.evaluate(k);
      runs.push(result);

      console.log(`\nKẾT QUẢ ĐÁNH GIÁ THẬT - K=${k}`);
      console.table(result.result);
      console.log(`Số tour đang xuất bản: ${result.dataset.activeTours}`);
      console.log(`Số hành vi đã đọc: ${result.dataset.loadedBehaviors}`);
      console.log(`Số người dùng hợp lệ: ${result.dataset.eligibleUsers}`);
      console.log(
        `Số người dùng được đánh giá: ${result.dataset.evaluatedUsers}`,
      );

      const env = result.recommendedProductionEnv;
      if (env) {
        console.log("\nTRỌNG SỐ CHỌN TRÊN VALIDATION CHO LẦN CHẠY NÀY:");
        console.log(
          `RECO_HYBRID_CONTENT_WEIGHT=${env.RECO_HYBRID_CONTENT_WEIGHT}`,
        );
        console.log(
          `RECO_HYBRID_COLLABORATIVE_WEIGHT=${env.RECO_HYBRID_COLLABORATIVE_WEIGHT}`,
        );
        console.log(`RECO_HYBRID_MF_WEIGHT=${env.RECO_HYBRID_MF_WEIGHT}`);
        console.log(
          `RECO_HYBRID_SEMANTIC_WEIGHT=${env.RECO_HYBRID_SEMANTIC_WEIGHT}`,
        );
      }
    }

    const productionRun =
      runs.find((run: any) => Number(run?.k) === productionK) ||
      runs[kValues.indexOf(productionK)] ||
      runs[0];

    const productionEnv = productionRun?.recommendedProductionEnv || null;

    if (productionEnv) {
      console.log(
        `\nTRỌNG SỐ ĐỀ XUẤT CHÍNH THỨC CHO PRODUCTION - K=${productionK}:`,
      );
      console.log(
        `RECO_HYBRID_CONTENT_WEIGHT=${productionEnv.RECO_HYBRID_CONTENT_WEIGHT}`,
      );
      console.log(
        `RECO_HYBRID_COLLABORATIVE_WEIGHT=${productionEnv.RECO_HYBRID_COLLABORATIVE_WEIGHT}`,
      );
      console.log(
        `RECO_HYBRID_MF_WEIGHT=${productionEnv.RECO_HYBRID_MF_WEIGHT}`,
      );
      console.log(
        `RECO_HYBRID_SEMANTIC_WEIGHT=${productionEnv.RECO_HYBRID_SEMANTIC_WEIGHT}`,
      );
    }

    const output = {
      generatedAt: new Date().toISOString(),
      kValues,
      productionK,
      productionEnv,
      runs,
    };

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify(
        output,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
      "utf8",
    );

    console.log(`\nĐã ghi toàn bộ kết quả vào: ${outputPath}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("Đánh giá hệ thống gợi ý thất bại:", error);
  process.exitCode = 1;
});
