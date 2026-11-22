import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
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

const money = (n: number) => '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default function AuctionScreen() {
  const insets = useSafeAreaInsets();
  const profile = useProfileStore((s) => s.profile);
  const auctionState = useSocketStore((s) => s.auctionState);
  const currentRoom = useSocketStore((s) => s.currentRoom);

  const [tentative, setTentative] = useState<number | null>(null);
  const [bidInput, setBidInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);

  // Hooks must ALL run before any early return — safe defaults while state loads
  const phase = auctionState?.phase;
  const currentItemIndex = auctionState?.currentItemIndex ?? 0;
  const currentItem = auctionState?.currentItem;
  const isMyTurn = phase === 'bidding' && !!currentItem?.isMyTurn;
  const minNext = currentItem?.minNextBid ?? 1;
  const canAfford = currentItem?.canAfford ?? false;

  // Pre-suggest the minimum raise the moment it becomes my turn
  useEffect(() => {
    if (phase === 'bidding' && isMyTurn && canAfford && tentative === null) {
      setTentative(minNext);
      setBidInput(String(minNext));
    }
  }, [phase, isMyTurn, canAfford, minNext, currentItemIndex]);

  if (!auctionState) {
    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Session" />
        <View style={styles.loadingBox}>
          <Text style={Typography.bodyMd}>Connecting to game session...</Text>
        </View>
      </View>
    );
  }

  const {
    scenario,
    items,
    myMoney,
    opponentMoney,
    results,
    winnerPlayerId,
    finishReason,
    stats,
  } = auctionState;

  const opponentSummary = currentRoom?.players.find((p) => p.profile.id !== profile?.id);
  const opponentName = opponentSummary?.profile.displayName || 'Companion';
  const isWinner = winnerPlayerId === profile?.id;

  const item = items[currentItemIndex];
  const isLastItem = currentItemIndex >= items.length - 1;

  const handleRaise = (amount: number) => {
    if (!isMyTurn || submitting) return;
    const capped = Math.min(amount, myMoney);
    setTentative(capped);
    setBidInput(String(capped));
  };

  const handleCustomInput = (text: string) => {
    if (!isMyTurn) return;
    const cleaned = text.replace(/[^0-9]/g, '');
    setBidInput(cleaned);
    const n = parseInt(cleaned, 10);
    setTentative(Number.isFinite(n) ? n : null);
  };

  const handleSealBid = async () => {
    if (tentative === null || !item || !isMyTurn || submitting) return;
    if (tentative < minNext) {
      Alert.alert('Bid Notice', `You need to bid at least ${money(minNext)}.`);
      return;
    }
    if (tentative > myMoney) {
      Alert.alert('Wallet Notice', `You only have ${money(myMoney)} left.`);
      return;
    }
    setSubmitting(true);
    const res = await socketService.submitAuctionBid(item.id, tentative);
    setSubmitting(false);
    if (!res.success) {
      Alert.alert('Bid Notice', res.error || 'Failed to place bid');
      return;
    }
    setTentative(null);
    setBidInput('');
  };

  const handleFold = () => {
    if (!isMyTurn || submitting) return;
    const highBid = currentItem?.highBidAmount;
    const message = highBid
      ? `Fold now and ${opponentName} wins this lot at ${money(highBid)}?`
      : 'Fold now and this lot goes unsold for both of you?';
    Alert.alert('Fold the lot', message, [
      { text: 'Keep fighting', style: 'cancel' },
      {
        text: 'Fold',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          const res = await socketService.foldAuctionItem();
          setSubmitting(false);
          if (!res.success) {
            Alert.alert('Auction Notice', res.error || 'Failed to fold');
            return;
          }
          setTentative(null);
          setBidInput('');
        },
      },
    ]);
  };

  const handleNextItem = async () => {
    if (advancing) return;
    setAdvancing(true);
    const res = await socketService.nextAuctionItem();
    setAdvancing(false);
    if (!res.success) {
      Alert.alert('Auction Notice', res.error || 'Failed to advance');
    }
  };

  const handleRematch = async () => {
    setRematchSent(true);
    await socketService.voteRematch(true);
  };

  const handleReturnHome = async () => {
    await socketService.leaveRoom();
  };

  /* ------------------------------- FINISHED ------------------------------- */
  if (phase === 'finished') {
    const myHaul = results.filter((r) => r.winnerPlayerId === profile?.id);
    const theirHaul = results.filter(
      (r) => r.winnerPlayerId && r.winnerPlayerId !== profile?.id
    );
    const unsold = results.filter((r) => r.unsold);

    const title =
      winnerPlayerId === null
        ? 'Perfectly even kits!'
        : isWinner
        ? 'You packed the better kit!'
        : `${opponentName} packed the better kit`;

    const myItems = stats
      ? profile?.id === auctionState.playerIds[0]
        ? stats.p1Items
        : stats.p2Items
      : myHaul.length;
    const theirItems = stats
      ? profile?.id === auctionState.playerIds[0]
        ? stats.p2Items
        : stats.p1Items
      : theirHaul.length;

    return (
      <View style={styles.screen}>
        <Header title="Tether" subtitle="Results" showBack onBack={handleReturnHome} />

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.celebrationSection}>
            <View
              style={[
                styles.trophyCircle,
                { backgroundColor: isWinner ? Colors.primaryContainer : Colors.secondaryContainer },
              ]}
            >
              <MaterialIcons
                name={winnerPlayerId === null ? 'handshake' : isWinner ? 'emoji-events' : 'military-tech'}
                size={36}
                color={winnerPlayerId === null ? Colors.gold : isWinner ? Colors.primary : Colors.secondary}
              />
            </View>
            <Text style={[Typography.labelSm, styles.roundLabel]}>AUCTION CLOSED</Text>
            <Text style={[Typography.headlineLg, styles.celebrationTitle]}>{title}</Text>
            <Text style={[Typography.bodyMd, styles.celebrationSubtitle]}>
              {finishReason || `Survived ${scenario.days} days in ${scenario.title}.`}
            </Text>
          </View>

          {/* Wallets + scorecard */}
          <View style={styles.statsCard}>
            <View style={styles.highlightsGrid}>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Your haul</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>{myItems}</Text>
                <Text style={[Typography.bodySm, styles.highlightSub]}>items won</Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Their haul</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>{theirItems}</Text>
                <Text style={[Typography.bodySm, styles.highlightSub]}>items won</Text>
              </View>
              <View style={styles.highlightItem}>
                <Text style={[Typography.labelSm, styles.highlightLabel]}>Money left</Text>
                <Text style={[Typography.headlineMd, styles.highlightValue]}>{money(myMoney)}</Text>
                <Text style={[Typography.bodySm, styles.highlightSub]}>vs {money(opponentMoney)}</Text>
              </View>
            </View>
          </View>

          {/* Final hauls */}
          <View style={styles.haulCard}>
            <View style={styles.haulColumn}>
              <Text style={[Typography.labelMd, styles.haulTitle]}>YOUR KIT</Text>
              {myHaul.length === 0 ? (
                <Text style={[Typography.bodySm, styles.haulEmpty]}>Nothing but good intentions.</Text>
              ) : (
                myHaul.map((r) => (
                  <View key={r.itemId} style={styles.haulRow}>
                    <MaterialIcons name="check" size={14} color={Colors.primary} />
                    <Text style={[Typography.bodySm, styles.haulItemText]} numberOfLines={1}>
                      {r.name} · {money(r.price || 0)}
                    </Text>
                  </View>
                ))
              )}
            </View>
            <View style={[styles.haulColumn, styles.haulColumnRight]}>
              <Text style={[Typography.labelMd, styles.haulTitle]}>{opponentName.toUpperCase()}'S KIT</Text>
              {theirHaul.length === 0 ? (
                <Text style={[Typography.bodySm, styles.haulEmpty]}>Also nothing but intentions.</Text>
              ) : (
                theirHaul.map((r) => (
                  <View key={r.itemId} style={styles.haulRow}>
                    <MaterialIcons name="check" size={14} color={Colors.secondary} />
                    <Text style={[Typography.bodySm, styles.haulItemText]} numberOfLines={1}>
                      {r.name} · {money(r.price || 0)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {unsold.length > 0 && (
            <Text style={[Typography.bodySm, styles.unsoldNote]}>
              {unsold.length} lot{unsold.length > 1 ? 's' : ''} went unsold after fold-outs:{' '}
              {unsold.map((r) => r.name).join(', ')}.
            </Text>
          )}

          <View style={styles.actionButtons}>
            <TactileButton
              title={rematchSent ? `Rematch requested… awaiting ${opponentName}` : `Rematch with ${opponentName}`}
              icon="cached"
              variant={rematchSent ? 'secondary' : 'primary'}
              size="lg"
              disabled={rematchSent}
              onPress={handleRematch}
            />
            <TactileButton
              title="Back to all games"
              icon="grid-view"
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

  /* ---------------------------- OPEN BID WAR ---------------------------- */
  const highBidderName =
    currentItem?.highBidPlayerId === profile?.id ? 'You' : opponentName;
  const revealWonByMe = phase === 'reveal' && currentItem?.winnerPlayerId === profile?.id;
  const revealUnsold = phase === 'reveal' && currentItem?.unsold;
  const raiseOptions = [minNext, minNext + 25, minNext + 50, minNext + 100].filter(
    (v) => v <= myMoney
  );

  return (
    <View style={styles.screen}>
      <Header
        title="Tether"
        subtitle="Survival Auction"
        showBack
        onBack={() => {
          Alert.alert('Leave Match', 'Are you sure you want to exit the current match?', [
            { text: 'Cancel', style: 'cancel' },
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
        {/* Scenario briefing */}
        <View style={styles.scenarioCard}>
          <View style={styles.scenarioBadge}>
            <MaterialIcons name="auto-awesome" size={13} color={Colors.gold} />
            <Text style={[Typography.labelSm, styles.scenarioBadgeText]}>AI SCENARIO</Text>
          </View>
          <Text style={[Typography.headlineMd, styles.scenarioTitle]}>{scenario.title}</Text>
          <Text style={[Typography.bodySm, styles.scenarioText]}>{scenario.situation}</Text>
          <View style={styles.scenarioMetaRow}>
            <View style={styles.scenarioChip}>
              <MaterialIcons name="timer" size={12} color={Colors.onSurfaceVariant} />
              <Text style={[Typography.labelSm, styles.scenarioChipText]}>
                Survive {scenario.days} days
              </Text>
            </View>
            <View style={styles.scenarioChip}>
              <MaterialIcons name="payments" size={12} color={Colors.onSurfaceVariant} />
              <Text style={[Typography.labelSm, styles.scenarioChipText]}>
                {money(scenario.budget)} each
              </Text>
            </View>
          </View>
        </View>

        {/* Wallets */}
        <View style={styles.walletRow}>
          <View style={[styles.walletChip, { backgroundColor: Colors.primaryContainer }]}>
            <MaterialIcons name="account-balance-wallet" size={13} color={Colors.primary} />
            <Text style={[Typography.labelMd, { color: Colors.onPrimaryContainer, fontWeight: '700' }]}>
              You: {money(myMoney)}
            </Text>
          </View>
          <View style={[styles.walletChip, { backgroundColor: Colors.secondaryContainer }]}>
            <MaterialIcons name="account-balance-wallet" size={13} color={Colors.secondary} />
            <Text style={[Typography.labelMd, { color: Colors.onSecondaryContainer, fontWeight: '700' }]}>
              {opponentName}: {money(opponentMoney)}
            </Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.dotsRow}>
          {items.map((_, i) => (
            <View
              key={i}
              style={[
                styles.inquiryDot,
                {
                  backgroundColor:
                    i < results.length
                      ? Colors.secondary
                      : i === currentItemIndex
                      ? Colors.gold
                      : Colors.surfaceContainerHighest,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[Typography.labelSm, styles.itemCounter]}>
          LOT {currentItemIndex + 1} OF {items.length}
        </Text>

        {/* Current lot */}
        {item && (
          <View style={styles.itemCard}>
            <Text style={[Typography.headlineLg, styles.itemName]}>{item.name}</Text>
            <Text style={[Typography.bodyMd, styles.itemDesc]}>{item.description}</Text>
            <View style={styles.itemValueChip}>
              <MaterialIcons name="sell" size={12} color={Colors.onSurfaceVariant} />
              <Text style={[Typography.labelSm, styles.itemValueText]}>
                Suggested value {money(item.baseValue)}
              </Text>
            </View>

            {/* Live war banner */}
            {phase === 'bidding' && (
              <View
                style={[
                  styles.warBanner,
                  currentItem?.highBidPlayerId
                    ? currentItem.highBidPlayerId === profile?.id
                      ? { backgroundColor: Colors.primaryContainer }
                      : { backgroundColor: Colors.secondaryContainer }
                    : { backgroundColor: Colors.surfaceContainerLow },
                ]}
              >
                {currentItem?.highBidPlayerId ? (
                  <>
                    <MaterialIcons
                      name="gavel"
                      size={16}
                      color={
                        currentItem.highBidPlayerId === profile?.id ? Colors.primary : Colors.secondary
                      }
                    />
                    <Text style={[Typography.bodyMd, styles.warText]}>
                      <Text style={{ fontWeight: '700' }}>{highBidderName}</Text> hold
                      {currentItem.highBidPlayerId === profile?.id ? '' : 's'} the high bid at{' '}
                      <Text style={{ fontWeight: '700' }}>{money(currentItem.highBidAmount || 0)}</Text>
                    </Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="campaign" size={16} color={Colors.onSurfaceVariant} />
                    <Text style={[Typography.bodyMd, styles.warText]}>
                      No bids yet — open at {money(minNext)} or more
                    </Text>
                  </>
                )}
              </View>
            )}

            {/* My turn: raise or fold */}
            {isMyTurn && (
              <View style={styles.bidSection}>
                <Text style={[Typography.labelMd, styles.bidLabel]}>
                  {canAfford
                    ? `Outbid to at least ${money(minNext)}:`
                    : `You can't cover ${money(minNext)} — folding is your only move:`}
                </Text>

                {canAfford && (
                  <>
                    <View style={styles.chipsRow}>
                      {raiseOptions.map((chip, idx) => {
                        const active = tentative === chip;
                        return (
                          <TouchableOpacity
                            key={`${chip}-${idx}`}
                            onPress={() => handleRaise(chip)}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text
                              style={[
                                Typography.labelMd,
                                styles.chipText,
                                active && styles.chipTextActive,
                              ]}
                            >
                              {money(chip)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.customBidRow}>
                      <Text style={[Typography.titleMd, styles.dollarSign]}>$</Text>
                      <TextInput
                        value={bidInput}
                        onChangeText={handleCustomInput}
                        placeholder={`At least ${minNext}`}
                        placeholderTextColor={Colors.outline}
                        keyboardType="number-pad"
                        style={[Typography.titleMd, styles.customBidInput]}
                      />
                    </View>
                    {tentative !== null && tentative < minNext && (
                      <Text style={[Typography.bodySm, styles.bidWarn]}>
                        Must be at least {money(minNext)} — the raise rule.
                      </Text>
                    )}
                  </>
                )}

                <View style={styles.sealRow}>
                  <TouchableOpacity onPress={handleFold} style={styles.passBtn}>
                    <MaterialIcons name="flag" size={14} color={Colors.onSurfaceVariant} />
                    <Text style={[Typography.labelMd, styles.passText]}>Fold</Text>
                  </TouchableOpacity>
                  {canAfford && (
                    <TactileButton
                      title={`Bid ${money(tentative ?? minNext)}`}
                      icon="gavel"
                      variant="primary"
                      size="lg"
                      loading={submitting}
                      disabled={tentative === null || tentative < minNext || tentative > myMoney}
                      onPress={handleSealBid}
                      style={{ flex: 1 }}
                    />
                  )}
                </View>
              </View>
            )}

            {/* Opponent's turn */}
            {phase === 'bidding' && !isMyTurn && (
              <View style={styles.waitingBox}>
                <MaterialIcons name="hourglass-top" size={18} color={Colors.gold} />
                <Text style={[Typography.bodyMd, styles.waitingText]}>
                  {currentItem?.highBidPlayerId
                    ? `${opponentName} must reach ${money(minNext)} to steal it — or they fold…`
                    : `${opponentName} is deciding whether to open…`}
                </Text>
              </View>
            )}

            {/* The rally so far */}
            {phase === 'bidding' && (currentItem?.bidHistory.length ?? 0) > 0 && (
              <View style={styles.rallyCard}>
                <Text style={[Typography.labelSm, styles.rallyTitle]}>BIDDING WAR</Text>
                {currentItem!.bidHistory
                  .slice()
                  .reverse()
                  .map((entry, idx) => {
                    const mine = entry.playerId === profile?.id;
                    return (
                      <View key={`${entry.at}-${idx}`} style={styles.rallyRow}>
                        <MaterialIcons
                          name={mine ? 'person' : 'person-outline'}
                          size={13}
                          color={mine ? Colors.primary : Colors.secondary}
                        />
                        <Text style={[Typography.bodySm, styles.rallyText]}>
                          {mine ? 'You' : opponentName} bid {money(entry.amount)}
                        </Text>
                      </View>
                    );
                  })}
              </View>
            )}
          </View>
        )}

        {/* Settled lot */}
        {phase === 'reveal' && currentItem && (
          <View
            style={[
              styles.revealCard,
              {
                backgroundColor: revealUnsold
                  ? Colors.surfaceContainerLow
                  : revealWonByMe
                  ? Colors.primaryContainer
                  : Colors.secondaryContainer,
              },
            ]}
          >
            <View style={styles.revealHeader}>
              <MaterialIcons
                name={revealUnsold ? 'do-not-disturb' : revealWonByMe ? 'emoji-events' : 'person'}
                size={20}
                color={revealUnsold ? Colors.outline : revealWonByMe ? Colors.primary : Colors.secondary}
              />
              <Text
                style={[
                  Typography.titleMd,
                  { color: revealUnsold ? Colors.onSurfaceVariant : Colors.onSurface },
                ]}
              >
                {revealUnsold
                  ? 'Folded out — nobody gets it.'
                  : revealWonByMe
                  ? `Yours for ${money(
                      currentItem.bidHistory.find((b) => b.playerId === profile?.id)?.amount ?? 0
                    )}`
                  : `${opponentName} takes it`}
              </Text>
            </View>

            <Text style={[Typography.bodySm, styles.revealHint]}>
              {revealUnsold
                ? 'One of you waved the white flag before anyone even bid.'
                : `${highBidderName} held the final bid and paid every dollar of it.`}
            </Text>

            <TactileButton
              title={isLastItem ? 'See final results' : 'Next lot'}
              icon={isLastItem ? 'emoji-events' : 'arrow-forward'}
              variant="primary"
              size="lg"
              loading={advancing}
              onPress={handleNextItem}
              style={{ marginTop: 12 }}
            />
          </View>
        )}

        {/* Resolved lots */}
        {results.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={[Typography.labelMd, styles.historyTitle]}>SOLD SO FAR</Text>
            <View style={styles.historyList}>
              {results
                .slice()
                .reverse()
                .map((r) => {
                  const mine = r.winnerPlayerId === profile?.id;
                  return (
                    <View key={r.itemId} style={styles.historyItem}>
                      <View
                        style={[
                          styles.historyDot,
                          { backgroundColor: r.unsold ? Colors.outline : mine ? Colors.primary : Colors.secondary },
                        ]}
                      />
                      <View style={styles.historyTextCol}>
                        <Text style={[Typography.bodySm, styles.historyQuestion]} numberOfLines={1}>
                          {r.name}
                        </Text>
                        <Text style={[Typography.bodySm, styles.historyPicks]}>
                          {r.unsold ? 'Unsold' : mine ? `Yours for ${money(r.price || 0)}` : `${opponentName} · ${money(r.price || 0)}`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          </View>
        )}
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
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scenarioCard: {
    backgroundColor: Colors.warningContainer,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  scenarioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF99',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  scenarioBadgeText: {
    color: Colors.onSurface,
    letterSpacing: 0.5,
  },
  scenarioTitle: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  scenarioText: {
    color: Colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 10,
  },
  scenarioMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scenarioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF77',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  scenarioChipText: {
    color: Colors.onSurface,
  },
  walletRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  walletChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 14,
    gap: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: 6,
  },
  inquiryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemCounter: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  itemName: {
    color: Colors.onSurface,
    marginBottom: 6,
  },
  itemDesc: {
    color: Colors.onSurfaceVariant,
    lineHeight: 20,
    marginBottom: 10,
  },
  itemValueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  itemValueText: {
    color: Colors.onSurfaceVariant,
  },
  warBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginTop: 12,
  },
  warText: {
    color: Colors.onSurface,
    flex: 1,
    lineHeight: 19,
  },
  bidSection: {
    marginTop: 14,
  },
  bidLabel: {
    color: Colors.onSurface,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    backgroundColor: Colors.surfaceContainerLow,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  chipActive: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.onSurface,
  },
  chipTextActive: {
    color: Colors.onPrimaryContainer,
    fontWeight: '700',
  },
  customBidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  dollarSign: {
    color: Colors.primary,
    fontWeight: '700',
  },
  customBidInput: {
    flex: 1,
    color: Colors.onSurface,
    paddingVertical: 12,
    marginLeft: 6,
  },
  bidWarn: {
    color: Colors.error,
    marginBottom: 8,
  },
  sealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  passBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 5,
  },
  passText: {
    color: Colors.onSurfaceVariant,
  },
  waitingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginTop: 12,
  },
  waitingText: {
    color: Colors.onSurfaceVariant,
    flex: 1,
    lineHeight: 19,
  },
  rallyCard: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  rallyTitle: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rallyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  rallyText: {
    color: Colors.onSurface,
  },
  revealCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  revealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  revealHint: {
    color: Colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  historyCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 12,
  },
  historyTitle: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
  },
  historyDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  historyTextCol: {
    flex: 1,
  },
  historyQuestion: {
    color: Colors.onSurface,
  },
  historyPicks: {
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  celebrationSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  trophyCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  roundLabel: {
    color: Colors.primary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  celebrationTitle: {
    color: Colors.onSurface,
    textAlign: 'center',
    marginBottom: 6,
  },
  celebrationSubtitle: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  highlightsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  highlightItem: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 14,
    padding: 12,
  },
  highlightLabel: {
    color: Colors.onSurfaceVariant,
  },
  highlightValue: {
    color: Colors.onSurface,
    marginVertical: 2,
  },
  highlightSub: {
    color: Colors.tertiary,
    fontSize: 11,
  },
  haulCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    gap: 14,
    marginBottom: 12,
  },
  haulColumn: {
    flex: 1,
  },
  haulColumnRight: {
    borderLeftWidth: 1,
    borderLeftColor: Colors.border,
    paddingLeft: 14,
  },
  haulTitle: {
    color: Colors.tertiary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  haulRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  haulItemText: {
    color: Colors.onSurface,
    flex: 1,
  },
  haulEmpty: {
    color: Colors.outline,
    fontStyle: 'italic',
  },
  unsoldNote: {
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  actionButtons: {
    marginTop: 6,
  },
});
