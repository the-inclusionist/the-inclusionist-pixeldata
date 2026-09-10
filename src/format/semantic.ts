// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE FILE THIS REPOSITORY EXISTS TO WRITE (ADR-0134 §6).
//
// One `<set>.semantic.json` per set — the sheets that share a palette — carrying the vocabulary of regions,
// the levels, the sheets with their runs and frames, the human decision in `colorMap`, references to the
// compatible palettes, and the provenance. The colours live apart, in `<name>.palette.json`, because that is
// what lets one palette serve several sets and one set wear several palettes.
//
// 🔴 THE INDEX IN THE GRID IS THE SET'S CANONICAL ORDER, NOT FIRST APPEARANCE. The grouping in `src/group/`
// numbers colours by first appearance, which is right for asking «is this the same drawing». It is wrong
// here: within one set, `walk` and `hurt` meet their shared colours in different orders, so a
// first-appearance index would need a different `colorMap` per sheet and one annotation could not cover the
// set. The canonical order is the sorted colour set — the same one `paletteHash` already agrees on.
import { encodeGrid, decodeGrid } from './rle.ts';

/** A pixel that is fully transparent, sorting before every real colour so it takes index 0 when present. */
export const NOTHING = -1;

/** Pack straight RGBA into one number. Alpha is part of the colour — a shadow is a colour, not a mask. */
export function packColour(rgba: readonly number[]): number {
  return rgba[3] === 0 ? NOTHING : ((rgba[0]! << 24) | (rgba[1]! << 16) | (rgba[2]! << 8) | rgba[3]!) >>> 0;
}

const HEX = (colour: number): string =>
  colour === NOTHING ? '#00000000' : `#${(colour >>> 0).toString(16).padStart(8, '0')}`;

const UNHEX = (text: string): number => {
  const value = Number.parseInt(text.replace('#', ''), 16);
  return (value & 0xff) === 0 ? NOTHING : value >>> 0;
};

export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface Frame {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** ⚠️ Per frame, and not a naming convention: ADR-0027 measured fifteen distinct sprite sizes. */
  readonly pivot: readonly [number, number];
  readonly durationMs?: number;
}

export interface Sheet {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** One string per row of pixels; see `src/format/rle.ts` for why runs stop at the row. */
  readonly grid: readonly string[];
  readonly frames: readonly Frame[];
}

/** What one canonical colour index MEANS. Region 0 is nothing at all — the hole in the picture. */
export interface Meaning {
  readonly region: number;
  readonly level: number;
}

export interface LevelSpec {
  readonly steps: number;
  /** Which level index is the outline, per region. `null` where a region has none. */
  readonly outline: number | null;
}

/** The same fields as a row of `art/ATTRIBUTION.csv`, so the ledger is GENERATED rather than written. */
export interface Provenance {
  readonly author: string;
  readonly url: string;
  readonly door: string;
  readonly licence: string;
  readonly outgoingLicence: string;
  readonly derivedFrom: string | null;
}

export interface SemanticSet {
  readonly schema: 1;
  readonly regions: Readonly<Record<string, string>>;
  readonly levels: Readonly<Record<string, LevelSpec>>;
  readonly sheets: readonly Sheet[];
  /** Indexed by canonical colour index. The record of HOW the annotation was made. */
  readonly colorMap: readonly Meaning[];
  /** Ids of the palettes known to be compatible — harvested from variants of the same drawing. */
  readonly palettes: readonly string[];
  readonly source: Provenance;
}

export interface Palette {
  readonly schema: 1;
  readonly name: string;
  /** `regions[regionId].variants[variantName][level]` is a colour, written `#rrggbbaa`. */
  readonly regions: Readonly<Record<string, { readonly variants: Readonly<Record<string, readonly string[]>> }>>;
}

// ---------------------------------------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------------------------------------

/** The union of every colour in the set, sorted. One index space for every sheet in it. */
export function canonicalOrder(images: readonly Pixels[]): number[] {
  const colours = new Set<number>();
  for (const image of images) {
    for (let i = 0; i < image.width * image.height; i++) {
      const d = i * 4;
      colours.add(packColour([image.rgba[d]!, image.rgba[d + 1]!, image.rgba[d + 2]!, image.rgba[d + 3]!]));
    }
  }
  return [...colours].sort((a, b) => a - b);
}

/** One index per pixel, against the set's canonical order. */
export function gridFor(image: Pixels, order: readonly number[]): Int32Array {
  const at = new Map(order.map((colour, index) => [colour, index]));
  const grid = new Int32Array(image.width * image.height);
  for (let i = 0; i < grid.length; i++) {
    const d = i * 4;
    const colour = packColour([image.rgba[d]!, image.rgba[d + 1]!, image.rgba[d + 2]!, image.rgba[d + 3]!]);
    const index = at.get(colour);
    if (index === undefined) {
      throw new Error(`${HEX(colour)} is not in the set's canonical order — the set was built without this sheet`);
    }
    grid[i] = index;
  }
  return grid;
}

export interface SetParts {
  readonly sheets: readonly { name: string; image: Pixels; frames?: readonly Frame[] }[];
  readonly order: readonly number[];
  readonly colorMap: readonly Meaning[];
  readonly regions: Readonly<Record<string, string>>;
  readonly levels: Readonly<Record<string, LevelSpec>>;
  readonly palettes: readonly string[];
  readonly source: Provenance;
}

