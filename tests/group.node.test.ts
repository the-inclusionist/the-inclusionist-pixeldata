// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE TWO GROUPINGS (ADR-0134 §4), and everything the four panels show comes out of them.
//
// Both are EXACT equality over a summary — no tolerance, no threshold, no parameter that a person could set
// wrongly and never find out. That matters more than it sounds: a similarity threshold would have to be
// stored in the file, defended, and explained, and the measurement says it is not needed yet.
//
//   · `drawingHash` over (width, height, index grid) — the SAME DRAWING with different colours. This is the
//     one that pays for the tool: 📏 34 groups covering 119 files in the 197-file sample.
//   · `paletteHash` over the sorted colour set — DIFFERENT DRAWINGS sharing colours. Seven groups in the
//     same sample, and every one of them a shared MATERIAL.
//
// Each is tested in BOTH directions. A grouping that only ever says "yes" is a grouping that would put every
// file in one bucket, and it would look like it was working.
import { describe, it, expect } from 'vitest';
import { indexColours, drawingHash, paletteHash, groupImages, TRANSPARENT } from '../src/group/group.ts';

/** A tiny image built straight from RGBA quadruples, so each case reads as the picture it is. */
function image(width: number, pixels: number[][]): { width: number; height: number; rgba: Uint8Array } {
  return { width, height: pixels.length / width, rgba: Uint8Array.from(pixels.flat()) };
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const GREEN = [0, 255, 0, 255];
const YELLOW = [255, 255, 0, 255];
const CLEAR = [0, 0, 0, 0];
const CLEAR_WHITE = [255, 255, 255, 0]; // different RGB, same nothing

describe('indexColours', () => {
  it('Zero: numbers the colours by FIRST APPEARANCE in raster order', () => {
    const { order, indexGrid } = indexColours(image(2, [BLUE, RED, RED, BLUE]));
    expect([...indexGrid]).toEqual([0, 1, 1, 0]);
    expect(order.length).toBe(2);
  });

  it('🔴 Boundary: a fully transparent pixel is the SAME absence whatever RGB sits under it', () => {
    // Without this, two files identical to the eye get different index grids because one of them stored
    // white-at-zero-alpha where the other stored black — and the variant harvest silently finds nothing.
    const { order, indexGrid } = indexColours(image(2, [CLEAR, CLEAR_WHITE, RED, RED]));
    expect([...indexGrid]).toEqual([0, 0, 1, 1]);
    expect(order[0]).toBe(TRANSPARENT);
    expect(order.length).toBe(2);
  });

  it('Right: partial alpha is part of the colour, so two alphas of one RGB are two colours', () => {
    // 📏 119 of 197 measured files carry partial alpha, and it is a shadow rather than anti-aliasing. The
    // shadow has to be annotatable as its own region, which it cannot be if alpha is thrown away here.
    const { order } = indexColours(image(2, [[10, 20, 30, 255], [10, 20, 30, 128]]));
    expect(order.length).toBe(2);
  });

  it('Right: it counts the pixels that are neither opaque nor transparent', () => {
    const { partialAlphaPixels } = indexColours(image(3, [RED, [1, 2, 3, 7], CLEAR]));
    expect(partialAlphaPixels).toBe(1);
  });
});

describe('drawingHash — the same drawing, whatever colours it wears', () => {
  it('🎯 Right: recolouring every pixel does not change it', async () => {
    const blueTeam = image(2, [RED, BLUE, BLUE, RED]);
    const redTeam = image(2, [GREEN, YELLOW, YELLOW, GREEN]);
    expect(await drawingHash(blueTeam)).toBe(await drawingHash(redTeam));
  });

  it('🔴 Boundary: ONE pixel changed makes it a different drawing', async () => {
    const before = image(2, [RED, BLUE, BLUE, RED]);
    const after = image(2, [RED, BLUE, BLUE, BLUE]);
    expect(await drawingHash(before)).not.toBe(await drawingHash(after));
  });

  it('Boundary: the same pixels at different dimensions are a different drawing', async () => {
    const wide = image(4, [RED, BLUE, BLUE, RED]);
    const square = image(2, [RED, BLUE, BLUE, RED]);
    expect(await drawingHash(wide)).not.toBe(await drawingHash(square));
  });

  it('🎯 Right: a PERMUTATION of the colours is the same drawing, because permuting IS recolouring', async () => {
    // ⚠️ This surprised the author, and it is load-bearing rather than incidental. Indexing by first
    // appearance means [red, blue, blue, red] and [blue, red, red, blue] both reduce to [0,1,1,0]. They are
    // the same picture under palette A = (red, blue) and palette B = (blue, red) — which is a recolouring.
    // 🔴 A hash that told these apart would MISS the variants that swap which colour sits in which role,
    // and that is a large share of what real palette variants do.
    expect(await drawingHash(image(2, [RED, BLUE, BLUE, RED]))).toBe(await drawingHash(image(2, [BLUE, RED, RED, BLUE])));
  });

  it('Boundary: a different arrangement of the same colours is a different drawing', async () => {
    // The distinction that survives: [0,1,1,0] against [0,0,1,1] is a real difference in the picture, and
    // no permutation of two colours turns one into the other.
    expect(await drawingHash(image(2, [RED, BLUE, BLUE, RED]))).not.toBe(await drawingHash(image(2, [RED, RED, BLUE, BLUE])));
  });
});

describe('paletteHash — the same colours, whatever picture they make', () => {
  it('Right: two different drawings built from one set of colours share a palette', async () => {
    const walk = image(2, [RED, BLUE, BLUE, RED]);
    const hurt = image(2, [BLUE, BLUE, RED, RED]);
    expect(await paletteHash(walk)).toBe(await paletteHash(hurt));
  });

  it('🔴 Boundary: one colour different is a different palette', async () => {
    expect(await paletteHash(image(2, [RED, BLUE, BLUE, RED]))).not.toBe(await paletteHash(image(2, [RED, GREEN, GREEN, RED])));
  });

  it('Boundary: a drawing that uses FEWER of the same colours has a different palette', async () => {
    expect(await paletteHash(image(2, [RED, BLUE, BLUE, RED]))).not.toBe(await paletteHash(image(2, [RED, RED, RED, RED])));
  });
});

describe('groupImages — the shape panels 3 and 4 read from', () => {
  it('🎯 Interface: four team colours of one sprite become ONE drawing with four palettes', async () => {
    // ⚠️ The shades start at 40 and not at 0. With `i` from zero the first team's two colours both come out
    // pure black, the drawing collapses to a single index, and the case fails for a reason that has nothing
    // to do with what it is testing. Found by running it.
    const teams = ['blue', 'red', 'purple', 'yellow'].map((name, i) => {
      const primary = [40 + i * 40, 0, 0, 255];
      const secondary = [0, 40 + i * 40, 0, 255];
      return { name, image: image(2, [primary, secondary, secondary, primary]) };
    });
    const { byDrawing, byPalette } = await groupImages(teams);

    expect(byDrawing.size).toBe(1);
    expect([...byDrawing.values()][0]!.map((m) => m.name)).toEqual(['blue', 'red', 'purple', 'yellow']);
    // Same drawing, four different palettes — which is exactly why panel 4 exists.
    expect(byPalette.size).toBe(4);
  });

  it('Interface: sheets of one body become ONE palette holding several drawings', async () => {
    // ⚠️ Three colours, not two. With two colours in four pixels there are too few arrangements: two of the
    // three sheets came out permutations of each other, which the grouping correctly called ONE drawing.
    const sheets = [
      { name: 'walk', image: image(2, [RED, BLUE, GREEN, RED]) }, //     [0,1,2,0]
      { name: 'hurt', image: image(2, [BLUE, RED, GREEN, GREEN]) }, //   [0,1,2,2]
      { name: 'thrust', image: image(2, [GREEN, GREEN, BLUE, RED]) }, // [0,0,1,2]
    ];
    const { byDrawing, byPalette } = await groupImages(sheets);
    expect(byPalette.size).toBe(1);
    expect(byDrawing.size).toBe(3);
  });

  it('Zero: no images at all gives two empty groupings rather than an error', async () => {
    const { byDrawing, byPalette } = await groupImages([]);
    expect(byDrawing.size).toBe(0);
    expect(byPalette.size).toBe(0);
  });
});
