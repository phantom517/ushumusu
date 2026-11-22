import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { Typography } from '../../src/theme/typography';
import { Header } from '../../src/components/Header';
import { useSocketStore } from '../../src/stores/useSocketStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { socketService } from '../../src/services/socketService';
import { MATH_CONFIG } from '@tether/shared';
import {
  ClayCard,
  ClayWell,
  ClayButton,
  ClayIn,
  ClayFloat,
  ClayWiggle,
  ClayBreath,
  ClayBlobs,
  ClayShadows,
  PopNumber,
} from '../../src/components/Clay';

/** How long the "+1" celebration lingers before auto-advancing. */
const AUTO_NEXT_MS = 1100;

interface Feedback {
  index: number;
  correct: boolean;
  correctAnswer: number;
  myAnswer: number | null;
}

/** Thin bar that fills over `ms` — shows the auto-advance countdown. */
function AutoAdvanceBar({ ms, tint }: { ms: number; tint: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [v, ms]);
  return (
    <View style={styles.autoBarTrack}>
      <Animated.View
        style={[styles.autoBarFill, { backgroundColor: tint, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
      />
    </View>
  );
}

export default function MathDuelScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const mathState = useSocketStore((s) => s.mathState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  // ---- all hooks live above the early return ----
  const [answerInput, setAnswerInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const [msLeftQ, setMsLeftQ] = useState<number>(MATH_CONFIG.QUESTION_TIME_MS);
  const answeredIndexRef = useRef<number>(-1); // index sent to the server, awaiting feedback
  const autoNextRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseV = useRef(new Animated.Value(1)).current;

  // Derived before the early return so effects can use them safely
  const phaseSolving = mathState?.phase === 'solving';
  const currentQIndex = mathState?.current?.index;
  const lowTime = phaseSolving && currentQIndex !== undefined && msLeftQ <= 5000 && feedback === null;

  const clearAutoNext = () => {
    if (autoNextRef.current) {
      clearTimeout(autoNextRef.current);
      autoNextRef.current = null;
    }
  };

  // When the server acknowledges an answer (state update), lift the result
  // from history into the feedback panel. A correct answer AUTO-advances to
  // the next equation after a short celebration; a miss waits for "Next".
  useEffect(() => {
    if (!mathState) return;
    // A fresh game (rematch) resets everything local
    if (mathState.history.length === 0 && feedback) {
      clearAutoNext();
      setFeedback(null);
      answeredIndexRef.current = -1;
      setAnswerInput('');
      return;
    }
    const idx = answeredIndexRef.current;
    if (idx < 0) return;
    const answered = mathState.history.find((h) => h.index === idx);
    if (answered) {
      setFeedback({
        index: answered.index,
        correct: answered.myCorrect,
        correctAnswer: answered.correctAnswer,
        myAnswer: answered.myAnswer,
      });
      answeredIndexRef.current = -1;
      if (answered.myCorrect) {
        clearAutoNext();
        autoNextRef.current = setTimeout(() => {
          autoNextRef.current = null;
          setFeedback(null); // auto-advance to the next equation
        }, AUTO_NEXT_MS);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathState]);

  // Never leave a stray auto-advance timer behind
  useEffect(() => {
    return () => clearAutoNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-question timer: fresh on every new question; paused while feedback is up.
  useEffect(() => {
    if (!phaseSolving || currentQIndex === undefined || feedback !== null) return;
    const started = Date.now();
    setMsLeftQ(MATH_CONFIG.QUESTION_TIME_MS);
    const interval = setInterval(() => {
      const left = MATH_CONFIG.QUESTION_TIME_MS - (Date.now() - started);
      if (left <= 0) {
        clearInterval(interval);
        setMsLeftQ(0);
        if (answeredIndexRef.current !== currentQIndex) {
          // Time's up — auto-skip (server records it as a miss)
          answeredIndexRef.current = currentQIndex;
          setSubmitting(true);
          socketService
            .submitMathAnswer(currentQIndex, null)
            .finally(() => setSubmitting(false));
        }
      } else {
        setMsLeftQ(left);
      }
    }, 150);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseSolving, currentQIndex, feedback]);

  // Heartbeat pulse on the card when time is running low
  useEffect(() => {
    if (lowTime) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseV, { toValue: 1.03, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulseV, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => {
        loop.stop();
        pulseV.setValue(1);
      };
    }
    pulseV.setValue(1);
  }, [lowTime, pulseV]);

  if (!mathState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Session" />
        <View style={styles.loadingBox}>
          <ClayCard radius={22} innerStyle={styles.loadingPad}>
            <Text style={[Typography.bodyMd, { color: Colors.onSurfaceVariant }]}>Connecting to game session…</Text>
          </ClayCard>
        </View>
      </View>
    );
  }

  const {
    current,
    history,
    totalQuestions,
    myCorrectCount,
    opponentIndex,
    opponentDone,
    myResult,
    finishReason,
    stats,
  } = mathState;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Companion';
  const opponentScore = stats ? stats.scores[mathState.playerIds.find((id) => id !== profile?.id) || ''] ?? 0 : 0;

  const handleSubmit = async (answer: number | null) => {
    if (!current || submitting || feedback) return;
    const idx = current.index;
    answeredIndexRef.current = idx;
    setSubmitting(true);
    const res = await socketService.submitMathAnswer(idx, answer);
    setSubmitting(false);
    if (!res.success) {
      answeredIndexRef.current = -1;
      Alert.alert('Answer Notice', res.error || 'Could not submit the answer');
      return;
    }
    setAnswerInput('');
  };

  const handleSkip = () => handleSubmit(null);

  const handleRematch = async () => {
    setRematchSent(true);
    setFeedback(null);
    answeredIndexRef.current = -1;
    await socketService.voteRematch(true);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
  };

  /* ------------------------------ FINISHED ------------------------------ */
  if (mathState.phase === 'finished') {
    const winTint =
      myResult === 'win' ? Colors.success : myResult === 'loss' ? Colors.error : Colors.gold;
    const trophyBg =
      myResult === 'win'
        ? Colors.secondaryContainer
        : myResult === 'loss'
        ? Colors.errorContainer
        : Colors.warningContainer;
    return (
      <View style={styles.screen}>
        <ClayBlobs />
        <Header title="Tether" subtitle="Math Duel" showBack onBack={handleReturnHome} />

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Trophy */}
          <ClayIn>
            <View style={styles.celebration}>
              <ClayFloat amplitude={5} duration={2600}>
                <View style={[styles.trophy, { backgroundColor: trophyBg }, ClayShadows.chip]}>
                  <MaterialIcons
                    name={myResult === 'win' ? 'emoji-events' : myResult === 'tie' ? 'handshake' : 'functions'}
                    size={36}
                    color={winTint}
                  />
                </View>
              </ClayFloat>
              <Text style={[Typography.labelSm, styles.roundLabel, { color: winTint }]}>
                {myResult === 'win' ? 'MATH CHAMPION' : myResult === 'loss' ? 'SO CLOSE' : 'DEAD EVEN'}
              </Text>
              <View style={styles.finalScoreRow}>
                <PopNumber value={myCorrectCount} style={[Typography.displayHero, { color: Colors.onSurface }]} />
                <Text style={[Typography.displayHero, { color: Colors.outline }]}>–</Text>
                <PopNumber value={opponentScore} style={[Typography.displayHero, { color: Colors.onSurface }]} />
              </View>
              <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
                {finishReason || 'The sums have been settled.'}
              </Text>
            </View>
          </ClayIn>

          {/* Duel scoreboard — winner's column rises with a wiggling crown */}
          <ClayIn delay={90}>
            <View style={styles.scoreboardRow}>
              <ClayCard
                radius={24}
                bg={myResult === 'win' ? Colors.secondaryContainer : Colors.surfaceContainerLowest}
                glow={myResult === 'win'}
                shadow="chip"
                innerStyle={styles.scoreCol}
                style={myResult === 'win' ? styles.colRaised : undefined}
              >
                {myResult === 'win' && (
                  <ClayWiggle amplitude={7} duration={900}>
                    <View style={styles.crownChip}>
                      <MaterialIcons name="emoji-events" size={13} color={Colors.onSecondaryContainer} />
                      <Text style={[Typography.labelSm, styles.crownText]}>Winner</Text>
                    </View>
                  </ClayWiggle>
                )}
                <Text style={[Typography.labelMd, styles.scoreWho]}>You</Text>
                <PopNumber value={myCorrectCount} style={[Typography.displayHero, { color: Colors.onSurface }]} />
                <Text style={[Typography.labelSm, styles.scoreMeta]}>of {totalQuestions} correct</Text>
              </ClayCard>

              <ClayCard
                radius={24}
                bg={myResult === 'loss' ? Colors.secondaryContainer : Colors.surfaceContainerLowest}
                glow={myResult === 'loss'}
                shadow="chip"
                innerStyle={styles.scoreCol}
                style={myResult === 'loss' ? styles.colRaised : undefined}
              >
                {myResult === 'loss' && (
                  <ClayWiggle amplitude={7} duration={900}>
                    <View style={styles.crownChip}>
                      <MaterialIcons name="emoji-events" size={13} color={Colors.onSecondaryContainer} />
                      <Text style={[Typography.labelSm, styles.crownText]}>Winner</Text>
                    </View>
                  </ClayWiggle>
                )}
                <Text style={[Typography.labelMd, styles.scoreWho]}>{opponentName}</Text>
                <PopNumber value={opponentScore} style={[Typography.displayHero, { color: Colors.onSurface }]} />
                <Text style={[Typography.labelSm, styles.scoreMeta]}>of {totalQuestions} correct</Text>
              </ClayCard>
            </View>
          </ClayIn>

          {/* Equation recap */}
          <ClayIn delay={170}>
            <ClayCard radius={22} innerStyle={styles.recapPad}>
              <Text style={[Typography.labelMd, styles.recapTitle]}>EVERY EQUATION</Text>
              <View style={styles.recapList}>
                {history.map((h, i) => (
                  <ClayIn key={h.index} delay={220 + Math.min(i * 40, 420)}>
                    <View style={styles.recapItem}>
                      <ClayWell radius={15} style={styles.recapBadge}>
                        <Text style={[Typography.labelSm, styles.recapBadgeText]}>Q{h.index + 1}</Text>
                      </ClayWell>
                      <View style={styles.recapTextCol}>
                        <Text style={[Typography.bodySm, { color: Colors.onSurface }]}>{h.text}</Text>
                        <Text style={[Typography.labelSm, { color: Colors.onSurfaceVariant, marginTop: 2 }]}>
                          You: {h.myAnswer ?? 'skipped'} · {opponentName}: {h.opponentAnswer ?? 'skipped'}
                        </Text>
                      </View>
                      <View style={styles.recapMarks}>
                        <MaterialIcons
                          name={h.myCorrect ? 'check-circle' : 'cancel'}
                          size={15}
                          color={h.myCorrect ? Colors.success : Colors.error}
                        />
                        <MaterialIcons
                          name={h.opponentCorrect ? 'check-circle' : 'cancel'}
                          size={15}
                          color={h.opponentCorrect ? Colors.success : Colors.error}
                        />
                      </View>
                    </View>
                  </ClayIn>
                ))}
              </View>
            </ClayCard>
          </ClayIn>

          <ClayIn delay={260}>
            <View style={styles.actionButtons}>
              <ClayButton
                title={rematchSent ? `Rematch requested… awaiting ${opponentName}` : `Duel again with ${opponentName}`}
                icon="cached"
                variant={rematchSent ? 'secondary' : 'primary'}
                disabled={rematchSent}
                onPress={handleRematch}
              />
              <ClayButton
                title="Back to all games"
                icon="grid-view"
                variant="secondary"
                onPress={handleReturnHome}
                style={{ marginTop: 10 }}
              />
            </View>
          </ClayIn>
        </ScrollView>
      </View>
    );
  }

  /* ------------------------------- SOLVING ------------------------------- */
  const secondsLeft = Math.ceil(msLeftQ / 1000);
  const timeRatio = Math.max(0, Math.min(1, msLeftQ / MATH_CONFIG.QUESTION_TIME_MS));
  const parsedAnswer = answerInput.trim() ? parseInt(answerInput.trim(), 10) : null;
  const iAmDone = !current && !feedback;

  return (
    <View style={styles.screen}>
      <ClayBlobs />
      <Header
        title="Tether"
        subtitle="Math Duel"
        showBack
        onBack={() => {
          Alert.alert('Leave Match', 'Are you sure you want to exit the current match?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Leave', style: 'destructive', onPress: () => socketService.leaveRoom() },
          ]);
        }}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* HUD */}
        <ClayIn>
          <ClayCard bg={Colors.surfaceContainerLowest} glow={false} radius={24} innerStyle={styles.hudPad}>
            <View style={styles.hudRow}>
              <View style={styles.hudLeft}>
                <Text style={[Typography.labelSm, styles.hudLabel]}>
                  {current ? `QUESTION ${current.index + 1} OF ${totalQuestions}` : 'ALL DONE'}
                </Text>
                <View style={styles.hudScoreRow}>
                  <PopNumber value={myCorrectCount} style={[Typography.headlineMd, { color: Colors.primary }]} />
                  <Text style={[Typography.headlineMd, { color: Colors.onSurface }]}> correct</Text>
                </View>
              </View>
              <ClayCard radius={16} shadow="chip" bg={Colors.surfaceContainerHigh} glow={false} innerStyle={styles.chipPad}>
                <View style={styles.chipRow}>
                  {opponentDone ? (
                    <MaterialIcons name="check-circle" size={14} color={Colors.success} />
                  ) : (
                    <ClayBreath min={0.35} duration={1300}>
                      <View style={styles.liveDot} />
                    </ClayBreath>
                  )}
                  <Text style={[Typography.labelSm, { color: Colors.onSurfaceVariant }]}>
                    {opponentName} ·{' '}
                    {opponentDone ? 'finished' : `Q${Math.min(opponentIndex + 1, totalQuestions)}`}
                  </Text>
                </View>
              </ClayCard>
            </View>
          </ClayCard>
        </ClayIn>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: totalQuestions }).map((_, i) => {
            const h = history.find((x) => x.index === i);
            const isCurrent = current?.index === i;
            const key = `d-${i}-${h ? (h.myCorrect ? 'ok' : 'no') : isCurrent ? 'cur' : 'todo'}`;
            return (
              <ClayIn key={key} delay={i * 25} overshoot>
                <View
                  style={[
                    styles.dot,
                    h?.myCorrect
                      ? styles.dotCorrect
                      : h
                      ? styles.dotWrong
                      : isCurrent
                      ? styles.dotCurrent
                      : styles.dotTodo,
                  ]}
                />
              </ClayIn>
            );
          })}
        </View>

        {/* Hero question card */}
        <ClayIn delay={110}>
          <Animated.View style={{ transform: [{ scale: pulseV }] }}>
            <ClayCard radius={30} innerStyle={styles.questionPad}>
              <View key={feedback ? `fb-${feedback.index}` : `q-${current?.index ?? 'none'}`}>
                <ClayIn overshoot>
                  {current && !feedback ? (
                    <>
                      <View style={styles.timeHead}>
                        <Text style={[Typography.labelSm, styles.solveLabel]}>SOLVE IT</Text>
                        <Text
                          style={[
                            Typography.labelMd,
                            { color: secondsLeft <= 5 ? Colors.error : Colors.success, fontWeight: '700' },
                          ]}
                        >
                          {secondsLeft}s
                        </Text>
                      </View>
                      <View style={styles.timeTrack}>
                        <View
                          style={[
                            styles.timeFill,
                            {
                              width: `${timeRatio * 100}%`,
                              backgroundColor: secondsLeft <= 5 ? Colors.error : Colors.success,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.equation}>{current.text}</Text>
                      <View style={styles.answerRow}>
                        <ClayWell radius={20} style={styles.answerWell}>
                          <TextInput
                            value={answerInput}
                            onChangeText={(t) => setAnswerInput(t.replace(/[^0-9]/g, ''))}
                            keyboardType="number-pad"
                            maxLength={6}
                            placeholder="?"
                            placeholderTextColor={Colors.outline}
                            style={[Typography.displayHero, styles.answerInput]}
                          />
                        </ClayWell>
                        <ClayButton
                          title="Answer"
                          icon="check"
                          size="lg"
                          loading={submitting}
                          disabled={parsedAnswer === null}
                          onPress={() => handleSubmit(parsedAnswer)}
                        />
                      </View>
                      <ClayButton
                        title="skip this one"
                        icon="skip-next"
                        variant="ghost"
                        size="sm"
                        onPress={handleSkip}
                        style={styles.skipBtn}
                      />
                    </>
                  ) : feedback ? (
                    <View style={styles.feedbackCenter}>
                      <MaterialIcons
                        name={feedback.correct ? 'check-circle' : 'cancel'}
                        size={26}
                        color={feedback.correct ? Colors.success : Colors.error}
                      />
                      <Text
                        style={[
                          Typography.titleMd,
                          { color: feedback.correct ? Colors.onSecondaryContainer : Colors.error },
                        ]}
                      >
                        {feedback.correct
                          ? 'Correct! +1'
                          : feedback.myAnswer === null
                          ? "Time's up"
                          : 'Not quite'}
                      </Text>
                      <Text style={[Typography.bodySm, styles.feedbackEquation]}>
                        {history.find((h) => h.index === feedback.index)?.text ?? ''}
                      </Text>
                      {feedback.correct ? (
                        <>
                          <Text style={[Typography.bodyMd, { color: Colors.onSurface, marginBottom: 6 }]}>
                            {feedback.correctAnswer} — exactly right.
                          </Text>
                          <AutoAdvanceBar ms={AUTO_NEXT_MS} tint={Colors.success} />
                        </>
                      ) : (
                        <Text style={[Typography.bodyMd, { color: Colors.onSurface, marginBottom: 6 }]}>
                          The answer was {feedback.correctAnswer}.
                        </Text>
                      )}
                      {!feedback.correct &&
                        (current ? (
                          <ClayButton
                            title="Next equation"
                            icon="arrow-forward"
                            onPress={() => setFeedback(null)}
                            style={{ marginTop: 10 }}
                          />
                        ) : (
                          <ClayWell radius={16} style={styles.waitWell}>
                            <Text style={[Typography.bodySm, styles.waitText]}>
                              You finished all {totalQuestions} —{' '}
                              {opponentDone ? 'comparing scores…' : `${opponentName} is still solving…`}
                            </Text>
                          </ClayWell>
                        ))}
                    </View>
                  ) : iAmDone ? (
                    <ClayWell radius={16} style={styles.waitWell}>
                      <Text style={[Typography.bodySm, styles.waitText]}>
                        Waiting for {opponentName} to finish…
                      </Text>
                    </ClayWell>
                  ) : null}
                </ClayIn>
              </View>
            </ClayCard>
          </Animated.View>
        </ClayIn>
      </ScrollView>
    </View>
  );
}

/** Opponent's correct count — only available once the duel is finished. */
function opponentCorrectCount(
  state: NonNullable<ReturnType<typeof useSocketStore.getState>['mathState']>,
  myId: string
): number {
  if (state.phase !== 'finished' || !state.stats) return 0;
  const opponentId = state.playerIds.find((id) => id !== myId);
  return (opponentId && state.stats.scores[opponentId]) || 0;
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
  loadingPad: {
    padding: 20,
  },

  /* HUD */
  hudPad: {
    padding: 14,
  },
  hudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudLeft: {
    gap: 2,
  },
  hudLabel: {
    color: Colors.onSurfaceVariant,
    letterSpacing: 1,
  },
  hudScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chipPad: {
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    alignItems: 'center',
    height: 20,
    marginVertical: 12,
  },
  dot: {
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  dotCorrect: {
    backgroundColor: Colors.success,
  },
  dotWrong: {
    backgroundColor: Colors.error,
  },
  dotCurrent: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    ...ClayShadows.chip,
  },
  dotTodo: {
    backgroundColor: Colors.surfaceContainerHighest,
  },

  /* Hero question card */
  questionPad: {
    padding: 18,
  },
  timeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  solveLabel: {
    color: Colors.onSurfaceVariant,
    letterSpacing: 1.2,
  },
  timeTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(185,138,110,0.18)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  timeFill: {
    height: 10,
    borderRadius: 5,
  },
  equation: {
    fontSize: 46,
    fontWeight: '800',
    color: Colors.onSurface,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 18,
    textShadowColor: 'rgba(185,138,110,0.28)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  answerWell: {
    flex: 1,
  },
  answerInput: {
    color: Colors.onSurface,
    textAlign: 'center',
    paddingVertical: 10,
  },
  skipBtn: {
    alignSelf: 'center',
    marginTop: 6,
  },

  /* Feedback */
  feedbackCenter: {
    alignItems: 'center',
    gap: 6,
  },
  feedbackEquation: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  autoBarTrack: {
    width: '62%',
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(185,138,110,0.18)',
    overflow: 'hidden',
    marginTop: 4,
  },
  autoBarFill: {
    height: 6,
    borderRadius: 3,
  },
  waitWell: {
    padding: 14,
    marginTop: 6,
  },
  waitText: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },

  /* Finished */
  celebration: {
    alignItems: 'center',
    marginBottom: 22,
  },
  trophy: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roundLabel: {
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  finalScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  celebrationSubtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  scoreboardRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  scoreCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  colRaised: {
    transform: [{ translateY: -4 }],
  },
  crownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFFAA',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    marginBottom: 6,
  },
  crownText: {
    color: Colors.onSecondaryContainer,
  },
  scoreWho: {
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  scoreMeta: {
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },

  /* Recap */
  recapPad: {
    padding: 14,
  },
  recapTitle: {
    color: Colors.tertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  recapList: {
    gap: 8,
  },
  recapItem: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
    gap: 9,
  },
  recapBadge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapBadgeText: {
    color: Colors.onSurfaceVariant,
    fontWeight: '700',
  },
  recapTextCol: {
    flex: 1,
  },
  recapMarks: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButtons: {
    marginTop: 6,
  },
});
