const palettes = [
  { color: '#5c284e', accent: '#ee9255' }, { color: '#164b4e', accent: '#74c58f' },
  { color: '#293c6b', accent: '#a4c5ef' }, { color: '#523063', accent: '#d890c9' },
  { color: '#713e32', accent: '#e4ae74' }, { color: '#23484a', accent: '#8bbfb3' },
];
/** Stable palette tint derived from the server identity. */
export function paletteFor(id: string) { let hash = 0; for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return palettes[hash % palettes.length]!; }
