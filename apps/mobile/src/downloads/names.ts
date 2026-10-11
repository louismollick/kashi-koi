/** Safe flat names retain a reversible artwork id without trusting server path segments. */
export const assetName = (id: string) => encodeURIComponent(id).replace(/\./g, '%2E');
export const audioExtension = (suffix?: string) =>
  suffix && /^[a-z0-9]{1,8}$/i.test(suffix) ? suffix.toLowerCase() : 'mp3';
