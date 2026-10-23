/** Join class names, skipping falsy values. Utilities passed last win only when they target a different property. */
export const cn = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
