import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { MatrixFactorizationService } from "../modules/recommendations/matrix-factorization.service";
import { DeepRecommendationService } from "../modules/recommendations/deep-recommendation.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const matrix = app.get(MatrixFactorizationService);
    const semantic = app.get(DeepRecommendationService);

    console.log("[1/2] Train Matrix Factorization...");
    const matrixResult = await matrix.train({
      k: Number(process.env.RECO_MF_K || 10),
      epochs: Number(process.env.RECO_MF_EPOCHS || 45),
      lr: Number(process.env.RECO_MF_LR || 0.025),
      lambda: Number(process.env.RECO_MF_LAMBDA || 0.04),
      sinceDays: Number(process.env.RECO_TRAIN_SINCE_DAYS || 365),
      maxToursPerUser: Number(process.env.RECO_MAX_TOURS_PER_USER || 25),
    });

    console.log("[2/2] Rebuild tour semantic embeddings...");
    const embeddingResult = await semantic.rebuildTourEmbeddings();

    const result = {
      generatedAt: new Date().toISOString(),
      matrixFactorization: matrixResult,
      semanticEmbeddings: embeddingResult,
    };

    const output = resolve(
      process.cwd(),
      "scripts/recommendation_training_result.json",
    );
    await mkdir(resolve(process.cwd(), "scripts"), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2), "utf8");
    console.log(`Hoàn tất. Kết quả: ${output}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("Train hệ thống gợi ý thất bại:", error);
  process.exitCode = 1;
});
