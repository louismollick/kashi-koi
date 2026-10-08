import { View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { IconButton, Label, styles } from './ui';
import type { ReactNode } from 'react';

/** Logo band on the three tabs; its safe-area background matches the chrome. */
export function Header() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: colors.header }}>
      <View style={[styles.row, { height: 60, paddingLeft: 8, paddingRight: 12, justifyContent: 'space-between' }]}>
        <Image
          source={require('../../assets/kashikoi-logo.png')}
          contentFit="contain"
          contentPosition="left"
          style={{ width: 210, height: 60 }}
          accessibilityLabel="Kashi-Koi!"
        />
        <IconButton
          plain
          name="settings"
          size={44}
          iconScale={0.68}
          label="Settings"
          onPress={() => router.push('/settings')}
        />
      </View>
    </View>
  );
}

/** Plain title band on pushed screens. `sheet` shows a down chevron for screens that slide up; `close` an X. */
export function ScreenHeader({
  title,
  subtitle,
  close = false,
  sheet = false,
  right,
}: {
  title?: string;
  subtitle?: string;
  close?: boolean;
  sheet?: boolean;
  right?: ReactNode;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.header, paddingTop: insets.top }}>
      <View style={[styles.row, { paddingHorizontal: 14, paddingVertical: 10, minHeight: 68 }]}>
        <IconButton
          name={close ? 'close' : sheet ? 'down' : 'back'}
          label={close || sheet ? 'Close' : 'Back'}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <View style={{ flex: 1 }}>
          {title && (
            <Label numberOfLines={1} style={{ fontWeight: '700', fontSize: 19, lineHeight: 24 }}>
              {title}
            </Label>
          )}
          {subtitle && (
            <Label numberOfLines={1} muted style={{ fontSize: 13 }}>
              {subtitle}
            </Label>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}
