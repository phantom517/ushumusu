import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';
import { Header } from '../src/components/Header';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useSocketStore } from '../src/stores/useSocketStore';
import { AvatarView } from '../src/components/AvatarView';
import { TactileButton } from '../src/components/TactileButton';
import { Pulse } from '../src/components/Pulse';
import { socketService } from '../src/services/socketService';
import { AVAILABLE_GAMES } from '@tether/shared';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const localPlayerSummary = currentRoom?.players.find((p) => p.profile.id === profile?.id);
  const remotePlayerSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);

  const isLocalReady = !!localPlayerSummary?.isReady;
  const isRemoteReady = !!remotePlayerSummary?.isReady;
  const bothReady = isLocalReady && isRemoteReady;

  const game = AVAILABLE_GAMES.find((g) => g.id === (currentRoom?.gameId || 'coding-hangman')) ??
    AVAILABLE_GAMES[0];

  const [togglingReady, setTogglingReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleToggleReady = async () => {
    setTogglingReady(true);
    await socketService.toggleReady(!isLocalReady);
    setTogglingReady(false);
  };

  const handleStart = async () => {
    setStarting(true);
    await socketService.startRoom();
    setStarting(false);
  };

  const handleLeave = async () => {
    await socketService.leaveRoom();
    router.replace('/home');
  };

  return (
    <View style={styles.screen}>
      <Header title="Tether" subtitle="Your cozy corner" showBack onBack={handleLeave} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Room header */}
        <View style={styles.roomHeader}>
          <Text style={[Typography.headlineItalic, styles.roomTitle]}>
            {bothReady ? "You're both in!" : 'A little room just for you'}
          </Text>
          <View style={styles.roomChip}>
            <Text style={[Typography.labelSm, styles.roomChipText]}>
              #{currentRoom?.roomId?.replace('room-', '').toUpperCase() || 'DUO'}
            </Text>
          </View>
        </View>

        {/* Two people + tether */}
        <View style={styles.connectionCard}>
          <View style={styles.playersRow}>
            {/* You */}
            <View style={styles.playerColumn}>
              <AvatarView
                avatar={profile?.avatar}
                size={62}
                showBadge
                badgeType={isLocalReady ? 'check' : 'pulse'}
                badgeColor={isLocalReady ? Colors.secondary : Colors.primary}
              />
              <Text style={[Typography.titleMd, styles.playerName]} numberOfLines={1}>
                {profile?.displayName}
              </Text>
              <View
                style={[
                  styles.readyChip,
                  {
                    backgroundColor: isLocalReady
                      ? Colors.secondaryContainer
                      : Colors.surfaceContainer,
                  },
                ]}
              >
                <Text
                  style={[
                    Typography.labelSm,
                    {
                      color: isLocalReady
                        ? Colors.onSecondaryContainer
                        : Colors.onSurfaceVariant,
                    },
                  ]}
                >
                  {isLocalReady ? "I'm in" : 'Deciding…'}
                </Text>
              </View>
            </View>

            {/* Tether */}
            <View style={styles.tetherAxis}>
              <View style={styles.tetherLine} />
              <Pulse duration={1600} maxScale={1.2}>
                <View style={styles.tetherHeart}>
                  <MaterialIcons name="favorite" size={16} color="#FFFFFF" />
                </View>
              </Pulse>
              <View style={styles.tetherTag}>
                <Text style={[Typography.labelSm, styles.tetherTagText]}>
                  {bothReady ? 'perfectly in sync' : 'tethered'}
                </Text>
              </View>
            </View>

            {/* Them */}
            <View style={styles.playerColumn}>
              <AvatarView
                avatar={remotePlayerSummary?.profile.avatar}
                size={62}
                showBadge
                badgeType={isRemoteReady ? 'check' : 'pulse'}
                badgeColor={isRemoteReady ? Colors.secondary : Colors.primary}
              />
              <Text style={[Typography.titleMd, styles.playerName]} numberOfLines={1}>
                {remotePlayerSummary?.profile.displayName || 'Your person'}
              </Text>
              <View
                style={[
                  styles.readyChip,
                  {
                    backgroundColor: isRemoteReady
                      ? Colors.secondaryContainer
                      : Colors.surfaceContainer,
                  },
                ]}
              >
                <Text
                  style={[
                    Typography.labelSm,
                    {
                      color: isRemoteReady
                        ? Colors.onSecondaryContainer
                        : Colors.onSurfaceVariant,
                    },
                  ]}
                >
                  {isRemoteReady ? "They're in" : 'Still thinking…'}
                </Text>
              </View>
            </View>
          </View>

          {/* Mutual ribbon */}
          <View
            style={[
              styles.mutualRibbon,
              bothReady && { backgroundColor: Colors.secondaryContainer },
            ]}
          >
            <MaterialIcons
              name={bothReady ? 'celebration' : 'hourglass-empty'}
              size={16}
              color={bothReady ? Colors.onSecondaryContainer : Colors.tertiary}
            />
            <Text
              style={[
                Typography.labelSm,
                { color: bothReady ? Colors.onSecondaryContainer : Colors.onSurfaceVariant },
              ]}
            >
              {bothReady
                ? 'Both of you are in — off you go'
                : 'One little tap and the game begins'}
            </Text>
          </View>
        </View>

        {/* Game card */}
        <View style={styles.gameSection}>
          <Text style={[Typography.labelMd, styles.sectionHeader]}>tonight's game</Text>
          <View style={styles.gameCard}>
            <View style={styles.gameIconTile}>
              <MaterialIcons name={game.icon as any} size={26} color={Colors.primary} />
            </View>
            <View style={styles.gameInfo}>
              <View style={styles.gameTitleRow}>
                <Text style={[Typography.headlineMd, styles.gameTitle]}>{game.name}</Text>
              </View>
              <Text style={[Typography.bodySm, styles.gameSubtitle]} numberOfLines={2}>
                {game.description}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsDeck}>
          <TactileButton
            title={isLocalReady ? 'Actually, not yet' : "I'm in"}
            icon={isLocalReady ? 'radio-button-unchecked' : 'favorite'}
            variant={isLocalReady ? 'secondary' : 'primary'}
            size="lg"
            loading={togglingReady}
            onPress={handleToggleReady}
          />

          {bothReady && (
            <TactileButton
              title="Start together"
              icon="play-arrow"
              variant="primary"
              size="lg"
              loading={starting}
              onPress={handleStart}
              style={{ marginTop: 10, backgroundColor: Colors.secondary }}
            />
          )}

          <TactileButton
            title="Slip out quietly"
            variant="ghost"
            size="md"
            icon="logout"
            onPress={handleLeave}
            style={{ marginTop: 8 }}
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
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  roomTitle: {
    color: Colors.onSurface,
    flex: 1,
    marginRight: 10,
  },
  roomChip: {
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  roomChipText: {
    color: Colors.onSurfaceVariant,
  },
  connectionCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 22,
  },
  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playerColumn: {
    alignItems: 'center',
    width: 104,
  },
  playerName: {
    color: Colors.onSurface,
    marginTop: 8,
    textAlign: 'center',
  },
  readyChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 5,
  },
  tetherAxis: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    position: 'relative',
    height: 84,
  },
  tetherLine: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: Colors.outlineVariant,
    borderRadius: 1,
  },
  tetherHeart: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  tetherTag: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tetherTagText: {
    color: Colors.onSurfaceVariant,
  },
  mutualRibbon: {
    marginTop: 18,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  gameSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    color: Colors.onSurfaceVariant,
    marginBottom: 8,
  },
  gameCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 14,
  },
  gameIconTile: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gameInfo: {
    flex: 1,
  },
  gameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gameTitle: {
    color: Colors.onSurface,
  },
  gameSubtitle: {
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  actionsDeck: {
    marginTop: 10,
  },
});
