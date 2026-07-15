import { Injectable } from "@nestjs/common";

@Injectable()
export class RecommendationMetricsService {
  precisionAtK(recommendedIds: string[], relevantIds: Set<string>, k = 10) {
    if (k <= 0) return 0;
    const top = recommendedIds.slice(0, k);
    const hits = top.filter((id) => relevantIds.has(String(id))).length;
    // Precision@K chuẩn dùng K làm mẫu số.
    return hits / k;
  }

  recallAtK(recommendedIds: string[], relevantIds: Set<string>, k = 10) {
    if (!relevantIds.size) return 0;
    const top = recommendedIds.slice(0, k);
    const hits = top.filter((id) => relevantIds.has(String(id))).length;
    return hits / relevantIds.size;
  }

  ndcgAtK(recommendedIds: string[], relevantIds: Set<string>, k = 10) {
    const top = recommendedIds.slice(0, k);
    let dcg = 0;

    for (let index = 0; index < top.length; index += 1) {
      const relevance = relevantIds.has(String(top[index])) ? 1 : 0;
      dcg += relevance / Math.log2(index + 2);
    }

    const idealHits = Math.min(relevantIds.size, k);
    let idcg = 0;
    for (let index = 0; index < idealHits; index += 1) {
      idcg += 1 / Math.log2(index + 2);
    }

    return idcg ? dcg / idcg : 0;
  }

  coverage(recommendedLists: string[][], totalTourCount: number) {
    if (!totalTourCount) return 0;
    const uniqueTourIds = new Set(recommendedLists.flat().map(String));
    return uniqueTourIds.size / totalTourCount;
  }

  diversity(recommendedIds: string[], tourMap: Map<string, any>) {
    if (recommendedIds.length <= 1) return 0;

    let pairs = 0;
    let diversityScore = 0;

    for (let i = 0; i < recommendedIds.length; i += 1) {
      for (let j = i + 1; j < recommendedIds.length; j += 1) {
        const first = tourMap.get(String(recommendedIds[i]));
        const second = tourMap.get(String(recommendedIds[j]));
        if (!first || !second) continue;

        pairs += 1;
        if (String(first.destinationId) !== String(second.destinationId)) {
          diversityScore += 0.6;
        }
        if (String(first.tourTheme) !== String(second.tourTheme)) {
          diversityScore += 0.4;
        }
      }
    }

    return pairs ? diversityScore / pairs : 0;
  }
}
