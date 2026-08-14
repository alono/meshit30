---
name: theming
description: How colour and appearance work in the Meshit 30 trainer. Read this before touching src/styles.css, adding a colour to any component, or changing anything about light/dark mode. Triggers on - styling, CSS, colour, palette, theme, light mode, dark mode, contrast, a new component that needs a background or border.
---

# Theming

The app supports **three appearance states**, not two:

| state | stored value | behaviour |
|---|---|---|
| לפי המערכת | `system` (default) | follows `prefers-color-scheme` |
| בהיר | `light` | forced light, even on a dark system |
| כהה | `dark` | forced dark, even on a light system |

Choice lives in `localStorage` under `meshit30:theme:v1` and is reflected as
`data-theme="light" | "dark"` on `<html>`. The `system` state **removes** the
attribute rather than setting a value, which is what hands control back to the
media query.

Run `npm run check:theme` after any change here. It is also a CI step, so a
violation fails the deploy.

## The one rule

**Every colour comes from a token.** A literal colour anywhere in a rule can
only ever be right in one of the three states — that is the whole failure mode,
and it is invisible while you are looking at the state it happens to suit.

```css
/* wrong — white text is unreadable on the pale dark-mode brand colour */
.btn { background: var(--brand); color: #fff; }

/* right */
.btn { background: var(--brand); color: var(--on-brand); }
```

This is not hypothetical: `.btn` and `.chip.on` were written exactly like the
first example, patched with a `prefers-color-scheme` override, and would have
shown white-on-pale-blue the moment someone forced dark mode on a light system.
That is why `--on-brand`, `--on-right` and `--on-wrong` exist.

## Token structure in `src/styles.css`

Three blocks, in this order:

```css
:root { /* the COMPLETE light palette — every token defined here */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* dark values */ }
}

:root[data-theme='dark'] { /* the same dark values again */ }
```

Why each part matters:

- The light palette is on **bare `:root`** so something is always defined.
- The media query is guarded with **`:not([data-theme='light'])`** so choosing
  light on a dark system actually works. A bare `:root` there would lose.
- The forced block is **duplicated on purpose**. A media query and a plain
  selector cannot be combined into one rule, so the dark values appear twice.
  `check:theme` compares them and fails if they drift.

### Adding a token

1. Add it to `:root` with its light value.
2. Add it to **both** dark blocks with the same dark value.
3. Run `npm run check:theme`.

Non-colour tokens (`--radius`, `--tap`) live only in `:root` — they do not vary
by theme. They are listed in `THEME_INDEPENDENT` in the checker; extend that
list if you add another.

### Current tokens

| token | use |
|---|---|
| `--bg` | page background |
| `--surface` | cards, tiles, buttons that sit on the page |
| `--ink` / `--ink-soft` | primary text / secondary text |
| `--line` | borders and dividers |
| `--brand` / `--brand-soft` | accent, and its tinted background |
| `--on-brand` | text on a `--brand` fill |
| `--right` / `--right-soft` / `--on-right` | correct answers, pass states |
| `--wrong` / `--wrong-soft` / `--on-wrong` | wrong answers, fail states, destructive actions |
| `--warn` / `--warn-soft` | notices, source-defect warnings |
| `--scrim` | modal backdrop |

Pick the pair that matches meaning, not appearance: a reset confirmation uses
`--wrong` because it is destructive, not because red looks right.

## Where the code lives

- `src/lib/theme.js` — read/save/apply, labels, icons, the cycle order.
- `src/components/ThemeControl.jsx` — two presentations of one choice:
  `variant="cycle"` (compact button in the header, available on every screen)
  and `variant="picker"` (labelled three-option group on the home screen).
- `src/App.jsx` — owns the theme state and applies it in an effect.
- `index.html` — inline script that sets `data-theme` **before first paint**, so
  a dark-mode reader never sees a white flash. It duplicates the storage key
  string; `check:theme` verifies the two agree.

## Testing a change

Do not trust one state. Check all three:

```js
// in the browser console
document.documentElement.setAttribute('data-theme', 'light');
document.documentElement.setAttribute('data-theme', 'dark');
document.documentElement.removeAttribute('data-theme'); // back to system
```

Then confirm the OS-level path too, since forced and automatic dark take
different CSS branches — DevTools ▸ Rendering ▸ Emulate `prefers-color-scheme`.

Worth looking at specifically, because these are the places contrast breaks:
filled buttons (`.btn`, `.chip.on`), the answer key badges on right/wrong
options, the pass/fail banner, and the modal scrim.

## Adding a component

Reuse the existing classes (`.card`, `.tile`, `.btn`, `.chip`, `.notice`,
`.meta`, `.bar`) before inventing new ones — they are already theme-correct. If
you do need new CSS, put it in `src/styles.css` with tokens; the codebase has no
inline colour styles and should keep none, so that `check:theme` sees everything.
