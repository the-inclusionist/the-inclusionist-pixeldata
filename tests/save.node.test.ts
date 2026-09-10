// SPDX-License-Identifier: AGPL-3.0-or-later
//
// WHAT COMES OUT, AND WHETHER IT CAN COME BACK.
//
// 🔴 `annotationProblem` is the surface that matters here: it takes the annotation the long way round —
// written, read back, recomposed — so a mistake is found while the person is still looking at it, instead
// of on the day a game renders their art wrong.
import { describe, it, expect } from 'vitest';
import { buildPng } from './helpers/build-png.ts';
import { importFiles, type SetView } from '../src/app/import.ts';
import {
  defaultSetName, levelsOf, buildOutputs, annotationProblem, recomposedPixels, difference, nonMonotonicRamps, type Draft,
} from '../src/app/save.ts';
import { parseSet } from '../src/format/semantic.ts';

const SOURCE = {
  author: 'Pixel Frog', url: 'https://pixelfrog-assets.itch.io/tiny-swords', door: 'licence',
  licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null,
};

const RED = [200, 40, 40, 255];
const BLUE = [40, 40, 200, 255];
const SHADOW = [0, 0, 0, 90];

async function aDraft(): Promise<{ draft: Draft; set: SetView }> {
  const bytes = await buildPng({
    width: 2, height: 2, colorType: 6,
    scanlines: [[0, ...RED, ...BLUE], [0, ...SHADOW, 0, 0, 0, 0]],
  });
  const { sets } = await importFiles([{ name: 'knight-walk.png', bytes }]);
  const set = sets[0]!;
  return { draft: { name: 'knight', set, source: SOURCE }, set };
}

describe('defaultSetName', () => {
  it('Right: it is what the sheets have in common, because that is what a person recognises', () => {
    expect(defaultSetName(['warrior-walk.png', 'warrior-hurt.png', 'warrior-thrust.png'])).toBe('warrior');
  });

  it('Boundary: with nothing in common it falls back to the first sheet, never to a number', () => {
    // "set-1" in a file listing tells a person nothing about which set it is.
    expect(defaultSetName(['castle.png', 'bridge.png'])).toBe('castle');
  });

  it('Boundary: a one-letter common prefix is an accident, not a name', () => {
    expect(defaultSetName(['warrior.png', 'wizard.png'])).toBe('warrior');
  });

  it('Zero: no sheets at all still gives a usable name', () => {
    expect(defaultSetName([])).toBe('set');
  });
});

describe('levelsOf', () => {
  it('Right: a ramp is as long as the highest level a colour claims, and it is DERIVED', () => {
    const set = { colorMap: [{ region: 0, level: 0 }, { region: 1, level: 0 }, { region: 1, level: 3 }] } as SetView;
    expect(levelsOf(set)['1']!.steps).toBe(4);
  });

  it('🔴 Right: outline stays null until a person marks one — it is never guessed', () => {
    // "The darkest step is the outline" is right often enough to be trusted and wrong often enough to
    // matter: a metal outline is not the darkest metal, and nothing downstream could tell a guess from a
    // decision.
    const set = { colorMap: [{ region: 1, level: 0 }, { region: 1, level: 1 }] } as SetView;
    expect(levelsOf(set)['1']!.outline).toBeNull();
  });
});

describe('buildOutputs', () => {
  it('Right: two files come out, and the set file lists the variants the palette file holds', async () => {
    const { draft } = await aDraft();
    const files = buildOutputs(draft);
    expect(files.map((f) => f.name)).toEqual(['knight.semantic.json', 'knight.palette.json']);
    expect(parseSet(files[0]!.text).palettes).toEqual(['source']);
    expect(JSON.parse(files[1]!.text).name).toBe('knight');
  });

  it('🎯 Right: harvested variants join the SAME palette file rather than each getting one', async () => {
    // The format is `region → variants → ramp`, so a variant IS a variant entry. Writing one file per
    // variant would split a structure that is already exactly the right shape, and leave a game loading
    // four files to offer four team colours.
    const { draft } = await aDraft();
    const red = {
      schema: 1 as const, name: 'red',
      regions: { 1: { variants: { red: ['#ff0000ff', '#880000ff'] } } },
    };
    const files = buildOutputs({ ...draft, harvested: [red] });
    expect(files).toHaveLength(2);
    expect(parseSet(files[0]!.text).palettes).toEqual(['source', 'red']);
    expect(Object.keys(JSON.parse(files[1]!.text).regions['1'].variants)).toEqual(['source', 'red']);
  });

  it('Right: the set file is valid on its own terms — it survives the reader that will read it', async () => {
    const { draft } = await aDraft();
    expect(() => parseSet(buildOutputs(draft)[0]!.text)).not.toThrow();
  });
});

