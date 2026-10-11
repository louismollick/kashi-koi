import type { DownloadArt } from './store';

/** Safe flat names retain a reversible artwork id without trusting server path segments. */
export const assetName = (id: string) => encodeURIComponent(id).replace(/\./g, '%2E');
export const audioExtension = (suffix?: string) =>
  suffix && /^[a-z0-9]{1,8}$/i.test(suffix) ? suffix.toLowerCase() : 'mp3';

/** Native filesystem access is lazy, so the queue can run with a plain Node adapter. */
export async function prepareFiles() {
  const { Directory, File, Paths } = await import('expo-file-system');
  const native = (await import('../../modules/kashi-downloads')).default;
  const root = new Directory(Paths.document, 'downloads');
  root.create({ intermediates: true, idempotent: true });
  await native.excludeFromBackup(root.uri);
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
  const { File } = await import('expo-file-system');
  const file = await File.downloadFileAsync(url, new File(uri), { idempotent: true, signal });
  const bytes = file.size ?? 0;
  if (!bytes) throw new Error('Empty download');
  return bytes;
}
export async function moveFile(from: string, to: string) {
  const { File } = await import('expo-file-system');
  await new File(from).move(new File(to), { overwrite: true });
}
export async function deleteFile(uri: string) {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  if (file.exists) file.delete();
}
export async function fileExists(uri: string) {
  const { File } = await import('expo-file-system');
  return new File(uri).exists;
}
export async function clearFiles() {
  const { Directory, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'downloads');
  if (directory.exists) directory.delete();
}
