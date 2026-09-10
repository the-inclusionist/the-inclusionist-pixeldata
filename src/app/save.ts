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
  /**
   * Palettes harvested from variants of the same drawing (panel 4). They go into the SAME palette file as
   * the source, because the format is `region → variants → ramp` and a variant is exactly what a variant
   * entry is for — one file per variant would be splitting a structure that is already the right shape.
   */
  readonly harvested?: readonly Palette[];
}

/** Fold several palettes into one, keeping every variant of every region. */
export function mergePalettes(name: string, palettes: readonly Palette[]): Palette {
  const regions: Record<string, { variants: Record<string, readonly string[]> }> = {};
  for (const palette of palettes) {
    for (const [id, region] of Object.entries(palette.regions)) {
      const target = (regions[id] ??= { variants: {} });
      Object.assign(target.variants, region.variants);
    }
  }
  return { schema: 1, name, regions };
}

export function toSemanticSet(draft: Draft): SemanticSet {
  return buildSet({
    sheets: draft.set.sheets.map((sheet) => ({ name: sheet.name, image: sheet.image })),
    order: draft.set.order,
    colorMap: draft.set.colorMap,
    regions: Object.fromEntries(Object.entries(draft.set.regionNames).map(([id, name]) => [id, name])),
    levels: levelsOf(draft.set),
    palettes: variantNames(draft),
    source: draft.source,
  });
}

/** Every variant this set can be worn in, `source` first because it is the one that reproduces the art. */
export function variantNames(draft: Draft): string[] {
  const harvested = (draft.harvested ?? []).map((p) => p.name);
  return [SOURCE_VARIANT, ...harvested];
}

export function toPalette(draft: Draft): Palette {
  // ⚠️ The source palette is harvested from a set built WITHOUT the palette list, or the two would define
  // each other. Only `colorMap` and the canonical order matter to the harvest, and neither depends on it.
  const bare = buildSet({
    sheets: draft.set.sheets.map((sheet) => ({ name: sheet.name, image: sheet.image })),
    order: draft.set.order,
    colorMap: draft.set.colorMap,
    regions: draft.set.regionNames as unknown as Record<string, string>,
    levels: levelsOf(draft.set),
    palettes: [],
    source: draft.source,
  });
  const source = harvestPalette(bare, draft.set.order, SOURCE_VARIANT);
  return mergePalettes(draft.name, [source, ...(draft.harvested ?? [])]);
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

/**
 * 🔴 A RAMP THAT DOES NOT CLIMB IS PROBABLY AN ANNOTATION MISTAKE — and it WARNS rather than refuses.
 *
 * A ramp runs shadow to light, so its colours should rise in luminance. When they do not, two levels were
 * most likely swapped, and the art will recolour with its shading inverted — which looks wrong and does not
 * fail. But a FLAT ramp is legitimate (a single-colour material, a shadow at one alpha) and so is a
 * deliberately inverted one, so refusing would be wrong. This says what it saw and leaves the decision.
 */
export function nonMonotonicRamps(palette: Palette, variant: string): { region: string; at: number }[] {
  const found: { region: string; at: number }[] = [];
  for (const [id, region] of Object.entries(palette.regions)) {
    const ramp = region.variants[variant];
    if (!ramp) continue;
    for (let i = 1; i < ramp.length; i++) {
      const before = ramp[i - 1];
      const here = ramp[i];
      if (before === undefined || here === undefined) continue;
      if (luminanceOfHex(here) < luminanceOfHex(before)) found.push({ region: id, at: i });
    }
  }
  return found;
}

function luminanceOfHex(hex: string): number {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return 0.299 * ((value >>> 24) & 0xff) + 0.587 * ((value >>> 16) & 0xff) + 0.114 * ((value >>> 8) & 0xff);
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