describe('🔴 annotationProblem — the check that runs before anything is drawn', () => {
  it('Right: the suggested annotation is sound as it arrives', async () => {
    const { draft } = await aDraft();
    expect(annotationProblem(draft)).toBeNull();
  });

  it('🔴 Boundary: two colours claiming the same (region, level) is named, not silently resolved', async () => {
    // Without this the ramp is ambiguous and recomposition takes whichever came last. The person finds out
    // when a game renders their art wrong, which is the worst possible moment and the hardest to trace.
    const { draft, set } = await aDraft();
    const opaque = set.colorMap.map((m) => (m.region === 0 ? m : { region: 1, level: 0 }));
    set.colorMap.splice(0, set.colorMap.length, ...opaque);
    expect(annotationProblem(draft)).toMatch(/claimed twice/i);
  });

  it('Boundary: a region used but never named is named as the problem', async () => {
    const { draft, set } = await aDraft();
    set.colorMap[set.colorMap.findIndex((m) => m.region !== 0)] = { region: 7, level: 0 };
    expect(annotationProblem(draft)).toMatch(/region 7/);
  });
});

describe('🔴 the round trip, from the surface a person actually touches', () => {
  it('THE CENTRAL CASE: what comes back out of the FILE is the image that went in', async () => {
    const { draft, set } = await aDraft();
    const back = recomposedPixels(draft, 'knight-walk.png');
    // Compared visually: RGB hidden under alpha 0 is not preserved, and `docs/FORMAT.md` says why.
    for (let p = 0; p < set.sheets[0]!.image.width * set.sheets[0]!.image.height; p++) {
      const d = p * 4;
      const original = set.sheets[0]!.image.rgba;
      if (original[d + 3] === 0) { expect(back[d + 3]).toBe(0); continue; }
      expect([...back.slice(d, d + 4)]).toEqual([...original.slice(d, d + 4)]);
    }
  });

  it('Right: the difference of an image with itself is empty', async () => {
    const { draft, set } = await aDraft();
    const back = recomposedPixels(draft, 'knight-walk.png');
    expect(difference(back, back).differing).toBe(0);
    expect(difference(back, set.sheets[0]!.image.rgba).differing).toBe(0);
  });

  it('Right: where two images disagree it lights up, and it says how many pixels', () => {
    const a = Uint8Array.from([1, 2, 3, 255, 9, 9, 9, 255]);
    const b = Uint8Array.from([1, 2, 3, 255, 8, 9, 9, 255]);
    const { pixels, differing } = difference(a, b);
    expect(differing).toBe(1);
    expect([...pixels.slice(0, 4)]).toEqual([0, 0, 0, 0]); // agreeing pixels stay out of the way
    expect([...pixels.slice(4, 8)]).toEqual([255, 0, 255, 255]);
  });
});

describe('🔴 nonMonotonicRamps — warns, and does not refuse', () => {
  const ramp = (variant: string, colours: string[]) => ({
    schema: 1 as const, name: 'p', regions: { 1: { variants: { [variant]: colours } } },
  });

  it('Right: a ramp that climbs shadow-to-light says nothing', () => {
    expect(nonMonotonicRamps(ramp('source', ['#111111ff', '#888888ff', '#eeeeeeff']), 'source')).toEqual([]);
  });

  it('🔴 Right: a step that goes DOWN is reported, with the region and where', () => {
    // Two levels swapped recolours the art with its shading inverted. It looks wrong and it does not fail,
    // which is why something has to say it out loud.
    expect(nonMonotonicRamps(ramp('source', ['#111111ff', '#eeeeeeff', '#888888ff']), 'source'))
      .toEqual([{ region: '1', at: 2 }]);
  });

  it('🔴 Boundary: a FLAT ramp is legitimate and says nothing', () => {
    // A single-colour material, or a shadow at one alpha. Refusing here would reject correct art, which is
    // why this warns instead of gating.
    expect(nonMonotonicRamps(ramp('source', ['#444444ff', '#444444ff']), 'source')).toEqual([]);
  });

  it('Boundary: a variant the palette does not hold is skipped rather than blamed', () => {
    expect(nonMonotonicRamps(ramp('source', ['#111111ff']), 'red')).toEqual([]);
  });
});
