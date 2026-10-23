import { colors, fonts, type FontRole } from '@kashi-koi/design/tokens';

export { colors, fonts, type FontRole };

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
