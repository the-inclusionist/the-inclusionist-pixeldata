// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A PNG decoder that returns THE BYTES THE FILE HOLDS (ADR-0134 §7).
//
// The platform already has decoders — `createImageBitmap`, an `<img>` on a canvas — and they are not usable
// here, for one reason: they may apply colour management. A file carrying `gAMA`, `iCCP` or `sRGB` can come
// back with different channel values than it stores, and this tool keys its whole human decision on exact
// colour equality. A transformed byte does not raise an error; it produces a `colorMap` whose keys match
// nothing, or worse, a mapping that looks right and is not.
//
// 📏 All 197 CC0 files in the measurement carry an `sRGB` chunk. Colour-management chunks are the NORM in
// distributed pixel art, so this is not defensive programming against a hypothetical.
//
// It runs unchanged in Node and in the browser: `DecompressionStream` is the only thing it needs, and it is
// in both. That is also why inflate makes the whole function async.
//
// ⚠️ IT REFUSES WHAT IT CANNOT DO, BY NAME. 16-bit depth and interlacing are real parts of PNG and are not
// implemented; a decoder that quietly read a 16-bit image as 8-bit would return a plausible, wrong picture.

/** What a decoded PNG is, and nothing more: size, pixels, and what the file said about colour. */
export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  /** Straight (NOT premultiplied) RGBA, four bytes per pixel, row-major. */
  readonly rgba: Uint8Array;
  /** Colour-management chunks present in the file, in the order they appeared. Reported, never obeyed. */
  readonly colorManagementChunks: readonly string[];
  /** The PNG colour type (0, 2, 3, 4 or 6) the file declared, kept because provenance is worth recording. */
  readonly colorType: number;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const COLOUR_MANAGEMENT = ['gAMA', 'iCCP', 'sRGB', 'cHRM'];
const BYTES_PER_PIXEL: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunk[] {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error('not a PNG: the eight-byte signature does not match');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Chunk[] = [];
  let p = 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4]!, bytes[p + 5]!, bytes[p + 6]!, bytes[p + 7]!);
    chunks.push({ type, data: bytes.subarray(p + 8, p + 8 + length) });
    p += 12 + length;
  }
  return chunks;
}

/**
 * Undo the per-scanline filter. The five types are defined in PNG §9.2, and every one of them is arithmetic
 * MODULO 256 — a decoder that clamps produces a plausible image with wrong bytes and no error.
 */
function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]!;
    const rowStart = y * stride;
    const aboveStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[rowStart + x - bpp]! : 0;
      const b = y > 0 ? out[aboveStart + x]! : 0;
      const c = y > 0 && x >= bpp ? out[aboveStart + x - bpp]! : 0;
      const v = raw[p + x]!;
      let recon: number;
      switch (filter) {
        case 0: recon = v; break;
        case 1: recon = v + a; break;
        case 2: recon = v + b; break;
        case 3: recon = v + ((a + b) >> 1); break;
        case 4: {
          const guess = a + b - c;
          const da = Math.abs(guess - a), db = Math.abs(guess - b), dc = Math.abs(guess - c);
          recon = v + (da <= db && da <= dc ? a : db <= dc ? b : c);
          break;
        }
        default: throw new Error(`unknown scanline filter ${filter} on row ${y}`);
      }
      out[rowStart + x] = recon & 0xff;
    }
    p += stride;
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toRgba(rows: Uint8Array, width: number, height: number, colorType: number, plte?: Uint8Array, trns?: Uint8Array): Uint8Array {
  const bpp = BYTES_PER_PIXEL[colorType]!;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp, d = i * 4;
    switch (colorType) {
      case 6: // RGBA
        rgba[d] = rows[s]!; rgba[d + 1] = rows[s + 1]!; rgba[d + 2] = rows[s + 2]!; rgba[d + 3] = rows[s + 3]!;
        break;
      case 2: // RGB — no alpha channel means every pixel is opaque
        rgba[d] = rows[s]!; rgba[d + 1] = rows[s + 1]!; rgba[d + 2] = rows[s + 2]!; rgba[d + 3] = 255;
        break;
      case 0: // greyscale
        rgba[d] = rgba[d + 1] = rgba[d + 2] = rows[s]!; rgba[d + 3] = 255;
        break;
      case 4: // greyscale + alpha
        rgba[d] = rgba[d + 1] = rgba[d + 2] = rows[s]!; rgba[d + 3] = rows[s + 1]!;
        break;
      case 3: { // indexed
        if (!plte) throw new Error('indexed image (colour type 3) with no PLTE chunk');
        const idx = rows[s]!;
        rgba[d] = plte[idx * 3]!; rgba[d + 1] = plte[idx * 3 + 1]!; rgba[d + 2] = plte[idx * 3 + 2]!;
        // tRNS may be shorter than the palette; entries past its end are fully opaque (PNG §11.3.2).
        rgba[d + 3] = trns && idx < trns.length ? trns[idx]! : 255;
        break;
      }
      default:
        throw new Error(`unsupported colour type ${colorType}`);
    }
  }
  return rgba;
}

/** Decode a PNG into straight RGBA, reporting colour-management chunks without ever obeying them. */
export async function decodePng(bytes: Uint8Array): Promise<DecodedPng> {
  const chunks = readChunks(bytes);
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr || ihdr.data.length < 13) throw new Error('not a PNG: no usable IHDR chunk');

  const head = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = head.getUint32(0), height = head.getUint32(4);
  const bitDepth = ihdr.data[8]!, colorType = ihdr.data[9]!, interlace = ihdr.data[12]!;

  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} is not supported — this reads 8-bit images only`);
  if (interlace !== 0) throw new Error('interlaced (Adam7) images are not supported');
  if (BYTES_PER_PIXEL[colorType] === undefined) throw new Error(`unsupported colour type ${colorType}`);

  const idat = chunks.filter((c) => c.type === 'IDAT');
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let at = 0;
  for (const c of idat) { joined.set(c.data, at); at += c.data.length; }

  const rows = unfilter(await inflate(joined), width, height, BYTES_PER_PIXEL[colorType]!);
  const rgba = toRgba(rows, width, height, colorType, chunks.find((c) => c.type === 'PLTE')?.data, chunks.find((c) => c.type === 'tRNS')?.data);

  return {
    width,
    height,
    rgba,
    colorManagementChunks: chunks.filter((c) => COLOUR_MANAGEMENT.includes(c.type)).map((c) => c.type),
    colorType,
  };
}
