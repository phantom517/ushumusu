import { TextStyle, Platform } from 'react-native';

export const Typography = {
  // Editorial Display / Headline (Playfair Display — romantic serif)
  displayHero: {
    fontFamily: Platform.select({ ios: 'PlayfairDisplay-SemiBold', default: 'serif' }),
    fontSize: 34,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 42,
    letterSpacing: -0.5,
  },
  headlineLg: {
    fontFamily: Platform.select({ ios: 'PlayfairDisplay-SemiBold', default: 'serif' }),
    fontSize: 26,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  headlineMd: {
    fontFamily: Platform.select({ ios: 'PlayfairDisplay-Medium', default: 'serif' }),
    fontSize: 21,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 29,
    letterSpacing: -0.2,
  },
  // Italic greeting — warm & intimate
  headlineItalic: {
    fontFamily: Platform.select({ ios: 'PlayfairDisplay-MediumItalic', default: 'serif' }),
    fontSize: 28,
    fontWeight: '500' as TextStyle['fontWeight'],
    lineHeight: 36,
    letterSpacing: -0.2,
  },

  // Friendly Interface Body & Titles (Nunito — rounded, warm)
  titleLg: {
    fontFamily: Platform.select({ ios: 'Nunito-Bold', default: undefined }),
    fontSize: 18,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 25,
  },
  titleMd: {
    fontFamily: Platform.select({ ios: 'Nunito-Bold', default: undefined }),
    fontSize: 16,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 22,
  },
  bodyLg: {
    fontFamily: Platform.select({ ios: 'Nunito-Regular', default: undefined }),
    fontSize: 16,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 24,
  },
  bodyMd: {
    fontFamily: Platform.select({ ios: 'Nunito-Regular', default: undefined }),
    fontSize: 14,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 21,
  },
  bodySm: {
    fontFamily: Platform.select({ ios: 'Nunito-Regular', default: undefined }),
    fontSize: 13,
    fontWeight: '400' as TextStyle['fontWeight'],
    lineHeight: 18,
  },
  labelLg: {
    fontFamily: Platform.select({ ios: 'Nunito-Bold', default: undefined }),
    fontSize: 14,
    fontWeight: '700' as TextStyle['fontWeight'],
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  labelMd: {
    fontFamily: Platform.select({ ios: 'Nunito-SemiBold', default: undefined }),
    fontSize: 12,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  labelSm: {
    fontFamily: Platform.select({ ios: 'Nunito-SemiBold', default: undefined }),
    fontSize: 11,
    fontWeight: '600' as TextStyle['fontWeight'],
    lineHeight: 14,
    letterSpacing: 0.5,
  },
};
