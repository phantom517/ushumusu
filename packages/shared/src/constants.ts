import { GameSummary } from './types/game';
import { WyrQuestion } from './types/wyr';
import { MindCloseness } from './types/mindmeld';

export const HANGMAN_CONFIG = {
  MIN_WORD_LENGTH: 4,
  MAX_WORD_LENGTH: 12,
  MAX_LETTER_QUERIES: 10,
  MAX_STRIKES: 6,
  TURN_TIMEOUT_SECONDS: 45,
} as const;

export const WYR_CONFIG = {
  TOTAL_ROUNDS: 5,
  RATING: 'pg', // 'pg' | 'pg13' | 'r' — truthordarebot.xyz rating ('pg' = tamest)
  API_BASE_URL: 'https://api.truthordarebot.xyz/v1',
  API_TIMEOUT_MS: 8000,
  REQUEST_GAP_MS: 1600, // global API limit is 5 req / 5s — stay well below it
  TARGET_POOL: 10, // questions kept pre-fetched in memory
} as const;

// Offline / API-failure fallback. Same "X OR Y" format the API returns.
export const WYR_FALLBACK_QUESTIONS: string[] = [
  'Would you rather always be 10 minutes late OR always be 20 minutes early?',
  'Would you rather text only in voice notes OR only in emojis for a week?',
  'Would you rather have a personal chef OR a personal driver?',
  'Would you rather explore space OR explore the deep ocean?',
  'Would you rather always have perfect hair OR never have a bad outfit day?',
  'Would you rather read minds OR see the future once a day?',
  'Would you rather cuddle a lion cub OR a baby bear?',
  'Would you rather never wait in a queue again OR never have slow internet again?',
  'Would you rather live somewhere it never rains OR never gets dark?',
  'Would you rather be famous for something silly OR unknown for something great?',
];

/**
 * Parses an API question like "Would you rather be unhappily single OR unhappily married?"
 * into two options. Returns null if the format cannot be split safely.
 */
export function parseWyrQuestion(raw: string, id: string): WyrQuestion | null {
  let text = (raw || '').trim();
  if (!text) return null;

  const lead = text.match(/^would\s+you\s+rather\s+/i);
  if (lead) text = text.slice(lead[0].length);
  text = text.replace(/[?.!]+\s*$/, '');

  const parts = text.split(' OR ');
  if (parts.length !== 2) return null;

  const optionA = parts[0].trim();
  const optionB = parts[1].trim();
  if (!optionA || !optionB) return null;

  return { id, question: text, optionA, optionB };
}

export const AUCTION_CONFIG = {
  MIN_ITEMS: 6,
  MAX_ITEMS: 10,
  MIN_BUDGET: 500,
  MAX_BUDGET: 2000,
  MIN_BASE_VALUE: 5,
  MAX_BASE_VALUE: 400,
  MIN_DAYS: 3,
  MAX_DAYS: 365,
  OPENING_MIN_BID: 1, // first bid on a lot must be at least this
  MIN_BID_INCREMENT: 10, // each raise must beat the high bid by this much
} as const;

export const MINDMELD_CONFIG = {
  MIN_WORD_LENGTH: 2,
  MAX_WORD_LENGTH: 20,
  // a single word: letters only (client uppercases for display)
  WORD_PATTERN: /^[a-z]{2,20}$/,
} as const;

export const MOLE_CONFIG = {
  DURATION_MS: 30000, // each player's whacking session
  COUNTDOWN_MS: 3000, // 3-2-1 so both phones start in step
  GRID_CELLS: 9, // 3x3 field
  SCORE_NORMAL: 1,
  SCORE_GOLDEN: 3,
  SCORE_BOMB: -2, // tapping the bomb hurts
  MIN_SCORE: -99, // server-side sanity bounds
  MAX_SCORE: 999,
  MAX_HITS: 999,
} as const;

export const MATH_CONFIG = {
  TOTAL_QUESTIONS: 8,
  QUESTION_TIME_MS: 25000, // per-question timer on the client; timeout = skipped
  POINTS_PER_CORRECT: 1,
} as const;

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Shared label ladder for a closeness score — used by the local fallback
 * reading and by the vector-refined reading on the client.
 */
export function closenessLabel(score: number): string {
  return score >= 90
    ? 'Twin thoughts'
    : score >= 70
    ? 'Same wavelength'
    : score >= 45
    ? 'Kindred minds'
    : score >= 20
    ? 'Wandering apart'
    : 'Galaxies apart';
}

