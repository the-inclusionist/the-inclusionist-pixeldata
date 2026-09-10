// SPDX-License-Identifier: AGPL-3.0-or-later
//
// TURNING A SET ON SCREEN INTO THE FILES ON DISK.
//
// Everything here is arithmetic and string-building, so it is proved in Node. What the browser adds is only
// the file picker, which is why that lives in `main.ts` and nothing else does.
//
// 🎯 The set file and the palette file come out TOGETHER and are consistent by construction: the palette is
// harvested from the same canonical order the grid was written against, so the round trip holds without
// anybody having to keep two files in step by hand.
import {
  buildSet, serialiseSet, parseSet, harvestPalette, recompose,
  type Provenance, type SemanticSet, type Palette, type LevelSpec,
} from '../format/semantic.ts';
import type { SetView } from './import.ts';

/** The name a variant harvested from the set's own colours goes by. */
export const SOURCE_VARIANT = 'source';

export interface OutputFile {
  readonly name: string;
  readonly text: string;
}

/**
 * A default name for the set, from what its sheets have in common.
 *
 * ⚠️ It falls back to the first sheet's base name rather than to something like «set-1». A set is identified
 * by a person reading a file listing, and a number tells them nothing about which one it is.
 */
export function defaultSetName(sheetNames: readonly string[]): string {
  const bases = sheetNames.map((n) => n.replace(/\.[^.]+$/, ''));
  if (bases.length === 0) return 'set';
  let prefix = bases[0]!;
  for (const base of bases.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < base.length && prefix[i] === base[i]) i++;
    prefix = prefix.slice(0, i);
  }
  const trimmed = prefix.replace(/[-_\s]+$/, '');
  return trimmed.length >= 2 ? trimmed : bases[0]!;
}

/** How many steps each region's ramp has, and which step is its outline. Derived, never asked for. */
export function levelsOf(set: SetView): Record<string, LevelSpec> {
  const steps: Record<string, number> = {};
  for (const meaning of set.colorMap) {
    if (meaning.region === 0) continue;
    const key = String(meaning.region);
    steps[key] = Math.max(steps[key] ?? 0, meaning.level + 1);
  }
  // ⚠️ `outline` is null everywhere until a person marks one. Guessing «the darkest step is the outline»
  // would be right often enough to be trusted and wrong often enough to matter — a metal outline is not the
  // darkest metal, and nothing downstream could tell the guess from a decision.
  return Object.fromEntries(Object.entries(steps).map(([id, count]) => [id, { steps: count, outline: null }]));
}

export interface Draft {
  readonly name: string;
  readonly set: SetView;
  readonly source: Provenance;
}

export function toSemanticSet(draft: Draft): SemanticSet {
  return buildSet({
    sheets: draft.set.sheets.map((sheet) => ({ name: sheet.name, image: sheet.image })),
    order: draft.set.order,
    colorMap: draft.set.colorMap,
    regions: Object.fromEntries(Object.entries(draft.set.regionNames).map(([id, name]) => [id, name])),
    levels: levelsOf(draft.set),
    palettes: [`${draft.name}.${SOURCE_VARIANT}`],
    source: draft.source,
  });
}

export function toPalette(draft: Draft): Palette {
  return {
    ...harvestPalette(toSemanticSet(draft), draft.set.order, SOURCE_VARIANT),
    name: `${draft.name}.${SOURCE_VARIANT}`,
  };
}

/** The two files, ready to be written wherever the person chooses. */
export function buildOutputs(draft: Draft): OutputFile[] {
  return [
    { name: `${draft.name}.semantic.json`, text: serialiseSet(toSemanticSet(draft)) },
    { name: `${draft.name}.palette.json`, text: `${JSON.stringify(toPalette(draft), null, 2)}\n` },
  ];
}

/**
 * 🔴 CAN THIS ANNOTATION SURVIVE BEING WRITTEN AND READ BACK? Returns the problem, or `null` when there is
 * none. This is what the «recomposed» view runs before it draws anything.
 *
 * The failure it exists for is two colours claiming the same `(region, level)`: it makes a ramp ambiguous,
 * and without this check the person would find out at the moment the engine renders their art wrong.
 */
export function annotationProblem(draft: Draft): string | null {
  try {
    const set = parseSet(serialiseSet(toSemanticSet(draft)));
    const palette = toPalette(draft);
    for (const sheet of set.sheets) recompose(set, sheet.name, palette, SOURCE_VARIANT);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The recomposed pixels of one sheet, taken the long way round — written, read back, and rebuilt from the
 * palette. Going the long way is the point: it exercises the file, not the objects in memory.
 */
export function recomposedPixels(draft: Draft, sheetName: string): Uint8Array {
  const set = parseSet(serialiseSet(toSemanticSet(draft)));
  return recompose(set, sheetName, toPalette(draft), SOURCE_VARIANT);
}

/** Where two images disagree, in magenta on black. Empty means the round trip held. */
export function difference(a: Uint8Array, b: Uint8Array): { pixels: Uint8Array; differing: number } {
  const pixels = new Uint8Array(a.length);
  let differing = 0;
  for (let i = 0; i < a.length; i += 4) {
    const same = a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
    if (same) continue;
    differing++;
    pixels[i] = 255; pixels[i + 1] = 0; pixels[i + 2] = 255; pixels[i + 3] = 255;
  }
  return { pixels, differing };
}
