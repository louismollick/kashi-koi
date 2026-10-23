import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { changeAwareStorage } from './persistStorage';

/** User settings, plus the analysis login. Imports no app modules, so anything may read it. */
type SettingsState = {
  /** Limits the app to downloaded songs and stops network work. Use `setOfflineMode` in navidrome/sync to also cancel running work. */
  offlineMode: boolean;
  hideSongsWithoutSyncedLyrics: boolean;
  hideSongsWithoutJapanese: boolean;
  /** Seconds to answer a stop; null waits forever. */
  answerTime: number | null;
  /** Audio speed for songs and clips, pitch kept. Lyrics follow the audio position, so they stay in sync. */
  playbackRate: number;
  showTranslations: boolean;
  /** Per-song translation display in listen mode. Quiz and review always use analyzed sentences when available. */
  lineByLineSongIds: string[];
  translationPrompted: boolean;
  lastSyncAt: number | null;
  lastScanAt: number | null;
  /** Empty falls back to the bundled environment default. */
  analysisServerUrl: string;
  /** Admin token from SecureStore, loaded at boot and never persisted here. */
  analysisToken: string;
  cycleAnswerTime: () => void;
  cyclePlaybackRate: () => void;
  toggleTranslations: () => void;
  /** Choose the song analysis (true) or line-by-line translations (false) for one song's listen mode. */
  setListenAnalysisEnabled: (songId: string, enabled: boolean) => void;
  toggleHideSongsWithoutSyncedLyrics: () => void;
  toggleHideSongsWithoutJapanese: () => void;
};

const answerTimePresets = [null, 10, 5, 3, 0];
const playbackRatePresets = [1, 0.75, 0.5];

/** The fields that survive a restart. */
const persistedSettings = (state: SettingsState) => ({
  offlineMode: state.offlineMode,
  hideSongsWithoutSyncedLyrics: state.hideSongsWithoutSyncedLyrics,
  hideSongsWithoutJapanese: state.hideSongsWithoutJapanese,
  answerTime: state.answerTime,
  playbackRate: state.playbackRate,
  showTranslations: state.showTranslations,
  lineByLineSongIds: state.lineByLineSongIds,
  translationPrompted: state.translationPrompted,
  lastSyncAt: state.lastSyncAt,
  lastScanAt: state.lastScanAt,
  analysisServerUrl: state.analysisServerUrl,
});

const storageKey = 'settings';

export const settingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      offlineMode: false,
      hideSongsWithoutSyncedLyrics: true,
      hideSongsWithoutJapanese: true,
      answerTime: null,
      playbackRate: 1,
      showTranslations: true,
      lineByLineSongIds: [],
      translationPrompted: false,
      lastSyncAt: null,
      lastScanAt: null,
      analysisServerUrl: '',
      analysisToken: '',
      // Cycle the fixed answer-time presets for future stops.
      cycleAnswerTime: () =>
        set({
          answerTime: answerTimePresets[(answerTimePresets.indexOf(get().answerTime) + 1) % answerTimePresets.length]!,
        }),
      // An unknown saved rate restarts the cycle at 1x.
      cyclePlaybackRate: () =>
        set({
          playbackRate:
            playbackRatePresets[(playbackRatePresets.indexOf(get().playbackRate) + 1) % playbackRatePresets.length]!,
        }),
      toggleTranslations: () => set((state) => ({ showTranslations: !state.showTranslations })),
      setListenAnalysisEnabled: (songId, enabled) =>
        set((state) => ({
          lineByLineSongIds: enabled
            ? state.lineByLineSongIds.filter((id) => id !== songId)
            : [...new Set([...state.lineByLineSongIds, songId])],
        })),
      toggleHideSongsWithoutSyncedLyrics: () =>
        set((state) => ({ hideSongsWithoutSyncedLyrics: !state.hideSongsWithoutSyncedLyrics })),
      toggleHideSongsWithoutJapanese: () =>
        set((state) => ({ hideSongsWithoutJapanese: !state.hideSongsWithoutJapanese })),
    }),
    {
      name: storageKey,
      skipHydration: true,
      storage: createJSONStorage(() => ({ getItem: () => null, setItem() {}, removeItem() {} })),
      partialize: persistedSettings,
    },
  ),
);

/** Names of the persisted settings, so the learning store can drop them from its legacy blob. */
export const persistedSettingKeys = Object.keys(persistedSettings(settingsStore.getInitialState()));

/**
 * Settings used to be saved inside the 'learning-state' blob. If this store has never been saved,
 * copy those fields over once so an upgrade keeps them. The blob loses them on its next write.
 */
async function seedFromLearningState(storage: StateStorage) {
  if ((await storage.getItem(storageKey)) !== null) return;
  const legacy = await storage.getItem('learning-state');
  if (legacy === null) return;
  const { state } = JSON.parse(legacy) as { state?: Record<string, unknown> };
  const seeded = Object.fromEntries(
    persistedSettingKeys.filter((key) => state && key in state).map((key) => [key, state![key]]),
  );
  await storage.setItem(storageKey, JSON.stringify({ state: seeded, version: 0 }));
}

/** Native storage is injected at boot so store imports stay safe in plain Node. Hydrate before the learning store. */
export async function hydrateSettings(storage: StateStorage) {
  await seedFromLearningState(storage);
  settingsStore.persist.setOptions({ storage: changeAwareStorage(storage) });
  await settingsStore.persist.rehydrate();
}
