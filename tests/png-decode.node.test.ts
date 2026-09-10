// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE DECODER, AND WHY IT IS OURS (ADR-0134 §7).
//
// `createImageBitmap` and canvas may apply colour management when decoding a PNG that carries `gAMA`,
// `iCCP` or `sRGB`. If the colours the page sees are not the colours the file holds, the keys of `colorMap`
// stop matching — and it fails SILENTLY, producing a wrong mapping instead of an error.
//
// 📏 All 197 CC0 files in the sample carry an `sRGB` chunk. Colour management is the norm in distributed
// pixel art, not an edge case. So the decoder is ours, and the case that matters most in this file is
// `gAMA` — a byte that must survive a chunk telling a viewer to change it.
//
// The same claim is made against a REAL browser in png-decode.browser.test.ts, which is where it is really
// about: this file proves the arithmetic, that one proves the platform.
import { describe, it, expect } from 'vitest';
import { buildPng, namedChunk } from './helpers/build-png.ts';
import { decodePng } from '../src/png/decode.ts';

describe('decodePng — the colours a file holds, and not the colours a viewer would prefer', () => {
  it('Zero: a one-pixel opaque red RGBA image decodes to exactly those four bytes', async () => {
    const img = await decodePng(await buildPng({ width: 1, height: 1, colorType: 6, scanlines: [[0, 255, 0, 0, 255]] }));
    expect(img.width).toBe(1);
    expect(img.height).toBe(1);
    expect([...img.rgba]).toEqual([255, 0, 0, 255]);
  });

  it('🔴 Boundary: a gAMA chunk demanding a different gamma changes NOTHING, and is reported', async () => {
    // 0.45455 as PNG stores it (gamma × 100000 = 45455 = 0xB18F). A viewer honouring this would lighten
    // every channel, and nothing about the resulting file would say that it had.
    const img = await decodePng(await buildPng({
      width: 2,
      height: 1,
      colorType: 6,
      before: [namedChunk('gAMA', [0x00, 0x00, 0xb1, 0x8f])],
      scanlines: [[0, 10, 20, 30, 255, 200, 210, 220, 255]],
    }));

    // The bytes are the bytes. This is the assertion the whole decision in ADR-0134 §7 rests on.
    expect([...img.rgba]).toEqual([10, 20, 30, 255, 200, 210, 220, 255]);
    // And it must SAY it saw the chunk, so a caller can warn rather than discover the problem later.
    expect(img.colorManagementChunks).toEqual(['gAMA']);
  });

  it('Right: an sRGB chunk is reported too, because 197 of 197 measured files carry one', async () => {
    const img = await decodePng(await buildPng({
      width: 1,
      height: 1,
      colorType: 6,
      before: [namedChunk('sRGB', [0])],
      scanlines: [[0, 1, 2, 3, 255]],
    }));
    expect(img.colorManagementChunks).toEqual(['sRGB']);
  });

  it('Interface: all five filter types unfilter to the values that were encoded', async () => {
    // One column, five rows, so Up/Average/Paeth all have a real row above them to lean on. Bytes per pixel
    // is 4 and the row is 4 bytes wide, so the left neighbour `a` and the upper-left `c` are always 0 — the
    // arithmetic in the comments is worked by hand against that.
    const img = await decodePng(await buildPng({
      width: 1,
      height: 5,
      colorType: 6,
      scanlines: [
        [0, 10, 10, 10, 255], //   None  → the bytes stand
        [1, 20, 20, 20, 255], //   Sub   → a = 0 at x < bpp, so the bytes stand
        [2, 25, 25, 25, 0], //     Up    → 20 + 25 = 45 ; alpha 0 + 255 = 255
        [3, 38, 38, 38, 200], //   Avg   → 38 + floor((0+45)/2) = 60 ; alpha 200 + floor(255/2) = 327
        [4, 0, 0, 0, 0], //        Paeth → a = 0 and c = 0, so it always predicts b (the row above)
      ],
    }));
    const px = (i: number): number[] => [...img.rgba.slice(i * 4, i * 4 + 4)];
    expect(px(0)).toEqual([10, 10, 10, 255]);
    expect(px(1)).toEqual([20, 20, 20, 255]);
    expect(px(2)).toEqual([45, 45, 45, 255]);
    // 🔴 THE ALPHA HERE WRAPS, AND THAT IS CORRECT: 200 + 127 = 327 → 71, because PNG filter arithmetic is
    // defined modulo 256. A decoder that CLAMPED to 255 instead would pass every ordinary image and quietly
    // corrupt this one — the class of bug this row exists to catch, and it has no other symptom.
    expect(px(3)).toEqual([60, 60, 60, 71]);
    expect(px(4)).toEqual([60, 60, 60, 71]);
  });

  it('Right: colour type 2 has no alpha channel, so every pixel comes back fully opaque', async () => {
    const img = await decodePng(await buildPng({ width: 2, height: 1, colorType: 2, scanlines: [[0, 1, 2, 3, 4, 5, 6]] }));
    expect([...img.rgba]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('Right: an indexed image expands through PLTE, and tRNS gives entry 0 its transparency', async () => {
    const img = await decodePng(await buildPng({
      width: 3,
      height: 1,
      colorType: 3,
      before: [namedChunk('PLTE', [9, 9, 9, 40, 50, 60, 70, 80, 90]), namedChunk('tRNS', [0])],
      scanlines: [[0, 0, 1, 2]],
    }));
    // Entry 0 is transparent; entries past the end of tRNS are opaque (PNG §11.3.2).
    expect([...img.rgba]).toEqual([9, 9, 9, 0, 40, 50, 60, 255, 70, 80, 90, 255]);
  });

  it('🔴 Right: PARTIAL alpha survives — not flattened, not premultiplied', async () => {
    // 📏 119 of 197 measured CC0 files carry partial alpha, so the earlier format's hard mask would have
    // rejected sixty per cent of a real pack. Premultiplying 200 at alpha 128 would give 100; flattening
    // would give 255. Both are wrong, and both fail without saying so.
    const img = await decodePng(await buildPng({ width: 1, height: 1, colorType: 6, scanlines: [[0, 200, 100, 50, 128]] }));
    expect([...img.rgba]).toEqual([200, 100, 50, 128]);
  });

describe('sub-byte depths, which a real asset pack is full of', () => {
  // 📏 Measured on the Liberated Pixel Cup (Body + Clothes, 8 155 files): 44 files at bit depth 4 and 41 at
  // bit depth 2, all of them indexed. They are beards and hair — real art, refused outright until this
  // existed. The decoder was right to refuse rather than misread; it was wrong to have nothing to offer.
  it('🔴 Right: four bits per pixel, indexed, with the row padded to a whole byte', async () => {
    // Three pixels at four bits is twelve bits, so the row is two bytes and the last four are padding.
    const img = await decodePng(await buildPng({
      width: 3, height: 1, colorType: 3, bitDepth: 4,
      before: [namedChunk('PLTE', [10, 10, 10, 20, 20, 20, 30, 30, 30])],
      scanlines: [[0, 0x01, 0x20]], // indices 0, 1, 2
    }));
    expect([...img.rgba]).toEqual([10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255]);
  });

  it('🔴 Right: two bits per pixel, indexed, five across a two-byte row', async () => {
    const img = await decodePng(await buildPng({
      width: 5, height: 1, colorType: 3, bitDepth: 2,
      before: [namedChunk('PLTE', [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3])],
      scanlines: [[0, 0b00011011, 0b01000000]], // 0,1,2,3 then 1
    }));
    expect([...img.rgba.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...img.rgba.slice(12, 16)]).toEqual([3, 3, 3, 255]);
    expect([...img.rgba.slice(16, 20)]).toEqual([1, 1, 1, 255]);
  });

  it('🔴 Boundary: an INDEX is never scaled, and a GREY sample always is', async () => {
    // The distinction that would corrupt everything if it were missed. At four bits a grey sample of 15 is
    // full white and must become 255; an index of 15 is the fifteenth palette entry and must stay 15.
    const grey = await decodePng(await buildPng({
      width: 2, height: 1, colorType: 0, bitDepth: 4,
      scanlines: [[0, 0x0f]], // 0 then 15
    }));
    expect([...grey.rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('Right: one bit per pixel, greyscale, is black and white', async () => {
    const img = await decodePng(await buildPng({ width: 2, height: 1, colorType: 0, bitDepth: 1, scanlines: [[0, 0b01000000]] }));
    expect([...img.rgba]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it('Right: tRNS still gives an indexed entry its transparency at four bits', async () => {
    const img = await decodePng(await buildPng({
      width: 2, height: 1, colorType: 3, bitDepth: 4,
      before: [namedChunk('PLTE', [9, 9, 9, 40, 50, 60]), namedChunk('tRNS', [0])],
      scanlines: [[0, 0x01]],
    }));
    expect([...img.rgba]).toEqual([9, 9, 9, 0, 40, 50, 60, 255]);
  });

  it('Boundary: rows still unfilter, with the filter byte per row and a byte-sized stride', async () => {
    const img = await decodePng(await buildPng({
      width: 2, height: 2, colorType: 3, bitDepth: 4,
      before: [namedChunk('PLTE', [0, 0, 0, 7, 7, 7, 8, 8, 8])],
      scanlines: [[0, 0x12], [2, 0x00]], // second row is filter Up over a zero delta, so it repeats the first
    }));
    expect([...img.rgba.slice(0, 4)]).toEqual([7, 7, 7, 255]);
    expect([...img.rgba.slice(8, 12)]).toEqual([7, 7, 7, 255]);
  });
});

  describe('Exercise the exceptional — it refuses loudly instead of guessing', () => {
    it('rejects something that is not a PNG', async () => {
      await expect(decodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow(/not a PNG/i);
    });

    it('rejects 16-bit depth by name rather than reading it as 8', async () => {
      const png = await buildPng({ width: 1, height: 1, colorType: 6, bitDepth: 16, scanlines: [[0, 0, 0, 0, 0, 0, 0, 0, 0]] });
      await expect(decodePng(png)).rejects.toThrow(/bit depth 16/i);
    });

    it('rejects an interlaced image rather than returning a scrambled one', async () => {
      const png = await buildPng({ width: 1, height: 1, colorType: 6, interlace: 1, scanlines: [[0, 0, 0, 0, 0]] });
      await expect(decodePng(png)).rejects.toThrow(/interlac/i);
    });
  });
});
