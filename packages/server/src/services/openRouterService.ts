import { config } from '../config';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBED_URL = 'https://openrouter.ai/api/v1/embeddings';

// Cheap, reliable embedding model — a two-word pair costs ~$0.00000004.
const EMBEDDING_MODEL = 'openai/text-embedding-3-small';

// Free-tier models, tried in order. gemma-4-31b-it reliably returns clean JSON.
const MODEL_CHAIN = [
  'google/gemma-4-31b-it',
  'nvidia/nemotron-3.5-lightning',
  'google/gemma-4-26b-a4b-it',
  'inclusionai/ling-3.2-flash',
];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface ChatOptions {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Minimal OpenRouter chat helper. Walks the free-model chain until one
 * answers; returns null when the key is missing or every model fails so
 * callers can fall back to local content.
 */
export async function chatComplete(opts: ChatOptions): Promise<string | null> {
  if (!config.openRouterApiKey) {
    console.warn('[OpenRouter] No API key configured — using local fallbacks.');
    return null;
  }

  for (const model of MODEL_CHAIN) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 45000);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 1000,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn(`[OpenRouter] ${model} -> HTTP ${res.status}. ${body.slice(0, 160)}`);
        continue;
      }

      const data: any = await res.json();
      const content: string | undefined = data?.choices?.[0]?.message?.content;
      if (content && content.trim()) {
        return content;
      }
      console.warn(`[OpenRouter] ${model} returned empty content.`);
    } catch (err: any) {
      console.warn(`[OpenRouter] ${model} failed: ${err?.message || err}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

/**
 * Extracts the first JSON object from an LLM reply, tolerating markdown
 * fences and surrounding chatter. Returns null when no object is found.
 */
export function extractJson(raw: string): any | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip ```json ... ``` fences
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function backoff(ms: number): Promise<void> {
  return sleep(ms);
}

export interface EmbedOptions {
  timeoutMs?: number;
  dimensions?: number;
}

/**
 * Embeds one or more short texts with a real embedding model and returns
 * the raw vectors (one per input, same order). Returns null when the key
 * is missing or the request fails so callers can fall back gracefully.
 * Passing several inputs in ONE request keeps it a single round trip.
 */
export async function embedTexts(inputs: string[], opts?: EmbedOptions): Promise<number[][] | null> {
  if (!config.openRouterApiKey || inputs.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15000);
  try {
    const res = await fetch(OPENROUTER_EMBED_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: opts?.dimensions ?? 512,
        encoding_format: 'float',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[OpenRouter] embeddings -> HTTP ${res.status}. ${body.slice(0, 160)}`);
      return null;
    }

    const data: any = await res.json();
    const vectors: number[][] = (data?.data ?? [])
      .map((d: any) => d?.embedding)
      .filter((e: any) => Array.isArray(e) && e.length > 0);
    if (vectors.length !== inputs.length) {
      console.warn('[OpenRouter] embeddings returned an unexpected vector count.');
      return null;
    }
    return vectors;
  } catch (err: any) {
    console.warn(`[OpenRouter] embeddings failed: ${err?.message || err}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
