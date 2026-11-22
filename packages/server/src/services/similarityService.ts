import { embedTexts } from './openRouterService';
import { mindVectorCloseness } from '@tether/shared';

/**
 * Semantic word closeness using REAL embedding vectors.
 *
 * Both words are embedded in a single OpenRouter request, then compared by
 * cosine similarity and calibrated to the game's 0–99 scale. Unlike the
 * string-distance fallback, this understands that "love" and "romance" are
 * close while "kiss" and "miss" (1 edit apart) are not.
 *
 * Results are cached per normalized pair and identical concurrent requests
 * collapse into one embed call.
 */
class SimilarityService {
  private cache = new Map<string, number>();
  private inflight = new Map<string, Promise<number | null>>();

  public async getPairCloseness(wordA: string, wordB: string): Promise<number | null> {
    const a = wordA.trim().toLowerCase();
    const b = wordB.trim().toLowerCase();
    if (!a || !b) return null;
    if (a === b) return 99; // exact match — the game treats this as a win anyway

    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const task = this.compute(key, a, b);
    this.inflight.set(key, task);
    return task;
  }

  private async compute(key: string, a: string, b: string): Promise<number | null> {
    try {
      const vectors = await embedTexts([a, b], { timeoutMs: 15000 });
      if (!vectors || vectors.length !== 2) return null;
      const score = mindVectorCloseness(cosineSimilarity(vectors[0], vectors[1]));
      if (this.cache.size > 3000) this.cache.clear();
      this.cache.set(key, score);
      return score;
    } catch (err: any) {
      console.warn(`[Similarity] pair failed: ${err?.message || err}`);
      return null;
    } finally {
      this.inflight.delete(key);
    }
  }
}

/** Standard cosine similarity between two equal-length vectors. */
export function cosineSimilarity(u: number[], v: number[]): number {
  if (!u.length || u.length !== v.length) return 0;
  let dot = 0;
  let nu = 0;
  let nv = 0;
  for (let i = 0; i < u.length; i++) {
    dot += u[i] * v[i];
    nu += u[i] * u[i];
    nv += v[i] * v[i];
  }
  const denom = Math.sqrt(nu) * Math.sqrt(nv);
  return denom ? dot / denom : 0;
}

export const similarityService = new SimilarityService();
