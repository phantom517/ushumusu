import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlayerProfile, AVATAR_PRESETS } from '@tether/shared';
import { Platform } from 'react-native';

const PROFILE_KEY = '@tether_profile';
const SERVER_URL_KEY = '@tether_server_url';
const PAIRING_SECRET_KEY = '@tether_pairing_secret';
const SESSION_TOKEN_KEY = '@tether_session_token';

import Constants from 'expo-constants';

/**
 * Default game-server address.
 *
 * - EXPO_PUBLIC_SERVER_URL always wins (set at build time, e.g. for a hosted deploy).
 * - Web build served BY the game server → same origin. Running under a dev
 *   bundler (Metro/expo start) → the local API on :3001 instead of the bundler port.
 * - Native (Expo Go / dev client) → the LAN host that serves the bundle.
 * - Anything else → localhost, which the Settings screen lets you override.
 */
const getDefaultServerUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (envUrl) return envUrl.trim().replace(/\/+$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    const { protocol, hostname, port } = window.location;
    const isDevBundler = !port || ['8081', '19000', '19001', '19002', '19006'].includes(port);
    if (isDevBundler) return `${protocol}//${hostname || 'localhost'}:3001`;
    return window.location.origin;
  }

  const hostUri = (Constants as any).expoConfig?.hostUri ?? '';
  const lanHost = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  if (lanHost && /^\d+\.\d+\.\d+\.\d+$/.test(lanHost) && lanHost !== '127.0.0.1') {
    return `http://${lanHost}:3001`;
  }

  return 'http://localhost:3001';
};

const DEFAULT_SERVER_URL = getDefaultServerUrl();

const DEFAULT_PAIRING_SECRET = 'tether-duo-secret';

interface ProfileState {
  profile: PlayerProfile | null;
  serverUrl: string;
  pairingSecret: string;
  sessionToken: string | null;
  isLoaded: boolean;

  loadSettings: () => Promise<void>;
  saveProfile: (profile: PlayerProfile) => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  setPairingSecret: (secret: string) => Promise<void>;
  setSessionToken: (token: string | null) => Promise<void>;
  resetProfile: () => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  serverUrl: DEFAULT_SERVER_URL,
  pairingSecret: DEFAULT_PAIRING_SECRET,
  sessionToken: null,
  isLoaded: false,

  loadSettings: async () => {
    try {
      const [storedProfile, storedUrl, storedSecret, storedToken] = await Promise.all([
        AsyncStorage.getItem(PROFILE_KEY),
        AsyncStorage.getItem(SERVER_URL_KEY),
        AsyncStorage.getItem(PAIRING_SECRET_KEY),
        AsyncStorage.getItem(SESSION_TOKEN_KEY),
      ]);

      set({
        profile: storedProfile ? JSON.parse(storedProfile) : null,
        serverUrl: storedUrl || DEFAULT_SERVER_URL,
        pairingSecret: storedSecret || DEFAULT_PAIRING_SECRET,
        sessionToken: storedToken || null,
        isLoaded: true,
      });
    } catch (err) {
      console.warn('[ProfileStore] Failed to load local settings from AsyncStorage', err);
      set({ isLoaded: true });
    }
  },

  saveProfile: async (profile: PlayerProfile) => {
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      set({ profile });
    } catch (err) {
      console.warn('[ProfileStore] Failed to save profile', err);
    }
  },

  setServerUrl: async (url: string) => {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    await AsyncStorage.setItem(SERVER_URL_KEY, cleanUrl);
    set({ serverUrl: cleanUrl });
  },

  setPairingSecret: async (secret: string) => {
    const cleanSecret = secret.trim();
    await AsyncStorage.setItem(PAIRING_SECRET_KEY, cleanSecret);
    set({ pairingSecret: cleanSecret });
  },

  setSessionToken: async (token: string | null) => {
    if (token) {
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
    }
    set({ sessionToken: token });
  },

  resetProfile: async () => {
    await AsyncStorage.multiRemove([PROFILE_KEY, SESSION_TOKEN_KEY]);
    set({ profile: null, sessionToken: null });
  },
}));
