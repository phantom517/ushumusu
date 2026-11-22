import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  StyleProp,
  TextStyle,
} from 'react-native';import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '../theme/colors';
import { Typography } from '../theme/typography';

/* ------------------------------------------------------------------ */
/* Clay shadow recipes — warm-toned soft shadows (iOS) + elevation (Android) */
/* ------------------------------------------------------------------ */
export const ClayShadows = {
  puffy: {
    shadowColor: '#D9A98C',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  chip: {
    shadowColor: '#D9A98C',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  accent: {
    shadowColor: Colors.primaryDark,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 9 },
    elevation: 9,
  },
  flat: {},
} as const;

export type ClayShadowName = keyof typeof ClayShadows;

/* ------------------------------------------------------------------ */
/* ClayCard — puffy inflated card with curved corner-glow highlights.  */
/* Nested so the iOS shadow is not clipped by the glow overflow mask.  */
/* ------------------------------------------------------------------ */
interface ClayCardProps {
  children?: React.ReactNode;
  bg?: string;
  radius?: number;
  shadow?: ClayShadowName;
  /** 'light' cards get a white top-left sheen; 'accent' a softer one. */
  tone?: 'light' | 'accent';
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  innerStyle?: StyleProp<ViewStyle>;
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  bg = Colors.surfaceContainerLow,
  radius = 26,
  shadow = 'puffy',
  tone = 'light',
  glow = true,
  style,
  innerStyle,
}) => {
  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius }, ClayShadows[shadow], style]}>
      <View style={[{ backgroundColor: bg, borderRadius: radius, overflow: 'hidden' }, innerStyle]}>
        {glow && (
          <View
            pointerEvents="none"
            style={[
              styles.glowTL,
              tone === 'light' ? styles.glowTLlight : styles.glowTLaccent,
              {
                width: radius * 3.4,
                height: radius * 3.4,
                borderRadius: radius * 1.7,
                top: -radius * 1.15,
                left: -radius * 0.95,
              },
            ]}
          />
        )}
        {glow && (
          <View
            pointerEvents="none"
            style={[
              styles.glowBR,
              tone === 'light' ? styles.glowBRlight : styles.glowBRaccent,
              {
                width: radius * 2.8,
                height: radius * 2.8,
                borderRadius: radius * 1.4,
                bottom: -radius * 0.95,
                right: -radius * 0.85,
              },
            ]}
          />
        )}
        {children}
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayWell — pressed-IN clay (for text inputs, tracks, quiet panels)  */
/* ------------------------------------------------------------------ */
interface ClayWellProps {
  children?: React.ReactNode;
  bg?: string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export const ClayWell: React.FC<ClayWellProps> = ({ children, bg = Colors.surfaceContainerHigh, radius = 18, style }) => {
  return (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(185,138,110,0.14)',
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.wellShade,
          { width: radius * 3, height: radius * 3, borderRadius: radius * 1.5, top: -radius * 1.3, left: -radius * 0.7 },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.wellSheen,
          { width: radius * 2.4, height: radius * 2.4, borderRadius: radius * 1.2, bottom: -radius * 1.0, right: -radius * 0.7 },
        ]}
      />
      {children}
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayButton — puffy pill that sinks when pressed, springs back       */
/* ------------------------------------------------------------------ */
interface ClayButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'lg' | 'md' | 'sm';
  icon?: keyof typeof MaterialIcons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const ClayButton: React.FC<ClayButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  disabled = false,
  loading = false,
  style,
  textStyle,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;

