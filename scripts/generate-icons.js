/**
 * Dero Vault — High-Resolution Master Icon & Cross-Platform Asset Generator
 * Generates 1024x1024 master PNG, multi-resolution Windows ICO, and macOS ICNS.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPngBuffer(width, height, drawFn) {
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const color = drawFn(x, y, width, height);
      rgba[idx] = color[0];     // R
      rgba[idx + 1] = color[1]; // G
      rgba[idx + 2] = color[2]; // B
      rgba[idx + 3] = color[3]; // A
    }
  }

  // Scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (width * 4 + 1);
    scanlines[scanlineOffset] = 0;
    rgba.copy(scanlines, scanlineOffset + 1, y * width * 4, (y + 1) * width * 4);
  }

  const deflated = zlib.deflateSync(scanlines);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

// Dero Granary Emblem Drawing Function (Official Brand Style Guide)
function drawGranaryEmblemSample(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = (x - cx) / (w / 2);
  const dy = (y - cy) / (h / 2);

  // Rounded squircle container
  const rCorner = 0.88;
  const distSquircle = Math.pow(Math.abs(dx), 3.2) + Math.pow(Math.abs(dy), 3.2);
  if (distSquircle > rCorner) {
    return [0, 0, 0, 0]; // Transparent
  }

  // Border highlight
  const isOuterBorder = distSquircle > rCorner - 0.08;
  if (isOuterBorder) {
    return [30, 52, 102, 255]; // #1E3466
  }

  // Deep Navy background (#0D1B3D -> #081126 gradient)
  const bgGrad = (dy + 1) / 2;
  const bgR = Math.round(13 * (1 - bgGrad) + 8 * bgGrad);
  const bgG = Math.round(27 * (1 - bgGrad) + 17 * bgGrad);
  const bgB = Math.round(61 * (1 - bgGrad) + 38 * bgGrad);

  // 1. Cyclic Backup Arrows Arc (Circular orbit r ~ 0.62)
  const distCenter = Math.sqrt(dx * dx + (dy + 0.05) * (dy + 0.05));
  const inOrbitalRing = distCenter >= 0.52 && distCenter <= 0.64;
  if (inOrbitalRing) {
    // Top right / bottom left arc segments
    const angle = Math.atan2(dy + 0.05, dx); // -PI to PI
    // Upper arc: Mint/Emerald (#00A884 to #00E5FF)
    if (angle > -2.8 && angle < -0.4) {
      return [0, 168, 132, 255]; // #00A884
    }
    // Lower arc: Gold/Amber (#F4A62A)
    if (angle > 0.4 && angle < 2.8) {
      return [244, 166, 42, 255]; // #F4A62A
    }
  }

  // 2. Conical Granary Thatch Roof (Triangle / cone in upper half)
  // Apex around (0, -0.48), base extends from x: -0.38 to +0.38 at y: -0.12
  if (dy >= -0.48 && dy <= -0.12) {
    const roofProgress = (dy - (-0.48)) / (-0.12 - (-0.48)); // 0 at apex, 1 at base
    const halfWidth = 0.06 + roofProgress * 0.36;
    if (Math.abs(dx) <= halfWidth) {
      // Thatch texture lines
      const thatchStripe = Math.floor((dx + 0.5) * 24) % 2;
      if (thatchStripe === 0) {
        return [206, 132, 60, 255]; // Warm Thatch Golden Amber #CE843C
      } else {
        return [168, 98, 40, 255];  // Darker Thatch Ochre #A86228
      }
    }
  }

  // 3. Woven Granary Basket Base (Trapezoid / rounded cylinder in lower half)
  // Extends from y: -0.10 to +0.38, width tapers slightly at base
  if (dy >= -0.10 && dy <= 0.38) {
    const basketProgress = (dy - (-0.10)) / 0.48; // 0 at top, 1 at bottom
    const halfWidth = 0.34 - basketProgress * 0.06;
    if (Math.abs(dx) <= halfWidth) {
      // 4. Central Entrance / Drive Bay Door (Dark arched aperture)
      const inDoor = Math.abs(dx) <= 0.12 && dy >= 0.10 && dy <= 0.36;
      if (inDoor) {
        // Modern external SSD drive resting at the entrance
        const inSsd = Math.abs(dx) <= 0.09 && dy >= 0.18 && dy <= 0.34;
        if (inSsd) {
          // SSD glowing LED activity light
          if (Math.abs(dx - 0.05) <= 0.02 && Math.abs(dy - 0.22) <= 0.02) {
            return [0, 229, 255, 255]; // Glowing Cyan LED #00E5FF
          }
          // SSD casing (anodized aluminum slate)
          return [45, 60, 80, 255];
        }
        return [10, 15, 28, 255]; // Dark inner doorway
      }

      // Basket weave pattern
      const row = Math.floor((dy - (-0.10)) * 18);
      const col = Math.floor((dx + 0.4) * 22);
      const isWeaveLight = (row + col) % 2 === 0;
      if (isWeaveLight) {
        return [196, 125, 59, 255]; // Warm Basket Tan #C47D3B
      } else {
        return [148, 88, 38, 255];  // Shadow Weave #945826
      }
    }
  }

  // Return background navy
  return [bgR, bgG, bgB, 255];
}

// 2x2 Subpixel Supersampling for smooth, crisp rendering at high resolution
function drawGranaryEmblem(x, y, w, h) {
  const offsets = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75]
  ];
  let r = 0, g = 0, b = 0, a = 0;
  for (const [ox, oy] of offsets) {
    const sample = drawGranaryEmblemSample(x + ox, y + oy, w, h);
    r += sample[0];
    g += sample[1];
    b += sample[2];
    a += sample[3];
  }
  return [
    Math.round(r / 4),
    Math.round(g / 4),
    Math.round(b / 4),
    Math.round(a / 4)
  ];
}

// Build multi-image Windows .ICO
function buildMultiIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4); // Number of images

  let offset = 6 + count * 16;
  const dirEntries = [];
  const imageBuffers = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // Width (0 for 256)
    entry[1] = size >= 256 ? 0 : size; // Height (0 for 256)
    entry[2] = 0; // Colors
    entry[3] = 0; // Reserved
    entry.writeUInt16LE(1, 4);  // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8); // Size of image data
    entry.writeUInt32LE(offset, 12);    // Offset of image data
    dirEntries.push(entry);
    imageBuffers.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

// Build Apple .ICNS container
function buildIcns(entries) {
  let totalLength = 8;
  const chunkBuffers = [];

  for (const { tag, png } of entries) {
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(tag, 0, 4, 'ascii');
    chunkHeader.writeUInt32BE(8 + png.length, 4);
    chunkBuffers.push(chunkHeader, png);
    totalLength += 8 + png.length;
  }

  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(totalLength, 4);

  return Buffer.concat([fileHeader, ...chunkBuffers]);
}

const assetsDir = path.resolve(process.cwd(), 'windows', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

console.log('Rendering high-resolution master icon (1024x1024)...');
const png1024 = createPngBuffer(1024, 1024, drawGranaryEmblem);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png1024);
fs.writeFileSync(path.join(assetsDir, 'icon-1024.png'), png1024);

console.log('Rendering 512x512 icon...');
const png512 = createPngBuffer(512, 512, drawGranaryEmblem);
fs.writeFileSync(path.join(assetsDir, 'icon-512.png'), png512);

console.log('Rendering 256x256 icon...');
const png256 = createPngBuffer(256, 256, drawGranaryEmblem);
fs.writeFileSync(path.join(assetsDir, 'icon-256.png'), png256);

console.log('Rendering 128x128 icon...');
const png128 = createPngBuffer(128, 128, drawGranaryEmblem);

console.log('Rendering 64x64 icon...');
const png64 = createPngBuffer(64, 64, drawGranaryEmblem);

console.log('Rendering 48x48 icon...');
const png48 = createPngBuffer(48, 48, drawGranaryEmblem);

console.log('Rendering 32x32 icon...');
const png32 = createPngBuffer(32, 32, drawGranaryEmblem);

console.log('Rendering 16x16 icon...');
const png16 = createPngBuffer(16, 16, drawGranaryEmblem);

console.log('Generating multi-resolution Windows ICO (256, 128, 64, 48, 32, 16)...');
const icoFile = buildMultiIco([
  { size: 256, png: png256 },
  { size: 128, png: png128 },
  { size: 64, png: png64 },
  { size: 48, png: png48 },
  { size: 32, png: png32 },
  { size: 16, png: png16 },
]);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoFile);

console.log('Generating Apple ICNS container (1024, 512, 256, 128, 64, 32, 16)...');
const icnsFile = buildIcns([
  { tag: 'ic10', png: png1024 }, // 1024x1024
  { tag: 'ic09', png: png512 },  // 512x512
  { tag: 'ic08', png: png256 },  // 256x256
  { tag: 'ic07', png: png128 },  // 128x128
  { tag: 'icp6', png: png64 },   // 64x64
  { tag: 'icp5', png: png32 },   // 32x32
  { tag: 'icp4', png: png16 },   // 16x16
]);
fs.writeFileSync(path.join(assetsDir, 'icon.icns'), icnsFile);

console.log('Generating system tray icon (32x32)...');
fs.writeFileSync(path.join(assetsDir, 'tray_icon.png'), png32);

console.log('All high-resolution and platform icon assets generated successfully in windows/assets/.');
