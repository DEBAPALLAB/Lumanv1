#!/usr/bin/env node
/**
 * Generate public/icon.ico and public/favicon.ico.
 *
 * electron-builder fails outright when `win.icon` points at a missing file,
 * and `new Tray()` throws on one, so the app needs these to build and to run.
 *
 * This draws a PLACEHOLDER mark -- a black "L" on the brand yellow, in the
 * same flat/heavy-border style as the onboarding UI. Replace it with real
 * artwork when branding exists: either drop a proper multi-size .ico at
 * public/icon.ico, or adjust the palette and glyph below and re-run
 * `node scripts/generate-icon.js`.
 *
 * No image dependencies: PNGs are encoded here with zlib and packed into an
 * ICO container, so this runs on a bare checkout.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Sizes Windows actually picks between: taskbar, Alt+Tab, Explorer views,
// and the 256px entry used by the installer and high-DPI shells.
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const YELLOW = [250, 204, 21, 255]; // brand accent
const BLACK = [10, 10, 10, 255];

/** CRC-32, needed for every PNG chunk. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA pixel buffer as a PNG. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draw the mark: yellow field, heavy black border, black "L".
 * Coordinates are fractions of the icon so every size stays proportional.
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const border = Math.max(1, Math.round(size / 16));

  // Fractions chosen so the L reads as an L even at 16px, where the whole
  // glyph is only a handful of pixels.
  const stemX0 = 0.30, stemX1 = 0.46;
  const stemY0 = 0.24, stemY1 = 0.76;
  const footX1 = 0.72, footY0 = 0.60;

  const px = (f) => Math.round(f * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isBorder = x < border || y < border || x >= size - border || y >= size - border;
      const inStem = x >= px(stemX0) && x < px(stemX1) && y >= px(stemY0) && y < px(stemY1);
      const inFoot = x >= px(stemX0) && x < px(footX1) && y >= px(footY0) && y < px(stemY1);

      const colour = isBorder || inStem || inFoot ? BLACK : YELLOW;
      const o = (y * size + x) * 4;
      rgba[o] = colour[0];
      rgba[o + 1] = colour[1];
      rgba[o + 2] = colour[2];
      rgba[o + 3] = colour[3];
    }
  }

  return rgba;
}

/** Pack PNGs into an ICO container (PNG-compressed entries, Vista+). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  const DIR_ENTRY = 16;
  let offset = header.length + images.length * DIR_ENTRY;
  const entries = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(DIR_ENTRY);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // palette size
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const images = SIZES.map((size) => ({ size, png: encodePng(size, drawIcon(size)) }));
const ico = buildIco(images);

const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });

for (const name of ['icon.ico', 'favicon.ico']) {
  const target = path.join(publicDir, name);
  fs.writeFileSync(target, ico);
  console.log(`[generate-icon] wrote public/${name} (${SIZES.join(', ')} px, ${ico.length} bytes)`);
}
