// Appearance preference: follow the system, or force light or dark.
//
// Kept out of the `meshit30:v1:` prefix that export/import walks — this is a
// property of the device someone is reading on, not of their progress.
//
// NOTE: the key below is duplicated by the no-flash inline script in
// index.html. `npm run check:theme` fails if the two ever disagree.
const KEY = 'meshit30:theme:v1';

export const THEMES = ['system', 'light', 'dark'];

export const THEME_LABEL = {
  system: 'לפי המערכת',
  light: 'בהיר',
  dark: 'כהה',
};

export const THEME_ICON = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function readTheme() {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Reflect the choice onto the root element. "system" removes the attribute
 * entirely so the prefers-color-scheme media query takes over again.
 */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Preference simply will not survive a reload.
  }
  applyTheme(theme);
}

export const nextTheme = (theme) => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
