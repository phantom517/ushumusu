import { chatComplete, extractJson } from './openRouterService';
import { similarityService } from './similarityService';

export interface MindReading {
  vibe: string;
  /** Vector-refined closeness 0–99; null when embeddings were unavailable. */
  closeness: number | null;
}

const SYSTEM_PROMPT = `You are the warm host of "Mind Meld", a cozy two-player game for a couple.
Both partners silently wrote ONE word, hoping to write the SAME word. You see both words.
Reply with ONLY minified JSON, no markdown fences, matching exactly:
{"vibe":string}
Rules for "vibe":
- ONE very short sentence (max 12 words) in VERY simple English.
- Playful, warm and family-friendly. No difficult words, no idioms.
- Comment on how close their minds feel, given the two words.
- Examples: "Your minds are almost holding hands!", "Two words, one big brain connection.", "Different words, but your hearts agree."`;

const FALLBACK_VIBES = [
  'Your minds are almost holding hands!',
  'Two words, one big brain connection.',
  'Different words, but your hearts agree.',
  'Not twins yet — keep dreaming together!',
  'So close. The universe is listening.',
  'Two hearts, two words — try once more!',
];

/**
 * Generates the full "mind closeness" reading for a revealed round:
 * the playful AI vibe line AND a vector-refined closeness score, in
 * parallel. De-duplicates per room+round so both clients' traffic can
 * never trigger it twice. When embeddings fail, closeness stays null and
 * the client keeps its instant string-distance estimate.
 */
class ClosenessService {
  private inflight = new Set<string>();

  public async getReading(roomId: string, roundIndex: number, wordA: string, wordB: string): Promise<MindReading> {
    const key = `${roomId}:${roundIndex}`;
    if (this.inflight.has(key)) return { vibe: '', closeness: null };
    if (this.inflight.size > 500) this.inflight.clear();
    this.inflight.add(key);

    try {
      const [vibe, closeness] = await Promise.all([
        this.generateVibe(wordA, wordB),
        similarityService.getPairCloseness(wordA, wordB),
      ]);
      return { vibe, closeness };
    } finally {
      this.inflight.delete(key);
    }
  }

  private async generateVibe(wordA: string, wordB: string): Promise<string> {
    try {
      const raw = await chatComplete({
        system: SYSTEM_PROMPT,
        user: `Person A wrote "${wordA}". Person B wrote "${wordB}".`,
        maxTokens: 120,
        timeoutMs: 20000,
      });
      if (!raw) return this.fallback();

      const payload = extractJson(raw);
      const vibe = payload && typeof payload.vibe === 'string' ? payload.vibe.trim() : '';
      if (vibe && vibe.length <= 140) return vibe;

      console.warn('[ClosenessService] AI vibe payload invalid, using fallback.');
      return this.fallback();
    } catch (err: any) {
      console.warn(`[ClosenessService] vibe failed: ${err?.message || err}`);
      return this.fallback();
    }
  }

  private fallback(): string {
    return FALLBACK_VIBES[Math.floor(Math.random() * FALLBACK_VIBES.length)];
  }
}

export const closenessService = new ClosenessService();
