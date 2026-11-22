import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';
import { Header } from '../src/components/Header';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useSocketStore } from '../src/stores/useSocketStore';
import { AVATAR_PRESETS, AvatarInfo } from '@tether/shared';
import { AvatarView } from '../src/components/AvatarView';
import { TactileButton } from '../src/components/TactileButton';
import { socketService } from '../src/services/socketService';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const profile = useProfileStore((s) => s.profile);
  const saveProfile = useProfileStore((s) => s.saveProfile);
  const serverUrl = useProfileStore((s) => s.serverUrl);
  const setServerUrl = useProfileStore((s) => s.setServerUrl);
  const pairingSecret = useProfileStore((s) => s.pairingSecret);
  const setPairingSecret = useProfileStore((s) => s.setPairingSecret);
  const resetProfile = useProfileStore((s) => s.resetProfile);

  const isConnected = useSocketStore((s) => s.isConnected);

  const [name, setName] = useState(profile?.displayName || '');
  const [avatar, setAvatar] = useState<AvatarInfo>(
    profile?.avatar || { type: 'icon', value: AVATAR_PRESETS[0].value }
  );
  const [disposition, setDisposition] = useState(profile?.disposition || 'Playful');
  const [comfortAnchor, setComfortAnchor] = useState(profile?.comfortAnchor || '');
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [secretInput, setSecretInput] = useState(pairingSecret);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSaveSettings = async () => {
    if (!name.trim()) {
      Alert.alert('One tiny thing', 'Every heart needs a name ♡');
      return;
    }

    if (profile) {
      await saveProfile({
        ...profile,
        displayName: name.trim(),
        avatar,
        disposition,
        comfortAnchor: comfortAnchor.trim(),
        pairingSecret: secretInput.trim(),
      });
    }

    await setServerUrl(urlInput);
    await setPairingSecret(secretInput);

    // Reconnect socket with updated settings
    socketService.initConnection(urlInput);

    Alert.alert('Saved ♡', 'Your little space is updated.');
    router.back();
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    const cleanUrl = urlInput.trim().replace(/\/+$/, '');

    try {
      const start = Date.now();
      const res = await fetch(`${cleanUrl}/health`, { method: 'GET' });
      const duration = Date.now() - start;

      if (res.ok) {
        setTestResult(`They're home! Knocked and answered in ${duration}ms`);
      } else {
        setTestResult(`Someone mumbled from behind the door (status ${res.status})`);
      }
    } catch (err: any) {
      setTestResult(`No one home — ${err.message}. Double-check the address.`);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleReset = () => {
    Alert.alert('Start over?', 'This clears your little identity and takes you back to the beginning.', [
      { text: 'Never mind', style: 'cancel' },
      {
        text: 'Start over',
        style: 'destructive',
        onPress: async () => {
          await resetProfile();
          socketService.disconnect();
          router.replace('/setup');
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Our settings"
        showBack
        onBack={() => router.back()}
        showCompanionStatus={false}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Where your person lives */}
        <View style={styles.card}>
          <Text style={[Typography.titleMd, styles.cardTitle]}>Where your person lives</Text>
          <View style={styles.connectionStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isConnected ? Colors.secondary : Colors.error },
              ]}
            />
            <Text style={[Typography.bodyMd, styles.statusText]}>
              {isConnected ? 'You are connected and in sync' : 'Not connected right now'}
            </Text>
          </View>

          <Text style={[Typography.labelSm, styles.inputLabel]}>Address</Text>
          <View style={styles.inputBox}>
            <TextInput
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="http://192.168.1.16:3001"
              placeholderTextColor={Colors.outline}
              style={[Typography.bodyMd, styles.textInput]}
            />
          </View>

          <TactileButton
            title="Knock, knock"
            icon="wifi"
            variant="secondary"
            size="md"
            loading={testingConnection}
            onPress={handleTestConnection}
            style={{ marginTop: 10 }}
          />

          {testResult && (
            <Text
              style={[
                Typography.bodySm,
                {
                  color: testResult.startsWith("They're home") ? Colors.success : Colors.error,
                  marginTop: 8,
                },
              ]}
            >
              {testResult}
            </Text>
          )}
        </View>

        {/* Secret knock */}
        <View style={styles.card}>
          <Text style={[Typography.titleMd, styles.cardTitle]}>Secret knock</Text>
          <Text style={[Typography.bodySm, styles.cardDesc]}>
            Only people who share this little knock can find you. Optional, but cozy.
          </Text>

          <View style={styles.inputBox}>
            <MaterialIcons name="lock-outline" size={17} color={Colors.tertiary} style={{ marginRight: 8 }} />
            <TextInput
              value={secretInput}
              onChangeText={setSecretInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="a tiny passphrase"
              placeholderTextColor={Colors.outline}
              style={[Typography.bodyMd, styles.textInput]}
            />
          </View>
        </View>

        {/* All about you */}
        <View style={styles.card}>
          <Text style={[Typography.titleMd, styles.cardTitle]}>All about you</Text>

          <Text style={[Typography.labelSm, styles.inputLabel]}>Your name</Text>
          <View style={styles.inputBox}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={18}
              placeholder="Your name"
              placeholderTextColor={Colors.outline}
              style={[Typography.bodyMd, styles.textInput]}
            />
          </View>

          <Text style={[Typography.labelSm, styles.inputLabel, { marginTop: 12 }]}>
            Pick your little icon
          </Text>
          <View style={styles.avatarGrid}>
            {AVATAR_PRESETS.map((preset) => {
              const isSelected = avatar.type === preset.type && avatar.value === preset.value;
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => setAvatar({ type: preset.type, value: preset.value })}
                  style={[
                    styles.avatarTile,
                    isSelected && { borderColor: preset.accentColor, borderWidth: 2.5 },
                  ]}
                >
                  <AvatarView avatar={{ type: preset.type, value: preset.value }} size={42} />
                  <Text style={[Typography.labelSm, styles.avatarTileLabel]} numberOfLines={1}>
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[Typography.labelSm, styles.inputLabel, { marginTop: 12 }]}>
            A little something for them
          </Text>
          <View style={styles.inputBox}>
            <TextInput
              value={comfortAnchor}
              onChangeText={setComfortAnchor}
              placeholder="Matcha, messy hair, morning playlists…"
              placeholderTextColor={Colors.outline}
              style={[Typography.bodyMd, styles.textInput]}
            />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TactileButton
            title="Save our settings"
            icon="favorite"
            variant="primary"
            size="lg"
            onPress={handleSaveSettings}
          />

          <TactileButton
            title="Start over"
            icon="restart-alt"
            variant="ghost"
            size="md"
            onPress={handleReset}
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
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 18,
  },
  cardTitle: {
    color: Colors.onSurface,
    marginBottom: 10,
  },
  cardDesc: {
    color: Colors.onSurfaceVariant,
    marginBottom: 12,
    lineHeight: 18,
  },
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: Colors.onSurface,
  },
  inputLabel: {
    color: Colors.onSurfaceVariant,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 48,
  },
  textInput: {
    flex: 1,
    color: Colors.onSurface,
    paddingVertical: 0,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  avatarTile: {
    width: '30%',
    aspectRatio: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarTileLabel: {
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
  actions: {
    marginTop: 10,
  },
});
