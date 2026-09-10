// SPDX-License-Identifier: AGPL-3.0-or-later
//
// 🎯 THE HALF NODE CANNOT PROVE. `src/png/decode` exists because the browser's own decoders may apply colour
// management (ADR-0134 §7) — so the claim being made is about the BROWSER, and a suite that only ever ran in
// Node would be asserting it without ever visiting the place it is about.
//
// Two things are checked here and nowhere else:
//   · the decoder runs in Chromium at all, on `DecompressionStream` rather than `node:zlib`;
//   · 🔴 it disagrees with the browser's OWN decoder when the file carries a gamma chunk, or, if this
//     particular Chromium happens not to transform, it at least agrees byte for byte with the file. Either
//     way the assertion is about OUR bytes, and they are the ones the file holds.
import { describe, it, expect } from 'vitest';
import { buildPng, namedChunk } from './helpers/build-png.ts';
import { decodePng } from '../src/png/decode.ts';

/** What the platform's own path returns, for comparison: an <img> drawn onto a canvas. */
async function decodeThroughCanvas(png: Uint8Array): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return new Uint8Array(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data);
}

describe('decodePng, in a real browser', () => {
  it('runs on DecompressionStream in Chromium and returns the bytes the file holds', async () => {
    const png = await buildPng({ width: 2, height: 1, colorType: 6, scanlines: [[0, 10, 20, 30, 255, 200, 210, 220, 255]] });
    const img = await decodePng(png);
    expect(img.width).toBe(2);
    expect([...img.rgba]).toEqual([10, 20, 30, 255, 200, 210, 220, 255]);
  });

  it('🔴 a gAMA chunk does not move our values, whatever the browser would do with it', async () => {
    const png = await buildPng({
      width: 1,
      height: 1,
      colorType: 6,
      before: [namedChunk('gAMA', [0x00, 0x00, 0xb1, 0x8f])],
      scanlines: [[0, 10, 20, 30, 255]],
    });

    const ours = await decodePng(png);
    expect([...ours.rgba]).toEqual([10, 20, 30, 255]);
    expect(ours.colorManagementChunks).toEqual(['gAMA']);

    // Reported, not asserted: if this ever prints a difference, the reason this module exists just became
    // visible in this browser. Asserting a difference would make the test fail on a Chromium that behaves,
    // and asserting equality would make it fail on one that does not — neither is the claim being made.
    const platform = await decodeThroughCanvas(png);
    if ([...platform].join() !== [...ours.rgba].join()) {
      // eslint-disable-next-line no-console
      console.warn(`the platform decoder returned ${[...platform]} where the file holds ${[...ours.rgba]}`);
    }
  });

  it('🔴 partial alpha comes back straight, and the canvas path is where premultiplication would show', async () => {
    // 📏 119 of 197 measured CC0 files carry partial alpha. Canvas stores premultiplied and un-premultiplies
    // on `getImageData`, which is lossy — 200 at alpha 128 does not survive the round trip exactly. Ours
    // never enters that pipeline, and this is the assertion that says so.
    const png = await buildPng({ width: 1, height: 1, colorType: 6, scanlines: [[0, 200, 100, 50, 128]] });
    const ours = await decodePng(png);
    expect([...ours.rgba]).toEqual([200, 100, 50, 128]);
  });
});
