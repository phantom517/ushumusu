import React, { useState } from 'react';
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
import { WyrChoice } from '@tether/shared';

const prettyOption = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

export default function WouldYouRatherScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const wyrState = useSocketStore((s) => s.wyrState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [tentative, setTentative] = useState<WyrChoice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);

  if (!wyrState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Session" />
        <View style={styles.loadingBox}>
          <Text style={Typography.bodyMd}>Connecting to game session...</Text>
        </View>
      </View>
    );
  }

  const { phase, currentRound, history, totalRounds, finishReason, stats } = wyrState;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Companion';

  const handlePick = (choice: WyrChoice) => {
    if (phase !== 'answering' || currentRound?.hasAnswered || submitting) return;
    setTentative(choice);
  };

  const handleLockIn = async () => {
    if (!tentative || !currentRound || currentRound.hasAnswered) return;
    setSubmitting(true);
    const res = await socketService.submitWyrAnswer(tentative);
    setSubmitting(false);
    if (!res.success) {
      Alert.alert('Answer Notice', res.error || 'Failed to submit answer');
      return;
    }
    setTentative(null);
  };

  const handleNextRound = async () => {
    if (advancing) return;
    setAdvancing(true);
    const res = await socketService.nextWyrRound();
    setAdvancing(false);
    if (!res.success) {
      Alert.alert('Round Notice', res.error || 'Failed to advance the round');
    }
  };

  const handleRematch = async () => {
    setRematchSent(true);
    await socketService.voteRematch(true);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
  };

  const isLastRound = currentRound ? currentRound.index >= totalRounds - 1 : false;

  /* ------------------------------- FINISHED ------------------------------- */
  if (phase === 'finished') {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Results" showBack onBack={handleReturnHome} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.celebrationSection}>
            <View style={[styles.trophyCircle, { backgroundColor: Colors.secondaryContainer }]}>
              <MaterialIcons name="diversity-2" size={36} color={Colors.secondary} />
            </View>
            <Text style={[Typography.labelSm, styles.roundLabel]}>SESSION COMPLETE</Text>
            <Text style={[Typography.headlineLg, styles.celebrationTitle]}>
              You matched {stats?.syncedRounds ?? 0} of {stats?.completedRounds ?? totalRounds} picks
            </Text>
            <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
              {finishReason || 'Two minds, one shared taste.'}
            </Text>
          </View>

          <View style={styles.statsCard}>
            <View style={styles.resonanceRingRow}>
              <View style={styles.scoreCircle}>
                <Text style={[Typography.headlineMd, styles.scoreValue]}>
                  {stats?.agreementPercent ?? 0}%
                </Text>
              </View>
              <View style={styles.scoreDetails}>
                <Text style={[Typography.titleMd, styles.scoreHeading]}>Taste Harmony</Text>
                <Text style={[Typography.bodySm, styles.scoreDescription]}>
                  How often you two picked the same side.
                </Text>
              </View>
            </View>

            <View style={styles.highlightsGrid}>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Rounds played</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.completedRounds ?? totalRounds}
                </Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>In sync</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>
                  {stats?.syncedRounds ?? 0}
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

          {/* Round recap */}
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
                    <Text style={[Typography.bodySm, styles.historyQuestion]} numberOfLines={2}>
                      {prettyOption(round.question)}
                    </Text>
                    <Text style={[Typography.bodySm, styles.historyPicks]}>
                      You: {prettyOption(round.myChoice === 'a' ? round.optionA : round.optionB)} ·{' '}
                      {opponentName}:{' '}
                      {prettyOption(round.opponentChoice === 'a' ? round.optionA : round.optionB)}
                    </Text>
                  </View>
                  <MaterialIcons
                    name={round.isSynced ? 'check-circle' : 'swap-horiz'}
                    size={16}
                    color={round.isSynced ? Colors.secondary : Colors.tertiary}
                  />
                </View>
              ))}
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TactileButton
              title={
                rematchSent ? `Rematch requested… awaiting ${opponentName}` : `Rematch with ${opponentName}`
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

  /* ---------------------------- PLAYING / REVEAL ---------------------------- */
  const question = currentRound!;
  const myLabel = question.myChoice
    ? prettyOption(question.myChoice === 'a' ? question.optionA : question.optionB)
    : '';
  const opponentLabel = question.opponentChoice
    ? prettyOption(question.opponentChoice === 'a' ? question.optionA : question.optionB)
    : '';
  const isSynced = phase === 'reveal' ? question.isSynced : false;
  const pendingMyLock = !!tentative && !question.hasAnswered;

  const renderOptionCard = (choice: WyrChoice, optionText: string, accent: string) => {
    const isSelected =
      phase === 'reveal'
        ? question.myChoice === choice
        : (tentative === choice && !question.hasAnswered) ||
          (question.hasAnswered && question.myChoice === choice);
    const isOpponentPick = phase === 'reveal' && question.opponentChoice === choice;

    return (
      <TouchableOpacity
        key={choice}
        activeOpacity={0.85}
        disabled={phase !== 'answering' || question.hasAnswered}
        onPress={() => handlePick(choice)}
        style={[
          styles.optionCard,
          isSelected && styles.optionCardSelected,
          isSelected && { borderColor: accent },
        ]}
      >
        <View style={[styles.optionLetter, { backgroundColor: accent + '22' }]}>
          <Text style={[Typography.labelLg, { color: accent, fontWeight: '700' }]}>
            {choice.toUpperCase()}
          </Text>
        </View>
        <Text style={[Typography.bodyLg, styles.optionText, isSelected && { color: Colors.onSurface }]}>
          {prettyOption(optionText)}
        </Text>
        {isOpponentPick && (
          <MaterialIcons name="person" size={16} color={Colors.secondary} style={styles.optionFlag} />
        )}
        {isSelected && <MaterialIcons name="check" size={18} color={accent} style={styles.optionFlag} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Tether"
        subtitle="Would You Rather?"
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
        {/* Round progress */}
        <View style={styles.turnCard}>
          <View style={styles.turnLeft}>
            <View
              style={[
                styles.turnDot,
                { backgroundColor: phase === 'reveal' ? Colors.secondary : Colors.primary },
              ]}
            />
            <Text style={[Typography.labelMd, { color: Colors.onSurface }]}>
              {phase === 'reveal'
                ? 'Both answered!'
                : question.hasAnswered
                ? `Waiting for ${opponentName}…`
                : 'Pick your side'}
            </Text>
          </View>
          <Text style={[Typography.labelSm, styles.roundCounter]}>
            Round {question.index + 1} of {totalRounds}
          </Text>
        </View>

        <View style={styles.dotsRow}>
          {Array.from({ length: totalRounds }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.inquiryDot,
                {
                  backgroundColor:
                    i < history.length + (phase === 'reveal' ? 1 : 0)
                      ? Colors.secondary
                      : Colors.surfaceContainerHighest,
                },
              ]}
            />
          ))}
        </View>

        {/* Question */}
        <View style={styles.questionCard}>
          <Text style={[Typography.labelSm, styles.questionEyebrow]}>WOULD YOU RATHER…</Text>
          <View style={styles.optionsColumn}>
            {renderOptionCard('a', question.optionA, Colors.primary)}
            {renderOptionCard('b', question.optionB, Colors.secondary)}
          </View>

          {pendingMyLock && (
            <TactileButton
              title="Lock in answer"
              icon="lock"
              variant="primary"
              size="lg"
              loading={submitting}
              onPress={handleLockIn}
              style={{ marginTop: 12 }}
            />
          )}
        </View>

        {/* Reveal panel */}
        {phase === 'reveal' && (
          <View
            style={[
              styles.revealCard,
              { backgroundColor: isSynced ? Colors.secondaryContainer : Colors.pinkContainer },
            ]}
          >
            <View style={styles.revealHeader}>
              <MaterialIcons
                name={isSynced ? 'check-circle' : 'swap-horiz'}
                size={20}
                color={isSynced ? Colors.secondary : Colors.pink}
              />
              <Text
                style={[
                  Typography.titleMd,
                  { color: isSynced ? Colors.onSecondaryContainer : Colors.onSurface },
                ]}
              >
                {isSynced ? 'Perfectly in sync!' : 'Different this time'}
              </Text>
            </View>

            <View style={styles.revealRow}>
              <View style={styles.revealPick}>
                <Text style={[Typography.labelSm, styles.revealWho]}>You</Text>
                <Text style={[Typography.bodySm, styles.revealChoice]}>{myLabel}</Text>
              </View>
              <View style={styles.revealPick}>
                <Text style={[Typography.labelSm, styles.revealWho]}>{opponentName}</Text>
                <Text style={[Typography.bodySm, styles.revealChoice]}>{opponentLabel}</Text>
              </View>
            </View>

            {isSynced ? (
              <Text style={[Typography.bodySm, styles.revealHint]}>
                Two hearts, one pick. Savor it.
              </Text>
            ) : (
              <Text style={[Typography.bodySm, styles.revealHint]}>
                Talk it out — why did you each choose your side?
              </Text>
            )}

            <TactileButton
              title={isLastRound ? 'See results' : 'Next question'}
              icon={isLastRound ? 'emoji-events' : 'arrow-forward'}
              variant="primary"
              size="lg"
              loading={advancing}
              onPress={handleNextRound}
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        {/* Past rounds */}
        {history.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={[Typography.labelMd, styles.historyTitle]}>PAST ROUNDS</Text>
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
                      <Text style={[Typography.bodySm, styles.historyQuestion]} numberOfLines={1}>
                        {prettyOption(round.question)}
                      </Text>
                      <Text style={[Typography.bodySm, styles.historyPicks]}>
                        {round.isSynced ? 'In sync' : 'Different'} · you picked{' '}
                        {round.myChoice === 'a' ? 'A' : 'B'}
                      </Text>
                    </View>
                    <MaterialIcons
                      name={round.isSynced ? 'check-circle' : 'swap-horiz'}
                      size={16}
                      color={round.isSynced ? Colors.secondary : Colors.tertiary}
                    />
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
    marginBottom: 10,
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
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: 12,
  },
  inquiryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  questionCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  questionEyebrow: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  optionsColumn: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: 14,
    gap: 12,
  },
  optionCardSelected: {
    backgroundColor: Colors.surfaceContainerLowest,
  },
  optionLetter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    color: Colors.onSurfaceVariant,
    lineHeight: 22,
  },
  optionFlag: {
    marginLeft: 4,
  },
  revealCard: {
    borderRadius: 20,
    padding: 16,
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
    marginBottom: 10,
  },
  revealPick: {
    flex: 1,
    backgroundColor: '#FFFFFFAA',
    borderRadius: 14,
    padding: 12,
  },
  revealWho: {
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  revealChoice: {
    color: Colors.onSurface,
    lineHeight: 18,
  },
  revealHint: {
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
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
  historyQuestion: {
    color: Colors.onSurface,
  },
  historyPicks: {
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
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
