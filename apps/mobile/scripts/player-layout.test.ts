import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import * as React from 'react';
import { appStore, resetAppState } from '../src/store/appStore';
import { libraryStore } from '../src/store/libraryStore';
import { albums, artists, songs, songLyrics } from './fixtures';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as { renderToStaticMarkup: (element: React.ReactElement) => string };

/** Render the real screen with native hosts and animation APIs replaced for Node. */
async function loadPlayerScreen() {
  const key = Symbol.for('kashi-koi.test.react');
  const globals = globalThis as typeof globalThis & { [key]: typeof React | undefined };
  globals[key] = React;
  const host = `const React = globalThis[Symbol.for('kashi-koi.test.react')];
    const host = name => props => React.createElement(name, { 'data-label': props.accessibilityLabel }, props.children);`;
  const mocks: Record<string, string> = {
    'react-native': `${host}
      module.exports = { View: host('native-view'), Text: host('native-text'), Pressable: host('native-button'), ScrollView: host('native-scroll'), ActivityIndicator: host('native-loading'), Modal: () => null,
        StyleSheet: { create: styles => styles, flatten: style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)), absoluteFill: {} }, PixelRatio: { get: () => 1 }, useWindowDimensions: () => ({ width: 390, height: 844 }) };`,
    'react-native-svg': `${host} module.exports = { __esModule: true, default: host('native-svg'), Path: host('native-path'), Defs: host('native-defs'), LinearGradient: host('native-gradient'), Rect: host('native-rect'), Stop: host('native-stop') };`,
    'react-native-reanimated': `${host} module.exports = { __esModule: true, default: { View: host('native-animated') }, useAnimatedStyle: () => ({}), useSharedValue: value => ({ value }), Easing: { linear: value => value }, withSpring: value => value, withTiming: value => value, withDelay: (_, value) => value, withRepeat: value => value, withSequence: value => value, cancelAnimation() {}, useReducedMotion: () => true };`,
    'react-native-safe-area-context': 'exports.useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });',
    'expo-router': 'exports.useRouter = () => ({ replace() {}, push() {}, back() {}, canGoBack: () => true });',
    'expo-image': `${host} exports.Image = host('native-image');`,
  };
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier in mocks) return { url: `test:ui:${specifier}`, shortCircuit: true };
      if (specifier.endsWith('.png')) return { url: 'test:ui:asset', shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === 'test:ui:asset') return { format: 'commonjs', source: 'module.exports = 1;', shortCircuit: true };
      if (url.startsWith('test:ui:')) return { format: 'commonjs', source: mocks[url.slice('test:ui:'.length)]!, shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  const cleanup = () => { hooks.deregister(); delete globals[key]; };
  try { return { PlayerScreen: (await import('../src/screens/player')).default, cleanup }; }
  catch (error) { cleanup(); throw error; }
}

test('the actual quiz screen renders its musical gap before the first line without scrolling or listen controls', async t => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: { ...songLyrics, dawn: { ...songLyrics.dawn!, timeline: songLyrics.dawn!.timeline.map(line => ({ ...line, startMs: line.startMs + 1000, endMs: line.endMs + 1000 })) } } });
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  appStore.setState({ loading: false });
  appStore.getState().updatePlayback(0, 238000, false);
  assert.equal(appStore.getState().lineIndex, -1);
  // Zustand's server snapshot uses its initial state; supply the current fixture.
  const appInitial = { ...appStore.getInitialState() }, libraryInitial = { ...libraryStore.getInitialState() };
  Object.assign(appStore.getInitialState(), appStore.getState());
  Object.assign(libraryStore.getInitialState(), libraryStore.getState());
  t.after(() => { Object.assign(appStore.getInitialState(), appInitial); Object.assign(libraryStore.getInitialState(), libraryInitial); });
  const { PlayerScreen, cleanup } = await loadPlayerScreen();
  t.after(cleanup);
  const html = renderToStaticMarkup(React.createElement(PlayerScreen));
  assert.ok(html.includes('♪'));
  assert.ok(html.includes('Mascot bobbing'));
  assert.ok(html.includes('COMBO'));
  assert.ok(!html.includes('Play line'));
  assert.ok(!html.includes('DIDN'));
  assert.ok(!html.includes(songLyrics.dawn!.lines[0]!.translation!));
  appStore.getInitialState().loading = true;
  const loading = renderToStaticMarkup(React.createElement(PlayerScreen));
  assert.ok(loading.includes('Loading song'));
  assert.ok(loading.includes('native-image'));
  assert.ok(!loading.includes('Mascot'));
  assert.ok(!loading.includes('Play line'));
});
