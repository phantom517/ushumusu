import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';
import { useProfileStore } from '../src/stores/useProfileStore';
import { AVATAR_PRESETS, AvatarInfo, PlayerProfile } from '@tether/shared';
import { AvatarView } from '../src/components/AvatarView';
import { TactileButton } from '../src/components/TactileButton';
import { Pulse } from '../src/components/Pulse';
import { socketService } from '../src/services/socketService';

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currentProfile = useProfileStore((s) => s.profile);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const serverUrl = useProfileStore((s) => s.serverUrl);

  const [displayName, setDisplayName] = useState(currentProfile?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarInfo>(
    currentProfile?.avatar || {
      type: AVATAR_PRESETS[0].type,
      value: AVATAR_PRESETS[0].value,
    }
  );
  const [disposition, setDisposition] = useState<'Quiet' | 'Playful' | 'Thoughtful' | string>(
    currentProfile?.disposition || 'Playful'
  );
  const [comfortAnchor, setComfortAnchor] = useState(
    currentProfile?.comfortAnchor || 'Matcha & oat milk'
  );

  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Every heart needs a name ♡');
      return;
    }

    const newProfile: PlayerProfile = {
      id: currentProfile?.id || `usr-${Date.now().toString(36)}`,
      displayName: trimmed,
      avatar: selectedAvatar,
      disposition,
      comfortAnchor: comfortAnchor.trim(),
    };

    await saveProfile(newProfile);

    // Initialize or re-authenticate socket
    socketService.initConnection(serverUrl);
    socketService.authenticateSession();

    router.replace('/home');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.stepBadge}>
            <MaterialIcons name="favorite-border" size={12} color={Colors.primary} />
            <Text style={[Typography.labelMd, styles.stepText]}>Little intro</Text>
          </View>

          <Text style={[Typography.headlineItalic, styles.heading]}>Hi! Who's joining?</Text>
          <Text style={[Typography.bodyMd, styles.subheading]}>
            This is how your favorite person will see you. A name, a little icon, and today's mood.
          </Text>
        </View>

        {/* Live Preview Card */}
        <View style={styles.previewCard}>
          <View style={styles.previewTop}>
            <Text style={[Typography.labelMd, styles.previewLabel]}>Your little card</Text>
            <View style={styles.awaitingBadge}>
              <Pulse duration={1800} maxScale={1.35}>
                <View style={styles.pulseDot} />
              </Pulse>
              <Text style={[Typography.labelSm, styles.awaitingText]}>Waiting for your person</Text>
            </View>
          </View>

          <View style={styles.previewRow}>
            <View style={styles.previewIdentity}>
              <AvatarView avatar={selectedAvatar} size={54} />
              <View style={styles.previewDetails}>
                <View style={styles.nameRow}>
                  <Text style={[Typography.titleMd, styles.previewName]} numberOfLines={1}>
                    {displayName || 'Your name'}
                  </Text>
                  <View style={styles.moodPill}>
                    <Text style={[Typography.labelSm, styles.moodPillText]}>{disposition}</Text>
                  </View>
                </View>
                {comfortAnchor ? (
                  <View style={styles.anchorRow}>
                    <MaterialIcons name="spa" size={13} color={Colors.tertiary} />
                    <Text style={[Typography.bodySm, styles.anchorText]} numberOfLines={1}>
                      {comfortAnchor}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.linkIconBox}>
              <MaterialIcons name="favorite" size={18} color={Colors.primary} />
            </View>
          </View>
        </View>

        {/* Avatar Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[Typography.labelLg, styles.sectionTitle]}>Pick your little icon</Text>
            <Text style={[Typography.labelSm, styles.sectionSubtitle]}>you can change it later</Text>
          </View>

          <View style={styles.avatarGrid}>
            {AVATAR_PRESETS.map((preset) => {
              const isSelected =
                selectedAvatar.type === preset.type && selectedAvatar.value === preset.value;
              return (
                <TouchableOpacity
                  key={preset.id}
                  activeOpacity={0.8}
                  onPress={() => setSelectedAvatar({ type: preset.type, value: preset.value })}
                  style={[
                    styles.avatarItem,
                    isSelected && {
                      borderColor: preset.accentColor,
                      borderWidth: 2.5,
                      backgroundColor: preset.accentColor + '14',
                    },
                  ]}
                >
                  <AvatarView avatar={{ type: preset.type, value: preset.value }} size={46} />
                  <Text style={[Typography.labelSm, styles.presetLabel]} numberOfLines={1}>
                    {preset.name}
                  </Text>
                  {isSelected && (
                    <View style={[styles.checkIcon, { backgroundColor: preset.accentColor }]}>
                      <MaterialIcons name="check" size={12} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Display Name Field */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[Typography.labelLg, styles.sectionTitle]}>What should we call you?</Text>
            <Text style={[Typography.labelSm, styles.sectionSubtitle]}>
              {displayName.length} / 18
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="edit" size={20} color={Colors.tertiary} style={styles.inputIcon} />
            <TextInput
              value={displayName}
              onChangeText={(t) => {
                setDisplayName(t);
                setError(null);
              }}
              maxLength={18}
              placeholder="Your name"
              placeholderTextColor={Colors.outline}
              style={[Typography.titleMd, styles.textInput]}
            />
            {displayName.length > 0 && (
              <TouchableOpacity onPress={() => setDisplayName('')} style={styles.clearBtn}>
                <MaterialIcons name="close" size={16} color={Colors.tertiary} />
              </TouchableOpacity>
            )}
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* Today's Mood */}
        <View style={styles.section}>
          <Text style={[Typography.labelLg, styles.sectionTitle]}>Today's mood</Text>
          <View style={styles.dispositionGrid}>
            {[
              { label: 'Quiet', icon: 'cloud' as const },
              { label: 'Playful', icon: 'favorite' as const },
              { label: 'Thoughtful', icon: 'eco' as const },
            ].map((item) => {
              const isSelected = disposition === item.label;
              return (
                <TouchableOpacity
                  key={item.label}
                  activeOpacity={0.8}
                  onPress={() => setDisposition(item.label)}
                  style={[
                    styles.dispositionBtn,
                    isSelected ? styles.dispositionSelected : styles.dispositionUnselected,
                  ]}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={16}
                    color={isSelected ? Colors.onSecondaryContainer : Colors.tertiary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      Typography.labelMd,
                      { color: isSelected ? Colors.onSecondaryContainer : Colors.onSurfaceVariant },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Little something for them */}
        <View style={styles.section}>
          <Text style={[Typography.labelLg, styles.sectionTitle]}>
            A little something for them (optional)
          </Text>
          <View style={styles.inputContainer}>
            <MaterialIcons name="coffee" size={20} color={Colors.tertiary} style={styles.inputIcon} />
            <TextInput
              value={comfortAnchor}
              onChangeText={setComfortAnchor}
              maxLength={28}
              placeholder="Matcha, messy hair, morning playlists…"
              placeholderTextColor={Colors.outline}
              style={[Typography.bodyMd, styles.textInput]}
            />
          </View>
          <Text style={[Typography.bodySm, styles.fieldHint]}>
            A sweet little hint that shows up next to your name.
          </Text>
        </View>

        {/* Save */}
        <View style={styles.bottomBar}>
          <TactileButton
            title="Step into our space"
            icon="favorite"
            onPress={handleSave}
            variant="primary"
            size="lg"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  stepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 14,
  },
  stepText: {
    color: Colors.onPrimaryContainer,
    marginLeft: 6,
  },
  heading: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  subheading: {
    color: Colors.onSurfaceVariant,
    lineHeight: 21,
  },
  previewCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  previewLabel: {
    color: Colors.onSurfaceVariant,
  },
  awaitingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  awaitingText: {
    color: Colors.onSecondaryContainer,
    marginLeft: 6,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewDetails: {
    marginLeft: 12,
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewName: {
    color: Colors.onSurface,
  },
  moodPill: {
    backgroundColor: Colors.peachContainer,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  moodPillText: {
    color: Colors.onPrimaryContainer,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  anchorText: {
    color: Colors.onSurfaceVariant,
    marginLeft: 5,
  },
  linkIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.onSurface,
  },
  sectionSubtitle: {
    color: Colors.onSurfaceVariant,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  avatarItem: {
    width: '30.5%',
    aspectRatio: 0.95,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  presetLabel: {
    color: Colors.onSurfaceVariant,
    marginTop: 6,
  },
  checkIcon: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: Colors.onSurface,
  },
  clearBtn: {
    padding: 4,
  },
  errorText: {
    color: Colors.error,
    marginTop: 8,
    ...Typography.bodySm,
  },
  fieldHint: {
    color: Colors.onSurfaceVariant,
    marginTop: 8,
  },
  dispositionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  dispositionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 18,
  },
  dispositionSelected: {
    backgroundColor: Colors.secondaryContainer,
    borderWidth: 1.5,
    borderColor: Colors.secondary,
  },
  dispositionUnselected: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bottomBar: {
    marginTop: 10,
  },
});