export function buildSet(parts: SetParts): SemanticSet {
  return {
    schema: 1,
    regions: parts.regions,
    levels: parts.levels,
    sheets: parts.sheets.map((sheet) => ({
      name: sheet.name,
      width: sheet.image.width,
      height: sheet.image.height,
      grid: encodeGrid(gridFor(sheet.image, parts.order), sheet.image.width, sheet.image.height),
      frames: sheet.frames ?? [],
    })),
    colorMap: parts.colorMap,
    palettes: parts.palettes,
    source: parts.source,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Writing and reading
// ---------------------------------------------------------------------------------------------------------

/** Two-space JSON, because this file is meant to be read by a person and diffed by git. */
export function serialiseSet(set: SemanticSet): string {
  return `${JSON.stringify(set, null, 2)}\n`;
}

/**
 * Read a set back, refusing anything it cannot trust.
 *
 * ⚠️ The validation with the most teeth is the one that rejects two indices meaning the same
 * `(region, level)`. It makes a ramp ambiguous — two source colours claiming one step — and recomposition
 * would silently pick whichever came last. Nothing downstream would report an error.
 */
export function parseSet(text: string): SemanticSet {
  const raw = JSON.parse(text) as SemanticSet;
  if (raw.schema !== 1) throw new Error(`schema ${raw.schema} is not one this reader knows`);

  const claimed = new Map<string, number>();
  raw.colorMap.forEach((meaning, index) => {
    if (meaning.region === 0) return; // nothing has no ramp and no level to claim
    if (!(String(meaning.region) in raw.regions)) {
      throw new Error(`colorMap index ${index} names region ${meaning.region}, which the vocabulary does not hold`);
    }
    const key = `${meaning.region}/${meaning.level}`;
    const already = claimed.get(key);
    if (already !== undefined) {
      throw new Error(`region ${meaning.region} level ${meaning.level} is claimed twice — by index ${already} and index ${index}`);
    }
    claimed.set(key, index);
  });

  for (const sheet of raw.sheets) {
    const grid = decodeGrid(sheet.grid, sheet.width, sheet.height);
    for (const index of grid) {
      if (index >= raw.colorMap.length) {
        throw new Error(`sheet "${sheet.name}" uses index ${index}, and the colorMap holds only ${raw.colorMap.length}`);
      }
    }
  }
  return raw;
}

// ---------------------------------------------------------------------------------------------------------
// Palettes, and the round trip
// ---------------------------------------------------------------------------------------------------------

/**
 * Turn a set's own colours into a palette, one ramp per region.
 *
 * 🎯 This is also the shape a HARVESTED variant takes: because a variant has the same drawing, its colour at
 * canonical position `i` is the same step as the annotated one's colour at `i`, so the same walk over
 * `colorMap` produces its ramp with no matching and no nearest-colour anywhere.
 */
export function harvestPalette(set: SemanticSet, order: readonly number[], variant: string): Palette {
  const regions: Record<string, { variants: Record<string, string[]> }> = {};
  set.colorMap.forEach((meaning, index) => {
    if (meaning.region === 0) return;
    const region = (regions[String(meaning.region)] ??= { variants: { [variant]: [] } });
    (region.variants[variant] ??= [])[meaning.level] = HEX(order[index]!);
  });
  return { schema: 1, name: variant, regions };
}

/**
 * Which variant each region wears. A single name means «this one everywhere», which is what the source
 * round trip wants; a map chooses per region, which is what a game wants.
 */
export type VariantChoice = string | Readonly<Record<string, string>>;

const variantFor = (choice: VariantChoice, region: number): string | undefined =>
  typeof choice === 'string' ? choice : choice[String(region)];

/**
 * 🔴 THE OTHER HALF OF THE ROUND TRIP. Walk a sheet's grid, look each index up in `colorMap`, and take the
 * colour from the chosen ramp. Region 0 stays transparent.
 *
 * ⚠️ THE CHOICE IS PER REGION, and an earlier version of this took one global variant name. That version
 * could only ever recolour everything at once — there was no «light skin with a red shirt» — which empties
 * the palette dictionary of its purpose. The structure `region → variants` exists precisely so a variant is
 * swapped WITHIN a region, and this signature is what makes that true in code.
 */
export function recompose(set: SemanticSet, sheetName: string, palette: Palette, choice: VariantChoice): Uint8Array {
  const sheet = set.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`this set holds no sheet named "${sheetName}"`);

  const grid = decodeGrid(sheet.grid, sheet.width, sheet.height);
  const rgba = new Uint8Array(sheet.width * sheet.height * 4);

  for (let i = 0; i < grid.length; i++) {
    const meaning = set.colorMap[grid[i]!]!;
    if (meaning.region === 0) continue; // already zeroed, and zero alpha is nothing
    const variant = variantFor(choice, meaning.region);
    if (variant === undefined) {
      throw new Error(`no variant was chosen for region ${meaning.region}, and this sheet uses it`);
    }
    const ramp = palette.regions[String(meaning.region)]?.variants[variant];
    if (!ramp) {
      throw new Error(`palette "${palette.name}" has no variant "${variant}" for region ${meaning.region}`);
    }
    const hex = ramp[meaning.level];
    if (hex === undefined) {
      throw new Error(`the ramp for region ${meaning.region} variant "${variant}" has no level ${meaning.level}`);
    }
    const colour = UNHEX(hex);
    if (colour === NOTHING) continue;
    const d = i * 4;
    rgba[d] = (colour >>> 24) & 0xff;
    rgba[d + 1] = (colour >>> 16) & 0xff;
    rgba[d + 2] = (colour >>> 8) & 0xff;
    rgba[d + 3] = colour & 0xff;
  }
  return rgba;
}
