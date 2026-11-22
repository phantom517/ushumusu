import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { Typography } from '../../src/theme/typography';
import { Header } from '../../src/components/Header';
import { Pulse } from '../../src/components/Pulse';
import { useSocketStore } from '../../src/stores/useSocketStore';
import { useProfileStore } from '../../src/stores/useProfileStore';
import { socketService } from '../../src/services/socketService';
import { TactileButton } from '../../src/components/TactileButton';

export default function ResultsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const hangmanState = useSocketStore((s) => s.hangmanState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [rematchSent, setRematchSent] = useState(false);
  const [requestingRematch, setRequestingRematch] = useState(false);

  const isWinner = hangmanState?.winnerPlayerId === profile?.id;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Your person';

  const myWord = hangmanState?.myState.secretWord || '';
  const opponentWord = hangmanState?.opponentState.secretWord || '';
  const stats = hangmanState?.stats || {
    totalInquiries: 14,
    durationSeconds: 120,
    resonancePercent: 92,
  };

  const connectionLine = () => {
    const r = stats.resonancePercent;
    if (r >= 80) return 'You two know each other pretty well!';
    if (r >= 50) return 'Pretty in sync, if you ask us.';
    return 'Someone is taking forever to answer… just kidding.';
  };

  const handleRematch = async () => {
    setRequestingRematch(true);
    setRematchSent(true);
    await socketService.voteRematch(true);
    setRequestingRematch(false);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
    router.replace('/home');
  };

  return (
    <View style={styles.screen}>
      <Header title="Tether" subtitle="The verdict" showBack onBack={handleReturnHome} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Celebration */}
        <View style={styles.celebrationSection}>
          <Pulse duration={1800} maxScale={1.12}>
            <View
              style={[
                styles.trophyCircle,
                { backgroundColor: isWinner ? Colors.primary : Colors.secondary },
              ]}
            >
              <MaterialIcons name={isWinner ? 'celebration' : 'favorite'} size={32} color="#FFFFFF" />
            </View>
          </Pulse>

          <Text style={[Typography.headlineItalic, styles.celebrationTitle]}>
            {isWinner ? 'You cracked it!' : `${opponentName} cracked yours!`}
          </Text>
          <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
            {connectionLine()}
          </Text>
        </View>

        {/* The answers */}
        <View style={styles.answersCard}>
          <View style={styles.answersHeader}>
            <Text style={[Typography.titleMd, styles.answersTitle]}>The answers</Text>
            <View style={styles.revealedBadge}>
              <Text style={[Typography.labelSm, styles.revealedBadgeText]}>all revealed</Text>
            </View>
          </View>

          {/* Their answer */}
          <View style={styles.wordSubCard}>
            <View style={styles.wordSubHeader}>
              <View style={styles.initialChip}>
                <Text style={[Typography.labelSm, styles.initialText]}>
                  {opponentName[0]}
                </Text>
              </View>
              <Text style={[Typography.labelLg, styles.wordOwnerName]}>
                {opponentName}'s answer
              </Text>
            </View>

            <View style={styles.lettersRow}>
              {opponentWord.split('').map((char, i) => (
                <View key={i} style={styles.letterTile}>
                  <Text style={[Typography.titleLg, styles.letterTileText]}>{char}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Your answer */}
          <View style={styles.wordSubCard}>
            <View style={styles.wordSubHeader}>
              <View style={[styles.initialChip, { backgroundColor: Colors.secondary }]}>
                <Text style={[Typography.labelSm, { color: '#FFF' }]}>
                  {profile?.displayName ? profile.displayName[0] : 'Y'}
                </Text>
              </View>
              <Text style={[Typography.labelLg, styles.wordOwnerName]}>Your answer</Text>
            </View>

            <View style={styles.lettersRow}>
              {myWord.split('').map((char, i) => (
                <View key={i} style={styles.letterTile}>
                  <Text style={[Typography.titleLg, styles.letterTileText]}>{char}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Your connection */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={[Typography.titleMd, styles.statsTitle]}>Your connection</Text>
            <View style={styles.resonancePill}>
              <MaterialIcons name="favorite" size={14} color={Colors.primary} />
              <Text style={[Typography.labelMd, styles.resonanceText]}>hearts in sync</Text>
            </View>
          </View>

          <View style={styles.resonanceRow}>
            <View style={styles.scoreCircle}>
              <Text style={[Typography.headlineMd, styles.scoreValue]}>
                {stats.resonancePercent}%
              </Text>
            </View>
            <View style={styles.scoreDetails}>
              <Text style={[Typography.titleMd, styles.scoreHeading]}>In sync</Text>
              <Text style={[Typography.bodySm, styles.scoreDescription]}>
                How closely your peeks and questions found each other this round.
              </Text>
            </View>
          </View>

          <View style={styles.highlightsRow}>
            <View style={styles.highlightItem}>
              <Text style={[Typography.labelSm, styles.highlightLabel]}>Peeks shared</Text>
              <Text style={[Typography.headlineMd, styles.highlightValue]}>
                {stats.totalInquiries}
              </Text>
            </View>
            <View style={styles.highlightItem}>
              <Text style={[Typography.labelSm, styles.highlightLabel]}>Time together</Text>
              <Text style={[Typography.headlineMd, styles.highlightValue]}>
                {Math.floor(stats.durationSeconds / 60)}m {stats.durationSeconds % 60}s
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionButtons}>
          <TactileButton
            title={
              rematchSent
                ? `Waiting for ${opponentName}…`
                : 'One more round?'
            }
            icon={rematchSent ? 'hourglass-empty' : 'cached'}
            variant={rematchSent ? 'secondary' : 'primary'}
            size="lg"
            loading={requestingRematch}
            disabled={rematchSent}
            onPress={handleRematch}
          />

          <TactileButton
            title="Back to our space"
            icon="cottage"
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  celebrationSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  trophyCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  celebrationTitle: {
    color: Colors.onSurface,
    textAlign: 'center',
    marginBottom: 6,
  },
  celebrationSubtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  answersCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  answersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  answersTitle: {
    color: Colors.onSurface,
  },
  revealedBadge: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  revealedBadgeText: {
    color: Colors.onSecondaryContainer,
  },
  wordSubCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  wordSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  initialChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#FFF',
  },
  wordOwnerName: {
    color: Colors.onSurface,
  },
  lettersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  letterTile: {
    width: 38,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  letterTileText: {
    color: Colors.onSurface,
  },
  statsCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  statsTitle: {
    color: Colors.onSurface,
  },
  resonancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resonanceText: {
    color: Colors.primary,
  },
  resonanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 14,
    borderRadius: 16,
    marginBottom: 12,
    gap: 14,
  },
  scoreCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  scoreValue: {
    color: Colors.onSurface,
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
  highlightsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  highlightItem: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  highlightLabel: {
    color: Colors.onSurfaceVariant,
  },
  highlightValue: {
    color: Colors.onSurface,
    marginTop: 2,
  },
  actionButtons: {
    marginTop: 4,
  },
});
