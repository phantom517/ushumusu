import { WYR_CONFIG, WYR_FALLBACK_QUESTIONS, parseWyrQuestion, WyrQuestion } from '@tether/shared';

interface PreparedQuestion extends WyrQuestion {
  source: 'api' | 'fallback';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Keeps an in-memory pool of Would You Rather questions pre-fetched from
 * truthordarebot.xyz. The game interface is synchronous, so questions must be
 * available instantly — this service tops the pool up in the background while
 * staying under the API's global rate limit of 5 requests / 5 seconds.
 */
class QuestionService {
  private pool: PreparedQuestion[] = [];
  private fallbacks: PreparedQuestion[];
  private usedIds = new Set<string>();
  private lastRequestAt = 0;
  private toppingUp = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.fallbacks = WYR_FALLBACK_QUESTIONS.map((raw, i) => {
      const parsed = parseWyrQuestion(raw, `local-${i}`);
      if (!parsed) {
        throw new Error(`[QuestionService] Invalid hardcoded fallback question #${i}`);
      }
      return { ...parsed, source: 'fallback' as const };
    });
  }

  public start(): void {
    if (this.timer) return;
    this.topUp(); // async seed, do not block server startup
    this.timer = setInterval(() => {
      if (this.pool.length < WYR_CONFIG.TARGET_POOL) {
        this.topUp();
      }
    }, 5000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public get poolSize(): number {
    return this.pool.length;
  }

  /**
   * Synchronously takes the next question, avoiding the given ids (e.g. ones
   * already asked in the current room). Falls back to the local list when the
   * API pool is empty, so game creation never blocks or fails.
   */
  public takeQuestion(excludeIds: string[] = []): PreparedQuestion {
    const skip = new Set(excludeIds);

    let index = this.pool.findIndex((q) => !skip.has(q.id) && !this.usedIds.has(q.id));
    if (index === -1) {
      index = this.pool.findIndex((q) => !skip.has(q.id));
    }
    if (index >= 0) {
      const [question] = this.pool.splice(index, 1);
      this.usedIds.add(question.id);
      return question;
    }

    // Pool exhausted — cycle the local fallbacks, skipping recently used ones.
    for (let i = 0; i < this.fallbacks.length; i++) {
      const candidate = this.fallbacks[i];
      if (!skip.has(candidate.id) && !this.usedIds.has(candidate.id)) {
        this.usedIds.add(candidate.id);
        return candidate;
      }
    }
    // Everything used already — repeat is acceptable rather than blocking.
    const fallback = this.fallbacks[0];
    this.usedIds.add(fallback.id);
    return fallback;
  }

  private async topUp(): Promise<void> {
    if (this.toppingUp) return;
    this.toppingUp = true;
    try {
      while (this.pool.length < WYR_CONFIG.TARGET_POOL) {
        await this.fetchOne();
      }
    } finally {
      this.toppingUp = false;
    }
  }

  private async fetchOne(): Promise<void> {
    // Respect the global 5/5s rate limit with a comfortable gap.
    const now = Date.now();
    const waitMs = this.lastRequestAt + WYR_CONFIG.REQUEST_GAP_MS - now;
    if (waitMs > 0) await sleep(waitMs);
    this.lastRequestAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WYR_CONFIG.API_TIMEOUT_MS);
    try {
      const res = await fetch(`${WYR_CONFIG.API_BASE_URL}/wyr?rating=${WYR_CONFIG.RATING}`, {
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: any = await res.json();
      const parsed = parseWyrQuestion(String(data?.question || ''), String(data?.id || ''));
      if (!parsed) return; // unparsable format — ignore, fallbacks cover us
      if (this.usedIds.has(parsed.id)) return;
      if (this.pool.some((q) => q.id === parsed.id)) return;
      this.pool.push({ ...parsed, source: 'api' });
    } catch (err: any) {
      console.warn(
        `[QuestionService] WYR fetch failed (${err?.message || err}). Pool size: ${this.pool.length}. Using fallbacks if needed.`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const questionService = new QuestionService();
