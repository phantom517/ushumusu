import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';
import { useSocketStore } from '../src/stores/useSocketStore';
import { useProfileStore } from '../src/stores/useProfileStore';
import { socketService } from '../src/services/socketService';
import { TactileButton } from '../src/components/TactileButton';
import { AvatarView } from '../src/components/AvatarView';
import { Pulse } from '../src/components/Pulse';

const WAITING_QUIPS = [
  'Waiting for your favorite human…',
  "They're probably picking the perfect word…",
  'Someone is taking forever to answer. Adorable.',
  'Psst — maybe nudge them in real life?',
  'Checking under the couch… nope, not here.',
  'Good things take time. So do they. ♡',
];

export default function MatchmakingScreen() {
  const router = useRouter();
  const { gameId } = useLocalSearchParams<{ gameId?: string }>();
  const profile = useProfileStore((s) => s.profile);
  const matchmakingMessage = useSocketStore((s) => s.matchmakingMessage);
  const [error, setError] = useState<string | null>(null);
  const [quipIndex, setQuipIndex] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function startMatchmaking() {
      const res = await socketService.joinMatchmaking(gameId || 'coding-hangman');
      if (!res.success && isMounted) {
        setError(res.error || 'Could not reach your person — try again?');
      }
    }

    startMatchmaking();

    return () => {
      isMounted = false;
    };
  }, [gameId]);

  useEffect(() => {
    if (error) return;
    const interval = setInterval(() => {
      setQuipIndex((i) => (i + 1) % WAITING_QUIPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [error]);

  const handleCancel = async () => {
    await socketService.cancelMatchmaking();
    router.back();
  };

  const showQuips = !error && !matchmakingMessage;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Badge */}
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Pulse duration={1800} maxScale={1.4}>
              <View style={styles.pulseDot} />
            </Pulse>
            <Text style={[Typography.labelMd, styles.badgeText]}>Waiting for your person</Text>
          </View>
        </View>

        {/* Two avatars + tether */}
        <View style={styles.animationArea}>
          <View style={styles.avatarBubble}>
            <AvatarView avatar={profile?.avatar} size={72} />
          </View>

          <View style={styles.tether}>
            <View style={styles.tetherLine} />
            <Pulse duration={1400} maxScale={1.25}>
              <View style={styles.tetherHeart}>
                <MaterialIcons name="favorite" size={18} color="#FFFFFF" />
              </View>
            </Pulse>
          </View>

          <View style={[styles.avatarBubble, styles.mysteryBubble]}>
            <View style={styles.mysteryInner}>
              <MaterialIcons name="help-outline" size={30} color={Colors.outline} />
            </View>
          </View>
        </View>

        {/* Copy */}
        <Text style={[Typography.headlineItalic, styles.title]}>Just you two, soon</Text>
        <Text style={[Typography.bodyMd, styles.subtitle]}>
          {error || matchmakingMessage || (showQuips ? WAITING_QUIPS[quipIndex] : '')}
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <MaterialIcons name="favorite" size={16} color={Colors.primary} />
            <Text style={[Typography.labelSm, styles.infoText]}>
              Private pairing — only the two of you
            </Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <MaterialIcons name="bolt" size={16} color={Colors.secondary} />
            <Text style={[Typography.labelSm, styles.infoText]}>
              You will hop into the room the second they arrive
            </Text>
          </View>
        </View>

        {/* Cancel */}
        <View style={styles.bottomBar}>
          <TactileButton
            title="Wait, actually not yet"
            variant="secondary"
            size="lg"
            icon="close"
            onPress={handleCancel}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    marginBottom: 32,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  badgeText: {
    color: Colors.onPrimaryContainer,
  },
  animationArea: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  avatarBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  mysteryBubble: {
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
  },
  mysteryInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tether: {
    width: 74,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tetherLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 2,
    marginTop: -1,
    backgroundColor: Colors.outlineVariant,
    borderRadius: 1,
  },
  tetherHeart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  title: {
    color: Colors.onSurface,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 21,
    marginBottom: 28,
    minHeight: 21,
  },
  infoCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    width: '100%',
    marginBottom: 30,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: Colors.onSurfaceVariant,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 10,
  },
  bottomBar: {
    width: '100%',
  },
});
