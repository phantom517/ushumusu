import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { Typography } from '../../src/theme/typography';
import { Header } from '../../src/components/Header';
import { useSocketStore } from '../../src/stores/useSocketStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { socketService } from '../../src/services/socketService';
import { TactileButton } from '../../src/components/TactileButton';
import { MOLE_CONFIG } from '@tether/shared';

type MoleType = 'mole' | 'golden' | 'bomb';
interface CellState {
  type: MoleType;
  hit: boolean;
}
type Cells = (CellState | null)[];

const MOLE_EMOJI: Record<MoleType, string> = {
  mole: '🐹',
  golden: '🐹',
  bomb: '💣',
};

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const emptyField = (): Cells => Array(MOLE_CONFIG.GRID_CELLS).fill(null);

export default function MoleScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const moleState = useSocketStore((s) => s.moleState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  // ---- session state (all hooks MUST live above the early return) ----
  const [cells, setCells] = useState<Cells>(emptyField);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null); // 3,2,1 while starting
  const [msLeft, setMsLeft] = useState<number>(MOLE_CONFIG.DURATION_MS);
  const [sessionDone, setSessionDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);

  // Refs mirror the mutable session so timers never read stale state
  const cellsRef = useRef<Cells>(emptyField());
  const scoreRef = useRef(0);
  const hitsRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ranForRef = useRef<string>(''); // sessionKey this device already played

  const setCell = (idx: number, cell: CellState | null) => {
    const next = cellsRef.current.slice();
    next[idx] = cell;
    cellsRef.current = next;
    setCells(next);
  };

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  };

  const sessionKey = moleState?.sessionKey;
  const phase = moleState?.phase;

  useEffect(() => {
    // Run the local session once per server sessionKey — a rematch gets a new
    // key, which restarts this whole effect with fresh state.
    if (!sessionKey || phase !== 'playing' || ranForRef.current === sessionKey) return;
    ranForRef.current = sessionKey;

    let dead = false; // spawn-chain kill switch (session over or effect disposed)
    let endSessionFn: () => void = () => {};

    // Reset local session state for (re)start
    scoreRef.current = 0;
    hitsRef.current = 0;
    cellsRef.current = emptyField();
    setCells(emptyField());
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setSessionDone(false);
    setMsLeft(MOLE_CONFIG.DURATION_MS);

    const spawnOne = () => {
      if (dead) return;
      const holes: number[] = [];
      cellsRef.current.forEach((c, i) => {
        if (!c) holes.push(i);
      });
      if (holes.length === 0) {
        later(spawnOne, 300); // field momentarily full — retry shortly
        return;
      }
      const idx = holes[randomInt(0, holes.length - 1)];
      const roll = Math.random();
      const type: MoleType = roll < 0.1 ? 'bomb' : roll < 0.24 ? 'golden' : 'mole';
      setCell(idx, { type, hit: false });

      const upMs = type === 'golden' ? randomInt(600, 900) : randomInt(750, 1150);
      later(() => {
        if (dead) return;
        const cur = cellsRef.current[idx];
        if (cur && !cur.hit) setCell(idx, null); // whiffed away
        later(() => {
          if (!dead) spawnOne();
        }, randomInt(220, 550));
      }, upMs);
    };

    const endSession = () => {
      if (dead) return;
      dead = true;
      clearTimers();
      cellsRef.current = emptyField();
      setCells(emptyField());
      setSessionDone(true);
      setSubmitting(true);
      socketService
        .submitMoleScore(scoreRef.current, hitsRef.current)
        .finally(() => setSubmitting(false));
    };
    endSessionFn = endSession;

    // 3-2-1 countdown, then the whacking session
    let count = 3;
    setCountdown(count);
    const tick = () => {
      if (dead) return;
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        later(tick, 1000);
      } else {
        setCountdown(null);
        const startedAt = Date.now();
        intervalRef.current = setInterval(() => {
          if (dead) return;
          const left = MOLE_CONFIG.DURATION_MS - (Date.now() - startedAt);
          if (left <= 0) {
            endSessionFn();
          } else {
            setMsLeft(left);
          }
        }, 100);
        spawnOne();
      }
    };
    later(tick, 1000);

    return () => {
      dead = true;
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, phase]);

  useEffect(() => {
    // Leaving the screen entirely — drop the played-marker and stop everything
    return () => {
      ranForRef.current = '';
      clearTimers();
    };
  }, []);

  if (!moleState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Session" />
        <View style={styles.loadingBox}>
          <Text style={Typography.bodyMd}>Connecting to game session...</Text>
        </View>
      </View>
    );
  }

  const { myScore, opponentScore, hasSubmitted, opponentHasSubmitted, myResult, finishReason, stats } =
    moleState;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Companion';

  const handleWhack = (idx: number) => {
    if (countdown !== null || sessionDone || submitting) return;
    const cell = cellsRef.current[idx];

    if (!cell || cell.hit) {
      setStreak(0); // whiff — tapping an empty hole breaks the streak
      return;
    }

    const earned =
      cell.type === 'golden'
        ? MOLE_CONFIG.SCORE_GOLDEN
        : cell.type === 'bomb'
        ? MOLE_CONFIG.SCORE_BOMB
        : MOLE_CONFIG.SCORE_NORMAL;

    scoreRef.current += earned;
    hitsRef.current += 1;
    setScore(scoreRef.current);

    const nextStreak = cell.type === 'bomb' ? 0 : streak + 1;
    setStreak(nextStreak);
    setBestStreak((b) => Math.max(b, nextStreak));

    // 💥 flash, then clear the hole
    setCell(idx, { ...cell, hit: true });
    later(() => {
      if (cellsRef.current[idx]?.hit) setCell(idx, null);
    }, 180);
  };

  const handleRematch = async () => {
    setRematchSent(true);
    ranForRef.current = ''; // allow a fresh local session when the rematch state lands
    await socketService.voteRematch(true);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
  };

  /* ------------------------------ FINISHED ------------------------------ */
  if (moleState.phase === 'finished') {
    const winTint =
      myResult === 'win' ? Colors.secondary : myResult === 'loss' ? Colors.error : Colors.gold;
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="High Score Duel" showBack onBack={handleReturnHome} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.celebrationSection}>
            <View style={[styles.trophyCircle, { backgroundColor: winTint + '22' }]}>
              <MaterialIcons
                name={
                  myResult === 'win' ? 'emoji-events' : myResult === 'tie' ? 'handshake' : 'sports-esports'
                }
                size={36}
                color={winTint}
              />
            </View>
            <Text style={[Typography.labelSm, styles.roundLabel, { color: winTint }]}>
              {myResult === 'win' ? 'MOLE CHAMPION' : myResult === 'loss' ? 'SO CLOSE' : 'DEAD EVEN'}
            </Text>
            <Text style={[Typography.headlineLg, styles.celebrationTitle]}>
              {myScore?.score} – {opponentScore?.score}
            </Text>
            <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
              {finishReason || 'The high scores have been compared.'}
            </Text>
          </View>

          {/* Scoreboard */}
          <View style={styles.scoreboardCard}>
            <View style={[styles.scoreboardCol, myResult === 'win' && styles.scoreboardColWin]}>
              {myResult === 'win' && (
                <View style={styles.crownChip}>
                  <MaterialIcons name="emoji-events" size={13} color={Colors.onSecondaryContainer} />
                  <Text style={[Typography.labelSm, styles.crownText]}>Winner</Text>
                </View>
              )}
              <Text style={[Typography.labelMd, styles.scoreboardWho]}>You</Text>
              <Text style={[Typography.displayHero, styles.scoreboardScore, { color: Colors.onSurface }]}>
                {myScore?.score ?? 0}
              </Text>
              <Text style={[Typography.labelSm, styles.scoreboardMeta]}>
                {myScore?.hits ?? 0} hits · best streak {bestStreak}
              </Text>
            </View>
            <View style={styles.scoreboardDivider} />
            <View style={[styles.scoreboardCol, myResult === 'loss' && styles.scoreboardColWin]}>
              {myResult === 'loss' && (
                <View style={styles.crownChip}>
                  <MaterialIcons name="emoji-events" size={13} color={Colors.onSecondaryContainer} />
                  <Text style={[Typography.labelSm, styles.crownText]}>Winner</Text>
                </View>
              )}
              <Text style={[Typography.labelMd, styles.scoreboardWho]}>{opponentName}</Text>
              <Text style={[Typography.displayHero, styles.scoreboardScore, { color: Colors.onSurface }]}>
                {opponentScore?.score ?? 0}
              </Text>
              <Text style={[Typography.labelSm, styles.scoreboardMeta]}>
                {opponentScore?.hits ?? 0} hits
              </Text>
            </View>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.highlightsGrid}>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Winning gap</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.margin ?? 0} pts
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Total moles hit</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.totalHits ?? 0}
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Session</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {Math.ceil((moleState.durationMs ?? MOLE_CONFIG.DURATION_MS) / 1000)}s
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TactileButton
              title={
                rematchSent
                  ? `Rematch requested… awaiting ${opponentName}`
                  : `Rematch with ${opponentName}`
              }
              icon="cached"
              variant={rematchSent ? 'secondary' : 'primary'}
              size="lg"
              disabled={rematchSent}
              onPress={handleRematch}
            />
            <TactileButton
              title="Back to all games"
              icon="grid-view"
              variant="secondary"
              size="lg"
              onPress={handleReturnHome}
              style={{ marginTop: 10 }}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  /* --------------------------- PLAYING / WAITING --------------------------- */
  const secondsLeft = Math.ceil(msLeft / 1000);
  const timeRatio = Math.max(0, Math.min(1, msLeft / MOLE_CONFIG.DURATION_MS));
  const waitingForOpponent = sessionDone && !opponentHasSubmitted;

  return (
    <View style={styles.screen}>
      <Header
        title="Tether"
        subtitle="Hit the Mole"
        showBack
        onBack={() => {
          Alert.alert('Leave Match', 'Leaving forfeits your mole session. Sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Leave', style: 'destructive', onPress: () => socketService.leaveRoom() },
          ]);
        }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Score + timer */}
        <View style={styles.hudCard}>
          <View style={styles.hudLeft}>
            <Text style={[Typography.labelSm, styles.hudLabel]}>SCORE</Text>
            <Text style={[Typography.displayHero, styles.hudScore]}>{score}</Text>
          </View>
          <View style={styles.hudRight}>
            {streak >= 2 && (
              <View style={styles.streakChip}>
                <MaterialIcons name="bolt" size={13} color={Colors.onPrimaryContainer} />
                <Text style={[Typography.labelSm, styles.streakText]}>streak ×{streak}</Text>
              </View>
            )}
            <Text style={[Typography.labelSm, styles.hudLabel]}>TIME</Text>
            <Text style={[Typography.headlineMd, styles.hudTime, secondsLeft <= 5 && styles.hudTimeLow]}>
              {countdown !== null ? '—' : `${secondsLeft}s`}
            </Text>
          </View>
        </View>
        <View style={styles.timeTrack}>
          <View
            style={[
              styles.timeFill,
              {
                width: `${timeRatio * 100}%`,
                backgroundColor: secondsLeft <= 5 ? Colors.error : Colors.primary,
              },
            ]}
          />
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendChip}>
            <Text style={styles.legendEmoji}>🐹</Text>
            <Text style={[Typography.labelSm, styles.legendText]}>
              +{MOLE_CONFIG.SCORE_NORMAL}
            </Text>
          </View>
          <View style={[styles.legendChip, styles.legendChipGold]}>
            <Text style={styles.legendEmoji}>🐹</Text>
            <Text style={[Typography.labelSm, styles.legendText]}>
              +{MOLE_CONFIG.SCORE_GOLDEN}
            </Text>
          </View>
          <View style={styles.legendChip}>
            <Text style={styles.legendEmoji}>💣</Text>
            <Text style={[Typography.labelSm, styles.legendText]}>
              {MOLE_CONFIG.SCORE_BOMB}
            </Text>
          </View>
        </View>

        {/* Mole field */}
        <View style={styles.fieldCard}>
          {countdown !== null && (
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownText}>{countdown}</Text>
              <Text style={[Typography.bodyMd, styles.countdownHint]}>get your mallet ready…</Text>
            </View>
          )}
          <View style={styles.grid}>
            {cells.map((cell, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                disabled={countdown !== null || sessionDone}
                onPress={() => handleWhack(i)}
                style={[styles.hole, cell?.type === 'golden' && !cell?.hit && styles.holeGolden]}
              >
                {cell ? (
                  <Text style={styles.moleEmoji}>{cell.hit ? '💥' : MOLE_EMOJI[cell.type]}</Text>
                ) : (
                  <View style={styles.holeInner} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Status */}
        {sessionDone ? (
          <View style={styles.waitCard}>
            <View style={styles.waitRow}>
              <MaterialIcons
                name={submitting ? 'hourglass-empty' : 'check-circle'}
                size={16}
                color={Colors.secondary}
              />
              <Text style={[Typography.bodySm, styles.waitText]}>
                {submitting
                  ? 'Sending your score…'
                  : `Your score is in: ${myScore?.score ?? score} points`}
              </Text>
            </View>
            <Text style={[Typography.bodySm, styles.waitSub]}>
              {waitingForOpponent
                ? `${opponentName}'s mallet is still swinging…`
                : 'Comparing high scores…'}
            </Text>
          </View>
        ) : (
          opponentHasSubmitted && (
            <View style={styles.waitCard}>
              <Text style={[Typography.bodySm, styles.waitText]}>
                {opponentName} already finished — finish strong!
              </Text>
            </View>
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* HUD */
  hudCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  hudLeft: {
    alignItems: 'flex-start',
  },
  hudRight: {
    alignItems: 'flex-end',
  },
  hudLabel: {
    color: Colors.onSurfaceVariant,
    letterSpacing: 1,
  },
  hudScore: {
    color: Colors.onSurface,
  },
  hudTime: {
    color: Colors.onSurface,
  },
  hudTimeLow: {
    color: Colors.error,
  },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 2,
  },
  streakText: {
    color: Colors.onPrimaryContainer,
  },
  timeTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 12,
  },
  timeFill: {
    height: 6,
    borderRadius: 3,
  },

  /* Legend */
  legendRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  legendChipGold: {
    backgroundColor: Colors.warningContainer,
    borderColor: Colors.gold,
  },
  legendEmoji: {
    fontSize: 14,
  },
  legendText: {
    color: Colors.onSurfaceVariant,
  },

  /* Field */
  fieldCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 12,
  },
  countdownOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.surfaceContainerLow + 'F2',
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  countdownText: {
    fontSize: 84,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: 4,
  },
  countdownHint: {
    color: Colors.onSurfaceVariant,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  hole: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holeGolden: {
    borderColor: Colors.gold,
    backgroundColor: Colors.warningContainer,
  },
  holeInner: {
    width: '46%',
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  moleEmoji: {
    fontSize: 40,
  },

  /* Waiting */
  waitCard: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  waitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  waitText: {
    color: Colors.onSecondaryContainer,
  },
  waitSub: {
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
  },

  /* Finished */
  celebrationSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  trophyCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roundLabel: {
    letterSpacing: 1,
    marginBottom: 4,
  },
  celebrationTitle: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  celebrationSubtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  scoreboardCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
  },
  scoreboardCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 16,
  },
  scoreboardColWin: {
    backgroundColor: Colors.secondaryContainer,
  },
  crownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFFAA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
  },
  crownText: {
    color: Colors.onSecondaryContainer,
  },
  scoreboardWho: {
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  scoreboardScore: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  scoreboardMeta: {
    color: Colors.onSurfaceVariant,
  },
  scoreboardDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: 10,
  },
  statsCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  highlightsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  highlightItem: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
  },
  highlightLabel: {
    color: Colors.onSurfaceVariant,
  },
  highlightValue: {
    color: Colors.onSurface,
    marginVertical: 2,
  },
  actionButtons: {
    marginTop: 6,
  },
});
