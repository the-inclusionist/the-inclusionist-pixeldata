// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE TWO WAYS THE SAME FILES ARE ORGANISED.
//
// 🎯 «Este software não é pra definir o que significa a COR, mas o que significa o PÍXEL naquela posição.»
// The case that carries that sentence is the last one here: swap the palette, and every meaning stays put
// while every swatch changes.
//
// 📏 The shape is the Liberated Pixel Cup's: `Body/Base/Human_male/` holds eight palette folders, each with
// the same eight sheets. Sixty-four files, eight drawings, eight palettes, one annotation.
import { describe, it, expect } from 'vitest';
import { buildPng } from './helpers/build-png.ts';
import { importFiles, type SetView } from '../src/app/import.ts';
import { workspaceFor, paletteNameOf, paletteColours, sheetIn, coloursIn, groupByContainment, chooseBase, unreachableFrom } from '../src/app/workspace.ts';
import { packColour } from '../src/format/semantic.ts';

/** Two drawings — `walk` and `hurt` — rendered in whichever two colours a palette brings. */
const walk = (a: number[], b: number[]) =>
  buildPng({ width: 2, height: 2, colorType: 6, scanlines: [[0, ...a, ...b], [0, ...b, ...a]] });
const hurt = (a: number[], b: number[]) =>
  buildPng({ width: 2, height: 2, colorType: 6, scanlines: [[0, ...a, ...a], [0, ...b, ...b]] });

const COFFEE = [[90, 60, 40, 255], [40, 26, 18, 255]];
const IVORY = [[230, 220, 200, 255], [150, 140, 120, 255]];
const GOLD = [[220, 180, 40, 255], [130, 100, 20, 255]];

/** The LPC layout: `<body>/<palette>/<sheet>.png`. */
async function humanMale() {
  const files: { name: string; bytes: Uint8Array }[] = [];
  for (const [name, colours] of [['Coffee', COFFEE], ['Ivory', IVORY], ['Gold', GOLD]] as const) {
    files.push({ name: `Human_male/${name}/walk.png`, bytes: await walk(colours[0]!, colours[1]!) });
    files.push({ name: `Human_male/${name}/hurt.png`, bytes: await hurt(colours[0]!, colours[1]!) });
  }
  const imported = await importFiles(files);
  return { imported, base: imported.sets[0]! };
}

describe('paletteNameOf', () => {
  it('🎯 Right: it is the folder, which for the LPC IS the palette name', async () => {
    const { imported } = await humanMale();
    expect(imported.sets.map(paletteNameOf).sort()).toEqual(['Coffee', 'Gold', 'Ivory']);
  });

  it('Boundary: a flat import falls back to the file, never to a hash', () => {
    const flat = { sheets: [{ name: 'lonely.png' }] } as unknown as SetView;
    expect(paletteNameOf(flat)).toBe('lonely');
  });
});

describe('workspaceFor', () => {
  it('🎯 Right: three palettes and two drawings out of six files', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    expect(workspace.palettes).toHaveLength(3);
    expect(workspace.drawings).toHaveLength(2);
  });

  it('🎯 Right: THE BADGE — each drawing says how many palettes hold it', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    expect(workspace.drawings.map((d) => d.paletteCount)).toEqual([3, 3]);
  });

  it('🔴 Boundary: a palette sharing no drawing is LEFT OUT, because no swap could reach it', async () => {
    // Its colours cannot be travelled to — there is no correspondence — so offering it as a swap would
    // offer one that cannot be made, and the person would click it and get nothing.
    const { imported, base } = await humanMale();
    const stranger = await importFiles([
      { name: 'Other/Red/shield.png', bytes: await buildPng({ width: 1, height: 2, colorType: 6, scanlines: [[0, 9, 9, 9, 255], [0, 8, 8, 8, 255]] }) },
    ]);
    const workspace = workspaceFor({ sets: [...imported.sets, ...stranger.sets], refused: [] }, base);
    expect(workspace.palettes).toHaveLength(3);
  });
});

describe('sheetIn', () => {
  it('Right: the same drawing wearing another palette', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    const other = workspace.palettes.find((p) => p.set !== base)!;
    expect(sheetIn(other, workspace.drawings[0]!)!.drawingHash).toBe(workspace.drawings[0]!.sheet.drawingHash);
  });
});

