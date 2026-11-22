import React from 'react';
import { Redirect } from 'expo-router';
import { useProfileStore } from '../src/stores/useProfileStore';
import { View, StyleSheet, Text } from 'react-native';
import { Pulse } from '../src/components/Pulse';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';

export default function IndexScreen() {
  const profile = useProfileStore((s) => s.profile);
  const isLoaded = useProfileStore((s) => s.isLoaded);

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <Pulse duration={1400} maxScale={1.15}>
          <View style={styles.heart}>
            <MaterialIcons name="favorite" size={34} color="#FFFFFF" />
          </View>
        </Pulse>
        <Text style={[Typography.headlineItalic, styles.wordmark]}>Tether</Text>
      </View>
    );
  }

  if (profile && profile.displayName) {
    return <Redirect href="/home" />;
  }

  return <Redirect href="/setup" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  heart: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  wordmark: {
    color: Colors.onSurface,
    marginTop: 20,
  },
});
