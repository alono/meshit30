import { THEME_ICON, THEME_LABEL, THEMES, nextTheme } from '../lib/theme.js';

/**
 * Two presentations of the same choice:
 *
 * - `cycle` sits in the header, reachable from any screen — she may want to
 *   switch to dark part-way through a practice session at night.
 * - `picker` is the labelled version on the home screen, because a lone cycling
 *   icon does not tell a first-time reader that three states exist.
 */
export default function ThemeControl({ theme, onChange, variant = 'cycle' }) {
  if (variant === 'cycle') {
    const upcoming = nextTheme(theme);
    return (
      <button
        type="button"
        className="back theme-cycle"
        onClick={() => onChange(upcoming)}
        title={`מראה: ${THEME_LABEL[theme]} — להחלפה ל${THEME_LABEL[upcoming]}`}
        aria-label={`מראה: ${THEME_LABEL[theme]}. להחלפה ל${THEME_LABEL[upcoming]}`}
      >
        <span aria-hidden="true">{THEME_ICON[theme]}</span>
      </button>
    );
  }

  return (
    <div className="card">
      <b>מראה</b>
      <p className="meta">
        ברירת המחדל היא לפי הגדרת המערכת במכשיר. אפשר לקבוע תמיד בהיר או תמיד כהה.
      </p>
      <div className="chips" role="group" aria-label="בחירת מראה">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            className={`chip ${theme === t ? 'on' : ''}`}
            aria-pressed={theme === t}
            onClick={() => onChange(t)}
          >
            <span aria-hidden="true">{THEME_ICON[t]}</span> {THEME_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
