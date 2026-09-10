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
import { workspaceFor, paletteNameOf, paletteColours, sheetIn, coloursIn, groupByContainment, chooseBase, unreachableFrom, filesCovered, workspacesIn } from '../src/app/workspace.ts';
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

  it('🎯 Right: it takes the base that describes the most FILES, even at the cost of some positions', async () => {
    // The wide palette covers three files — including `solo.png`, which exists nowhere else — while the
    // thin one covers two and could never describe `solo.png` at all. Losing a few positions on a swap is
    // the right price for keeping a whole file in scope, and the loss-minimising rule could not weigh that.
    const imported = await lopsided();
    const base = chooseBase(imported)!;
    expect(filesCovered(imported, base)).toBe(3);
    expect(unreachableFrom(imported, base)).toBeGreaterThan(0); // and that is accepted, not avoided
  });

  it('Right: the loss is still counted, and still reported', async () => {
    const imported = await lopsided();
    const widest = imported.sets.reduce((a, b) => (b.order.length > a.order.length ? b : a));
    expect(unreachableFrom(imported, widest)).toBeGreaterThan(0);
  });

  it('Boundary: a palette sharing nothing does not change what a base is charged', async () => {
    // It is not in that workspace at all, so it must not move the number either way — charging a base for a
    // file that was never going to be swapped into would make an unrelated import change the choice.
    const imported = await lopsided();
    const stranger = await importFiles([
      { name: 'Other/x.png', bytes: await buildPng({ width: 1, height: 1, colorType: 6, scanlines: [[0, 1, 2, 3, 255]] }) },
    ]);
    const base = chooseBase(imported)!;
    const both = { sets: [...imported.sets, ...stranger.sets], refused: [] };
    expect(unreachableFrom(both, base)).toBe(unreachableFrom(imported, base));
  });

  it('Zero: nothing imported gives no base rather than an error', async () => {
    expect(chooseBase({ sets: [], refused: [] })).toBeNull();
  });
});

describe('🔴 filesCovered and workspacesIn — an import is not one workspace', () => {
  /**
   * 📏 The shape measured on the LPC's `Body/Base`: 269 files that partition into ELEVEN groups nothing can
   * travel between. Here it is in miniature — a big family of palettes, and a loner nobody shares with.
   */
  async function twoFamilies() {
    const shape = (a: number[], b: number[]) =>
      buildPng({ width: 2, height: 1, colorType: 6, scanlines: [[0, ...a, ...b]] });
    const other = (a: number[], b: number[]) =>
      buildPng({ width: 2, height: 1, colorType: 6, scanlines: [[0, ...b, ...a]] });

    const files: { name: string; bytes: Uint8Array }[] = [];
    for (const [name, c] of [['Coffee', COFFEE], ['Ivory', IVORY], ['Gold', GOLD]] as const) {
      files.push({ name: `Human/${name}/walk.png`, bytes: await shape(c[0]!, c[1]!) });
      files.push({ name: `Human/${name}/hurt.png`, bytes: await other(c[0]!, c[1]!) });
    }
    // A lone body: many colours, shared with nobody. It is the shape that broke the old rule.
    files.push({
      name: 'Skeleton/Bone/walk.png',
      bytes: await buildPng({
        width: 4, height: 1, colorType: 6,
        scanlines: [[0, 1, 1, 1, 255, 2, 2, 2, 255, 3, 3, 3, 255, 4, 4, 4, 255]],
      }),
    });
    return importFiles(files);
  }

  it('🔴 Right: an isolated palette covers only ITSELF, however wide it is', async () => {
    const imported = await twoFamilies();
    const lone = imported.sets.find((s) => s.sheets[0]!.name.startsWith('Skeleton'))!;
    expect(filesCovered(imported, lone)).toBe(1);
    expect(unreachableFrom(imported, lone)).toBe(0); // ⚠️ zero, and it means NOTHING TO LOSE
  });

  it('🎯 Right: chooseBase takes the one describing the most FILES, not the one losing least', async () => {
    // The old rule picked the loner because its loss was zero. Counting files cannot be gamed by having
    // nothing to lose: an isolated palette covers one file, and the family covers six.
    const imported = await twoFamilies();
    const base = chooseBase(imported)!;
    expect(base.sheets[0]!.name.startsWith('Human')).toBe(true);
    expect(filesCovered(imported, base)).toBeGreaterThan(1);
  });

  it('🔴 Right: the import partitions into workspaces, biggest first', async () => {
    const imported = await twoFamilies();
    const spaces = workspacesIn(imported);
    expect(spaces.length).toBeGreaterThanOrEqual(2);
    expect(spaces[0]!.files).toBeGreaterThan(spaces[spaces.length - 1]!.files);
    // Showing only the first and saying nothing is how an import looks smaller than it is.
    expect(spaces.reduce((n, w) => n + w.files, 0)).toBe(7);
  });

  it('Right: every workspace carries how many files it covers', async () => {
    const spaces = workspacesIn(await twoFamilies());
    expect(spaces.every((w) => w.files >= 1)).toBe(true);
  });

  it('Zero: nothing imported gives no workspaces rather than an error', () => {
    expect(workspacesIn({ sets: [], refused: [] })).toEqual([]);
  });
});
