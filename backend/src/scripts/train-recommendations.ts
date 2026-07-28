import "reflect-metadata";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { MatrixFactorizationService } from "../modules/recommendations/matrix-factorization.service";
import { DeepRecommendationService } from "../modules/recommendations/deep-recommendation.service";

function envNumber(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });

  try {
    const matrix = app.get(MatrixFactorizationService);
    const semantic = app.get(DeepRecommendationService);

    const options = {
      k: Math.round(envNumber("RECO_MF_K", 10, 2, 100)),
      epochs: Math.round(envNumber("RECO_MF_EPOCHS", 45, 1, 500)),
      lr: envNumber("RECO_MF_LR", 0.025, 0.00001, 1),
      lambda: envNumber("RECO_MF_LAMBDA", 0.04, 0, 10),
      sinceDays: Math.round(envNumber("RECO_TRAIN_SINCE_DAYS", 365, 30, 3650)),
      maxToursPerUser: Math.round(
        envNumber("RECO_MAX_TOURS_PER_USER", 25, 4, 500),
      ),
      maxBehaviors: Math.round(
        envNumber("RECO_MAX_TRAIN_BEHAVIORS", 50000, 1000, 1000000),
      ),
    };

    console.log("[1/2] Train Matrix Factorization...");
    console.table(options);
    const matrixResult = await matrix.train(options);

    console.log("[2/2] Rebuild tour semantic embeddings...");
    const embeddingResult = await semantic.rebuildTourEmbeddings();

    const result = {
      generatedAt: new Date().toISOString(),
      options,
      matrixFactorization: matrixResult,
      semanticEmbeddings: embeddingResult,
    };

    const output = resolve(
      process.cwd(),
      "scripts/recommendation_training_result.json",
    );
    await mkdir(resolve(process.cwd(), "scripts"), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        result,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
      "utf8",
    );

    console.log(`Hoàn tất. Kết quả: ${output}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error("Train hệ thống gợi ý thất bại:", error);
  process.exitCode = 1;
});
