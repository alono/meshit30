#!/usr/bin/env node
// Guard the theming contract described in .claude/skills/theming/SKILL.md.
//
//   node scripts/check-theme.mjs
//
// The app supports three appearance states: follow the system, force light,
// force dark. That only holds if a few invariants are maintained by hand, and
// each of them is easy to break without noticing — so they are checked here
// instead of being left to memory.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const themeJs = readFileSync(join(ROOT, 'src/lib/theme.js'), 'utf8');

const errors = [];

/** Body of the first rule whose selector matches, brace-matched. */
function ruleBody(source, selector) {
  const at = source.indexOf(selector);
  if (at === -1) return null;
  // Search from `at`, not past the selector: some selectors here are written
  // with their opening brace included, and skipping it would brace-match the
  // following rule instead.
  const open = source.indexOf('{', at);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  return null;
}

const tokensIn = (body) =>
  Object.fromEntries(
    [...(body ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]),
  );

// --- 1. all three token blocks exist -------------------------------------
const light = tokensIn(ruleBody(css, ':root {'));
const darkAuto = tokensIn(ruleBody(css, ":root:not([data-theme='light'])"));
const darkForced = tokensIn(ruleBody(css, ":root[data-theme='dark']"));

for (const [name, block] of [
  ['light (:root)', light],
  ["dark auto (:root:not([data-theme='light']))", darkAuto],
  ["dark forced (:root[data-theme='dark'])", darkForced],
]) {
  if (Object.keys(block).length === 0) errors.push(`token block missing or empty: ${name}`);
}

// --- 2. the two dark blocks must be identical ----------------------------
// They cannot be merged into one rule (a media query and a plain selector do
// not combine), so they are duplicated — and duplication drifts.
const allDarkTokens = new Set([...Object.keys(darkAuto), ...Object.keys(darkForced)]);
for (const token of allDarkTokens) {
  const a = darkAuto[token];
  const b = darkForced[token];
  if (a === undefined) errors.push(`${token} is set for forced dark but missing from the media-query dark block`);
  else if (b === undefined) errors.push(`${token} is set in the media-query dark block but missing from forced dark`);
  else if (a !== b) errors.push(`${token} differs between the dark blocks: "${a}" vs "${b}"`);
}

// --- 3. every colour token has a dark counterpart ------------------------
// Non-colour tokens (--radius, --tap) are theme-independent by design.
const THEME_INDEPENDENT = new Set(['--radius', '--tap']);
for (const token of Object.keys(light)) {
  if (THEME_INDEPENDENT.has(token)) continue;
  if (!(token in darkForced)) errors.push(`${token} has a light value but no dark value`);
}
for (const token of allDarkTokens) {
  if (!(token in light)) errors.push(`${token} has a dark value but is never defined for light`);
}

// --- 4. no literal colours outside the token blocks ---------------------
// A literal colour in a rule cannot follow the theme; this is the mistake the
// three-state setup makes invisible, because it only shows up in one state.
let remainder = css;
for (const selector of [':root {', ":root:not([data-theme='light'])", ":root[data-theme='dark']"]) {
  const body = ruleBody(css, selector);
  if (body) remainder = remainder.replace(body, '');
}
remainder = remainder.replace(/\/\*[\s\S]*?\*\//g, ''); // comments may mention colours
for (const [, literal] of remainder.matchAll(/(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\))/g)) {
  errors.push(`literal colour "${literal}" outside the token blocks — use a var(--token)`);
}

// --- 5. only one prefers-color-scheme rule, and it is guarded -----------
const mediaRules = [...css.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)/g)];
if (mediaRules.length !== 1) {
  errors.push(
    `expected exactly 1 prefers-color-scheme rule, found ${mediaRules.length}. ` +
      `Extra ones ignore an explicit theme choice.`,
  );
}
if (ruleBody(css, '@media (prefers-color-scheme: dark)')?.includes(':root {')) {
  errors.push(
    `the dark media query targets a bare :root — it must be ` +
      `:root:not([data-theme='light']) so an explicit light choice wins`,
  );
}

// --- 6. the storage key is the same in both places ---------------------
const keyIn = (source) => source.match(/'(meshit30:theme:v\d+)'/)?.[1];
if (keyIn(themeJs) !== keyIn(html)) {
  errors.push(
    `theme storage key mismatch: src/lib/theme.js uses ${keyIn(themeJs)}, ` +
      `index.html uses ${keyIn(html)} — the no-flash script would read nothing`,
  );
}

if (errors.length) {
  console.error('✗ theme contract violated:');
  for (const e of errors) console.error(`  · ${e}`);
  process.exit(1);
}

console.log(
  `✓ theme contract OK: ${Object.keys(light).length} tokens, ` +
    `${allDarkTokens.size} with dark values, no literal colours outside the palette`,
);
