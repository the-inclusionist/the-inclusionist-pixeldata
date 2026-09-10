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
  type Provenance, type SemanticSet, type Ramps, type LevelSpec,
} from '../format/semantic.ts';
import type { SetView } from './import.ts';

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
  for (const meaning of set.positions) {
    if (meaning.region === null) continue;
    steps[meaning.region] = Math.max(steps[meaning.region] ?? 0, meaning.level + 1);
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
  /** Palettes harvested from other palettes of the same drawings, by name. They ride into the one file. */
  readonly harvested?: Readonly<Record<string, Ramps>>;
}

/** The palette that reproduces the art exactly — the colours the source files actually hold. */
export const SOURCE_VARIANT = 'source';

export function toSemanticSet(draft: Draft): SemanticSet {
  return buildSet({
    sheets: draft.set.sheets.map((sheet) => ({ name: sheet.name, image: sheet.image })),
    order: draft.set.order,
    positions: draft.set.positions,
    levels: levelsOf(draft.set),
    palettes: {
      [SOURCE_VARIANT]: harvestPalette(draft.set.positions, draft.set.order),
      ...(draft.harvested ?? {}),
    },
    source: draft.source,
  });
}

/** Every palette this art can wear, `source` first because it is the one that reproduces the files. */
export function variantNames(draft: Draft): string[] {
  return Object.keys(toSemanticSet(draft).palettes);
}

/** 🔴 ONE FILE (ADR-0135). The pixels and the colours travel together, or a reader can be handed half. */
export function buildOutputs(draft: Draft): OutputFile[] {
  return [{ name: `${draft.name}.semantic.json`, text: serialiseSet(toSemanticSet(draft)) }];
}

/**
 * 🔴 CAN THIS ANNOTATION SURVIVE BEING WRITTEN AND READ BACK? Returns the problem, or `null` when there is
 * none. This is what the «recomposed» view runs before it draws anything.
 */
export function annotationProblem(draft: Draft): string | null {
  try {
    const set = parseSet(serialiseSet(toSemanticSet(draft)));
    for (const sheet of set.sheets) recompose(set, sheet.name, SOURCE_VARIANT);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The recomposed pixels of one sheet, taken the long way round — written, read back, and rebuilt from the
 * palette. Going the long way is the point: it exercises the file, not the objects in memory.
 */
export function recomposedPixels(draft: Draft, sheetName: string, variant = SOURCE_VARIANT): Uint8Array {
  return recompose(parseSet(serialiseSet(toSemanticSet(draft))), sheetName, variant);
}

/**
 * 🔴 A RAMP THAT DOES NOT CLIMB IS PROBABLY AN ANNOTATION MISTAKE — and it WARNS rather than refuses.
 *
 * A ramp runs shadow to light, so its colours should rise in luminance. When they do not, two levels were
 * most likely swapped and the art will recolour with its shading inverted — which looks wrong and does not
 * fail. But a FLAT ramp is legitimate, and so is a deliberately inverted one, so refusing would be wrong.
 */
export function nonMonotonicRamps(set: SemanticSet, variant: string): { region: string; at: number }[] {
  const found: { region: string; at: number }[] = [];
  for (const [region, ramp] of Object.entries(set.palettes[variant] ?? {})) {
    for (let i = 1; i < ramp.length; i++) {
      const before = ramp[i - 1];
      const here = ramp[i];
      if (before === undefined || here === undefined) continue;
      if (luminanceOfHex(here) < luminanceOfHex(before)) found.push({ region, at: i });
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
