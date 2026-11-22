import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useProfileStore } from '../stores/useProfileStore';
import { useSocketStore } from '../stores/useSocketStore';
import { AvatarView } from './AvatarView';
import { router } from 'expo-router';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  showCompanionStatus?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Tether',
  subtitle,
  showBack = false,
  onBack,
  showCompanionStatus = true,
}) => {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const isConnected = useSocketStore((s) => s.isConnected);
  const isConnecting = useSocketStore((s) => s.isConnecting);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  // Partner in the current room (if any)
  const opponent = currentRoom?.players.find((p) => p.profile.id !== profile?.id);

  const togetherOnline = !!opponent && opponent.isOnline && isConnected;
  const partnerAway = !!opponent && !opponent.isOnline && isConnected;

  let pillText = 'Reaching out…';
  let pillColor = Colors.error;
  let pillBg = Colors.errorContainer;
  if (isConnecting) {
    pillText = 'Finding them…';
    pillColor = Colors.gold;
    pillBg = Colors.warningContainer;
  } else if (togetherOnline) {
    pillText = "You're both here";
    pillColor = Colors.onSecondaryContainer;
    pillBg = Colors.secondaryContainer;
  } else if (partnerAway) {
    pillText = `Waiting for ${opponent.profile.displayName.split(' ')[0]}…`;
    pillColor = Colors.onPrimaryContainer;
    pillBg = Colors.primaryContainer;
  } else if (isConnected && !opponent) {
    pillText = 'You came online';
    pillColor = Colors.onSecondaryContainer;
    pillBg = Colors.secondaryContainer;
  }

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.content}>
        {/* Left — logo & wordmark */}
        <View style={styles.leftGroup}>
          {showBack && (
            <TouchableOpacity
              onPress={onBack || (() => router.back())}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back-ios" size={18} color={Colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}

          <View style={styles.emblemContainer}>
            <MaterialIcons name="favorite" size={16} color="#FFFFFF" />
          </View>

          <View style={styles.titleColumn}>
            <Text style={[Typography.headlineMd, styles.titleText]}>{title}</Text>
            {subtitle ? (
              <Text style={[Typography.labelMd, styles.subtitleText]}>{subtitle}</Text>
            ) : null}
          </View>
        </View>

        {/* Right — connection & profile */}
        <View style={styles.rightGroup}>
          {showCompanionStatus && (
            <View style={[styles.statusPill, { backgroundColor: pillBg }]}>
              <View style={[styles.statusDot, { backgroundColor: pillColor }]} />
              <Text style={[Typography.labelMd, styles.statusText, { color: pillColor }]} numberOfLines={1}>
                {pillText}
              </Text>
              {togetherOnline && (
                <MaterialIcons
                  name="favorite"
                  size={12}
                  color={pillColor}
                  style={styles.pillHeart}
                />
              )}
            </View>
          )}

          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={styles.profileButton}
            activeOpacity={0.8}
          >
            <AvatarView avatar={profile?.avatar} size={34} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
    paddingBottom: 10,
    paddingHorizontal: 16,
    zIndex: 10,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    marginRight: 8,
  },
  emblemContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginRight: 9,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  titleColumn: {
    justifyContent: 'center',
  },
  titleText: {
    color: Colors.onSurface,
    lineHeight: 26,
  },
  subtitleText: {
    color: Colors.onSurfaceVariant,
    marginTop: -3,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 170,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    flexShrink: 1,
  },
  pillHeart: {
    marginLeft: 5,
  },
  profileButton: {
    marginLeft: 2,
  },
});
