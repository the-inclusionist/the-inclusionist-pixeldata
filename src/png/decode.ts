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
//
// 📏 SUB-BYTE DEPTHS ARE SUPPORTED BECAUSE A REAL PACK NEEDS THEM. Measured on the Liberated Pixel Cup
// (Body + Clothes, 8 155 files): 44 files at bit depth 4 and 41 at bit depth 2, all indexed — beards and
// hair, refused outright before this. Refusing was the right behaviour and having nothing to offer was not.

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
/** Samples per pixel, by colour type: grey, RGB, palette index, grey+alpha, RGBA. */
const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** What the PNG specification allows, so an impossible combination is named rather than half-read. */
const ALLOWED_DEPTHS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16],
};
/**
 * Scaling a sub-byte GREY sample up to a byte: 1 bit → 0 or 255, 2 bits → 0/85/170/255, 4 bits → ×17.
 * 🔴 It applies to grey samples ONLY. An INDEX is not a quantity — scaling one would silently point at a
 * different palette entry, and every pixel of the image would be the wrong colour with no error anywhere.
 */
const GREY_SCALE: Readonly<Record<number, number>> = { 1: 255, 2: 85, 4: 17, 8: 1 };

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
function unfilter(raw: Uint8Array, stride: number, height: number, bpp: number): Uint8Array {
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

/**
 * Read the `index`-th sample of a row, whatever the bit depth. Sub-byte samples are packed MOST significant
 * bits first, and a row is padded to a whole byte — the padding is read by nobody because `width` bounds the
 * loop, which is why the extra bits can hold anything at all.
 */
function sampleAt(rows: Uint8Array, rowStart: number, index: number, bitDepth: number): number {
  if (bitDepth === 8) return rows[rowStart + index]!;
  const perByte = 8 / bitDepth;
  const byte = rows[rowStart + Math.floor(index / perByte)]!;
  const shift = 8 - bitDepth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function toRgba(
  rows: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  bitDepth: number,
  stride: number,
  plte?: Uint8Array,
  trns?: Uint8Array,
): Uint8Array {
  const channels = CHANNELS[colorType]!;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    for (let x = 0; x < width; x++) {
      const d = (y * width + x) * 4;
      const s = x * channels;
      const at = (channel: number): number => sampleAt(rows, rowStart, s + channel, bitDepth);

      switch (colorType) {
        case 6: // RGBA
          rgba[d] = at(0); rgba[d + 1] = at(1); rgba[d + 2] = at(2); rgba[d + 3] = at(3);
          break;
        case 2: // RGB — no alpha channel means every pixel is opaque
          rgba[d] = at(0); rgba[d + 1] = at(1); rgba[d + 2] = at(2); rgba[d + 3] = 255;
          break;
        case 0: { // greyscale, and the sample is a QUANTITY, so it scales to a byte
          const grey = at(0) * GREY_SCALE[bitDepth]!;
          rgba[d] = rgba[d + 1] = rgba[d + 2] = grey; rgba[d + 3] = 255;
          break;
        }
        case 4: // greyscale + alpha, eight bits only per the specification
          rgba[d] = rgba[d + 1] = rgba[d + 2] = at(0); rgba[d + 3] = at(1);
          break;
        case 3: { // indexed — the sample is an INDEX and is never scaled
          if (!plte) throw new Error('indexed image (colour type 3) with no PLTE chunk');
          const idx = at(0);
          if (idx * 3 + 2 >= plte.length) throw new Error(`palette index ${idx} is past the end of PLTE`);
          rgba[d] = plte[idx * 3]!; rgba[d + 1] = plte[idx * 3 + 1]!; rgba[d + 2] = plte[idx * 3 + 2]!;
          // tRNS may be shorter than the palette; entries past its end are fully opaque (PNG §11.3.2).
          rgba[d + 3] = trns && idx < trns.length ? trns[idx]! : 255;
          break;
        }
        default:
          throw new Error(`unsupported colour type ${colorType}`);
      }
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

  if (CHANNELS[colorType] === undefined) throw new Error(`unsupported colour type ${colorType}`);
  if (bitDepth === 16) throw new Error('bit depth 16 is not supported — this reads 8-bit samples and below');
  if (!ALLOWED_DEPTHS[colorType]!.includes(bitDepth)) {
    throw new Error(`bit depth ${bitDepth} is not allowed with colour type ${colorType}`);
  }
  if (interlace !== 0) throw new Error('interlaced (Adam7) images are not supported');

  const idat = chunks.filter((c) => c.type === 'IDAT');
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.data.length, 0));
  let at = 0;
  for (const c of idat) { joined.set(c.data, at); at += c.data.length; }

  // ⚠️ THE FILTER WORKS IN BYTES AND THE IMAGE IN SAMPLES, and below one byte per pixel they part company.
  // `bpp` is the distance to the left neighbour «rounding up to one» (PNG §9.2), so at four bits it is 1 —
  // the filter reaches back a whole byte, which is TWO pixels. Using the sample width here instead would
  // unfilter every sub-byte image into noise.
  const bitsPerPixel = CHANNELS[colorType]! * bitDepth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const rows = unfilter(await inflate(joined), stride, height, Math.max(1, Math.ceil(bitsPerPixel / 8)));
  const rgba = toRgba(
    rows, width, height, colorType, bitDepth, stride,
    chunks.find((c) => c.type === 'PLTE')?.data,
    chunks.find((c) => c.type === 'tRNS')?.data,
  );

  return {
    width,
    height,
    rgba,
    colorManagementChunks: chunks.filter((c) => COLOUR_MANAGEMENT.includes(c.type)).map((c) => c.type),
    colorType,
  };
}
