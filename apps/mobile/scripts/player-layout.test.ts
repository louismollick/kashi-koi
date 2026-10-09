import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire, registerHooks } from 'node:module';
import * as React from 'react';
import type { SongAnalysis } from '@kashi-koi/shared/analysis';
import { appStore, resetAppState } from '../src/store/appStore';
import { libraryStore } from '../src/store/libraryStore';
import { albums, artists, songs, songLyrics } from './fixtures';

const require = createRequire(import.meta.url);
const { renderToStaticMarkup } = require('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

/** Load a real screen with native hosts and animation APIs replaced for Node. Song info always shows `dawn`. */
async function loadScreen(screen: 'player' | 'song-info', presses = new Map<string, () => void>()) {
  const key = Symbol.for('kashi-koi.test.react');
  const pressKey = Symbol.for('kashi-koi.test.presses');
  const globals = globalThis as typeof globalThis & {
    [key]: typeof React | undefined;
    [pressKey]: Map<string, () => void> | undefined;
  };
  globals[key] = React;
  globals[pressKey] = presses;
  const host = `const React = globalThis[Symbol.for('kashi-koi.test.react')];
    const host = name => props => {
      if (name === 'native-button' && props.onPress) globalThis[Symbol.for('kashi-koi.test.presses')].set(props.accessibilityLabel, props.onPress);
      return React.createElement(name, { 'data-label': props.accessibilityLabel, 'data-role': props.accessibilityRole, 'data-checked': props.accessibilityState?.checked === undefined ? undefined : String(props.accessibilityState.checked) }, props.children);
    };`;
  const mocks: Record<string, string> = {
    'react-native': `${host}
      module.exports = { View: host('native-view'), Text: host('native-text'), Pressable: host('native-button'), ScrollView: host('native-scroll'), ActivityIndicator: host('native-loading'), Modal: () => null,
        StyleSheet: { create: styles => styles, flatten: style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)), absoluteFill: {} }, PixelRatio: { get: () => 1 }, useWindowDimensions: () => ({ width: 390, height: 844 }) };`,
    'react-native-svg': `${host} module.exports = { __esModule: true, default: host('native-svg'), Path: host('native-path'), Defs: host('native-defs'), LinearGradient: host('native-gradient'), Rect: host('native-rect'), Stop: host('native-stop') };`,
    'react-native-reanimated': `${host} module.exports = { __esModule: true, default: { View: host('native-animated') }, useAnimatedStyle: () => ({}), useSharedValue: value => ({ value }), Easing: { linear: value => value }, withSpring: value => value, withTiming: value => value, withDelay: (_, value) => value, withRepeat: value => value, withSequence: value => value, cancelAnimation() {}, useReducedMotion: () => true };`,
    'react-native-safe-area-context': 'exports.useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });',
    'expo-router':
      "exports.useRouter = () => ({ replace() {}, push() {}, back() {}, canGoBack: () => true }); exports.useLocalSearchParams = () => ({ id: 'dawn' });",
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
      if (url.startsWith('test:ui:'))
        return { format: 'commonjs', source: mocks[url.slice('test:ui:'.length)]!, shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  const cleanup = () => {
    hooks.deregister();
    delete globals[key];
    delete globals[pressKey];
  };
  try {
    const module =
      screen === 'player' ? await import('../src/screens/player') : await import('../src/screens/song-info');
    return { Screen: module.default, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

test('the actual quiz screen renders its musical gap before the first line without scrolling or listen controls', async (t) => {
  await resetAppState();
  libraryStore.getState().setLibrary({
    songs,
    albums,
    artists,
    lyrics: {
      ...songLyrics,
      dawn: {
        ...songLyrics.dawn!,
        timeline: songLyrics.dawn!.timeline.map((line) => ({
          ...line,
          startMs: line.startMs + 1000,
          endMs: line.endMs + 1000,
        })),
      },
    },
  });
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  appStore.setState({ loading: false });
  appStore.getState().updatePlayback(0, 238000, false);
  assert.equal(appStore.getState().lineIndex, -1);
  // Zustand's server snapshot uses its initial state; supply the current fixture.
  const appInitial = { ...appStore.getInitialState() },
    libraryInitial = { ...libraryStore.getInitialState() };
  Object.assign(appStore.getInitialState(), appStore.getState());
  Object.assign(libraryStore.getInitialState(), libraryStore.getState());
  t.after(() => {
    Object.assign(appStore.getInitialState(), appInitial);
    Object.assign(libraryStore.getInitialState(), libraryInitial);
  });
  const { Screen: PlayerScreen, cleanup } = await loadScreen('player');
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

test('Song info Retry preserves the failed request force flag', async (t) => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  const calls: { songId: string; force: boolean | undefined }[] = [];
  appStore.setState({
    songId: 'dawn',
    analysisToken: 'test-token',
    analysisServerUrl: 'https://analysis.test',
    analysisRequests: { dawn: { status: 'failed', error: 'Analyzer unavailable', force: true } },
    analyzeSong: async (songId, options) => {
      calls.push({ songId, force: options?.force });
    },
  });
  const appInitial = { ...appStore.getInitialState() },
    libraryInitial = { ...libraryStore.getInitialState() };
  Object.assign(appStore.getInitialState(), appStore.getState());
  Object.assign(libraryStore.getInitialState(), libraryStore.getState());
  t.after(async () => {
    Object.assign(appStore.getInitialState(), appInitial);
    Object.assign(libraryStore.getInitialState(), libraryInitial);
    await resetAppState();
  });
  const presses = new Map<string, () => void>();
  const { Screen, cleanup } = await loadScreen('song-info', presses);
  t.after(cleanup);
  renderToStaticMarkup(React.createElement(Screen));
  assert.ok(presses.has('Retry analysis'));
  presses.get('Retry analysis')!();
  assert.deepEqual(calls, [{ songId: 'dawn', force: true }]);
});

test('Song info only offers source choices for analyzed songs and switches the player translations', async (t) => {
  await resetAppState();
  libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics });
  appStore.setState({ songId: 'dawn', showTranslations: true, loading: false });
  const appInitial = { ...appStore.getInitialState() },
    libraryInitial = { ...libraryStore.getInitialState() };
  const snapshot = () => {
    Object.assign(appStore.getInitialState(), appStore.getState());
    Object.assign(libraryStore.getInitialState(), libraryStore.getState());
  };
  t.after(async () => {
    Object.assign(appStore.getInitialState(), appInitial);
    Object.assign(libraryStore.getInitialState(), libraryInitial);
    await resetAppState();
  });
  const presses = new Map<string, () => void>();
  const { Screen: SongInfo, cleanup } = await loadScreen('song-info', presses);
  t.after(cleanup);
  snapshot();
  const withoutAnalysis = renderToStaticMarkup(React.createElement(SongInfo));
  assert.ok(!withoutAnalysis.includes('data-role="radio"'));
  assert.ok(!presses.has('iOS (line by line)'));

  const lyrics = songLyrics.dawn!;
  const analysis: SongAnalysis = {
    schemaVersion: 1,
    fingerprint: lyrics.fingerprint,
    model: 'test',
    createdAt: '2026-10-08T00:00:00Z',
    title: 'Dawn bus',
    summary: 'A bus ride at dawn.',
    speaker: 'A passenger',
    addressee: 'A remembered friend',
    lines: lyrics.timeline.map((_, index) => `Analyzed line ${index}`),
    sentences: lyrics.timeline.map((_, index) => ({
      start: index,
      end: index,
      translation: `Analyzed sentence ${index}`,
    })),
    notes: [],
  };
  libraryStore.getState().setAnalysis(analysis);
  snapshot();
  const analyzedInfo = renderToStaticMarkup(React.createElement(SongInfo));
  assert.ok(analyzedInfo.includes('data-label="Song analysis" data-role="radio" data-checked="true"'));
  assert.ok(presses.has('iOS (line by line)'));
  const { Screen: Player, cleanup: cleanupPlayer } = await loadScreen('player', presses);
  t.after(cleanupPlayer);
  const analyzedPlayer = renderToStaticMarkup(React.createElement(Player));
  assert.ok(analyzedPlayer.includes('Analyzed sentence 0'));
  assert.ok(!analyzedPlayer.includes(lyrics.lines[0]!.translation!));

  const before = appStore.getState();
  presses.get('iOS (line by line)')!();
  assert.equal(appStore.getState().run, before.run);
  assert.equal(appStore.getState().reviewList, before.reviewList);
  assert.equal(libraryStore.getState().lyrics.dawn!.analysis?.title, analysis.title);
  snapshot();
  const iosInfo = renderToStaticMarkup(React.createElement(SongInfo));
  assert.ok(iosInfo.includes('data-label="iOS (line by line)" data-role="radio" data-checked="true"'));
  assert.ok(presses.has('Song analysis'));
  const iosPlayer = renderToStaticMarkup(React.createElement(Player));
  assert.ok(iosPlayer.includes(lyrics.lines[0]!.translation!));
  assert.ok(!iosPlayer.includes('Analyzed sentence 0'));

  appStore.getState().setQuizToggle(true);
  snapshot();
  assert.ok(renderToStaticMarkup(React.createElement(Player)).includes('Analyzed sentence 0'));
  appStore.getState().setQuizToggle(false);

  presses.get('Song analysis')!();
  snapshot();
  assert.ok(renderToStaticMarkup(React.createElement(Player)).includes('Analyzed sentence 0'));
});
