import { describe, test, expect, mock, beforeEach } from 'bun:test';

/**
 * The OpenRouter layer is mocked so these tests verify the VECTOR math and
 * the reading pipeline without network traffic.
 */
let embedCalls = 0;
let embedVectors: number[][] | null = [
  [1, 0],
  [0.8, 0.6],
];
let chatReply: string | null = '{"vibe":"Close minds!"}';

mock.module('./openRouterService', () => ({
  chatComplete: async () => chatReply,
  extractJson: (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  embedTexts: async () => {
    embedCalls++;
    return embedVectors;
  },
  backoff: async () => {},
}));

const { similarityService, cosineSimilarity } = await import('./similarityService');
const { closenessService } = await import('./closenessService');
const { mindVectorCloseness } = await import('@tether/shared');

beforeEach(() => {
  embedCalls = 0;
  embedVectors = [
    [1, 0],
    [0.8, 0.6],
  ];
  chatReply = '{"vibe":"Close minds!"}';
});

describe('similarityService (vector closeness)', () => {
  test('cosineSimilarity computes plain dot-product similarity', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0.8, 0.6])).toBeCloseTo(0.8, 5);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0); // mismatched lengths
  });

  test('identical words short-circuit to 99 without embedding', async () => {
    const score = await similarityService.getPairCloseness('Moon', ' moon ');
    expect(score).toBe(99);
    expect(embedCalls).toBe(0);
  });

  test('pair closeness is calibrated from the real cosine and cached', async () => {
    const expected = mindVectorCloseness(0.8);
    const score = await similarityService.getPairCloseness('love', 'romance');
    expect(score).toBe(expected);
    expect(embedCalls).toBe(1); // one request embeds both words

    // Second call hits the cache — no new embedding request
    const again = await similarityService.getPairCloseness('ROMANCE', 'love');
    expect(again).toBe(expected);
    expect(embedCalls).toBe(1);
  });

  test('embedding failure returns null (client keeps its local estimate)', async () => {
    embedVectors = null;
    const score = await similarityService.getPairCloseness('kiss', 'math');
    expect(score).toBeNull();
  });
});

describe('closenessService.getReading (vibe + vector in parallel)', () => {
  test('returns the AI vibe and the vector-refined score together', async () => {
    const reading = await closenessService.getReading('room-v', 0, 'love', 'romance');
    expect(reading.vibe).toBe('Close minds!');
    expect(reading.closeness).toBe(mindVectorCloseness(0.8));
  });

  test('chat failure still yields a fallback vibe and the vector score', async () => {
    chatReply = null;
    const reading = await closenessService.getReading('room-v', 1, 'sun', 'moon');
    expect(reading.vibe.length).toBeGreaterThan(0);
    expect(reading.vibe).not.toBe(''); // deterministic fallback line
    expect(reading.closeness).toBeGreaterThan(0);
    chatReply = '{"vibe":"Close minds!"}';
  });

  test('duplicate reads for the same room+round are de-duplicated', async () => {
    // Both partners' completing submits can fire the read concurrently —
    // only the first should do the work.
    const [first, second] = await Promise.all([
      closenessService.getReading('room-dedupe', 0, 'star', 'sky'),
      closenessService.getReading('room-dedupe', 0, 'star', 'sky'),
    ]);
    expect(second.vibe).toBe('');
    expect(second.closeness).toBeNull();
    expect(first.vibe).toBe('Close minds!');
  });
});
