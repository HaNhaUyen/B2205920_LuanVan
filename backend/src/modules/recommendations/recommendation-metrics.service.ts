import { Injectable } from "@nestjs/common";

@Injectable()
export class RecommendationMetricsService {
  precisionAtK(recommendedIds: string[], relevantIds: Set<string>, k = 10) {
    const top = recommendedIds.slice(0, k);
    if (!top.length) return 0;
    const hits = top.filter((id) => relevantIds.has(String(id))).length;
    return hits / top.length;
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
    for (let i = 0; i < top.length; i += 1) {
      const rel = relevantIds.has(String(top[i])) ? 1 : 0;
      dcg += rel / Math.log2(i + 2);
    }
    const idealHits = Math.min(relevantIds.size, k);
    let idcg = 0;
    for (let i = 0; i < idealHits; i += 1) idcg += 1 / Math.log2(i + 2);
    return idcg ? dcg / idcg : 0;
  }

  coverage(recommendedLists: string[][], totalTourCount: number) {
    if (!totalTourCount) return 0;
    const unique = new Set(recommendedLists.flat().map(String));
    return unique.size / totalTourCount;
  }

  diversity(recommendedIds: string[], tourMap: Map<string, any>) {
    if (recommendedIds.length <= 1) return 0;
    let pairs = 0;
    let diverse = 0;
    for (let i = 0; i < recommendedIds.length; i += 1) {
      for (let j = i + 1; j < recommendedIds.length; j += 1) {
        pairs += 1;
        const a = tourMap.get(String(recommendedIds[i]));
        const b = tourMap.get(String(recommendedIds[j]));
        if (!a || !b) continue;
        if (String(a.destinationId) !== String(b.destinationId)) diverse += 0.6;
        if (String(a.tourTheme) !== String(b.tourTheme)) diverse += 0.4;
      }
    }
    return pairs ? diverse / pairs : 0;
  }
}
