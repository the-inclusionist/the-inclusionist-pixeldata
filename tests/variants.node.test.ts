// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANEL 4 — THE MECHANISM THAT PAYS FOR THE WHOLE TOOL.
//
// 📏 34 groups of «same drawing, different palettes» covering 100 of 197 measured CC0 files: every troop and
// building in four team colours, buttons in two, ribbons in three. One annotation, ninety-nine readings.
//
// 🔴 The case that matters most here is the RECOLOUR one: harvest a variant's palette, recompose the
// annotated sheet with it, and get the variant back pixel for pixel. If that holds, the correspondence is
// real; if it does not, the tool is quietly producing wrong art.
import { describe, it, expect } from 'vitest';
import { buildPng } from './helpers/build-png.ts';
import { importFiles } from '../src/app/import.ts';
import { variantsFor, harvestFromVariant, variantName } from '../src/app/variants.ts';
import { toSemanticSet } from '../src/app/save.ts';
import { recompose, parseSet, serialiseSet } from '../src/format/semantic.ts';

const SOURCE = {
  author: 'Pixel Frog', url: 'https://example.invalid', door: 'licence',
  licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null,
};

/** A 2×2 drawing — top-left and bottom-right are `a`, the others `b` — in whatever two colours are given. */
const team = (a: number[], b: number[]): Promise<Uint8Array> =>
  buildPng({ width: 2, height: 2, colorType: 6, scanlines: [[0, ...a, ...b], [0, ...b, ...a]] });

const BLUE = [[40, 40, 200, 255], [20, 20, 110, 255]];
const RED = [[200, 40, 40, 255], [110, 20, 20, 255]];
const OTHER_SHAPE = [[9, 9, 9, 255], [7, 7, 7, 255]];

async function twoTeams() {
  const { sets } = await importFiles([
    { name: 'warrior-blue.png', bytes: await team(BLUE[0]!, BLUE[1]!) },
    { name: 'warrior-red.png', bytes: await team(RED[0]!, RED[1]!) },
  ]);
  return { imported: { sets, refused: [] }, blue: sets[0]!, red: sets[1]! };
}

describe('variantsFor', () => {
  it('🎯 Right: the same drawing in another palette is found, and it is found ELSEWHERE', () => {
    // A file sharing this set's palette would already be IN this set, so a variant is by definition in
    // another one. Looking only inside the current set would find nothing, ever.
    return twoTeams().then(({ imported, blue }) => {
      const variants = variantsFor(imported, blue);
      expect(variants.map((v) => v.name)).toEqual(['warrior-red.png']);
      expect(variants[0]!.matches.name).toBe('warrior-blue.png');
    });
  });

  it('Boundary: a different drawing is not a variant, however close its colours', async () => {
    const { sets } = await importFiles([
      { name: 'warrior.png', bytes: await team(BLUE[0]!, BLUE[1]!) },
      { name: 'shield.png', bytes: await buildPng({ width: 2, height: 2, colorType: 6, scanlines: [[0, ...OTHER_SHAPE[0]!, ...OTHER_SHAPE[0]!], [0, ...OTHER_SHAPE[1]!, ...OTHER_SHAPE[0]!]] }) },
    ]);
    expect(variantsFor({ sets, refused: [] }, sets[0]!)).toEqual([]);
  });

  it('Zero: one set on its own has no variants, and that is not an error', async () => {
    const { sets } = await importFiles([{ name: 'alone.png', bytes: await team(BLUE[0]!, BLUE[1]!) }]);
    expect(variantsFor({ sets, refused: [] }, sets[0]!)).toEqual([]);
  });
});

describe('harvestFromVariant', () => {
  it('Right: it produces a ramp per region, named after the file it came from', async () => {
    const { imported, blue } = await twoTeams();
    const { palette, missing } = harvestFromVariant(blue, variantsFor(imported, blue)[0]!, 'warrior.red');
    expect(palette.name).toBe('warrior.red');
    expect(missing).toEqual([]);
    expect(Object.keys(palette.regions)).toEqual(['1']);
  });

  it('🔴 THE CASE THAT PROVES THE CORRESPONDENCE: recolouring with the harvest gives the variant back, exactly', async () => {
    const { imported, blue } = await twoTeams();
    const variant = variantsFor(imported, blue)[0]!;
    const { palette } = harvestFromVariant(blue, variant, 'warrior.red');

    const set = parseSet(serialiseSet(toSemanticSet({ name: 'warrior', set: blue, source: SOURCE })));
    const painted = recompose(set, 'warrior-blue.png', palette, 'warrior.red');

    expect([...painted]).toEqual([...variant.image.rgba]);
  });

  it('🔴 Exercise the exceptional: a variant whose drawing does not match is REFUSED', async () => {
    // The whole correspondence rests on the two index grids being identical. Taking colours across a
    // mismatch produces a palette that looks plausible and recolours the art wrongly, with nothing to say
    // that it did.
    const { imported, blue } = await twoTeams();
    const wrong = { ...variantsFor(imported, blue)[0]!, image: { width: 2, height: 2, rgba: new Uint8Array(16) } };
    expect(() => harvestFromVariant(blue, wrong, 'x')).toThrow(/not the same drawing/i);
  });

  it('Boundary: a step the correspondence cannot reach is REPORTED, never filled with a guess', async () => {
    const { imported, blue } = await twoTeams();
    const variant = variantsFor(imported, blue)[0]!;
    // A set that knows a colour the MATCHED sheet never uses — as happens when another sheet of the set
    // brings its own. The correspondence runs through the matched sheet, so it has nothing to say about
    // that step, and inventing one would put a wrong colour in a ramp with no way to notice.
    const widened = {
      ...blue,
      order: [...blue.order, 0x11223344],
      colorMap: [...blue.colorMap, { region: 1, level: 9 }],
    };

    const { missing } = harvestFromVariant(widened, variant, 'warrior.red');
    expect(missing).toEqual([{ region: 1, level: 9 }]);
  });
});

describe('variantName', () => {
  it('Right: it reads like the file it came from, not like a number', () => {
    expect(variantName('warrior', 'Warrior_Red.png')).toBe('warrior.red');
    expect(variantName('warrior', 'warrior-yellow.png')).toBe('warrior.yellow');
  });

  it('Boundary: a name with no separator uses the whole thing rather than nothing', () => {
    expect(variantName('tile', 'moss.png')).toBe('tile.moss');
  });
});
