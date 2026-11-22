import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
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
import { TactileButton } from '../../src/components/TactileButton';
import { Pulse } from '../../src/components/Pulse';
import { HANGMAN_CONFIG } from '@tether/shared';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function HangmanScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const hangmanState = useSocketStore((s) => s.hangmanState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [revealMyWord, setRevealMyWord] = useState(false);
  const [guessModalVisible, setGuessModalVisible] = useState(false);
  const [wordGuessInput, setWordGuessInput] = useState('');
  const [submittingGuess, setSubmittingGuess] = useState(false);

  // Phase 2 question state
  const [questionModalVisible, setQuestionModalVisible] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);

  // Phase 2 answer state
  const [answerInput, setAnswerInput] = useState('');
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  if (!hangmanState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Guess My Answer" />
        <View style={styles.loadingBox}>
          <Pulse duration={1400} maxScale={1.15}>
            <View style={styles.loadingHeart}>
              <MaterialIcons name="favorite" size={24} color="#FFFFFF" />
            </View>
          </Pulse>
          <Text style={[Typography.bodyMd, styles.loadingText]}>
            Warming up the game…
          </Text>
        </View>
      </View>
    );
  }

  const { isMyTurn, myState, opponentState, ledger, pendingQuestion, phase } = hangmanState;
  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Your person';

  const isPendingMyAnswer =
    pendingQuestion && pendingQuestion.targetPlayerId !== profile?.id
      ? false
      : !!pendingQuestion;

  const handleQueryLetter = async (letter: string) => {
    if (!isMyTurn) {
      Alert.alert('Not yet, love', `It's ${opponentName}'s move right now.`);
      return;
    }
    if (myState.queriedLetters.includes(letter)) {
      return;
    }
    const res = await socketService.queryLetter(letter);
    if (!res.success) {
      Alert.alert('Peek failed', res.error || 'Could not peek at that letter');
    }
  };

  const handleGuessSubmit = async () => {
    const trimmed = wordGuessInput.trim().toUpperCase();
    if (!trimmed) return;

    setSubmittingGuess(true);
    const res = await socketService.submitGuess(trimmed);
    setSubmittingGuess(false);

    if (res.success) {
      setGuessModalVisible(false);
      setWordGuessInput('');
      if (!res.isCorrect) {
        Alert.alert(
          'So close!',
          `“${trimmed}” wasn't their answer. A heart just cracked — try again.`
        );
      }
    } else {
      Alert.alert('Hmm…', res.error || 'Could not submit that guess');
    }
  };

  const handleQuestionSubmit = async () => {
    const trimmed = questionInput.trim();
    if (!trimmed) return;

    setSubmittingQuestion(true);
    const res = await socketService.submitQuestion(trimmed);
    setSubmittingQuestion(false);

    if (res.success) {
      setQuestionModalVisible(false);
      setQuestionInput('');
    } else {
      Alert.alert('Hmm…', res.error || 'Could not send that question');
    }
  };

  const handleAnswerSubmit = async (answerText: string) => {
    if (!pendingQuestion) return;

    setSubmittingAnswer(true);
    const res = await socketService.submitAnswer(pendingQuestion.id, answerText);
    setSubmittingAnswer(false);

    if (res.success) {
      setAnswerInput('');
    } else {
      Alert.alert('Hmm…', res.error || 'Could not send that answer');
    }
  };

  const lettersLeft = myState.maxLetterQueries - myState.letterQueriesUsed;

  return (
    <View style={styles.screen}>
      <Header
        title="Tether"
        subtitle="Guess My Answer"
        showBack
        onBack={() => {
          Alert.alert('Slip away?', 'Leaving will end this little match.', [
            { text: 'Stay', style: 'cancel' },
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
        {/* Turn status */}
        <View
          style={[
            styles.turnCard,
            {
              backgroundColor: isMyTurn
                ? Colors.secondaryContainer
                : Colors.surfaceContainerLow,
            },
          ]}
        >
          <View style={styles.turnLeft}>
            <Pulse duration={isMyTurn ? 1600 : 0} maxScale={1.25}>
              <MaterialIcons
                name={isMyTurn ? 'favorite' : 'schedule'}
                size={16}
                color={isMyTurn ? Colors.secondary : Colors.tertiary}
              />
            </Pulse>
            <Text
              style={[
                Typography.titleMd,
                { color: isMyTurn ? Colors.onSecondaryContainer : Colors.onSurface },
              ]}
            >
              {isMyTurn ? 'Your move ♡' : `${opponentName}'s move`}
            </Text>
          </View>

          <View style={styles.phasePill}>
            <Text style={[Typography.labelMd, styles.phasePillText]}>
              {phase === 'free_form_clues' ? 'ask anything' : 'peek phase'}
            </Text>
          </View>
        </View>

        {/* Their hidden answer */}
        <View style={styles.targetCard}>
          <View style={styles.targetHeader}>
            <View style={styles.targetLabelGroup}>
              <MaterialIcons name="favorite-border" size={16} color={Colors.primary} />
              <Text style={[Typography.titleMd, styles.targetTitle]}>
                {opponentName}'s secret answer
              </Text>
            </View>
            <View style={styles.lettersChip}>
              <Text style={[Typography.labelSm, styles.lettersChipText]}>
                {opponentState.wordLength} letters
              </Text>
            </View>
          </View>

          {/* Letter tiles */}
          <View style={styles.tilesRow}>
            {opponentState.revealedLettersGrid.map((letter, index) => {
              const isRevealed = letter !== null;
              return (
                <View
                  key={index}
                  style={[
                    styles.letterSlot,
                    isRevealed ? styles.letterSlotRevealed : styles.letterSlotVeiled,
                  ]}
                >
                  {isRevealed ? (
                    <Text style={[Typography.headlineMd, styles.revealedLetterText]}>
                      {letter}
                    </Text>
                  ) : (
                    <View style={styles.slotDash} />
                  )}
                </View>
              );
            })}
          </View>

          {/* Hearts & revealed count */}
          <View style={styles.targetFooter}>
            <View style={styles.heartsRow}>
              {Array.from({ length: myState.maxStrikes }).map((_, i) => {
                const isCracked = i < myState.strikes;
                return (
                  <MaterialIcons
                    key={i}
                    name={isCracked ? 'heart-broken' : 'favorite'}
                    size={18}
                    color={isCracked ? Colors.outline : Colors.primary}
                    style={styles.heartIcon}
                  />
                );
              })}
            </View>
            <Text style={[Typography.bodySm, styles.revealedRatioText]}>
              {opponentState.revealedCount} of {opponentState.wordLength} letters found
            </Text>
          </View>
        </View>

        {/* Your secret answer */}
        <View style={styles.secretWordCard}>
          <View style={styles.secretWordLeft}>
            <View style={styles.secretWordTitleRow}>
              <MaterialIcons name="visibility-off" size={14} color={Colors.outline} />
              <Text style={[Typography.labelMd, styles.secretWordTitle]}>
                Your secret answer
              </Text>
            </View>
            <Text
              style={[
                Typography.headlineMd,
                styles.secretWordText,
                !revealMyWord && styles.hiddenWord,
              ]}
            >
              {myState.secretWord || '••••••'}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPressIn={() => setRevealMyWord(true)}
            onPressOut={() => setRevealMyWord(false)}
            style={styles.revealBtn}
          >
            <Text style={[Typography.labelMd, styles.revealBtnText]}>
              {revealMyWord ? 'peeking…' : 'hold to peek'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Peek progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <Text style={[Typography.labelMd, styles.progressTitle]}>
              {lettersLeft > 0
                ? `${lettersLeft} peek${lettersLeft === 1 ? '' : 's'} until you can ask anything`
                : 'Ask anything unlocked!'}
            </Text>
            <Text style={[Typography.labelSm, styles.progressCount]}>
              {myState.letterQueriesUsed} / {myState.maxLetterQueries}
            </Text>
          </View>
          <View style={styles.progressBg}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(
                    100,
                    (myState.letterQueriesUsed / myState.maxLetterQueries) * 100
                  )}%`,
                },
              ]}
            />
          </View>
          {myState.unlockedFreeForm && (
            <View style={styles.progressTip}>
              <MaterialIcons name="forum" size={13} color={Colors.primary} />
              <Text style={[Typography.bodySm, styles.progressTipText]}>
                Get personal — ask them anything about their answer.
              </Text>
            </View>
          )}
        </View>

        {/* Pending question to answer */}
        {isPendingMyAnswer && pendingQuestion && (
          <View style={styles.pendingQuestionBanner}>
            <View style={styles.questionBannerHeader}>
              <MaterialIcons name="forum" size={17} color={Colors.onPrimaryContainer} />
              <Text style={[Typography.titleMd, styles.questionBannerTitle]}>
                {opponentName} asked:
              </Text>
            </View>
            <Text style={[Typography.bodyLg, styles.questionBannerText]}>
              “{pendingQuestion.questionText}”
            </Text>

            <View style={styles.quickAnswerRow}>
              {['Yes', 'Nope', 'Kinda'].map((ans) => (
                <TouchableOpacity
                  key={ans}
                  onPress={() => handleAnswerSubmit(ans)}
                  disabled={submittingAnswer}
                  style={styles.quickAnswerBtn}
                >
                  <Text style={[Typography.labelMd, styles.quickAnswerText]}>{ans}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.customAnswerRow}>
              <TextInput
                value={answerInput}
                onChangeText={setAnswerInput}
                placeholder="or whisper something custom…"
                placeholderTextColor={Colors.outline}
                style={[Typography.bodyMd, styles.customAnswerInput]}
              />
              <TouchableOpacity
                onPress={() => handleAnswerSubmit(answerInput)}
                disabled={submittingAnswer || !answerInput.trim()}
                style={styles.customAnswerSendBtn}
              >
                <MaterialIcons name="send" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Little history */}
        <View style={styles.ledgerCard}>
          <Text style={[Typography.labelMd, styles.ledgerTitle]}>your little history</Text>
          <View style={styles.ledgerList}>
            {ledger.length === 0 ? (
              <Text style={[Typography.bodySm, styles.emptyLedgerText]}>
                Nothing yet — peek at a letter below on your move.
              </Text>
            ) : (
              ledger
                .slice(-6)
                .reverse()
                .map((item) => {
                  const isMine = item.playerId === profile?.id;
                  return (
                    <View key={item.id} style={styles.ledgerItem}>
                      <MaterialIcons
                        name={
                          item.type === 'letter'
                            ? item.isCorrect
                              ? 'check-circle'
                              : 'cancel'
                            : item.type === 'guess'
                            ? 'auto-awesome'
                            : 'forum'
                        }
                        size={16}
                        color={
                          item.isCorrect
                            ? Colors.secondary
                            : item.type === 'question'
                            ? Colors.primary
                            : Colors.error
                        }
                      />
                      <View style={styles.ledgerTextCol}>
                        <Text style={[Typography.bodySm, styles.ledgerMainText]}>
                          {isMine ? 'You' : opponentName}{' '}
                          {item.type === 'letter'
                            ? `peeked at '${item.letter}'`
                            : item.type === 'guess'
                            ? `guessed the whole answer '${item.guess}'`
                            : `asked: "${item.question}"`}
                        </Text>
                        {item.type === 'letter' && (
                          <Text
                            style={[
                              Typography.bodySm,
                              {
                                color:
                                  (item.foundCount || 0) > 0 ? Colors.secondary : Colors.error,
                              },
                            ]}
                          >
                            {(item.foundCount || 0) > 0
                              ? `Found ${item.foundCount}!`
                              : 'Not there — a heart cracked'}
                          </Text>
                        )}
                        {item.answer && (
                          <Text style={[Typography.bodySm, styles.ledgerAnswerText]}>
                            “{item.answer}”
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
            )}
          </View>
        </View>

        {/* Letter keyboard */}
        <View style={styles.keyboardCard}>
          <View style={styles.keyboardHeader}>
            <Text style={[Typography.labelMd, styles.keyboardTitle]}>Peek at a letter</Text>
            <Text
              style={[
                Typography.labelSm,
                { color: isMyTurn ? Colors.secondary : Colors.outline },
              ]}
            >
              {isMyTurn ? 'your move' : 'waiting…'}
            </Text>
          </View>

          <View style={styles.keysGrid}>
            {ALPHABET.map((char) => {
              const isUsed = myState.queriedLetters.includes(char);
              return (
                <TouchableOpacity
                  key={char}
                  activeOpacity={0.7}
                  disabled={!isMyTurn || isUsed}
                  onPress={() => handleQueryLetter(char)}
                  style={[
                    styles.keyTile,
                    isUsed && styles.keyTileUsed,
                    !isMyTurn && !isUsed && styles.keyTileDisabled,
                  ]}
                >
                  <Text
                    style={[
                      Typography.titleMd,
                      styles.keyText,
                      isUsed && styles.keyTextUsed,
                      !isMyTurn && !isUsed && styles.keyTextDisabled,
                    ]}
                  >
                    {char}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionButtonsRow}>
          <TactileButton
            title="Guess it all"
            icon="auto-awesome"
            variant="primary"
            size="lg"
            disabled={!isMyTurn}
            onPress={() => setGuessModalVisible(true)}
            style={{ flex: 1 }}
          />

          {myState.unlockedFreeForm && (
            <TactileButton
              title="Ask anything"
              icon="forum"
              variant="secondary"
              size="lg"
              disabled={!isMyTurn || !!pendingQuestion}
              onPress={() => setQuestionModalVisible(true)}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </ScrollView>

      {/* Whole-answer guess modal */}
      <Modal visible={guessModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={[Typography.headlineMd, styles.modalTitle]}>Feeling lucky?</Text>
              <TouchableOpacity onPress={() => setGuessModalVisible(false)}>
                <MaterialIcons name="close" size={20} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={[Typography.bodyMd, styles.modalDesc]}>
              Type your guess for {opponentName}'s answer. Nail it and you win right there —
              miss it and a heart cracks.
            </Text>

            <TextInput
              value={wordGuessInput}
              onChangeText={(t) => setWordGuessInput(t.toUpperCase())}
              placeholder="e.g. PANCAKES"
              placeholderTextColor={Colors.outline}
              autoCapitalize="characters"
              autoFocus
              style={[Typography.headlineMd, styles.modalInput]}
            />

            <View style={styles.modalActions}>
              <TactileButton
                title="Wait, not yet"
                variant="secondary"
                size="md"
                onPress={() => setGuessModalVisible(false)}
                style={{ flex: 1 }}
              />
              <TactileButton
                title="Go for it"
                variant="primary"
                size="md"
                loading={submittingGuess}
                disabled={!wordGuessInput.trim()}
                onPress={handleGuessSubmit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask-anything modal */}
      <Modal visible={questionModalVisible} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={[Typography.headlineMd, styles.modalTitle]}>
                Ask them anything
              </Text>
              <TouchableOpacity onPress={() => setQuestionModalVisible(false)}>
                <MaterialIcons name="close" size={20} color={Colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={[Typography.bodyMd, styles.modalDesc]}>
              Anything about their answer — “Is it a place?”, “Does it make you think of us?”
            </Text>

            <TextInput
              value={questionInput}
              onChangeText={setQuestionInput}
              placeholder="Is it something we do on Sundays?"
              placeholderTextColor={Colors.outline}
              multiline
              autoFocus
              style={[Typography.bodyLg, styles.modalInput, { height: 80 }]}
            />

            <View style={styles.modalActions}>
              <TactileButton
                title="Wait, not yet"
                variant="secondary"
                size="md"
                onPress={() => setQuestionModalVisible(false)}
                style={{ flex: 1 }}
              />
              <TactileButton
                title="Send it ♡"
                variant="primary"
                size="md"
                loading={submittingQuestion}
                disabled={!questionInput.trim()}
                onPress={handleQuestionSubmit}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  loadingHeart: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.onSurfaceVariant,
    marginTop: 12,
  },
  turnCard: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  turnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phasePill: {
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  phasePillText: {
    color: Colors.onSurfaceVariant,
  },
  targetCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  targetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  targetLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  targetTitle: {
    color: Colors.onSurface,
    flexShrink: 1,
  },
  lettersChip: {
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
  },
  lettersChipText: {
    color: Colors.onPrimaryContainer,
  },
  tilesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 10,
  },
  letterSlot: {
    width: 44,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  letterSlotRevealed: {
    backgroundColor: Colors.secondaryContainer,
    borderColor: Colors.secondary,
  },
  letterSlotVeiled: {
    backgroundColor: Colors.surfaceContainerLow,
    borderColor: Colors.border,
  },
  revealedLetterText: {
    color: Colors.onSecondaryContainer,
    fontWeight: '700',
  },
  slotDash: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    marginTop: 20,
  },
  targetFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  heartsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  heartIcon: {},
  revealedRatioText: {
    color: Colors.onSurfaceVariant,
  },
  secretWordCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  secretWordLeft: {
    flex: 1,
  },
  secretWordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  secretWordTitle: {
    color: Colors.onSurfaceVariant,
  },
  secretWordText: {
    color: Colors.primary,
    letterSpacing: 3,
    marginTop: 2,
  },
  hiddenWord: {
    opacity: 0.15,
  },
  revealBtn: {
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  revealBtnText: {
    color: Colors.onSurface,
  },
  progressCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressTitle: {
    color: Colors.onSurface,
    flex: 1,
    marginRight: 8,
  },
  progressCount: {
    color: Colors.secondary,
  },
  progressBg: {
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainer,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.secondary,
    borderRadius: 4,
  },
  progressTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  progressTipText: {
    color: Colors.onSurfaceVariant,
  },
  pendingQuestionBanner: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
  },
  questionBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionBannerTitle: {
    color: Colors.onPrimaryContainer,
  },
  questionBannerText: {
    color: Colors.onPrimaryContainer,
    fontStyle: 'italic',
    marginVertical: 8,
  },
  quickAnswerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  quickAnswerBtn: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingVertical: 9,
    borderRadius: 14,
    alignItems: 'center',
  },
  quickAnswerText: {
    color: Colors.onPrimaryContainer,
  },
  customAnswerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  customAnswerInput: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 40,
    color: Colors.onSurface,
  },
  customAnswerSendBtn: {
    backgroundColor: Colors.primary,
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  ledgerTitle: {
    color: Colors.onSurfaceVariant,
    marginBottom: 8,
  },
  ledgerList: {
    gap: 8,
  },
  emptyLedgerText: {
    color: Colors.outline,
    fontStyle: 'italic',
  },
  ledgerItem: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  ledgerTextCol: {
    flex: 1,
  },
  ledgerMainText: {
    color: Colors.onSurface,
  },
  ledgerAnswerText: {
    color: Colors.primary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  keyboardCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 14,
  },
  keyboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  keyboardTitle: {
    color: Colors.onSurface,
  },
  keysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  keyTile: {
    width: 36,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyTileUsed: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderColor: 'transparent',
    opacity: 0.5,
  },
  keyTileDisabled: {
    opacity: 0.7,
  },
  keyText: {
    color: Colors.onSurface,
  },
  keyTextUsed: {
    color: Colors.outline,
  },
  keyTextDisabled: {
    color: Colors.outline,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(74, 63, 58, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    color: Colors.onSurface,
    flex: 1,
  },
  modalDesc: {
    color: Colors.onSurfaceVariant,
    marginBottom: 16,
    lineHeight: 20,
  },
  modalInput: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 52,
    color: Colors.onSurface,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
});