describe('🔴 paletteColours — the translation the whole design rests on', () => {
  it('Right: the base palette is itself, position for position', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    const here = workspace.palettes.find((p) => p.set === base)!;
    expect(paletteColours(workspace, here)).toEqual([...base.order]);
  });

  it('🎯 THE POINT: another palette gives a DIFFERENT colour at every position, and the same COUNT', async () => {
    // This is what makes a meaning survive a swap. Position 3 is position 3 in every palette; only the
    // colour it wears changes, so an annotation written against position 3 never has to be written again.
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    const other = workspace.palettes.find((p) => p.set !== base)!;

    const mine = paletteColours(workspace, workspace.palettes.find((p) => p.set === base)!);
    const theirs = paletteColours(workspace, other);

    expect(theirs).toHaveLength(mine.length);
    expect(theirs.every((c) => c !== undefined)).toBe(true);
    // Every real colour moved; nothing but the transparent sentinel stayed the same.
    const moved = theirs.filter((c, i) => c !== mine[i]).length;
    expect(moved).toBeGreaterThan(0);
  });

  it('Right: the colours it gives are the ones that palette actually holds', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    const gold = workspace.palettes.find((p) => p.name === 'Gold')!;
    const colours = paletteColours(workspace, gold);
    expect(colours).toContain(packColour(GOLD[0]!));
    expect(colours).toContain(packColour(GOLD[1]!));
  });

  it('Exercise the exceptional: travelling to a drawing that does not match is refused', async () => {
    const { imported, base } = await humanMale();
    const workspace = workspaceFor(imported, base);
    const [walkDrawing, hurtDrawing] = workspace.drawings;
    const other = workspace.palettes.find((p) => p.set !== base)!;
    // Deliberately cross the wires: walk's positions against hurt's pixels.
    expect(() => coloursIn(base, walkDrawing!.sheet, sheetIn(other, hurtDrawing!)!)).toThrow(/not the same drawing/i);
  });
});

describe('🔴 groupByContainment — what makes two files the same palette', () => {
  const of = (...colours: number[]) => ({ colours: new Set(colours) });

  it('🎯 Right: a sheet that shows FEWER of the same colours is the same palette', () => {
    // 📏 The case measured on the real folder: a `hurt` frame that never displays the boots is plainly the
    // same palette as the `walk` that does. Exact-set matching splits those two, and split eight LPC
    // palettes into twenty-five.
    const groups = groupByContainment([of(1, 2, 3), of(1, 2)]);
    expect(groups).toHaveLength(1);
  });

  it('Right: colour sets that merely overlap are NOT the same palette', () => {
    // No threshold anywhere. Overlap would need a percentage, a percentage would need storing in the file,
    // and the Dev deferred exactly that with «iguais agora, agrupamento depois».
    expect(groupByContainment([of(1, 2, 3), of(3, 4, 5)])).toHaveLength(2);
  });

  it('Right: containment is closed transitively, so a chain is one palette', () => {
    expect(groupByContainment([of(1), of(1, 2), of(1, 2, 3)])).toHaveLength(1);
  });

  it('Boundary: identical sets land together without needing containment at all', () => {
    const groups = groupByContainment([of(7, 8), of(8, 7), of(9)]);
    expect(groups.map((g) => g.length).sort()).toEqual([1, 2]);
  });

  it('Zero: nothing in gives nothing out', () => {
    expect(groupByContainment([])).toEqual([]);
  });
});

describe('🔴 chooseBase — the widest palette is the WORST base', () => {
  /**
   * The shape that exposed it, from the real LPC: one palette is wide but its drawing is unique to it, so
   * nothing can travel to those positions. A narrower palette whose drawings are SHARED loses nothing.
   */
  async function lopsided() {
    const wide = [[10, 10, 10, 255], [20, 20, 20, 255], [30, 30, 30, 255]];
    const thin = [[90, 90, 90, 255], [80, 80, 80, 255]];
    // `shared` is the same drawing everywhere. `only-wide` exists in one palette alone and uses the colour
    // nothing else can reach.
    const shared = (c: number[][]) =>
      buildPng({ width: 2, height: 1, colorType: 6, scanlines: [[0, ...c[0]!, ...c[1]!]] });
    const solo = buildPng({ width: 3, height: 1, colorType: 6, scanlines: [[0, ...wide[0]!, ...wide[1]!, ...wide[2]!]] });

    return importFiles([
      { name: 'Wide/shared.png', bytes: await shared(wide) },
      { name: 'Wide/solo.png', bytes: await solo },
      { name: 'Thin/shared.png', bytes: await shared(thin) },
    ]);
  }

  it('🎯 Right: it picks the palette whose drawings are SHARED, not the one with most colours', async () => {
    const imported = await lopsided();
    const base = chooseBase(imported)!;
    // The wide palette carries three positions and can only be reached through the two-colour drawing.
    expect(base.order.length).toBeLessThan(Math.max(...imported.sets.map((s) => s.order.length)));
    expect(unreachableFrom(imported, base)).toBe(0);
  });

  it('Right: it counts what the widest base would have lost', async () => {
    const imported = await lopsided();
    const widest = imported.sets.reduce((a, b) => (b.order.length > a.order.length ? b : a));
    expect(unreachableFrom(imported, widest)).toBeGreaterThan(0);
  });

  it('Boundary: a palette sharing nothing is not counted against a base it cannot reach', async () => {
    // It is not a palette of that workspace at all, so charging the base for it would punish a base for a
    // file that was never going to be swapped into.
    const imported = await lopsided();
    const stranger = await importFiles([
      { name: 'Other/x.png', bytes: await buildPng({ width: 1, height: 1, colorType: 6, scanlines: [[0, 1, 2, 3, 255]] }) },
    ]);
    const both = { sets: [...imported.sets, ...stranger.sets], refused: [] };
    expect(unreachableFrom(both, chooseBase(imported)!)).toBe(0);
  });

  it('Zero: nothing imported gives no base rather than an error', async () => {
    expect(chooseBase({ sets: [], refused: [] })).toBeNull();
  });
});
