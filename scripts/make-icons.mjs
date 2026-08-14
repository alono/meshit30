#!/usr/bin/env node
// Generate the PWA icons: a ship's wheel on the brand blue, written as PNGs
// with no image dependencies — a minimal PNG encoder over node's zlib and a
// rasterizer for the wheel geometry.
//
//   node scripts/make-icons.mjs   ->  public/icon-*.png, public/apple-touch-icon.png

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

const BG = [0x0b, 0x3f, 0x5c]; // --brand (light theme)
const FG = [0xff, 0xff, 0xff];

/* ---------------------------------------------------------------- png -- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4 */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines, each prefixed with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --------------------------------------------------------------- wheel -- */

/**
 * Coverage-sampled wheel: for each pixel, 3×3 subsamples against the exact
 * geometry — rim, inner ring, eight spokes with round handle tips, hub.
 * `inset` shrinks the artwork into the maskable safe zone.
 */
function drawWheel(size, inset = 1) {
  const rgba = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const R = size * 0.3 * inset;
  const lw = size * 0.05 * inset;
  const innerR = R * 0.62;
  const hubR = size * 0.075 * inset;
  const handleEnd = R + size * 0.085 * inset;
  const spokeStart = R * 0.2;
  const angles = Array.from({ length: 8 }, (_, i) => (Math.PI / 4) * i + Math.PI / 8);

  const hit = (x, y) => {
    const px = x - cx;
    const py = y - cx;
    const d = Math.hypot(px, py);
    if (d <= hubR) return true;
    if (Math.abs(d - R) <= lw / 2) return true;
    if (Math.abs(d - innerR) <= lw / 2) return true;
    for (const a of angles) {
      const along = px * Math.cos(a) + py * Math.sin(a);
      const perp = -px * Math.sin(a) + py * Math.cos(a);
      if (along >= spokeStart && along <= handleEnd && Math.abs(perp) <= lw / 2) return true;
      // round handle tip
      const tx = px - Math.cos(a) * handleEnd;
      const ty = py - Math.sin(a) * handleEnd;
      if (Math.hypot(tx, ty) <= lw / 2) return true;
    }
    return false;
  };

  const SUB = 3;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          if (hit(x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB)) cover++;
        }
      }
      const t = cover / (SUB * SUB);
      const o = (y * size + x) * 4;
      rgba[o] = BG[0] + (FG[0] - BG[0]) * t;
      rgba[o + 1] = BG[1] + (FG[1] - BG[1]) * t;
      rgba[o + 2] = BG[2] + (FG[2] - BG[2]) * t;
      rgba[o + 3] = 255;
    }
  }
  return rgba;
}

/* ---------------------------------------------------------------- main -- */

mkdirSync(OUT, { recursive: true });
const files = {
  'icon-192.png': [192, 1],
  'icon-512.png': [512, 1],
  'icon-maskable-512.png': [512, 0.72],
  'apple-touch-icon.png': [180, 1],
};
for (const [name, [size, inset]] of Object.entries(files)) {
  const png = encodePng(size, drawWheel(size, inset));
  writeFileSync(join(OUT, name), png);
  console.log(`✓ public/${name} (${png.length} bytes)`);
}
