// SPDX-License-Identifier: AGPL-3.0-or-later
//
// IMPORT IS WHERE THE BATCH LIVES (ADR-0134 §3c) — opening a folder at once is what makes a hundred files
// one job, and it is why there is no separate command-line tool.
import { describe, it, expect } from 'vitest';
import { buildPng } from './helpers/build-png.ts';
import { importFiles } from '../src/app/import.ts';
import { NOTHING } from '../src/format/semantic.ts';

/** A 2×1 RGBA sheet from two colours, so a case reads as the picture it is. */
const sheet = (left: number[], right: number[]): Promise<Uint8Array> =>
  buildPng({ width: 2, height: 1, colorType: 6, scanlines: [[0, ...left, ...right]] });

const RED = [200, 40, 40, 255];
const BLUE = [40, 40, 200, 255];
const GREEN = [40, 200, 40, 255];
const CLEAR = [0, 0, 0, 0];

describe('importFiles', () => {
  it('🎯 Right: sheets sharing colours become ONE set, which is the boundary of one semantic file', async () => {
    const { sets } = await importFiles([
      { name: 'walk.png', bytes: await sheet(RED, BLUE) },
      { name: 'hurt.png', bytes: await sheet(BLUE, RED) },
    ]);
    expect(sets).toHaveLength(1);
    expect(sets[0]!.sheets.map((s) => s.name)).toEqual(['walk.png', 'hurt.png']);
  });

  it('Right: sheets with different colours become different sets', async () => {
    const { sets } = await importFiles([
      { name: 'knight.png', bytes: await sheet(RED, BLUE) },
      { name: 'goblin.png', bytes: await sheet(GREEN, CLEAR) },
    ]);
    expect(sets).toHaveLength(2);
  });

  it('🔴 Right: the count is over the WHOLE set, because the annotation covers the set', async () => {
    // Counting per sheet would show a colour as rare in the sheet on screen while it dominates the set the
    // decision actually applies to.
    const { sets } = await importFiles([
      { name: 'a.png', bytes: await sheet(RED, RED) },
      { name: 'b.png', bytes: await sheet(RED, RED) },
    ]);
    const set = sets[0]!;
    expect(set.counts[set.order.indexOf(set.order.find((c) => c !== NOTHING)!)]).toBe(4);
  });

  it('Right: every sheet in a set indexes into the SAME canonical order', async () => {
    const { sets } = await importFiles([
      { name: 'walk.png', bytes: await sheet(RED, BLUE) },
      { name: 'hurt.png', bytes: await sheet(BLUE, RED) },
    ]);
    const [walk, hurt] = sets[0]!.sheets;
    // walk is [red, blue] and hurt is [blue, red], so one grid is the reverse of the other — and would NOT
    // be, if each sheet had numbered its colours by first appearance.
    expect([...walk!.grid]).toEqual([...hurt!.grid].reverse());
  });

  it('Right: the draft annotation is index-aligned with the order and ready to be edited', async () => {
    const { sets } = await importFiles([{ name: 'a.png', bytes: await sheet(RED, CLEAR) }]);
    const set = sets[0]!;
    expect(set.positions).toHaveLength(set.order.length);
    expect(set.positions[set.order.indexOf(NOTHING)]!.region).toBeNull();
  });

  it('🔴 Exercise the exceptional: a file that cannot be read is REFUSED and named, never dropped', async () => {
    // A silently skipped file is the worst outcome here: the person annotates a set that is missing a sheet
    // and nothing on screen says a sheet is missing.
    const { sets, refused } = await importFiles([
      { name: 'good.png', bytes: await sheet(RED, BLUE) },
      { name: 'broken.png', bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) },
    ]);
    expect(sets).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]!.name).toBe('broken.png');
    expect(refused[0]!.why).toMatch(/not a PNG/i);
  });

  it('Zero: importing nothing gives no sets and no refusals, not an error', async () => {
    expect(await importFiles([])).toEqual({ sets: [], refused: [] });
  });
});
