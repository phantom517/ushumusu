import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  AccessibilityInfo,
  useWindowDimensions,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useProfileStore } from '../src/stores/useProfileStore';
import { AVAILABLE_GAMES, PLAYABLE_GAME_IDS } from '@tether/shared';

/* ------------------------------------------------------------------ */
/* Tether design tokens — warm, rounded, tactile (per design spec)     */
/* ------------------------------------------------------------------ */
const T = {
  page: '#F7F3EE',
  surface: '#FFFCF8',
  surfaceSage: '#F0F6F2',
  ink: '#403A37',
  muted: '#887D75',
  mutedStrong: '#6F6259', // darker muted for small text contrast
  line: '#E8D9CD',
  coral: '#D9665B',
  coralDark: '#BB4F47',
  coralSoft: '#F7E3DE',
  sage: '#DFECE2',
  sageInk: '#45634F',
  goldSoft: '#F4EBD8',
  goldInk: '#9A7132',
  lavenderSoft: '#EEE8F0',
  lavenderInk: '#6E5470',
} as const;

const SHADOW_CARD = {
  shadowColor: '#533A2B',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 2,
} as const;

const SHADOW_RAISED = {
  shadowColor: '#533A2B',
  shadowOffset: { width: 0, height: 9 },
  shadowOpacity: 0.12,
  shadowRadius: 22,
  elevation: 5,
} as const;

const SHADOW_PILL = {
  shadowColor: '#BB4F47',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.22,
  shadowRadius: 8,
  elevation: 3,
} as const;

/* Interface font (DM Sans) + display font (Fraunces) */
const F = {
  sans: 'DMSans-Regular',
  sansMd: 'DMSans-Medium',
  sansBold: 'DMSans-Bold',
  serif: 'Fraunces-SemiBold',
  serifBold: 'Fraunces-Bold',
} as const;

/* Icon-tile accents — distinct but coordinated */
const TILE: Record<string, { bg: string; ink: string }> = {
  blush: { bg: T.coralSoft, ink: T.coralDark },
  lavender: { bg: T.lavenderSoft, ink: T.lavenderInk },
  gold: { bg: T.goldSoft, ink: T.goldInk },
  sage: { bg: T.sage, ink: T.sageInk },
};

/* ------------------------------------------------------------------ */
/* Games section — exact copy, mapped to the playable catalog ids      */
/* ------------------------------------------------------------------ */
interface HubCard {
  id: string;
  title: string;
  desc: string;
  tile: keyof typeof TILE;
}

const GAME_CARDS: HubCard[] = [
  {
    id: 'syntax-duel',
    title: 'Would You Rather?',
    desc: 'Silly, sweet and slightly spicy either-ors. Discover how wonderfully your tastes tangle.',
    tile: 'blush',
  },
  {
    id: 'binary-whisper',
    title: 'Truth or Dare',
    desc: 'Playful truths and tiny dares, delivered one turn at a time. A little bold, a lot of fun.',
    tile: 'lavender',
  },
  {
    id: 'quantum-bazaar',
    title: 'Survival Auction',
    desc: 'An AI-hosted survival scenario, the same budget for you both, and a bidding war over the gear that decides who thrives.',
    tile: 'gold',
  },
  {
    id: 'parallel-minds',
    title: 'Mind Meld',
    desc: 'Write one word each, in silence. Match it and you both win — miss, and get a reading of how close your minds really are.',
    tile: 'sage',
  },
  {
    id: 'pixel-mole',
    title: 'Hit the Mole',
    desc: 'The same 30 seconds on both phones, a field full of moles, and one high score to rule you both.',
    tile: 'blush',
  },
  {
    id: 'delta-drill',
    title: 'Math Duel',
    desc: 'The same eight equations hit both phones — 58+26 today, 36/4 tomorrow. Out-math each other, one sum at a time.',
    tile: 'sage',
  },
  {
    id: 'memory-lane',
    title: 'Memory Lane',
    desc: 'Wander back through shared moments — first dates, inside jokes, the little things only you two know.',
    tile: 'lavender',
  },
];

const FEATURED_ID = 'coding-hangman';

