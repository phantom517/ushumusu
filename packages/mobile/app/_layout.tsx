import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, StyleSheet, Text } from 'react-native';
import { useFonts, PlayfairDisplay_500Medium, PlayfairDisplay_600SemiBold, PlayfairDisplay_500Medium_Italic } from '@expo-google-fonts/playfair-display';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useProfileStore } from '../src/stores/useProfileStore';
import { socketService } from '../src/services/socketService';
import { ReconnectionBanner } from '../src/components/ReconnectionBanner';
import { Pulse } from '../src/components/Pulse';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../src/theme/colors';
import { Typography } from '../src/theme/typography';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'PlayfairDisplay-Medium': PlayfairDisplay_500Medium,
    'PlayfairDisplay-SemiBold': PlayfairDisplay_600SemiBold,
    'PlayfairDisplay-MediumItalic': PlayfairDisplay_500Medium_Italic,
    'Nunito-Regular': Nunito_400Regular,
    'Nunito-SemiBold': Nunito_600SemiBold,
    'Nunito-Bold': Nunito_700Bold,
    'Nunito-ExtraBold': Nunito_800ExtraBold,
    'DMSans-Regular': DMSans_400Regular,
    'DMSans-Medium': DMSans_500Medium,
    'DMSans-Bold': DMSans_700Bold,
    'Fraunces-SemiBold': Fraunces_600SemiBold,
    'Fraunces-Bold': Fraunces_700Bold,
  });

  const isLoaded = useProfileStore((s) => s.isLoaded);
  const loadSettings = useProfileStore((s) => s.loadSettings);
  const serverUrl = useProfileStore((s) => s.serverUrl);
  const profile = useProfileStore((s) => s.profile);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (isLoaded && profile && serverUrl) {
      socketService.initConnection(serverUrl);
    }
  }, [isLoaded, profile, serverUrl]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.root}>
        <ReconnectionBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="home" />
          <Stack.Screen name="matchmaking" options={{ presentation: 'modal' }} />
          <Stack.Screen name="lobby" />
          <Stack.Screen name="game/setup" />
          <Stack.Screen name="game/hangman" />
          <Stack.Screen name="game/results" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack>

        {(!fontsLoaded || !isLoaded) && (
          <View style={styles.loadingOverlay}>
            <Pulse duration={1400} maxScale={1.15}>
              <View style={styles.loaderHeart}>
                <MaterialIcons name="favorite" size={30} color="#FFFFFF" />
              </View>
            </Pulse>
            <Text style={[Typography.headlineItalic, styles.loaderText]}>Tether</Text>
            <Text style={[Typography.bodySm, styles.loaderSub]}>warming things up…</Text>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
    position: 'relative',
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    zIndex: 999,
  },
  loaderHeart: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  loaderText: {
    color: Colors.onSurface,
    marginTop: 18,
  },
  loaderSub: {
    color: Colors.onSurfaceVariant,
    marginTop: 4,
  },
});
