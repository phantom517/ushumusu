import React, { useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';

interface PulseProps {
  children: React.ReactNode;
  /** Animation loop duration in ms */
  duration?: number;
  /** Max scale factor at the peak of the pulse */
  maxScale?: number;
  style?: ViewStyle;
}

/** Gentle breathing scale animation for playful micro-interactions. */
export const Pulse: React.FC<PulseProps> = ({ children, duration = 1600, maxScale = 1.08, style }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [scale, duration, maxScale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
};