/**
 * Maps a cosine similarity between two word-embedding vectors onto the
 * game's 0–99 closeness scale. text-embedding-3-small compresses natural
 * language into a narrow band — unrelated words sit around 0.25–0.35,
 * related words ~0.5–0.65, near-identical 0.8+. The control points below
 * were calibrated against real model output so synonyms read "close" and
 * strangers read "far". 100 stays exclusive to exact matches.
 */
const VECTOR_CURVE: Array<[number, number]> = [
  [0.2, 4],
  [0.3, 10],
  [0.4, 22],
  [0.5, 40],
  [0.6, 60],
  [0.7, 78],
  [0.8, 90],
  [1, 99],
];

export function mindVectorCloseness(cosine: number): number {
  const c = Math.max(0, Math.min(1, cosine));
  if (c <= VECTOR_CURVE[0][0]) return 4;
  for (let i = 1; i < VECTOR_CURVE.length; i++) {
    const [x1, y1] = VECTOR_CURVE[i];
    const [x0, y0] = VECTOR_CURVE[i - 1];
    if (c <= x1) {
      return Math.round(y0 + ((c - x0) / (x1 - x0)) * (y1 - y0));
    }
  }
  return 99;
}

/**
 * Deterministic "how close were your minds" reading for a MISSED round.
 * Exact matches never reach this — the game ends in a win instead.
 * This string-distance reading is the instant estimate; the server refines
 * it with embedding vectors shortly after via 'game:mindmeld:vibe'.
 */
export function mindCloseness(a: string, b: string): MindCloseness {
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  const raw = Math.round((1 - distance / maxLen) * 100);
  // Keep 100 exclusive to exact matches; never worse than 4 so it never feels cruel.
  const score = raw >= 100 ? 100 : Math.max(4, Math.min(99, raw));

  const sameFirstLetter = a[0] === b[0];
  const sameLength = a.length === b.length;
  const label = closenessLabel(score);

  return { score, sameFirstLetter, sameLength, label };
}

// Offline / AI-failure fallback scenarios. Items follow the AI schema.
// The couple is always SEPARATED in the story — each builds their own kit.
export const AUCTION_FALLBACK_SCENARIOS = [
  {
    title: 'Split by the Storm',
    situation:
      'A storm broke your boat in two. You each washed up on a different island. At night you can see each other\'s fire across the water. Rescue boats are far away.',
    days: 25,
    budget: 1000,
    items: [
      { name: 'Rain Catcher Tarp', description: 'Catches rain water to drink.', baseValue: 90 },
      { name: 'Signal Mirror', description: 'Flash sunlight at far ships.', baseValue: 60 },
      { name: 'Fishing Spear', description: 'Catch fish for dinner every night.', baseValue: 75 },
      { name: 'Strong Medkit', description: 'Bandages, antibiotics, sting cream.', baseValue: 140 },
      { name: 'Sharp Machete', description: 'Cut paths and open coconuts.', baseValue: 85 },
      { name: 'Solar Radio Beacon', description: 'Calls for help using the sun.', baseValue: 160 },
      { name: 'Salt Water Straw', description: 'Drink the sea water safely.', baseValue: 110 },
      { name: 'Bug-Proof Hammock', description: 'Sleep high, away from mosquitoes.', baseValue: 55 },
    ],
  },
  {
    title: 'Dead City: 100 Days',
    situation:
      'The outbreak split you up. You are stuck in two different towns, far apart. The roads are full of the sick. Help will not come soon.',
    days: 100,
    budget: 1200,
    items: [
      { name: 'Door Bar', description: 'Makes any room safe for the night.', baseValue: 100 },
      { name: 'Water Filter Pump', description: 'Turns river water into clean water.', baseValue: 150 },
      { name: 'Quiet Crossbow', description: 'Silent weapon. Arrows are easy to find.', baseValue: 180 },
      { name: 'Canned Food Box', description: 'Sixty meals that last for years.', baseValue: 130 },
      { name: 'Wind-Up Torch', description: 'No batteries needed, ever.', baseValue: 45 },
      { name: 'Doctor Kit', description: 'Stitches, splints and clear notes.', baseValue: 170 },
      { name: 'Watching Drone', description: 'Checks the next streets for danger.', baseValue: 220 },
      { name: 'Seed Box', description: 'Grow your own food behind a locked door.', baseValue: 95 },
    ],
  },
  {
    title: 'Snowbound Cabins',
    situation:
      'The blizzard closed the mountain pass. Your cars stopped at two different spots on the road. You each found a small cabin. The snow will not stop for days.',
    days: 14,
    budget: 800,
    items: [
      { name: 'Warm Sleeping Bags', description: 'Sleep warm in minus thirty.', baseValue: 120 },
      { name: 'Stove Plate', description: 'Turns the wood stove into a kitchen.', baseValue: 70 },
      { name: 'Snow Shovel', description: 'Clear the door and the roof.', baseValue: 65 },
      { name: 'Snowshoes', description: 'Walk on deep snow without sinking.', baseValue: 90 },
      { name: 'Diesel Heater', description: 'Four hours of strong heat per tank.', baseValue: 155 },
      { name: 'Food Rations', description: 'High-energy food for cold days.', baseValue: 85 },
      { name: 'Satellite Phone', description: 'One call could end the whole problem.', baseValue: 240 },
      { name: 'Wool Clothes Set', description: 'Warm from head to toe.', baseValue: 60 },
    ],
  },
] as const;

