import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
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
import { Pulse } from '../../src/components/Pulse';
import { HANGMAN_CONFIG, validateSecretWord } from '@tether/shared';

const SWEET_WORD_SUGGESTIONS = [
  'SUNSET',
  'COFFEE',
  'MONDAY',
  'PICNIC',
  'PANCAKES',
  'STARGAZE',
  'HARBOUR',
  'PUDDLE',
  'SUNSHINE',
  'PLAYLIST',
];

export default function GameSetupScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const hangmanState = useSocketStore((s) => s.hangmanState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasSubmitted = !!hangmanState?.myState.hasSubmittedWord;
  const opponentSubmitted = !!hangmanState?.opponentState.hasSubmittedWord;

  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);

  const handleSubmit = async () => {
    const val = validateSecretWord(word);
    if (!val.valid) {
      setError(val.error || 'Hmm, that word is a little tricky');
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await socketService.submitSecretWord(val.normalized);
    setSubmitting(false);

    if (!res.success) {
      setError(res.error || 'Could not seal your answer — try again');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <Header title="Tether" subtitle="Just between us" showBack={false} />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.phaseHeader}>
          <View style={styles.phaseBadge}>
            <MaterialIcons name="lock" size={13} color={Colors.primary} />
            <Text style={[Typography.labelMd, styles.phaseText]}>Just between us</Text>
          </View>
          <Text style={[Typography.headlineItalic, styles.heading]}>
            Lock in your secret answer
          </Text>
          <Text style={[Typography.bodyMd, styles.subheading]}>
            Think of something that means something to you two — a place, a feeling, a little
            ritual. One word, letters only (4–12).
          </Text>
        </View>

        {/* Submitted or input */}
        {hasSubmitted ? (
          <View style={styles.submittedCard}>
            <Pulse duration={2000} maxScale={1.08}>
              <View style={styles.submittedIconBox}>
                <MaterialIcons name="favorite" size={30} color={Colors.primary} />
              </View>
            </Pulse>
            <Text style={[Typography.titleLg, styles.submittedTitle]}>Sealed ♡</Text>
            <View style={styles.lockedWordPill}>
              <Text style={[Typography.headlineMd, styles.lockedWordText]}>
                {hangmanState?.myState.secretWord}
              </Text>
            </View>
            <Text style={[Typography.bodyMd, styles.submittedDesc]}>
              {opponentSubmitted
                ? 'Both of you are sealed! The peeks are about to begin…'
                : `Waiting for ${opponentSummary?.profile.displayName || 'your person'} to seal their answer…`}
            </Text>
            <View style={styles.companionStatusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: opponentSubmitted
                      ? Colors.secondary
                      : Colors.outlineVariant,
                  },
                ]}
              />
              <Text style={[Typography.labelSm, styles.companionStatusText]}>
                {opponentSubmitted
                  ? `${opponentSummary?.profile.displayName} is ready too!`
                  : `${opponentSummary?.profile.displayName} is picking something sweet…`}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.inputCard}>
            <View style={styles.inputHeader}>
              <Text style={[Typography.labelLg, styles.inputLabel]}>Your secret answer</Text>
              <Text style={[Typography.labelSm, styles.charCounter]}>
                {word.length} / {HANGMAN_CONFIG.MAX_WORD_LENGTH}
              </Text>
            </View>

            <View style={styles.wordInputContainer}>
              <MaterialIcons
                name="favorite"
                size={20}
                color={Colors.primary}
                style={styles.inputIcon}
              />
              <TextInput
                value={word}
                onChangeText={(t) => {
                  setWord(t.toUpperCase());
                  setError(null);
                }}
                maxLength={HANGMAN_CONFIG.MAX_WORD_LENGTH}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="SOMETHING SWEET"
                placeholderTextColor={Colors.outline}
                style={[Typography.headlineMd, styles.wordInput]}
              />
              {word.length > 0 && (
                <TouchableOpacity onPress={() => setWord('')} style={styles.clearBtn}>
                  <MaterialIcons name="close" size={16} color={Colors.tertiary} />
                </TouchableOpacity>
              )}
            </View>
            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* Sweet suggestions */}
            <View style={styles.chipsSection}>
              <Text style={[Typography.labelMd, styles.chipsHeading]}>
                or steal one of these:
              </Text>
              <View style={styles.chipsRow}>
                {SWEET_WORD_SUGGESTIONS.map((sug) => (
                  <TouchableOpacity
                    key={sug}
                    activeOpacity={0.7}
                    onPress={() => {
                      setWord(sug);
                      setError(null);
                    }}
                    style={[
                      styles.suggestionChip,
                      word === sug && styles.suggestionChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        Typography.labelSm,
                        { color: word === sug ? '#FFF' : Colors.onSurfaceVariant },
                      ]}
                    >
                      {sug}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Privacy note */}
            <View style={styles.privacyNote}>
              <MaterialIcons name="lock-outline" size={18} color={Colors.secondary} />
              <View style={styles.privacyTextCol}>
                <Text style={[Typography.labelMd, styles.privacyTitle]}>
                  Sealed with a kiss
                </Text>
                <Text style={[Typography.bodySm, styles.privacyDesc]}>
                  They'll only see how many letters you picked — the word itself stays secret
                  until someone wins.
                </Text>
              </View>
            </View>

            <TactileButton
              title="Seal it with a kiss"
              icon="lock"
              variant="primary"
              size="lg"
              loading={submitting}
              onPress={handleSubmit}
              style={{ marginTop: 20 }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  phaseHeader: {
    marginBottom: 20,
  },
  phaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    alignSelf: 'flex-start',
    gap: 6,
    marginBottom: 12,
  },
  phaseText: {
    color: Colors.onPrimaryContainer,
  },
  heading: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  subheading: {
    color: Colors.onSurfaceVariant,
    lineHeight: 21,
  },
  inputCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.onSurface,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  inputLabel: {
    color: Colors.onSurface,
  },
  charCounter: {
    color: Colors.tertiary,
  },
  wordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  wordInput: {
    flex: 1,
    color: Colors.onSurface,
    letterSpacing: 2,
    paddingVertical: 0,
  },
  clearBtn: {
    padding: 6,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 6,
  },
  chipsSection: {
    marginTop: 18,
  },
  chipsHeading: {
    color: Colors.onSurfaceVariant,
    marginBottom: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  privacyNote: {
    flexDirection: 'row',
    backgroundColor: Colors.secondaryContainer,
    borderRadius: 14,
    padding: 12,
    marginTop: 20,
    gap: 10,
  },
  privacyTextCol: {
    flex: 1,
  },
  privacyTitle: {
    color: Colors.onSecondaryContainer,
  },
  privacyDesc: {
    color: Colors.onSecondaryContainer,
    marginTop: 2,
    lineHeight: 16,
    opacity: 0.8,
  },
  submittedCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 10,
  },
  submittedIconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  submittedTitle: {
    color: Colors.onSurface,
    textAlign: 'center',
  },
  lockedWordPill: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginVertical: 16,
  },
  lockedWordText: {
    color: Colors.primary,
    letterSpacing: 4,
  },
  submittedDesc: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  companionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  companionStatusText: {
    color: Colors.onSurfaceVariant,
  },
});
