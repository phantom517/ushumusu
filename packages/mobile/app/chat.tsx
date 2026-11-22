import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputInstance,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CHAT_CONFIG, ChatMessage, PHOTO_AVATARS, AVATAR_PRESETS, AvatarInfo, AVAILABLE_GAMES, PLAYABLE_GAME_IDS } from '@tether/shared';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useChatStore } from '../src/stores/useChatStore';
import { socketService } from '../src/services/socketService';
import { AvatarView } from '../src/components/AvatarView';
import { PHOTO_AVATAR_SOURCES } from '../src/theme/photoAvatars';

/* Same palette tokens as the Tether home redesign */
const T = {
  page: '#F7F3EE',
  surface: '#FFFCF8',
  ink: '#403A37',
  muted: '#887D75',
  line: '#E8D9CD',
  coral: '#D9665B',
  coralDark: '#BB4F47',
  coralSoft: '#F7E3DE',
  sage: '#DFECE2',
  sageInk: '#45634F',
} as const;

const FALLBACK_AVATAR: AvatarInfo = { type: 'icon', value: 'favorite' };

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default function ChatScreen() {
  const router = useRouter();
  const profile = useProfileStore((s) => s.profile);
  const sessionToken = useProfileStore((s) => s.sessionToken);
  const saveProfile = useProfileStore((s) => s.saveProfile);

  const messages = useChatStore((s) => s.messages);
  const partnerTyping = useChatStore((s) => s.partnerTyping);
  const partnerOnline = useChatStore((s) => s.partnerOnline);
  const partnerName = useChatStore((s) => s.partnerName);
  const partnerAvatar = useChatStore((s) => s.partnerAvatar);
  const ownSessionId = useChatStore((s) => s.ownSessionId);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [tick, setTick] = useState(0); // re-render sweep so expired messages vanish
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInputInstance | null>(null);

  /* Open the channel: history + partner presence; close on leave */
  useEffect(() => {
    useChatStore.getState().setOwnSessionId(sessionToken);
    socketService.openChat().then((res) => {
      if (!res.success) return;
      useChatStore.getState().setMessages(res.messages);
      useChatStore.getState().setPresence({
        partnerOnline: res.partnerOnline,
        partnerName: res.partnerName,
      });
      if (res.partnerAvatar) useChatStore.getState().setPartnerAvatar(res.partnerAvatar);
    });
    return () => {
      socketService.setChatTyping(false);
      socketService.closeChat();
      useChatStore.getState().reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Re-render every 30s so 15-minute-old messages quietly disappear */
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  const now = useMemo(() => Date.now(), [tick, messages.length]);
  const liveMessages = useMemo(
    () => messages.filter((m) => now - m.sentAt < CHAT_CONFIG.TTL_MS),
    [messages, now]
  );

  const handleChangeText = useCallback((value: string) => {
    setText(value);
    socketService.setChatTyping(value.trim().length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketService.setChatTyping(false), 1500);
  }, []);

  const handleSend = useCallback(async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    const res = await socketService.sendChatMessage(value);
    setSending(false);
    if (!res.success) {
      Alert.alert('Message didn’t send', res.error ?? 'Try again in a moment.');
      return;
    }
    setText('');
    socketService.setChatTyping(false);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    inputRef.current?.focus();
  }, [text, sending]);

  const handlePickAvatar = useCallback(
    async (avatarId: string) => {
      const res = await socketService.setChatAvatar(avatarId);
      if (!res.success || !res.avatar || !profile) {
        setPickerOpen(false);
        return;
      }
      setPickerOpen(false);
      await saveProfile({ ...profile, avatar: res.avatar });
    },
    [profile, saveProfile]
  );

  const handleSendInvite = useCallback(async (gameId: string) => {
    const res = await socketService.sendChatInvite(gameId);
    setGamePickerOpen(false);
    if (!res.success) {
      Alert.alert('Invite didn’t send', res.error ?? 'Try again in a moment.');
    }
  }, []);

  const handleAcceptInvite = useCallback(
    async (inviteId: string, gameId: string) => {
      const res = await socketService.respondChatInvite(inviteId, true);
      if (!res.success) return; // card already flipped via chat:invite:update
      router.push({ pathname: '/matchmaking', params: { gameId } });
    },
    [router]
  );

  const displayName = profile?.displayName ?? 'You';
  const shownPartnerName = partnerName ?? 'Your person';
  const shownPartnerAvatar = partnerAvatar ?? FALLBACK_AVATAR;

  /* Newest at the bottom (inverted list) */
  const listData = useMemo(() => [...liveMessages].reverse(), [liveMessages]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (item.kind === 'system') {
        return (
          <View style={styles.systemRow}>
            <AvatarView avatar={shownPartnerAvatar} size={16} />
            <Text style={styles.systemText}>
              {item.displayName} {item.text}
            </Text>
          </View>
        );
      }

      const mine = item.sessionId === ownSessionId;

      if (item.kind === 'invite' && item.invite) {
        const game = AVAILABLE_GAMES.find((g) => g.id === item.invite!.gameId);
        const status = item.invite.status;
        const canRespond = !mine && status === 'pending';

        return (
          <View style={[styles.messageRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
            <Pressable
              disabled={status !== 'accepted'}
              onPress={() => router.push({ pathname: '/matchmaking', params: { gameId: item.invite!.gameId } })}
              style={[styles.inviteCard, { backgroundColor: mine ? T.coralSoft : T.surface, borderColor: T.line }]}
            >
              <View style={[styles.inviteTile, { backgroundColor: mine ? '#FFFFFF' : T.coralSoft }]}>
                <MaterialIcons
                  name={(game?.icon ?? 'sports-esports') as never}
                  size={22}
                  color={mine ? T.coralDark : T.coralDark}
                />
              </View>
              <View style={styles.inviteBody}>
                <Text style={styles.inviteKicker}>
                  {mine ? 'Your invite' : `${item.displayName} invites you`}
                </Text>
                <Text style={[styles.inviteTitle, { color: T.ink }]}>{game?.name ?? item.text}</Text>
                <Text style={styles.inviteMeta}>{game?.estimatedTime ?? 'Made for two'} · made for two</Text>

                {canRespond && partnerOnline && (
                  <View style={styles.inviteActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Accept invite"
                      onPress={() => handleAcceptInvite(item.invite!.inviteId, item.invite!.gameId)}
                      style={({ pressed }) => [styles.acceptBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.acceptText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Decline invite"
                      onPress={() => socketService.respondChatInvite(item.invite!.inviteId, false)}
                      style={({ pressed }) => [styles.declineBtn, pressed && styles.pressed]}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
                {canRespond && !partnerOnline && (
                  <Text style={styles.inviteHint}>They’re away right now — one sec</Text>
                )}
                {mine && status === 'pending' && (
                  <Text style={styles.inviteHint}>Waiting for {shownPartnerName}…</Text>
                )}
                {status === 'accepted' && (
                  <View style={styles.inviteStatusChipAccepted}>
                    <MaterialIcons name="check-circle" size={13} color={T.sageInk} />
                    <Text style={styles.inviteStatusTextAccepted}>Accepted — tap to jump in</Text>
                  </View>
                )}
                {status === 'declined' && (
                  <View style={styles.inviteStatusChipDeclined}>
                    <MaterialIcons name="cancel" size={13} color={T.muted} />
                    <Text style={styles.inviteStatusTextDeclined}>Declined</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </View>
        );
      }

      return (
        <View style={[styles.messageRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
          {!mine && <AvatarView avatar={shownPartnerAvatar} size={30} />}
          <View style={[styles.bubbleCol, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
            {!mine && <Text style={styles.senderName}>{item.displayName}</Text>}
            <View style={mine ? styles.bubbleMine : styles.bubbleTheirs}>
              <Text style={[styles.bubbleText, { color: mine ? '#FFFFFF' : T.ink }]}>{item.text}</Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.sentAt)}</Text>
          </View>
        </View>
      );
    },
    [ownSessionId, shownPartnerAvatar, partnerOnline, handleAcceptInvite]
  );

  const selectedAvatarId = profile?.avatar?.value ?? '';

  return (
    <View style={[styles.screen, { backgroundColor: T.page }]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            >
              <MaterialIcons name="arrow-back" size={22} color={T.ink} />
            </Pressable>

            <View style={styles.headerCenter}>
              <View style={styles.avatarPair}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick your photo"
                  hitSlop={6}
                  onPress={() => setPickerOpen(true)}
                >
                  <AvatarView avatar={profile?.avatar} size={38} showBadge badgeType="pulse" />
                </Pressable>
                <AvatarView
                  avatar={shownPartnerAvatar}
                  size={38}
                  showBadge
                  badgeType={partnerOnline ? 'check' : 'offline'}
                />
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>
                You & {shownPartnerName}
              </Text>
              <Text style={styles.headerSub}>
                {partnerOnline ? 'Here with you' : 'Away right now'} · messages vanish in 15 min
              </Text>
            </View>

            <View style={styles.iconBtnSpace} />
          </View>

          {/* ── Messages ───────────────────────────────────────────── */}
          {listData.length === 0 ? (
            <ScrollView contentContainerStyle={styles.emptyWrap}>
              <View style={styles.emptyCard}>
                <MaterialIcons name="forum" size={30} color={T.coral} />
                <Text style={styles.emptyTitle}>Say the first hello</Text>
                <Text style={styles.emptyText}>
                  A tiny room just for you two. Every message fades away after 15 minutes.
                </Text>
              </View>
            </ScrollView>
          ) : (
            <FlatList
              data={listData}
              inverted
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* ── Typing indicator ───────────────────────────────────── */}
          {partnerTyping && (
            <View style={styles.typingRow}>
              <Text style={styles.typingText}>{shownPartnerName} is typing…</Text>
            </View>
          )}

          {/* ── Composer ───────────────────────────────────────────── */}
          <View style={styles.composer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={text}
              onChangeText={handleChangeText}
              onBlur={() => socketService.setChatTyping(false)}
              placeholder="Write something sweet…"
              placeholderTextColor={T.muted}
              multiline
              maxLength={CHAT_CONFIG.MAX_TEXT_LEN}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Invite to a game"
              onPress={() => setGamePickerOpen(true)}
              style={({ pressed }) => [styles.gameBtn, pressed && styles.pressed]}
            >
              <MaterialIcons name="sports-esports" size={22} color={T.coralDark} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              onPress={handleSend}
              disabled={!text.trim() || sending}
              style={({ pressed }) => [
                styles.sendBtn,
                (!text.trim() || sending) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <MaterialIcons name="send" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Photo picker ─────────────────────────────────────────── */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalScrim}>
          <Pressable style={styles.modalTouchAway} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick your photo</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={() => setPickerOpen(false)}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <MaterialIcons name="close" size={20} color={T.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {PHOTO_AVATARS.map((preset) => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Photo ${preset.name}`}
                    onPress={() => handlePickAvatar(preset.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      selectedAvatarId === preset.id && profile?.avatar?.type === 'photo' && styles.tileSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Image
                      source={PHOTO_AVATAR_SOURCES[preset.id]}
                      style={styles.tileImage}
                    />
                    <Text style={styles.tileLabel} numberOfLines={1}>
                      {preset.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Or an icon friend</Text>
              <View style={styles.grid}>
                {AVATAR_PRESETS.map((preset) => (
                  <Pressable
                    key={preset.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Icon ${preset.name}`}
                    onPress={() => handlePickAvatar(preset.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      selectedAvatarId === preset.value && profile?.avatar?.type !== 'photo' && styles.tileSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AvatarView avatar={{ type: preset.type, value: preset.value }} size={56} />
                    <Text style={styles.tileLabel} numberOfLines={1}>
                      {preset.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Game invite picker ───────────────────────────────────── */}
      <Modal
        visible={gamePickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setGamePickerOpen(false)}
      >
        <View style={styles.modalScrim}>
          <Pressable style={styles.modalTouchAway} onPress={() => setGamePickerOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite to a game</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={() => setGamePickerOpen(false)}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <MaterialIcons name="close" size={20} color={T.ink} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {PLAYABLE_GAME_IDS.map((id) => {
                const game = AVAILABLE_GAMES.find((g) => g.id === id);
                if (!game) return null;
                return (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityLabel={`Invite to ${game.name}`}
                    onPress={() => handleSendInvite(id)}
                    style={({ pressed }) => [styles.gameRow, pressed && styles.pressed]}
                  >
                    <View style={[styles.inviteTile, { backgroundColor: T.coralSoft }]}>
                      <MaterialIcons name={game.icon as never} size={22} color={T.coralDark} />
                    </View>
                    <View style={styles.gameRowBody}>
                      <Text style={styles.gameRowTitle}>{game.name}</Text>
                      <Text style={styles.gameRowMeta}>
                        {game.estimatedTime} · {game.focusLevel}
                      </Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={T.muted} />
                  </Pressable>
                );
              })}
              {!partnerOnline && (
                <Text style={styles.gameRowHint}>
                  {shownPartnerName} is away — they’ll see the invite when they’re back.
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.line,
    backgroundColor: T.surface,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  iconBtnSpace: { width: 44 },
  headerCenter: { flex: 1, alignItems: 'center' },
  avatarPair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
    color: T.ink,
    fontFamily: 'DMSans-Bold',
  },
  headerSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: T.muted,
    fontFamily: 'DMSans-Regular',
  },

  emptyWrap: { flex: 1, justifyContent: 'center', padding: 24 },
  emptyCard: {
    backgroundColor: T.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    padding: 26,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    color: T.ink,
    fontFamily: 'Fraunces-SemiBold',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 20,
    color: T.muted,
    textAlign: 'center',
    fontFamily: 'DMSans-Regular',
  },

  listContent: { paddingHorizontal: 16, paddingVertical: 14 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  bubbleCol: { maxWidth: '82%', marginHorizontal: 8 },
  senderName: {
    fontSize: 10.5,
    color: T.muted,
    marginBottom: 3,
    marginLeft: 2,
    fontFamily: 'DMSans-Medium',
  },
  bubbleMine: {
    backgroundColor: T.coral,
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleTheirs: {
    backgroundColor: T.surface,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleText: {
    fontSize: 14.5,
    lineHeight: 20,
    fontFamily: 'DMSans-Regular',
  },
  timeText: {
    marginTop: 2,
    fontSize: 10,
    color: T.muted,
    fontFamily: 'DMSans-Regular',
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 8,
    alignSelf: 'center',
  },
  systemText: {
    fontSize: 11.5,
    color: T.muted,
    fontFamily: 'DMSans-Medium',
  },

  typingRow: { paddingHorizontal: 18, paddingBottom: 4 },
  typingText: {
    fontSize: 11.5,
    color: T.muted,
    fontStyle: 'italic',
    fontFamily: 'DMSans-Regular',
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.line,
    backgroundColor: T.surface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    backgroundColor: T.page,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 14.5,
    color: T.ink,
    fontFamily: 'DMSans-Regular',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: T.line },
  gameBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  inviteCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    maxWidth: '86%',
  },
  inviteTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBody: { flex: 1, minWidth: 0 },
  inviteKicker: {
    fontSize: 10,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'DMSans-Medium',
  },
  inviteTitle: {
    marginTop: 2,
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
  },
  inviteMeta: {
    marginTop: 2,
    fontSize: 11.5,
    color: T.muted,
    fontFamily: 'DMSans-Regular',
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  acceptBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: T.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'DMSans-Bold' },
  declineBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1.3,
    borderColor: T.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { color: T.muted, fontSize: 13, fontFamily: 'DMSans-Medium' },
  inviteHint: {
    marginTop: 8,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: T.muted,
    fontFamily: 'DMSans-Regular',
  },
  inviteStatusChipAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: T.sage,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  inviteStatusTextAccepted: { color: T.sageInk, fontSize: 11.5, fontFamily: 'DMSans-Medium' },
  inviteStatusChipDeclined: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: T.page,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  inviteStatusTextDeclined: { color: T.muted, fontSize: 11.5, fontFamily: 'DMSans-Medium' },

  gameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  gameRowBody: { flex: 1, minWidth: 0 },
  gameRowTitle: { fontSize: 14.5, color: T.ink, fontFamily: 'DMSans-Bold' },
  gameRowMeta: { marginTop: 1, fontSize: 11.5, color: T.muted, fontFamily: 'DMSans-Regular' },
  gameRowHint: {
    marginTop: 10,
    fontSize: 11.5,
    fontStyle: 'italic',
    color: T.muted,
    textAlign: 'center',
    fontFamily: 'DMSans-Regular',
  },

  modalScrim: { flex: 1, backgroundColor: 'rgba(64, 58, 55, 0.35)', justifyContent: 'flex-end' },
  modalTouchAway: { flex: 1 },
  modalCard: {
    backgroundColor: T.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: {
    fontSize: 19,
    color: T.ink,
    fontFamily: 'Fraunces-SemiBold',
  },
  sectionLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 12,
    color: T.muted,
    fontFamily: 'DMSans-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
  },
  tile: {
    width: '22%',
    alignItems: 'center',
    borderRadius: 16,
    padding: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileSelected: { borderColor: T.coral, backgroundColor: T.coralSoft },
  tileImage: { width: 56, height: 56, borderRadius: 19 },
  tileLabel: {
    marginTop: 5,
    fontSize: 11,
    color: T.muted,
    fontFamily: 'DMSans-Medium',
  },
});
