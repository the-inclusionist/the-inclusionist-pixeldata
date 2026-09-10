// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE FILE, AND THE ROUND TRIP THAT IS THE POINT OF IT (ADR-0134 §6).
//
// 🔴 The central case is exact: pixels → semantic file plus palette → recomposed → THE SAME PIXEL. It is
// what catches the two corruptions that fail in silence — colour management and alpha premultiplication —
// and nothing else in the suite would notice either.
//
// The index stored in the grid is the position of a colour in the SET's canonical order, which is the sorted
// colour set. ⚠️ It is NOT the first-appearance order the grouping uses: within a set, `walk` and `hurt`
// meet their colours in different orders, so a first-appearance index would mean a different `colorMap` per
// sheet, and one annotation could not cover the set at all.
import { describe, it, expect } from 'vitest';
import {
  canonicalOrder, gridFor, buildSet, serialiseSet, parseSet, recompose, harvestPalette, packColour, NOTHING,
} from '../src/format/semantic.ts';

function image(width: number, pixels: number[][]): { width: number; height: number; rgba: Uint8Array } {
  return { width, height: pixels.length / width, rgba: Uint8Array.from(pixels.flat()) };
}

const SKIN_DARK = [90, 60, 40, 255];
const SKIN_MID = [150, 110, 80, 255];
const SKIN_LIGHT = [210, 170, 130, 255];
const OUTLINE = [20, 12, 8, 255];
const SHADOW = [0, 0, 0, 90]; // 📏 the partial-alpha case, present in 119 of 197 measured files
const CLEAR = [0, 0, 0, 0];

/** A two-by-three face: outline, three skin levels, a shadow and a hole. */
const FACE = image(2, [OUTLINE, SKIN_LIGHT, SKIN_MID, SKIN_DARK, SHADOW, CLEAR]);

/** One annotation covering it: region 1 is skin at three levels plus an outline, region 2 is the shadow. */
function annotate(order: readonly number[]): { region: number; level: number }[] {
  const meaning = new Map<number, { region: number; level: number }>([
    [packColour(SKIN_DARK), { region: 1, level: 0 }],
    [packColour(SKIN_MID), { region: 1, level: 1 }],
    [packColour(SKIN_LIGHT), { region: 1, level: 2 }],
    [packColour(OUTLINE), { region: 1, level: 3 }],
    [packColour(SHADOW), { region: 2, level: 0 }],
    [NOTHING, { region: 0, level: 0 }],
  ]);
  return order.map((colour) => meaning.get(colour)!);
}

function aSet() {
  const order = canonicalOrder([FACE]);
  return buildSet({
    sheets: [{ name: 'face', image: FACE }],
    order,
    colorMap: annotate(order),
    regions: { 1: 'skin', 2: 'shadow' },
    levels: { 1: { steps: 4, outline: 3 }, 2: { steps: 1, outline: null } },
    palettes: ['face-default'],
    source: {
      author: 'nobody', url: 'https://example.invalid/face.png', door: 'grant',
      licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null,
    },
  });
}

describe('canonicalOrder — one index space for a whole set', () => {
  it('🔴 Right: two sheets sharing a palette get the SAME order, whatever order they meet the colours in', () => {
    const walk = image(2, [SKIN_DARK, SKIN_LIGHT, SKIN_LIGHT, SKIN_DARK]);
    const hurt = image(2, [SKIN_LIGHT, SKIN_DARK, SKIN_DARK, SKIN_LIGHT]);
    // First appearance would number these in opposite directions; the canonical order cannot.
    expect(canonicalOrder([walk])).toEqual(canonicalOrder([hurt]));
  });

  it('Right: it is the union across every sheet, so a colour used by only one is still in it', () => {
    const a = image(1, [SKIN_DARK]);
    const b = image(1, [SKIN_LIGHT]);
    expect(canonicalOrder([a, b])).toHaveLength(2);
  });

  it('Right: nothing sorts before every colour, so index 0 is transparency when there is any', () => {
    expect(canonicalOrder([image(2, [SKIN_DARK, CLEAR])])[0]).toBe(NOTHING);
  });
});

describe('gridFor', () => {
  it('Right: every pixel becomes its index in the canonical order', () => {
    const order = canonicalOrder([FACE]);
    const grid = gridFor(FACE, order);
    expect(grid).toHaveLength(6);
    expect(order[grid[5]!]).toBe(NOTHING); // the last pixel is the hole
  });

  it('Exercise the exceptional: a colour missing from the order is refused, not guessed', () => {
    expect(() => gridFor(FACE, [NOTHING])).toThrow(/not in the set/i);
  });
});

describe('serialise and parse', () => {
  it('Right: a set survives being written and read back', () => {
    const set = aSet();
    const back = parseSet(serialiseSet(set));
    expect(back).toEqual(set);
  });

  it('Right: the text is JSON a person can read, with the grid one line per row of pixels', () => {
    const text = serialiseSet(aSet());
    expect(JSON.parse(text).sheets[0].grid).toHaveLength(3);
    expect(text).toContain('"colorMap"');
  });

  describe('Exercise the exceptional — a file that cannot be trusted is refused', () => {
    it('refuses an unknown schema version rather than reading it hopefully', () => {
      expect(() => parseSet(JSON.stringify({ ...aSet(), schema: 99 }))).toThrow(/schema 99/i);
    });

    it('🔴 refuses two indices meaning the SAME (region, level)', () => {
      // It would make the ramp ambiguous — two source colours claiming one step — and the round trip would
      // silently pick one of them. This is the validation with the most teeth in the file.
      const set = aSet();
      const colorMap = set.colorMap.map((m, i) => (i === 0 ? m : { region: 1, level: 0 }));
      expect(() => parseSet(JSON.stringify({ ...set, colorMap }))).toThrow(/twice|already/i);
    });

    it('refuses a colorMap that does not cover every index the grid uses', () => {
      const set = aSet();
      expect(() => parseSet(JSON.stringify({ ...set, colorMap: set.colorMap.slice(0, 2) }))).toThrow(/index/i);
    });

    it('refuses a region used by the colorMap and absent from the vocabulary', () => {
      const set = aSet();
      const colorMap = set.colorMap.map((m) => (m.region === 2 ? { region: 9, level: 0 } : m));
      expect(() => parseSet(JSON.stringify({ ...set, colorMap }))).toThrow(/region 9/i);
    });
  });
});

