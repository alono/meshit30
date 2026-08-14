#!/usr/bin/env node
// Crop the numbered images out of the official lights-and-signals booklet
// (data/sq11.pdf) into public/signals/t-NNN.png.
//
//   pdftoppm -png -r 150 data/sq11.pdf <scratch>/page
//   node scripts/build-signals.mjs <scratch>
//
// Each booklet page lays its images out as solid dark/gray cells on white.
// Cells are found as connected components, ordered right-to-left within each
// row (the booklet numbers them in Hebrew reading order), and numbered from
// the page's known starting figure. The expected cell count per page is
// asserted, so a mis-detection fails loudly instead of shifting every caption.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './lib/png.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'signals');
const SCRATCH = process.argv[2];
if (!SCRATCH) {
  console.error('usage: node scripts/build-signals.mjs <dir with page-NN.png renders>');
  process.exit(1);
}

// page file -> [first figure number, expected cell count]
const PAGES = {
  'page-03.png': [1, 19],
  'page-04.png': [20, 20],
  'page-05.png': [40, 19],
  'page-06.png': [59, 16],
  'page-07.png': [75, 16],
  'page-08.png': [91, 20],
  'page-09.png': [111, 16],
};

const isCellish = (rgba, i) =>
  Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) < 240; // anything not near-white

/** Connected components of cellish pixels; returns solid, cell-sized boxes. */
function findCells({ width, height, rgba }) {
  const seen = new Uint8Array(width * height);
  const boxes = [];
  const stack = new Int32Array(width * height);

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || !isCellish(rgba, start * 4)) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = width, maxX = 0, minY = height, maxY = 0, count = 0;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p / width) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (const q of [p - 1, p + 1, p - width, p + width]) {
        if (q < 0 || q >= width * height || seen[q]) continue;
        if (Math.abs((q % width) - x) > 1) continue; // no row wrap
        if (!isCellish(rgba, q * 4)) continue;
        seen[q] = 1;
        stack[top++] = q;
      }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const fill = count / (w * h);
    // a booklet cell: big, solid, roughly rectangular
    // fill is loose because flags/day-signal artwork contains white regions —
    // holes in the component — while captions fail the size gate anyway
    if (w > 120 && h > 120 && fill > 0.45) boxes.push({ minX, minY, maxX, maxY });
  }
  return boxes;
}

/** Rows top-to-bottom, columns right-to-left (Hebrew reading order). */
function orderCells(boxes) {
  const sorted = [...boxes].sort((a, b) => a.minY - b.minY);
  const rows = [];
  for (const box of sorted) {
    const row = rows.find((r) => Math.abs(r[0].minY - box.minY) < (box.maxY - box.minY) / 2);
    if (row) row.push(box);
    else rows.push([box]);
  }
  rows.sort((a, b) => a[0].minY - b[0].minY);
  return rows.flatMap((row) => row.sort((a, b) => b.minX - a.minX));
}

function crop(img, { minX, minY, maxX, maxY }, pad = 2) {
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(img.width - 1, maxX + pad);
  const y1 = Math.min(img.height - 1, maxY + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    img.rgba.copy(out, y * w * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x1 + 1) * 4);
  }
  return encodePng(w, h, out);
}

mkdirSync(OUT, { recursive: true });
let total = 0;

for (const [file, [firstN, expected]] of Object.entries(PAGES)) {
  const img = decodePng(readFileSync(join(SCRATCH, file)));
  const cells = orderCells(findCells(img));
  if (cells.length !== expected) {
    console.error(`✗ ${file}: found ${cells.length} cells, expected ${expected}`);
    process.exit(1);
  }
  cells.forEach((box, i) => {
    const n = firstN + i;
    writeFileSync(join(OUT, `t-${String(n).padStart(3, '0')}.png`), crop(img, box));
    total++;
  });
  console.log(`✓ ${file}: ${cells.length} cells -> תמונות ${firstN}–${firstN + expected - 1}`);
}

// Figure 127 — the relative-positions diagram fills page 2: crop the content
// bounding box of everything non-white.
{
  const img = decodePng(readFileSync(join(SCRATCH, 'page-02.png')));
  let minX = img.width, maxX = 0, minY = img.height, maxY = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (isCellish(img.rgba, (y * img.width + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  writeFileSync(join(OUT, 't-127.png'), crop(img, { minX, minY, maxX, maxY }, 8));
  total++;
  console.log(`✓ page-02.png: מצבי שייט -> תמונה 127`);
}

console.log(`${total} images written to public/signals/`);
