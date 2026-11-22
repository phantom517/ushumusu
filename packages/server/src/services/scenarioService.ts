import {
  AUCTION_CONFIG,
  AUCTION_FALLBACK_SCENARIOS,
  AuctionScenario,
} from '@tether/shared';
import { chatComplete, extractJson } from './openRouterService';

export interface PreparedScenario {
  id: string;
  scenario: AuctionScenario;
  items: { id: string; name: string; description: string; baseValue: number }[];
  source: 'ai' | 'fallback';
}

const SYSTEM_PROMPT = `You are the game master for "Survival Auction", a cozy two-player game for a couple.
Invent a survival scenario where the two partners are SEPARATED and each must survive alone.
Examples: the storm pushed their boat to two different islands, the outbreak split them into two different cities, a blizzard trapped them in two different cabins.
They are in the same story but in different places, far apart. They each build their own survival kit from the same item list. The winner of each item keeps it for their own kit.
Use VERY simple English: short sentences, easy everyday words, no difficult vocabulary, no idioms. Write so an English learner can read it easily.
Keep it playful and family-friendly: no gore, no sexual content, no cruelty.
Reply with ONLY minified JSON, no markdown fences, matching exactly:
{"title":string,"situation":string,"days":number,"budget":number,"items":[{"name":string,"description":string,"baseValue":number}]}
Rules:
- "title": short and evocative (max 6 words), made of simple words.
- "situation": 1-3 short sentences that say the partners are apart, each alone, and each needs their own gear.
- "days": how long they must survive (between 3 and 365).
- "budget": dollars each player gets to bid with (between 500 and 1500).
- "items": exactly 8 items, each with a name (max 5 words, simple words), a description (max 14 words, simple English) and a "baseValue" suggested auction price between 10 and 300.
- Items must be varied and each genuinely useful for the scenario. Never repeat an item across different scenarios.`;

interface GeneratedPayload {
  scenario: AuctionScenario;
  items: { name: string; description: string; baseValue: number }[];
}

function clampInt(value: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Validates and normalizes an AI payload. Returns null when unusable so the
 * caller can retry or fall back to local content.
 */
function normalizePayload(data: any): GeneratedPayload | null {
  if (!data || typeof data !== 'object') return null;

  const title = String(data.title || '').trim();
  const situation = String(data.situation || '').trim();
  const days = clampInt(data.days, AUCTION_CONFIG.MIN_DAYS, AUCTION_CONFIG.MAX_DAYS, 30);
  const budget = clampInt(data.budget, AUCTION_CONFIG.MIN_BUDGET, AUCTION_CONFIG.MAX_BUDGET, 1000);

  if (!title || title.length > 60) return null;
  if (!situation || situation.length > 400) return null;

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items = rawItems
    .map((it: any) => ({
      name: String(it?.name || '').trim(),
      description: String(it?.description || '').trim(),
      baseValue: clampInt(it?.baseValue, AUCTION_CONFIG.MIN_BASE_VALUE, AUCTION_CONFIG.MAX_BASE_VALUE, 50),
    }))
    .filter((it: any) => it.name && it.name.length <= 60 && it.description.length <= 160);

  if (items.length < AUCTION_CONFIG.MIN_ITEMS || items.length > AUCTION_CONFIG.MAX_ITEMS) {
    return null;
  }

  return {
    scenario: { title, situation, days, budget },
    items: items.slice(0, AUCTION_CONFIG.MAX_ITEMS),
  };
}

/**
 * Keeps an in-memory pool of survival scenarios. The game interface is
 * synchronous, so scenarios must exist before a room is created — this
 * service generates them in the background via OpenRouter (free models),
 * with hardcoded fallbacks so gameplay never blocks or fails.
 */
class ScenarioService {
  private pool: PreparedScenario[] = [];
  private usedIds = new Set<string>();
  private seenItemNames = new Set<string>();
  private toppingUp = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 0;

  public start(): void {
    if (this.timer) return;
    this.topUp(); // async seed, do not block server startup
    this.timer = setInterval(() => {
      if (this.pool.length < 2) this.topUp();
    }, 20000); // AI generation is slow — one top-up attempt every 20s
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

  /** Synchronously takes the next unused scenario (AI pool, else fallbacks). */
  public takeScenario(): PreparedScenario {
    let index = this.pool.findIndex((s) => !this.usedIds.has(s.id));
    if (index === -1) index = this.pool.findIndex((s) => !s.items.some((i) => this.seenItemNames.has(i.name)));
    if (index >= 0) {
      const [taken] = this.pool.splice(index, 1);
      this.usedIds.add(taken.id);
      taken.items.forEach((i) => this.seenItemNames.add(i.name));
      return taken;
    }

    const fallback = this.buildFallback(this.counter++ % AUCTION_FALLBACK_SCENARIOS.length);
    this.usedIds.add(fallback.id);
    fallback.items.forEach((i) => this.seenItemNames.add(i.name));
    return fallback;
  }

  private async topUp(): Promise<void> {
    if (this.toppingUp) return;
    this.toppingUp = true;
    try {
      const prepared = await this.generateOne();
      if (prepared) {
        this.pool.push(prepared);
        console.log(`[ScenarioService] AI scenario ready: "${prepared.scenario.title}" (pool: ${this.pool.length})`);
      }
    } finally {
      this.toppingUp = false;
    }
  }

  private async generateOne(): Promise<PreparedScenario | null> {
    // Two attempts per generation cycle, then give up until the next timer tick.
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await chatComplete({
        system: SYSTEM_PROMPT,
        user: `Invent a new survival auction scenario. Avoid these items already used: ${Array.from(this.seenItemNames).slice(-24).join(', ') || 'none'}.`,
        maxTokens: 900,
        timeoutMs: 45000,
      });
      if (!raw) return null;

      const payload = normalizePayload(extractJson(raw));
      if (payload) {
        this.counter++;
        return {
          id: `ai-${Date.now().toString(36)}-${this.counter}`,
          scenario: payload.scenario,
          items: payload.items.map((it, i) => ({ id: `item-${this.counter}-${i}`, ...it })),
          source: 'ai',
        };
      }
      console.warn('[ScenarioService] AI payload invalid, retrying once...');
    }
    return null;
  }

  private buildFallback(index: number): PreparedScenario {
    const source = AUCTION_FALLBACK_SCENARIOS[index % AUCTION_FALLBACK_SCENARIOS.length];
    const scenario: AuctionScenario = {
      title: source.title,
      situation: source.situation,
      days: source.days,
      budget: source.budget,
    };
    return {
      id: `local-${index}`,
      scenario,
      items: source.items.map((it, i) => ({
        id: `local-${index}-item-${i}`,
        name: it.name,
        description: it.description,
        baseValue: it.baseValue,
      })),
      source: 'fallback',
    };
  }
}

export const scenarioService = new ScenarioService();