const CATALOG_ICON: Record<string, string> = Object.fromEntries(
  AVAILABLE_GAMES.map((g) => [g.id, g.icon])
);

const LOCKED_QUIPS = [
  'Patience, my love — this one is still being wrapped with a bow.',
  'Shh… this game is still stretching before its big debut.',
  'Soon! The hearts are still painting the scenery.',
];

const DAILY_QUESTIONS = [
  'What made you smile today?',
  'What is a tiny thing you are secretly looking forward to?',
  'If today had a flavor, what would it taste like?',
  'What is something small I did recently that made you feel loved?',
  'What song feels like us right now?',
  'Which memory of us do you replay the most?',
  'What is one little thing you would love us to try together?',
  'Where would you take me right now if we could teleport?',
  'What is your favorite little ritual of ours?',
  'What made you pick me, all that time ago?',
];

const metaOf = (id: string): string => {
  const g = AVAILABLE_GAMES.find((x) => x.id === id);
  return g ? `${g.estimatedTime} · ${g.focusLevel}` : '';
};

/* ------------------------------------------------------------------ */
/* Pill button — coral primary / quiet secondary, press-in response    */
/* ------------------------------------------------------------------ */
interface PillButtonProps {
  label: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  variant?: 'primary' | 'soft';
  size?: 'md' | 'lg';
  onPress: () => void;
  reduceMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

function PillButton({ label, icon, variant = 'primary', size = 'md', onPress, reduceMotion, style }: PillButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const height = size === 'lg' ? 52 : 44;

  const bg = variant === 'primary' ? T.coral : T.coralSoft;
  const fg = variant === 'primary' ? '#FFFFFF' : T.coralDark;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.pillBase,
        {
          height,
          backgroundColor: pressed && variant === 'primary' ? T.coralDark : bg,
        },
        variant === 'primary' ? SHADOW_PILL : null,
        hovered && !reduceMotion ? { transform: [{ translateY: -1 }] } : null,
        pressed && !reduceMotion ? { transform: [{ translateY: 1 }] } : null,
        pressed && reduceMotion ? { opacity: 0.85 } : null,
        focused ? styles.focusRing : null,
        style,
      ]}
    >
      {icon && <MaterialIcons name={icon} size={size === 'lg' ? 19 : 16} color={fg} />}
      <Text style={[styles.pillLabel, { color: fg, fontSize: size === 'lg' ? 15.5 : 13.5 }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  useProfileStore((s) => s.profile);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const pagePad = isWide ? 24 : 16;
  const listWidth = Math.min(width, 1120) - pagePad * 2;
  const gridCardWidth = isWide ? Math.floor((listWidth - 12) / 2) : undefined;

  // Respect reduced-motion: swap transforms for a plain opacity response
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(setReduceMotion)
      .catch(() => undefined);
  }, []);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const dailyQuestion = DAILY_QUESTIONS[dayOfYear % DAILY_QUESTIONS.length];

  const handleStartGame = (id: string) => {
    if (!PLAYABLE_GAME_IDS.includes(id)) {
      const quip = LOCKED_QUIPS[Math.floor(Math.random() * LOCKED_QUIPS.length)];
      alert(quip);
      return;
    }
    router.push({ pathname: '/matchmaking', params: { gameId: id } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: T.page }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: pagePad, paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 24) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured challenge — soft coral surface, strongest action */}
        <Text accessibilityRole="header" style={[styles.sectionHeading, { marginTop: 2, maxWidth: 1120, alignSelf: 'center', width: '100%' }]}>
          Today's little challenge
        </Text>
        <View
          style={[
            styles.featuredCard,
            { backgroundColor: T.coralSoft, maxWidth: isWide ? 640 : 1120, alignSelf: 'center', width: '100%', marginTop: 12 },
          ]}
        >
          <Text style={styles.featuredEyebrow}>Two Hearts, One Word</Text>
          <Text style={[styles.featuredTitle, { fontSize: isWide ? 36 : 30 }]}>Guess My Answer</Text>
          <Text style={styles.featuredDesc}>
            One of you hides a secret answer, the other peeks at it letter by letter — asking sweet questions along the way.
          </Text>
          <View style={styles.chipRow}>
            <View style={styles.metaChip}>
              <MaterialIcons name="schedule" size={13} color={T.ink} />
              <Text style={styles.metaChipText}>5–10 min</Text>
            </View>
            <View style={styles.metaChip}>
              <MaterialIcons name="diversity-2" size={13} color={T.ink} />
              <Text style={styles.metaChipText}>Made for two</Text>
            </View>
          </View>
          <PillButton
            label="Play together"
            icon="play-arrow"
            size="lg"
            reduceMotion={reduceMotion}
            onPress={() => handleStartGame(FEATURED_ID)}
            style={{ marginTop: 18, alignSelf: 'stretch' }}
          />
        </View>

        {/* Games */}
        <View style={[styles.gamesHeader, { maxWidth: 1120, alignSelf: 'center', width: '100%' }]}>
          <Text accessibilityRole="header" style={styles.sectionHeading}>
            Explore games
          </Text>
          <Text style={styles.gamesHint}>More little ways to be together</Text>
        </View>

        <View
          style={[
            styles.gamesList,
            { flexDirection: isWide ? 'row' : 'column', flexWrap: 'wrap', maxWidth: 1120, alignSelf: 'center', width: '100%' },
          ]}
        >
          {GAME_CARDS.map((card) => {
            const playable = PLAYABLE_GAME_IDS.includes(card.id);
            const tile = TILE[card.tile];
            return (
              <Pressable
                key={card.id}
                accessibilityRole="button"
                accessibilityLabel={playable ? `Play ${card.title}` : `${card.title} — coming soon`}
                onPress={() => handleStartGame(card.id)}
                onHoverIn={() => setHoveredCard(card.id)}
                onHoverOut={() => setHoveredCard(null)}
                style={({ pressed }) => [
                  styles.gameCard,
                  { width: gridCardWidth },
                  hoveredCard === card.id && !reduceMotion
                    ? { ...SHADOW_RAISED, transform: [{ translateY: -1 }] }
                    : null,
                  pressed && !reduceMotion ? { transform: [{ translateY: 1 }] } : null,
                  pressed && reduceMotion ? { opacity: 0.9 } : null,
                ]}
              >
                <View style={[styles.tile, { backgroundColor: tile.bg }]}>
                  <MaterialIcons name={CATALOG_ICON[card.id] as any} size={22} color={tile.ink} />
                </View>
                <View style={styles.gameBody}>
                  <Text style={styles.gameTitle}>{card.title}</Text>
                  <Text style={styles.gameDesc}>{card.desc}</Text>
                  <Text style={styles.gameMeta}>{metaOf(card.id)}</Text>
                </View>
                <View style={styles.gameAction}>
                  {playable ? (
                    <View style={[styles.playPill, SHADOW_PILL]}>
                      <MaterialIcons name="play-arrow" size={16} color="#FFFFFF" />
                      <Text style={styles.playPillText}>Play</Text>
                    </View>
                  ) : (
                    <View style={styles.soonChip}>
                      <MaterialIcons name="lock" size={13} color={T.goldInk} />
                      <Text style={styles.soonChipText}>Soon</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Little moments — daily question (kept from the original hub) */}
        <Text accessibilityRole="header" style={[styles.sectionHeading, { marginTop: 32, maxWidth: 1120, alignSelf: 'center', width: '100%' }]}>
          Little moments
        </Text>
        <View
          style={[
            styles.momentCard,
            { maxWidth: isWide ? 640 : 1120, alignSelf: 'center', width: '100%', marginTop: 12 },
          ]}
        >
          <View style={styles.momentTopRow}>
            <View style={styles.momentBadge}>
              <MaterialIcons name="local-cafe" size={13} color={T.goldInk} />
              <Text style={styles.momentBadgeText}>Daily question</Text>
            </View>
            <MaterialIcons name="favorite-border" size={16} color={T.coral} />
          </View>
          <Text style={styles.momentQuestion}>“{dailyQuestion}”</Text>
          <Text style={styles.momentHint}>
            Answer it together over coffee — no winners here, just warm ones.
          </Text>
        </View>

        <View style={styles.footer}>
          <MaterialIcons name="favorite" size={12} color={T.coral} />
          <Text style={styles.footerText}>MADE FOR TWO</Text>
        </View>
      </ScrollView>

      {/* Chat — small floating button, always in reach */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open your chat"
        onPress={() => router.push('/chat')}
        style={({ pressed }) => [
          styles.chatBtn,
          { top: insets.top + 12, right: pagePad },
          pressed && !reduceMotion && styles.chatBtnPressed,
        ]}
      >
        <MaterialIcons name="chat-bubble" size={26} color={T.coralDark} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },

  /* Floating chat button */
  chatBtn: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: T.surface,
    borderWidth: 1.3,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW_RAISED,
  },
  chatBtnPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.8,
  },

  /* Section headings */
  sectionHeading: {
    fontFamily: F.sansBold,
    fontSize: 20,
    color: T.ink,
  },
  gamesHeader: {
    marginTop: 32,
    marginBottom: 12,
    gap: 2,
  },
  gamesHint: {
    fontFamily: F.sans,
    fontSize: 13.5,
    color: T.mutedStrong,
  },

  /* Featured */
  featuredCard: {
    borderRadius: 20,
    padding: 16,
    ...SHADOW_CARD,
    borderWidth: 1,
    borderColor: 'rgba(232,217,205,0.7)',
  },
  featuredEyebrow: {
    fontFamily: F.sansBold,
    fontSize: 11.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.coralDark,
    marginBottom: 8,
  },
  featuredTitle: {
    fontFamily: F.serifBold,
    color: T.ink,
    lineHeight: 40,
    marginBottom: 8,
  },
  featuredDesc: {
    fontFamily: F.sans,
    fontSize: 14.5,
    lineHeight: 21,
    color: T.mutedStrong,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
  },
  metaChipText: {
    fontFamily: F.sansMd,
    fontSize: 12.5,
    color: T.ink,
  },

  /* Game cards */
  gamesList: {
    gap: 12,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.line,
    padding: 16,
    marginBottom: 12,
    ...SHADOW_CARD,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  gameBody: {
    flex: 1,
  },
  gameTitle: {
    fontFamily: F.sansBold,
    fontSize: 16,
    color: T.ink,
    marginBottom: 4,
  },
  gameDesc: {
    fontFamily: F.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: T.mutedStrong,
    marginBottom: 6,
  },
  gameMeta: {
    fontFamily: F.sansMd,
    fontSize: 12.5,
    color: T.mutedStrong,
  },
  gameAction: {
    marginLeft: 12,
    alignItems: 'flex-end',
  },
  playPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.coral,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 999,
  },
  playPillText: {
    fontFamily: F.sansBold,
    fontSize: 13.5,
    color: '#FFFFFF',
  },
  soonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: T.goldSoft,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 999,
  },
  soonChipText: {
    fontFamily: F.sansBold,
    fontSize: 12.5,
    color: T.goldInk,
  },

  /* Moments */
  momentCard: {
    borderRadius: 20,
    backgroundColor: T.surfaceSage,
    borderWidth: 1,
    borderColor: T.line,
    padding: 16,
    ...SHADOW_CARD,
  },
  momentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  momentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: T.goldSoft,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 999,
  },
  momentBadgeText: {
    fontFamily: F.sansMd,
    fontSize: 12.5,
    color: T.goldInk,
  },
  momentQuestion: {
    fontFamily: F.sansBold,
    fontSize: 17,
    lineHeight: 24,
    color: T.ink,
    marginBottom: 6,
  },
  momentHint: {
    fontFamily: F.sans,
    fontSize: 13,
    lineHeight: 18,
    color: T.mutedStrong,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 28,
  },
  footerText: {
    fontFamily: F.sansMd,
    fontSize: 11,
    letterSpacing: 1.5,
    color: T.muted,
  },

  /* Pills */
  pillBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 22,
    alignSelf: 'flex-start',
  },
  pillLabel: {
    fontFamily: F.sansBold,
  },
  focusRing: {
    borderWidth: 2,
    borderColor: T.coral,
    shadowColor: T.coral,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
});
