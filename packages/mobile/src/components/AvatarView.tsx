import React from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { AvatarInfo, AVATAR_PRESETS } from '@tether/shared';
import { getPhotoAvatarSource } from '../theme/photoAvatars';

// @expo/vector-icons v15 refreshed the MaterialIcons glyph map (legacy
// snake_case names were removed). Fall back for profiles persisted with old names.
const normalizeIconName = (name: string): string => {
  if (name in MaterialIcons.glyphMap) return name;
  const kebab = name.replace(/_/g, '-');
  if (kebab in MaterialIcons.glyphMap) return kebab;
  return 'favorite';
};

const hexToRgba = (hex: string, alpha: number): string => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

interface AvatarViewProps {
  avatar?: AvatarInfo;
  size?: number;
  showBadge?: boolean;
  badgeType?: 'check' | 'pulse' | 'offline';
  badgeColor?: string;
  borderColor?: string;
}

export const AvatarView: React.FC<AvatarViewProps> = ({
  avatar,
  size = 48,
  showBadge = false,
  badgeType = 'check',
  badgeColor = Colors.secondary,
  borderColor = Colors.surfaceContainerLowest,
}) => {
  const borderRadius = size / 2;
  // Photo avatars — bundled AI portraits resolved by id from assets/avatars.
  const photoSource = avatar?.type === 'photo' ? getPhotoAvatarSource(avatar.value) : undefined;
  // Legacy preset photo URLs fall back to the tinted icon treatment below.
  const isImage = Boolean(photoSource) || (avatar?.type === 'custom' && !!avatar?.value && avatar.value.startsWith('http'));

  // Icon avatars get a soft tinted background in their preset accent color.
  const preset = AVATAR_PRESETS.find((p) => p.value === avatar?.value);
  const accent = preset?.accentColor ?? Colors.primary;

  const iconName = avatar?.value && !isImage
    ? (normalizeIconName(avatar.value) as any)
    : 'favorite';

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {isImage && avatar?.value ? (
        <Image
          source={photoSource ?? { uri: avatar.value }}
          style={[styles.image, { width: size, height: size, borderRadius, borderColor }]}
        />
      ) : (
        <View
          style={[
            styles.iconPlaceholder,
            {
              width: size,
              height: size,
              borderRadius,
              backgroundColor: hexToRgba(accent, 0.16),
              borderColor,
            },
          ]}
        >
          <MaterialIcons name={iconName} size={size * 0.52} color={accent} />
        </View>
      )}

      {showBadge && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeType === 'offline' ? Colors.outline : badgeColor,
              width: size * 0.32,
              height: size * 0.32,
              borderRadius: (size * 0.32) / 2,
            },
          ]}
        >
          {badgeType === 'check' && (
            <MaterialIcons name="check" size={size * 0.2} color="#FFF" />
          )}
          {badgeType === 'pulse' && (
            <MaterialIcons name="favorite" size={size * 0.17} color="#FFF" />
          )}
          {badgeType === 'offline' && (
            <MaterialIcons name="cloud-off" size={size * 0.17} color="#FFF" />
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderWidth: 2,
  },
  iconPlaceholder: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
  },
});