describe('🔴 the round trip, pixel for pixel', () => {
  it('THE CENTRAL CASE: annotate, write, read, recompose — and the pixels are identical', () => {
    const set = aSet();
    const order = canonicalOrder([FACE]);
    const palette = harvestPalette(set, order, 'source');

    const back = parseSet(serialiseSet(set));
    const pixels = recompose(back, 'face', palette, 'source');

    expect([...pixels]).toEqual([...FACE.rgba]);
  });

  it('🔴 partial alpha survives the whole journey', () => {
    // 📏 119 of 197 measured files carry it. Premultiplying or flattening anywhere along this path would
    // change the shadow and nothing would report an error.
    const set = aSet();
    const order = canonicalOrder([FACE]);
    const pixels = recompose(set, 'face', harvestPalette(set, order, 'source'), 'source');
    expect([...pixels.slice(16, 20)]).toEqual(SHADOW);
  });

  it('🎯 THE POINT OF THE WHOLE THING: skin can change while the shadow does not', () => {
    // ⚠️ This case is what proved a single global variant name wrong. Choosing one variant for the resource
    // means everything recolours together, and «light skin with a red shirt» cannot be expressed — which
    // empties the palette dictionary of its purpose. The choice is PER REGION.
    const set = aSet();
    const order = canonicalOrder([FACE]);
    const palette = harvestPalette(set, order, 'source');
    const withGreen = {
      ...palette,
      regions: {
        ...palette.regions,
        1: {
          variants: {
            ...palette.regions['1']!.variants,
            green: ['#003300ff', '#006600ff', '#00aa00ff', '#001100ff'],
          },
        },
      },
    };

    const pixels = recompose(set, 'face', withGreen, { 1: 'green', 2: 'source' });
    expect([...pixels.slice(0, 4)]).toEqual([0, 17, 0, 255]); // the outline, region 1 level 3, now green
    expect([...pixels.slice(16, 20)]).toEqual(SHADOW); // region 2 kept its own variant, so it did not move
    expect([...pixels.slice(20, 24)]).toEqual(CLEAR); // and nothing stays nothing
  });

  it('Exercise the exceptional: a region the choice does not mention is refused, not defaulted', () => {
    const set = aSet();
    const palette = harvestPalette(set, canonicalOrder([FACE]), 'source');
    expect(() => recompose(set, 'face', palette, { 1: 'source' })).toThrow(/no variant was chosen for region 2/);
  });

  it('🔴 THE ONE THING THE ROUND TRIP DOES NOT PRESERVE, and it is a trade rather than a bug', () => {
    // A fully transparent pixel can still carry RGB in the file. 📏 Measured across the 197-file sample:
    // 12 560 such pixels out of 41 512 960. The format collapses them all to one absence, so they come back
    // as zeroes — the image is identical, the bytes are not.
    //
    // 🎯 THE TRADE IS THE MECHANISM ITSELF. Without the collapse, two files identical to the eye get
    // different index grids because one stored white-at-zero-alpha where the other stored black, and the
    // variant harvest — the thing that turns 34 annotations into 100 files — finds nothing.
    //
    // ⚠️ IT WOULD MATTER UNDER BILINEAR FILTERING OR MIPMAPS, which sample transparent texels and bleed
    // their colour into visible edges. It does not matter here because this art renders NEAREST by mandate,
    // and that is a CONDITION rather than a coincidence: written down so it is checked if it ever changes.
    const hidden = image(2, [[158, 116, 102, 0], SKIN_DARK]);
    const order = canonicalOrder([hidden]);
    const map = order.map((colour) => (colour === NOTHING ? { region: 0, level: 0 } : { region: 1, level: 0 }));
    const set = buildSet({
      sheets: [{ name: 'hidden', image: hidden }],
      order, colorMap: map,
      regions: { 1: 'skin' }, levels: { 1: { steps: 1, outline: null } }, palettes: [],
      source: { author: 'x', url: 'x', door: 'grant', licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null },
    });
    const back = recompose(set, 'hidden', harvestPalette(set, order, 'source'), 'source');

    expect([...back.slice(0, 4)]).toEqual([0, 0, 0, 0]); // the hidden RGB is gone
    expect([...back.slice(4, 8)]).toEqual(SKIN_DARK); // and every visible pixel is untouched
  });

  it('Exercise the exceptional: recomposing with a palette that lacks a region is refused', () => {
    const set = aSet();
    const bare = { schema: 1 as const, name: 'bare', regions: {} };
    expect(() => recompose(set, 'face', bare, 'source')).toThrow(/region 1/i);
  });

  it('Exercise the exceptional: asking for a sheet the set does not hold is refused', () => {
    const set = aSet();
    expect(() => recompose(set, 'nope', harvestPalette(set, canonicalOrder([FACE]), 'source'), 'source')).toThrow(/nope/);
  });
});