  const pressIn = () => {
    const target = variant === 'ghost' ? 0.96 : 0.94;
    Animated.parallel([
      Animated.spring(scale, { toValue: target, useNativeDriver: true, friction: 8, tension: 320 }),
      Animated.spring(lift, { toValue: 3, useNativeDriver: true, friction: 8, tension: 320 }),
    ]).start();
  };

  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4.5, tension: 170 }),
      Animated.spring(lift, { toValue: 0, useNativeDriver: true, friction: 4.5, tension: 170 }),
    ]).start();
  };

  const height = size === 'lg' ? 56 : size === 'md' ? 46 : 38;
  const pill = height / 2;

  const inactive = disabled && variant !== 'ghost';
  const bg = inactive ? Colors.surfaceContainerHigh : variant === 'primary' ? Colors.primary : 'transparent';
  const textColor = inactive ? Colors.outline : variant === 'primary' ? '#FFFFFF' : variant === 'ghost' ? Colors.onSurfaceVariant : Colors.onSurface;
  const shadowStyle = variant === 'primary' && !inactive ? ClayShadows.accent : variant === 'secondary' && !inactive ? ClayShadows.chip : ClayShadows.flat;

  return (
    <Animated.View style={[{ transform: [{ scale }, { translateY: lift }] }, shadowStyle, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={disabled || loading}
        style={{
          height,
          borderRadius: pill,
          backgroundColor: bg,
          borderWidth: variant === 'primary' ? 1.5 : 1,
          borderColor: variant === 'primary' ? 'rgba(255,255,255,0.35)' : variant === 'secondary' ? Colors.border : 'transparent',
          opacity: disabled && variant === 'ghost' ? 0.55 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 22,
        }}
      >
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <>
            {icon && <MaterialIcons name={icon} size={size === 'lg' ? 20 : 16} color={textColor} style={{ marginRight: 8 }} />}
            <Text style={[Typography.labelLg, { color: textColor }, size === 'sm' && Typography.labelMd, textStyle]}>
              {title}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayIn — springy entrance on mount (fade + rise + scale)            */
/* ------------------------------------------------------------------ */
interface ClayInProps {
  children?: React.ReactNode;
  delay?: number;
  overshoot?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ClayIn: React.FC<ClayInProps> = ({ children, delay = 0, overshoot = false, style }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.spring(v, {
      toValue: 1,
      delay,
      useNativeDriver: true,
      friction: overshoot ? 4.2 : 6.5,
      tension: overshoot ? 140 : 110,
    });
    anim.start();
    return () => anim.stop();
  }, [v, delay, overshoot]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayFloat — gentle endless bobbing                                  */
/* ------------------------------------------------------------------ */
interface ClayFloatProps {
  children?: React.ReactNode;
  amplitude?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export const ClayFloat: React.FC<ClayFloatProps> = ({ children, amplitude = 5, duration = 2600, style }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);

  return (
    <Animated.View
      style={[style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-amplitude, amplitude] }) }] }]}
    >
      {children}
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayWiggle — playful little rotation sway (crowns, badges)          */
/* ------------------------------------------------------------------ */
interface ClayWiggleProps {
  children?: React.ReactNode;
  amplitude?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export const ClayWiggle: React.FC<ClayWiggleProps> = ({ children, amplitude = 8, duration = 1100, style }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, amplitude, duration]);

  return (
    <Animated.View
      style={[style, { transform: [{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: [`-${amplitude}deg`, `${amplitude}deg`] }) }] }]}
    >
      {children}
    </Animated.View>
  );
};

/* ------------------------------------------------------------------ */
/* ClayBreath — soft opacity pulse (live dots)                         */
/* ------------------------------------------------------------------ */
interface ClayBreathProps {
  children?: React.ReactNode;
  min?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}

export const ClayBreath: React.FC<ClayBreathProps> = ({ children, min = 0.35, duration = 1300, style }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duration / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);

  return <Animated.View style={[style, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [min, 1] }) }]}>{children}</Animated.View>;
};

/* ------------------------------------------------------------------ */
/* PopNumber — number that pops (overshoot scale) whenever it changes  */
/* ------------------------------------------------------------------ */
interface PopNumberProps {
  value: number | string;
  style?: StyleProp<TextStyle>;
}

export const PopNumber: React.FC<PopNumberProps> = ({ value, style }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    v.setValue(0);
    Animated.spring(v, { toValue: 1, friction: 4, tension: 200, useNativeDriver: true }).start();
  }, [value, v]);

  return (
    <Animated.Text style={[style, { transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) }] }]}>
      {value}
    </Animated.Text>
  );
};

/* ------------------------------------------------------------------ */
/* ClayBlobs — soft floating background shapes                         */
/* ------------------------------------------------------------------ */
export const ClayBlobs: React.FC = () => {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (val: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
    const l1 = mk(a, 3800);
    const l2 = mk(b, 5200);
    l1.start();
    l2.start();
    return () => {
      l1.stop();
      l2.stop();
    };
  }, [a, b]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.blob,
          styles.blobA,
          {
            transform: [
              { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] }) },
              { scale: a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[styles.blob, styles.blobB, { transform: [{ translateY: b.interpolate({ inputRange: [0, 1], outputRange: [10, -10] }) }] }]}
      />
      <Animated.View
        style={[styles.blob, styles.blobC, { transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [8, -8] }) }] }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  glowTL: {
    position: 'absolute',
  },
  glowTLlight: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  glowTLaccent: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  glowBR: {
    position: 'absolute',
  },
  glowBRlight: {
    backgroundColor: 'rgba(184,138,110,0.10)',
  },
  glowBRaccent: {
    backgroundColor: 'rgba(0,0,0,0.10)',
  },
  wellShade: {
    position: 'absolute',
    backgroundColor: 'rgba(185,138,110,0.16)',
  },
  wellSheen: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobA: {
    top: -80,
    right: -90,
    width: 280,
    height: 280,
    backgroundColor: 'rgba(240,121,107,0.10)',
  },
  blobB: {
    bottom: -70,
    left: -80,
    width: 240,
    height: 240,
    backgroundColor: 'rgba(124,169,130,0.10)',
  },
  blobC: {
    top: '42%',
    left: -50,
    width: 140,
    height: 140,
    backgroundColor: 'rgba(217,164,78,0.08)',
  },
});
