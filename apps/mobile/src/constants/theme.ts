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

/** Font files for `useFonts`, keyed by the names `fonts` uses. */
export const fontFiles = {
  'MPLUSRounded1c-Regular': require('../../assets/fonts/MPLUSRounded1c-Regular.ttf'),
  'MPLUSRounded1c-Medium': require('../../assets/fonts/MPLUSRounded1c-Medium.ttf'),
  'MPLUSRounded1c-Bold': require('../../assets/fonts/MPLUSRounded1c-Bold.ttf'),
  'PixelifySans-Regular': require('../../assets/fonts/PixelifySans-Regular.ttf'),
  'PixelifySans-Medium': require('../../assets/fonts/PixelifySans-Medium.ttf'),
  'PixelifySans-Bold': require('../../assets/fonts/PixelifySans-Bold.ttf'),
};

/** The face for a role and weight, with `fontWeight` cleared so iOS doesn't look for another face or fake bold. */
export function font(role: FontRole = 'body', weight?: string | number) {
  const value = weight === 'bold' ? 700 : Number(weight ?? 400) || 400;
  const faces = fonts[role];
  return { fontFamily: value >= 600 ? faces.bold : value >= 500 ? faces.medium : faces.regular, fontWeight: undefined };
}