export const RECONNECTION_CONFIG = {
  GRACE_PERIOD_MS: 60000, // 60 seconds
  TICK_INTERVAL_MS: 1000,
} as const;

export const AVAILABLE_GAMES: GameSummary[] = [
  {
    id: 'coding-hangman',
    name: 'Guess My Answer',
    shortTitle: 'Two Hearts, One Word',
    description: 'One of you hides a secret answer, the other peeks at it letter by letter — asking sweet questions along the way.',
    estimatedTime: '5–10 min',
    focusLevel: 'Cozy & focused',
    icon: 'favorite',
    tags: ['Live & Turn-Based', 'Made for Two', 'Little Secrets'],
  },
  {
    id: 'syntax-duel',
    name: 'Would You Rather?',
    shortTitle: 'Pick Together',
    description: 'Silly, sweet and slightly spicy either-ors. Discover how wonderfully your tastes tangle.',
    estimatedTime: '5 min',
    focusLevel: 'Easy breezy',
    icon: 'swap-horiz',
    tags: ['Live Turn-Based', 'Giggles Guaranteed', 'For Two'],
  },
  {
    id: 'binary-whisper',
    name: 'Truth or Dare',
    shortTitle: 'Dare You',
    description: 'Playful truths and tiny dares, delivered one turn at a time. A little bold, a lot of fun.',
    estimatedTime: '10 min',
    focusLevel: 'Playful',
    icon: 'local-fire-department',
    tags: ['Coming Soon', 'A Little Bold', 'After Dark'],
  },
  {
    id: 'quantum-bazaar',
    name: 'Survival Auction',
    shortTitle: 'Bid to Survive',
    description: 'An AI-hosted survival scenario, the same budget for you both, and a bidding war over the gear that decides who thrives.',
    estimatedTime: '5–10 min',
    focusLevel: 'Strategic & silly',
    icon: 'gavel',
    tags: ['Live Turn-Based', 'Bidding War', 'AI Hosted'],
  },
  {
    id: 'parallel-minds',
    name: 'Mind Meld',
    shortTitle: 'Think Alike',
    description: 'Write one word each, in silence. Match it and you both win — miss, and get a reading of how close your minds really are.',
    estimatedTime: '3–6 min',
    focusLevel: 'Intuitive',
    icon: 'psychology',
    tags: ['Live Together', 'One Word', 'Psychic Streak'],
  },
  {
    id: 'pixel-mole',
    name: 'Hit the Mole',
    shortTitle: 'Whack Together',
    description: 'The same 30 seconds on both phones, a field full of moles, and one high score to rule you both.',
    estimatedTime: '1 min',
    focusLevel: 'Reflex & giggles',
    icon: 'sports-esports',
    tags: ['Live Together', 'Reflex Duel', 'High Score'],
  },
  {
    id: 'delta-drill',
    name: 'Math Duel',
    shortTitle: 'Crunch Numbers',
    description: 'The same eight equations hit both phones — 58+26 today, 36/4 tomorrow. Out-math each other, one sum at a time.',
    estimatedTime: '2–3 min',
    focusLevel: 'Quick & sharp',
    icon: 'functions',
    tags: ['Live Together', 'Speedy Sums', 'Big Brain'],
  },
  {
    id: 'memory-lane',
    name: 'Memory Lane',
    shortTitle: 'Remember When?',
    description: 'Wander back through shared moments — first dates, inside jokes, the little things only you two know.',
    estimatedTime: 'Whenever',
    focusLevel: 'Warm & slow',
    icon: 'history',
    tags: ['Coming Soon', 'Nostalgic', 'Cozy Evenings'],
  },
];

