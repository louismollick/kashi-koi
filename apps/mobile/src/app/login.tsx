import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { PixelFrame } from '@/components/PixelFrame';
import { Button, Label, styles } from '@/components/ui';
import { login } from '@/navidrome/session';
import { loginError } from '@/navidrome/subsonic';

/** Connect to the user's Navidrome library with token authentication. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.page}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: 24,
          paddingTop: insets.top + 24,
          gap: 18,
        }}
      >
        <Label style={{ fontSize: 30, lineHeight: 38, fontWeight: '800' }}>Kashi-Koi!</Label>
        <Label style={styles.title}>Log in to Navidrome</Label>
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
                style={{ color: colors.text, minHeight: 28, fontSize: 17 }}
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
          <Label style={{ fontWeight: '700' }}>{busy ? 'Connecting…' : 'Log in'}</Label>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
