#!/usr/bin/env node
// Generate the app icons and favicon from the ohad.info wave logo
// (scripts/assets/ohad-wave-512.png), re-tinted for this app: the original is
// muted gray-teal (#688d93); here the wave is a deeper marine blue on the
// app's light ground.
//
//   node scripts/make-icons.mjs   ->  public/icon-*.png, apple-touch-icon.png,
//                                     favicon-32.png

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');
const SOURCE = join(ROOT, 'scripts', 'assets', 'ohad-wave-512.png');

const TINT = [0x2f, 0x7f, 0xae]; // marine blue — the "different tint"
const GROUND = [0xf4, 0xf6, 0xf8]; // app light background (--bg)

const logo = decodePng(readFileSync(SOURCE));

/**
 * Area-sampled alpha of the source at a target pixel: 4×4 subsamples over the
 * source box this pixel covers. `inset` shrinks the artwork toward the centre
 * (maskable safe zone).
 */
function sampleAlpha(tx, ty, targetSize, inset) {
  // target [0,size) maps onto a centred window of the source; inset > 1
  // shrinks the artwork by widening the window beyond the source and clamping.
  let sum = 0;
  const window = logo.width * inset;
  const origin = (logo.width - window) / 2;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const x = Math.floor(origin + ((tx + (sx + 0.5) / 4) / targetSize) * window);
      const y = Math.floor(origin + ((ty + (sy + 0.5) / 4) / targetSize) * window);
      if (x >= 0 && y >= 0 && x < logo.width && y < logo.height) {
        sum += logo.rgba[(y * logo.width + x) * 4 + 3];
      }
    }
  }
  return sum / 16 / 255;
}

/** Tinted wave on the app ground (or on transparency for the favicon). */
function render(size, { inset = 1, transparent = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = sampleAlpha(x, y, size, inset);
      const o = (y * size + x) * 4;
      if (transparent) {
        rgba[o] = TINT[0];
        rgba[o + 1] = TINT[1];
        rgba[o + 2] = TINT[2];
        rgba[o + 3] = Math.round(a * 255);
      } else {
        rgba[o] = Math.round(GROUND[0] + (TINT[0] - GROUND[0]) * a);
        rgba[o + 1] = Math.round(GROUND[1] + (TINT[1] - GROUND[1]) * a);
        rgba[o + 2] = Math.round(GROUND[2] + (TINT[2] - GROUND[2]) * a);
        rgba[o + 3] = 255;
      }
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': render(192),
  'icon-512.png': render(512),
  // maskable: artwork inset to the safe zone, full-bleed ground
  'icon-maskable-512.png': render(512, { inset: 1.45 }),
  // iOS renders transparency as black, so the ground stays opaque
  'apple-touch-icon.png': render(180),
  // browser tab: the tinted wave itself, no ground
  'favicon-32.png': render(32, { transparent: true }),
  // in-page logo on the home screen (transparent, works on both themes)
  'wave-logo.png': render(192, { transparent: true }),
};
for (const [name, png] of Object.entries(files)) {
  writeFileSync(join(OUT, name), png);
  console.log(`✓ public/${name} (${png.length} bytes)`);
}
