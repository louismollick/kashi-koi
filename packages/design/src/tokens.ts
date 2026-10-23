export const colors = {
  bg: '#000000',
  header: '#000000',
  surface: '#1d1f35',
  panel: '#1e2033',
  slate: '#272945',
  coral: '#fb4a5e',
  coralDeep: '#df475a',
  coralSoft: '#ff6d7d',
  coralBorder: '#ff9aa5',
  maroon: '#4a3441',
  greenDeep: '#1c6747',
  green: '#55ee9c',
  red: '#f95362',
  track: '#3e3d5b',
  cream: '#fbf8c6',
  combo: '#ffc93c',
  koi: '#e7834a',
  night: '#0d0f22',
  mini: '#f8f0f1',
  text: '#ffffff',
  muted: '#9a9cb8',
  lavender: '#b4a6e6',
  scrim: '#090a1699',
} as const;

/**
 * Typefaces, one face per weight because iOS can't pick weights out of a custom family. `body` (M PLUS Rounded 1c)
 * covers English and Japanese, so lyrics and UI share one voice. `pixel` (Pixelify Sans) is for titles, numbers and
 * short labels. `Label` maps `fontWeight` onto these; other text should spread `font(...)` into its style.
 */
export const fonts = {
  body: { regular: 'MPLUSRounded1c-Regular', medium: 'MPLUSRounded1c-Medium', bold: 'MPLUSRounded1c-Bold' },
  pixel: { regular: 'PixelifySans-Regular', medium: 'PixelifySans-Medium', bold: 'PixelifySans-Bold' },
} as const;

export type FontRole = keyof typeof fonts;

/** The same two families by their CSS names (Fontsource), where weights come from `font-weight` instead of face names. */
export const fontFamilies = { body: 'M PLUS Rounded 1c', pixel: 'Pixelify Sans' } as const satisfies Record<
  FontRole,
  string
>;