export const AVATAR_PRESETS = [
  {
    id: 'avatar-sunny',
    name: 'Sunny',
    type: 'icon' as const,
    label: 'Little Sun',
    value: 'wb-sunny',
    accentColor: '#E8955D',
  },
  {
    id: 'avatar-blossom',
    name: 'Blossom',
    type: 'icon' as const,
    label: 'Flower Field',
    value: 'local-florist',
    accentColor: '#E58FA2',
  },
  {
    id: 'avatar-sprout',
    name: 'Sprout',
    type: 'icon' as const,
    label: 'Green Sprout',
    value: 'eco',
    accentColor: '#7CA982',
  },
  {
    id: 'avatar-coco',
    name: 'Coco',
    type: 'icon' as const,
    label: 'Coffee Break',
    value: 'coffee',
    accentColor: '#B08968',
  },
  {
    id: 'avatar-star',
    name: 'Star',
    type: 'icon' as const,
    label: 'Night Star',
    value: 'star',
    accentColor: '#D9A44E',
  },
  {
    id: 'avatar-heartie',
    name: 'Heartie',
    type: 'icon' as const,
    label: 'Open Heart',
    value: 'favorite',
    accentColor: '#F0796B',
  },
];

/** Game ids that are fully playable (matchmaking/invite ready). */
export const PLAYABLE_GAME_IDS = [
  'coding-hangman',
  'syntax-duel',
  'quantum-bazaar',
  'parallel-minds',
  'pixel-mole',
  'delta-drill',
];

export const CHAT_CONFIG = {
  TTL_MS: 15 * 60 * 1000, // every message vanishes after 15 minutes
  MAX_TEXT_LEN: 500,
  MAX_CHANNEL_MESSAGES: 200, // hard cap per couple channel
  PRUNE_INTERVAL_MS: 60 * 1000,
} as const;

/**
 * Photo avatars — the couple's AI-generated portraits. The images live in
 * the mobile bundle (assets/avatars/<id>.png); the server only ever sees
 * the id. Users can swap the PNG files 1:1 without touching any code.
 */
export const PHOTO_AVATARS = [
  { id: 'photo-01', name: 'Ember' },
  { id: 'photo-02', name: 'Rose' },
  { id: 'photo-03', name: 'Sage' },
  { id: 'photo-04', name: 'Honey' },
  { id: 'photo-05', name: 'Plum' },
  { id: 'photo-06', name: 'Cocoa' },
  { id: 'photo-07', name: 'Meadow' },
  { id: 'photo-08', name: 'Sky' },
];

export function findAvatarPreset(avatarId: string): { id: string; name: string; type: 'photo' | 'icon'; value?: string; accentColor?: string } | undefined {
  const photo = PHOTO_AVATARS.find((p) => p.id === avatarId);
  if (photo) return { ...photo, type: 'photo' };
  const icon = AVATAR_PRESETS.find((p) => p.id === avatarId);
  if (icon) return { id: icon.id, name: icon.name, type: 'icon', value: icon.value, accentColor: icon.accentColor };
  return undefined;
}

export function normalizeWord(word: string): string {
  return word.trim().toUpperCase();
}

export function validateSecretWord(word: string): { valid: boolean; error?: string; normalized: string } {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return { valid: false, error: 'Start with a little word first ♡', normalized: '' };
  }
  if (!/^[A-Z]+$/.test(normalized)) {
    return { valid: false, error: 'Letters only (A–Z), one cozy word', normalized };
  }
  if (normalized.length < HANGMAN_CONFIG.MIN_WORD_LENGTH) {
    return {
      valid: false,
      error: `A little longer, please — at least ${HANGMAN_CONFIG.MIN_WORD_LENGTH} letters`,
      normalized,
    };
  }
  if (normalized.length > HANGMAN_CONFIG.MAX_WORD_LENGTH) {
    return {
      valid: false,
      error: `Keep it cozy — ${HANGMAN_CONFIG.MAX_WORD_LENGTH} letters or fewer`,
      normalized,
    };
  }
  return { valid: true, normalized };
}
