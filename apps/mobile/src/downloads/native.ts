import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import Downloads from '../../modules/kashi-downloads';
import type { DownloadArt } from './store';

// Native-only: the root layout injects these with setDownloadRuntime, so the queue stays importable in Node tests.
export async function prepareFiles() {
  const root = new Directory(Paths.document, 'downloads');
  root.create({ intermediates: true, idempotent: true });
  await Downloads.excludeFromBackup(root.uri);
  const audio = new Directory(root, 'audio'),
    art = new Directory(root, 'art');
  audio.create({ idempotent: true });
  art.create({ idempotent: true });
  const artwork: DownloadArt = {};
  for (const file of art.list()) {
    if (!(file instanceof File)) continue;
    if (file.name.endsWith('.part')) file.delete();
    else if (file.name.endsWith('.jpg'))
      artwork[decodeURIComponent(file.name.slice(0, -4))] = { fileName: file.name, bytes: file.size ?? 0 };
  }
  for (const file of audio.list()) if (file instanceof File && file.name.endsWith('.part')) file.delete();
  return { root: root.uri.replace(/\/$/, ''), art: artwork };
}
export async function downloadFile(url: string, uri: string, signal: AbortSignal) {
  const file = await File.downloadFileAsync(url, new File(uri), { idempotent: true, signal });
  const bytes = file.size ?? 0;
  if (!bytes) throw new Error('Empty download');
  return bytes;
}
export async function moveFile(from: string, to: string) {
  await new File(from).move(new File(to), { overwrite: true });
}
export async function deleteFile(uri: string) {
  const file = new File(uri);
  if (file.exists) file.delete();
}
export async function fileExists(uri: string) {
  return new File(uri).exists;
}
export async function clearFiles() {
  const directory = new Directory(Paths.document, 'downloads');
  if (directory.exists) directory.delete();
}

/** Start or extend the iOS continued-processing task; iOS only grants it from the foreground. */
export async function beginTask(total: number, completed = 0) {
  if (AppState.currentState !== 'active') return false;
  return Downloads.begin('Downloading songs', `${completed} of ${total}`, total);
}
export async function taskProgress(completed: number, total: number) {
  Downloads.setProgress(completed, total, `${completed} of ${total}`);
}
export async function endTask(success: boolean) {
  Downloads.end(success);
}
/** Report expiry of the background task and foreground changes; returns whether the app is active now. */
export async function observeTask(onExpired: () => void, onActive: (active: boolean) => void) {
  Downloads.addListener('onExpired', onExpired);
  AppState.addEventListener('change', (state) => onActive(state === 'active'));
  return AppState.currentState === 'active';
}

export const nativeDownloadRuntime = {
  prepare: prepareFiles,
  download: downloadFile,
  move: moveFile,
  remove: deleteFile,
  exists: fileExists,
  clearFiles,
  begin: beginTask,
  progress: taskProgress,
  end: endTask,
  observe: observeTask,
};
