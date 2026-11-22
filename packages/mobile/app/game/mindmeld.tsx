import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
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
import { PopNumber } from '../../src/components/Clay';
import { TactileButton } from '../../src/components/TactileButton';
import { MINDMELD_CONFIG, closenessLabel } from '@tether/shared';

const closenessColor = (score: number): string =>
  score >= 75 ? Colors.secondary : score >= 45 ? Colors.gold : Colors.pink;

export default function MindMeldScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const mindmeldState = useSocketStore((s) => s.mindmeldState);
  const mindmeldVibe = useSocketStore((s) => s.mindmeldVibe);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [word, setWord] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);

  if (!mindmeldState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Session" />
        <View style={styles.loadingBox}>
          <Text style={Typography.bodyMd}>Connecting to game session...</Text>
        </View>
      </View>
    );
  }

  const { phase, roundIndex, myWord, hasSubmitted, opponentHasSubmitted, reveal, history, finishReason, stats } =
    mindmeldState;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Companion';

  // Only the CURRENT revealed round's vibe — stale pushes from older rounds are ignored
  const vibe =
    phase === 'reveal' && mindmeldVibe && mindmeldVibe.roundIndex === roundIndex
      ? mindmeldVibe.vibe
      : null;

  // Vector-refined closeness lands a moment after the instant estimate —
  // replace the meter once it arrives for this exact round.
  const refinedScore =
    phase === 'reveal' && mindmeldVibe && mindmeldVibe.roundIndex === roundIndex
      ? mindmeldVibe.closeness ?? null
      : null;
  const shownScore = refinedScore ?? reveal?.closeness?.score ?? 0;
  const shownLabel = refinedScore != null ? closenessLabel(refinedScore) : reveal?.closeness?.label ?? '';

  const handleWordChange = (t: string) => {
    // Letters only — it is a word game, after all
    setWord(t.replace(/[^a-zA-Z]/g, '').toUpperCase());
  };

  const handleSeal = async () => {
    const clean = word.trim().toLowerCase();
    if (clean.length < MINDMELD_CONFIG.MIN_WORD_LENGTH || submitting) return;
    setSubmitting(true);
    const res = await socketService.submitMindmeldWord(clean);
    setSubmitting(false);
    if (!res.success) {
      Alert.alert('Word Notice', res.error || 'Could not seal your word');
      return;
    }
    setWord('');
  };

  const handleNextRound = async () => {
    if (advancing) return;
    setAdvancing(true);
    const res = await socketService.nextMindmeldRound();
    setAdvancing(false);
    if (!res.success) {
      Alert.alert('Round Notice', res.error || 'Could not start the next word');
    }
  };

  const handleRematch = async () => {
    setRematchSent(true);
    await socketService.voteRematch(true);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
  };

  /* --------------------------------- WON --------------------------------- */
  if (phase === 'won') {
    const winningWord = history.length > 0 ? history[history.length - 1] : null;
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Mind Meld" showBack onBack={handleReturnHome} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.celebrationSection}>
            <View style={[styles.trophyCircle, { backgroundColor: Colors.secondaryContainer }]}>
              <MaterialIcons name="psychology" size={36} color={Colors.secondary} />
            </View>
            <Text style={[Typography.labelSm, styles.roundLabel]}>MINDS MATCHED</Text>
            <Text style={[Typography.headlineLg, styles.celebrationTitle]}>
              {winningWord ? `“${winningWord.myWord.toUpperCase()}”` : 'One word'}
            </Text>
            <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
              {finishReason || 'You wrote the same word without saying a thing.'}
            </Text>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.resonanceRingRow}>
              <View style={styles.scoreCircle}>
                <Text style={[Typography.headlineMd, styles.scoreValue]}>
                  {stats?.bestCloseness ?? 0}%
                </Text>
              </View>
              <View style={styles.scoreDetails}>
                <Text style={[Typography.titleMd, styles.scoreHeading]}>Best near-miss</Text>
                <Text style={[Typography.bodySm, styles.scoreDescription]}>
                  How close you came before the minds finally merged.
                </Text>
              </View>
            </View>

            <View style={styles.highlightsGrid}>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Rounds till match</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.roundsPlayed ?? history.length}
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Missed tries</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.failedRounds ?? 0}
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Duration</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {Math.floor((stats?.durationSeconds ?? 0) / 60)}m {(stats?.durationSeconds ?? 0) % 60}s
                </Text>
              </View>
            </View>
          </View>

          {history.length > 0 && (
            <View style={styles.historyCard}>
              <Text style={[Typography.labelMd, styles.historyTitle]}>RECAP</Text>
              <View style={styles.historyList}>
                {history.map((round) => (
                  <View key={round.index} style={styles.historyItem}>
                    <View style={styles.historyBadge}>
                      <Text style={[Typography.labelSm, styles.historyBadgeText]}>
                        R{round.index + 1}
                      </Text>
                    </View>
                    <View style={styles.historyTextCol}>
                      <Text style={[Typography.bodySm, styles.historyWords]} numberOfLines={1}>
                        {round.myWord} · {round.opponentWord}
                      </Text>
                      <Text style={[Typography.labelSm, styles.historyPicks]}>
                        {round.closeness.score === 100 ? 'Matched!' : `${round.closeness.score}% · ${round.closeness.label}`}
                      </Text>
                    </View>
                    <MaterialIcons
                      name={round.closeness.score === 100 ? 'check-circle' : 'swap-horiz'}
                      size={16}
                      color={round.closeness.score === 100 ? Colors.secondary : Colors.tertiary}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actionButtons}>
            <TactileButton
              title={
                rematchSent
                  ? `Rematch requested… awaiting ${opponentName}`
                  : `Play again with ${opponentName}`
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

  /* --------------------------- WRITING / REVEAL --------------------------- */
  const waitingForOpponent = hasSubmitted && !opponentHasSubmitted && phase === 'writing';

  return (
    <View style={styles.screen}>
      <Header
        title="Tether"
        subtitle="Mind Meld"
        showBack
        onBack={() => {
          Alert.alert('Leave Match', 'Are you sure you want to exit the current match?', [
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
        {/* Round pill */}
        <View style={styles.turnCard}>
          <View style={styles.turnLeft}>
            <View
              style={[
                styles.turnDot,
                { backgroundColor: phase === 'reveal' ? Colors.gold : Colors.primary },
              ]}
            />
            <Text style={[Typography.labelMd, { color: Colors.onSurface }]}>
              {phase === 'reveal'
                ? 'Both words revealed!'
                : waitingForOpponent
                ? `Sealed — waiting for ${opponentName}…`
                : 'Write one word, in silence'}
            </Text>
          </View>
          <Text style={[Typography.labelSm, styles.roundCounter]}>Round {roundIndex + 1}</Text>
        </View>

        {phase === 'writing' ? (
          <View style={styles.wordCard}>
            <Text style={[Typography.labelSm, styles.wordEyebrow]}>ONE WORD, NO HINTS</Text>
            {!hasSubmitted ? (
              <>
                <View style={styles.wordInputContainer}>
                  <MaterialIcons
                    name="psychology"
                    size={20}
                    color={Colors.primary}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    value={word}
                    onChangeText={handleWordChange}
                    maxLength={MINDMELD_CONFIG.MAX_WORD_LENGTH}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="ANY WORD AT ALL"
                    placeholderTextColor={Colors.outline}
                    style={[Typography.headlineMd, styles.wordInput]}
                  />
                  {word.length > 0 && (
                    <TouchableOpacity onPress={() => setWord('')} style={styles.clearBtn}>
                      <MaterialIcons name="close" size={16} color={Colors.tertiary} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[Typography.labelSm, styles.charCounter]}>
                  {word.length} / {MINDMELD_CONFIG.MAX_WORD_LENGTH} letters · a feeling, a food, a place…
                </Text>
                <TactileButton
                  title={word.trim().length >= MINDMELD_CONFIG.MIN_WORD_LENGTH ? 'Seal your word' : 'Write a longer word'}
                  icon="lock"
                  variant="primary"
                  size="lg"
                  loading={submitting}
                  disabled={word.trim().length < MINDMELD_CONFIG.MIN_WORD_LENGTH}
                  onPress={handleSeal}
                  style={{ marginTop: 12 }}
                />
              </>
            ) : (
              <View style={styles.sealedBox}>
                <View style={styles.sealedRow}>
                  <MaterialIcons name="lock" size={16} color={Colors.secondary} />
                  <Text style={[Typography.labelMd, styles.sealedLabel]}>Sealed in silence</Text>
                </View>
                <Text style={[Typography.headlineMd, styles.sealedWord]}>{myWord?.toUpperCase()}</Text>
                <Text style={[Typography.bodySm, styles.sealedHint]}>
                  {opponentHasSubmitted
                    ? 'Your partner just sealed theirs — reveal is coming…'
                    : `${opponentName} is still writing…`}
                </Text>
              </View>
            )}
          </View>
        ) : (
          reveal && (
            <View style={styles.revealCard}>
              <View style={styles.revealHeader}>
                <MaterialIcons name="swap-horiz" size={20} color={closenessColor(shownScore)} />
                <Text style={[Typography.titleMd, { color: Colors.onSurface }]}>
                  {shownLabel}
                </Text>
              </View>

              <View style={styles.revealRow}>
                <View style={styles.revealPick}>
                  <Text style={[Typography.labelSm, styles.revealWho]}>You</Text>
                  <Text style={[Typography.headlineMd, styles.revealWord]}>
                    {reveal.myWord.toUpperCase()}
                  </Text>
                </View>
                <View style={styles.revealPick}>
                  <Text style={[Typography.labelSm, styles.revealWho]}>{opponentName}</Text>
                  <Text style={[Typography.headlineMd, styles.revealWord]}>
                    {reveal.opponentWord.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Closeness meter */}
              <View style={styles.meterBlock}>
                <View style={styles.meterTrack}>
                  <View
                    style={[
                      styles.meterFill,
                      {
                        width: `${shownScore}%`,
                        backgroundColor: closenessColor(shownScore),
                      },
                    ]}
                  />
                </View>
                <Text style={[Typography.labelLg, styles.meterValue, { color: closenessColor(shownScore) }]}>
                  <PopNumber value={shownScore} style={{ color: closenessColor(shownScore) }} />% mind closeness
                </Text>
              </View>

              {/* Tiny coincidences */}
              {(reveal.closeness.sameFirstLetter || reveal.closeness.sameLength) && (
                <View style={styles.flagsRow}>
                  {reveal.closeness.sameFirstLetter && (
                    <View style={styles.flagChip}>
                      <MaterialIcons name="abc" size={13} color={Colors.tertiary} />
                      <Text style={[Typography.labelSm, styles.flagText]}>same first letter</Text>
                    </View>
                  )}
                  {reveal.closeness.sameLength && (
                    <View style={styles.flagChip}>
                      <MaterialIcons name="straighten" size={13} color={Colors.tertiary} />
                      <Text style={[Typography.labelSm, styles.flagText]}>same length</Text>
                    </View>
                  )}
                </View>
              )}

              {/* AI vibe reading */}
              <Text style={[Typography.bodySm, styles.vibeText]}>
                {vibe ? `“${vibe}”` : 'Reading your minds…'}
              </Text>

              <TactileButton
                title="Next word"
                icon="arrow-forward"
                variant="primary"
                size="lg"
                loading={advancing}
                onPress={handleNextRound}
                style={{ marginTop: 12 }}
              />
            </View>
          )
        )}

        {/* Past rounds */}
        {history.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={[Typography.labelMd, styles.historyTitle]}>PAST WORDS</Text>
            <View style={styles.historyList}>
              {history
                .slice()
                .reverse()
                .map((round) => (
                  <View key={round.index} style={styles.historyItem}>
                    <View style={styles.historyBadge}>
                      <Text style={[Typography.labelSm, styles.historyBadgeText]}>
                        R{round.index + 1}
                      </Text>
                    </View>
                    <View style={styles.historyTextCol}>
                      <Text style={[Typography.bodySm, styles.historyWords]} numberOfLines={1}>
                        {round.myWord} · {round.opponentWord}
                      </Text>
                      <Text style={[Typography.labelSm, styles.historyPicks]}>
                        {round.closeness.score}% · {round.closeness.label}
                      </Text>
                    </View>
                    <MaterialIcons name="swap-horiz" size={16} color={closenessColor(round.closeness.score)} />
                  </View>
                ))}
            </View>
          </View>
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
  turnCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainerLowest,
    marginBottom: 12,
  },
  turnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  turnDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  roundCounter: {
    color: Colors.onSurfaceVariant,
  },

  /* Word input */
  wordCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  wordEyebrow: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  wordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  wordInput: {
    flex: 1,
    color: Colors.onSurface,
    paddingVertical: 12,
    letterSpacing: 2,
  },
  clearBtn: {
    padding: 6,
  },
  charCounter: {
    color: Colors.onSurfaceVariant,
    marginTop: 8,
  },
  sealedBox: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  sealedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  sealedLabel: {
    color: Colors.onSecondaryContainer,
  },
  sealedWord: {
    color: Colors.onSurface,
    letterSpacing: 3,
    marginBottom: 6,
  },
  sealedHint: {
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  /* Reveal */
  revealCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  revealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  revealRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  revealPick: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  revealWho: {
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  revealWord: {
    color: Colors.onSurface,
    letterSpacing: 2,
    textAlign: 'center',
  },
  meterBlock: {
    marginBottom: 10,
  },
  meterTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  meterFill: {
    height: 10,
    borderRadius: 5,
  },
  meterValue: {
    marginTop: 6,
    textAlign: 'center',
  },
  flagsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.tertiary + '1A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  flagText: {
    color: Colors.tertiary,
  },
  vibeText: {
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  /* History */
  historyCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  historyTitle: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  historyBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBadgeText: {
    color: Colors.onSurfaceVariant,
    fontWeight: '700',
  },
  historyTextCol: {
    flex: 1,
  },
  historyWords: {
    color: Colors.onSurface,
  },
  historyPicks: {
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },

  /* Won */
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
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  celebrationTitle: {
    color: Colors.onSurface,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
  },
  celebrationSubtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  resonanceRingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    gap: 14,
  },
  scoreCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.secondary,
  },
  scoreValue: {
    color: Colors.onSurface,
    fontWeight: '700',
  },
  scoreDetails: {
    flex: 1,
  },
  scoreHeading: {
    color: Colors.onSurface,
  },
  scoreDescription: {
    color: Colors.onSurfaceVariant,
    marginTop: 2,
    lineHeight: 16,
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
