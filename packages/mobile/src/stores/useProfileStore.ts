import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlayerProfile, AVATAR_PRESETS } from '@tether/shared';

const PROFILE_KEY = '@tether_profile';
const SERVER_URL_KEY = '@tether_server_url';
const PAIRING_SECRET_KEY = '@tether_pairing_secret';
const SESSION_TOKEN_KEY = '@tether_session_token';

/**
 * Default game-server address.
 *
 * - EXPO_PUBLIC_SERVER_URL always wins (set at build time, or in a local .env).
 * - Otherwise the client connects to the hosted server.
 * - Settings → Address still lets each device override this at runtime.
 */
const HOSTED_SERVER_URL = 'https://ushumusu.onrender.com';

const getDefaultServerUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_SERVER_URL;
  if (envUrl) return envUrl.trim().replace(/\/+$/, '');
  return HOSTED_SERVER_URL;
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
