// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A PNG built BY HAND, byte by byte, and deliberately NOT by `src/png/encode`.
//
// A decoder tested against its own encoder proves only that the two agree; a bug present in both cancels out
// and reports green. So this duplicates the encoding work on purpose, and it belongs to the tests.
//
// It uses `CompressionStream` rather than `node:zlib` for one reason: the same helper has to run in the
// `browser` project, where `node:zlib` does not exist.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC over type+data. */
export function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export const namedChunk = (type: string, bytes: number[]): Uint8Array => chunk(type, Uint8Array.from(bytes));

export interface PngParts {
  width: number;
  height: number;
  colorType: number;
  bitDepth?: number;
  interlace?: number;
  /** Scanlines WITH their leading filter byte, exactly as they go into IDAT. */
  scanlines: number[][];
  /** Chunks placed between IHDR and IDAT — PLTE, tRNS, gAMA, sRGB. */
  before?: Uint8Array[];
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function buildPng(p: PngParts): Promise<Uint8Array> {
  const ihdr = new Uint8Array(13);
  const head = new DataView(ihdr.buffer);
  head.setUint32(0, p.width);
  head.setUint32(4, p.height);
  ihdr[8] = p.bitDepth ?? 8;
  ihdr[9] = p.colorType;
  ihdr[12] = p.interlace ?? 0;

  const parts = [
    Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...(p.before ?? []),
    chunk('IDAT', await deflate(Uint8Array.from(p.scanlines.flat()))),
    chunk('IEND', new Uint8Array(0)),
  ];

  const png = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let at = 0;
  for (const part of parts) { png.set(part, at); at += part.length; }
  return png;
}
