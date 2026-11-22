import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';
import { useSocketStore } from '../stores/useSocketStore';

export const ReconnectionBanner: React.FC = () => {
  const opponentGraceSeconds = useSocketStore((s) => s.opponentGraceSeconds);
  const opponentDisconnectedName = useSocketStore((s) => s.opponentDisconnectedName);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(opponentGraceSeconds);

  useEffect(() => {
    setSecondsRemaining(opponentGraceSeconds);
    if (opponentGraceSeconds === null) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [opponentGraceSeconds]);

  if (secondsRemaining === null) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.iconBox}>
        <MaterialIcons name="wifi-off" size={16} color={Colors.onPrimaryContainer} />
      </View>
      <View style={styles.textColumn}>
        <Text style={[Typography.titleMd, styles.title]}>
          {opponentDisconnectedName || 'Your person'} slipped away
        </Text>
        <Text style={[Typography.bodySm, styles.subtitle]}>
          Saving your spot… {secondsRemaining}s
        </Text>
      </View>
      <MaterialIcons name="favorite-border" size={18} color={Colors.onPrimaryContainer} />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    color: Colors.onPrimaryContainer,
    fontSize: 13,
  },
  subtitle: {
    color: Colors.onPrimaryContainer,
    fontSize: 11,
    marginTop: 1,
    opacity: 0.8,
  },
});
