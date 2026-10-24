import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useNow } from '@/hooks/useNow';
import { Mascot, spriteFoot, type Pose } from './Mascot';

/**
 * The classic 3:2 harbor, day and night, with a solid boardwalk across its bottom. `deckTop` is where the deck meets
 * the water, as a fraction of the art's height (the same by day and by night).
 */
const art = {
  day: require('../../assets/harbor.webp'),
  night: require('../../assets/harbor-night.webp'),
  aspect: 1536 / 1024,
  deckTop: 0.785,
} as const;

/** Moonlit harbor from 7pm to 6am, local time. */
export function isNight(now: number) {
  const hour = new Date(now).getHours();
  return hour >= 19 || hour < 6;
}

/**
 * The harbor at the current time of day, with its aspect ratio (width over height). It flips at 7pm and 6am while the
 * app stays open, and catches up when the app returns to the foreground.
 */
export function useHarborArt() {
  const now = useNow();
  const [night, setNight] = useState(() => isNight(Date.now()));
  useEffect(() => setNight(isNight(now)), [now]);
  useEffect(() => {
    const next = new Date();
    next.setHours(night ? 6 : 19, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    const timer = setTimeout(() => setNight(isNight(Date.now())), next.getTime() - Date.now());
    return () => clearTimeout(timer);
  }, [night]);
  return { src: night ? art.night : art.day, aspect: art.aspect };
}

/**
 * Where her chair legs land, in points above the bottom of bottom-anchored art drawn `artWidth` wide: a little behind
 * the front of the deck, and above the bottom `covered` points that something rides over (a card, a dialogue box).
 */
export function deckFeet(artWidth: number, covered = 0) {
  const band = (artWidth / art.aspect) * (1 - art.deckTop);
  return covered + Math.max(0, band - covered) * 0.45;
}

/**
 * The harbor filling its box (cover, anchored to the bottom) with the mascot sitting on the deck, for fixed scenes
 * like the Home hero and the login. `covered` is how much of the bottom edge something overlaps; `size` gets the box
 * height and returns the mascot's size. The quiz stage zooms and places the art itself.
 */
export function HarborScene({
  style,
  covered = 0,
  left,
  size,
  pose,
}: {
  style?: StyleProp<ViewStyle>;
  covered?: number;
  left: number;
  size: (height: number) => number;
  pose?: Pose;
}) {
  const harbor = useHarborArt();
  const [{ width, height }, setBox] = useState({ width: 0, height: 0 });
  const mascot = Math.round(size(height));
  const feet = deckFeet(Math.max(width, height * art.aspect), covered);
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) => setBox({ width: layout.width, height: layout.height })}
      style={[{ overflow: 'hidden' }, style]}
    >
      <Image source={harbor.src} contentFit="cover" contentPosition="bottom" style={StyleSheet.absoluteFill} />
      {height > 0 && (
        <View style={{ position: 'absolute', left, bottom: feet - mascot * spriteFoot }}>
          <Mascot size={mascot} pose={pose} />
        </View>
      )}
    </View>
  );
}
