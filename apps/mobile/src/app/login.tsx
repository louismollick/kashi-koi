import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '@/constants/theme';
import { HarborScene } from '@/components/Harbor';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label, styles } from '@/components/ui';
import { login } from '@kashi-koi/core/navidrome/session';
import { loginError } from '@kashi-koi/core/navidrome/subsonic';

/** Connect to the user's Navidrome library with token authentication. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.page}>
      {/* The keyboard inset lets the form scroll above the keyboard; iOS keeps the focused field visible. */}
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
      >
        {/* The Home hero, so the first screen already looks like the app. */}
        <HarborScene style={{ height: 230 + insets.top }} left={20} size={() => 200} />
        <View style={{ padding: 24, paddingTop: 20, gap: 18 }}>
          <Image
            source={require('../../assets/kashikoi-logo.png')}
            contentFit="contain"
            contentPosition="left"
            style={{ width: 240, height: 72, marginLeft: -6 }}
            accessibilityLabel="Kashi-Koi!"
          />
          <Label pixel style={{ fontSize: 29 }}>
            Log in to Navidrome
          </Label>
          {(
            [
              { label: 'Server URL', value: url, change: setUrl },
              { label: 'Username', value: username, change: setUsername },
              { label: 'Password', value: password, change: setPassword },
            ] as const
          ).map((field) => (
            <View key={field.label} style={{ gap: 6 }}>
              <Label>{field.label}</Label>
              <PixelFrame fill={colors.surface} contentStyle={{ padding: 12 }}>
                <TextInput
                  accessibilityLabel={field.label}
                  value={field.value}
                  onChangeText={field.change}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  textContentType="none"
                  secureTextEntry={field.label === 'Password'}
                  keyboardType={field.label === 'Server URL' ? 'url' : 'default'}
                  style={{ ...font('body'), color: colors.text, minHeight: 28, fontSize: 17 }}
                />
              </PixelFrame>
            </View>
          ))}
          {error && <Label style={{ color: colors.red }}>{error}</Label>}
          <Button
            label="Log in"
            fill={colors.coral}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await login(url, username, password);
              } catch (error) {
                setError(loginError(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Label pixel style={{ fontSize: 22 }}>
              {busy ? 'Connecting…' : 'Log in'}
            </Label>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
