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
/**
 * What one position in the index space MEANS. The region is the word a person typed — free text, not a code
 * from a list — because the file is written to be read by a language model as much as by a program.
 *
 * ⚠️ `region: null` is nothing at all: the hole in the picture. It is `null` rather than a word like
 * «nothing», because a word could collide with one a person types.
 */
export interface Meaning {
  readonly region: string | null;
  readonly level: number;
}

export interface LevelSpec {
  readonly steps: number;
  /** Which level index is the outline. `null` where a region has none. Never guessed. */
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

/** One palette: `ramp[regionName][level]` is a colour written `#rrggbbaa`. */
export type Ramps = Readonly<Record<string, readonly string[]>>;

/**
 * 🔴 ONE FILE, and it holds the pixels AND the colours (ADR-0135).
 *
 * Schema 1 wrote two — a set file and a palette file — so one palette could serve several sets. The Dev
 * decided against it twice, and the reuse it bought was theoretical: palettes are harvested from the same
 * import that produced the sheets, and a reader that has to open two files to draw one sprite is a reader
 * that can be handed half a resource.
 *
 * ⚠️ THE REGION IS A WORD, NOT AN ID. Schema 1 kept `regions: {id → name}` and wrote ids in the map, which
 * meant joining two structures to learn what a pixel is. The file is written to be read by a language model,
 * and a join is exactly the kind of thing that gets read wrong.
 */
export interface SemanticSet {
  readonly schema: 2;
  /** A sentence saying what this file is, for whoever — or whatever — opens it first. */
  readonly '//'?: string;
  readonly sheets: readonly Sheet[];
  /** Indexed by position in the index space the grids use: what that position means. */
  readonly positions: readonly Meaning[];
  /** Per region name: how many steps its ramp has, and which step is the outline. */
  readonly levels: Readonly<Record<string, LevelSpec>>;
  /** `palettes[variantName][regionName][level]` — every palette this art was found wearing. */
  readonly palettes: Readonly<Record<string, Ramps>>;
  readonly source: Provenance;
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
  readonly positions: readonly Meaning[];
  readonly levels: Readonly<Record<string, LevelSpec>>;
  readonly palettes: Readonly<Record<string, Ramps>>;
  readonly source: Provenance;
}

const EXPLAINS = 'Semantic pixel art: `grid` holds run-length rows of POSITION indices, `positions` says what '
  + 'each position means, and `palettes` gives the colours each meaning wears. A pixel is described by what '
  + 'it IS, never by what colour it happens to be.';

export function buildSet(parts: SetParts): SemanticSet {
  return {
    schema: 2,
    '//': EXPLAINS,
    sheets: parts.sheets.map((sheet) => ({
      name: sheet.name,
      width: sheet.image.width,
      height: sheet.image.height,
      grid: encodeGrid(gridFor(sheet.image, parts.order), sheet.image.width, sheet.image.height),
      frames: sheet.frames ?? [],
    })),
    positions: parts.positions,
    levels: parts.levels,
    palettes: parts.palettes,
    source: parts.source,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Writing and reading
// ---------------------------------------------------------------------------------------------------------

/** Two-space JSON, because this file is meant to be read by a person, a model, and git alike. */
export function serialiseSet(set: SemanticSet): string {
  return `${JSON.stringify(set, null, 2)}
`;
}

/**
 * Read a set back, refusing anything it cannot trust.
 *
 * ⚠️ The check with the most teeth rejects two positions meaning the same `(region, level)`. It makes a ramp
 * ambiguous — two source colours claiming one step — and recomposition would silently take whichever came
 * last. Nothing downstream would report an error.
 */
export function parseSet(text: string): SemanticSet {
  const raw = JSON.parse(text) as SemanticSet;
  if (raw.schema !== 2) throw new Error(`schema ${raw.schema} is not one this reader knows`);

  const claimed = new Map<string, number>();
  raw.positions.forEach((meaning, index) => {
    if (meaning.region === null) return; // nothing has no ramp and claims no level
    if (!(meaning.region in raw.levels)) {
      throw new Error(`position ${index} names region "${meaning.region}", which \`levels\` does not describe`);
    }
    const key = `${meaning.region}/${meaning.level}`;
    const already = claimed.get(key);
    if (already !== undefined) {
      throw new Error(`region "${meaning.region}" level ${meaning.level} is claimed twice — by position ${already} and position ${index}`);
    }
    claimed.set(key, index);
  });

  for (const sheet of raw.sheets) {
    const grid = decodeGrid(sheet.grid, sheet.width, sheet.height);
    for (const index of grid) {
      if (index >= raw.positions.length) {
        throw new Error(`sheet "${sheet.name}" uses position ${index}, and the file describes only ${raw.positions.length}`);
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
 * 🎯 This is also the shape a HARVESTED variant takes: a variant has the same drawing, so its colour at
 * position `i` is the same step as the annotated one's colour at `i`, and the same walk over `positions`
 * produces its ramp with no matching and no nearest-colour anywhere.
 */
export function harvestPalette(positions: readonly Meaning[], order: readonly (number | undefined)[]): Ramps {
  const ramps: Record<string, string[]> = {};
  positions.forEach((meaning, index) => {
    const colour = order[index];
    // A position this palette cannot reach contributes nothing. Filling it with a nearby colour would put
    // a colour that palette does not have into a ramp, and nothing downstream could tell.
    if (meaning.region === null || colour === undefined) return;
    (ramps[meaning.region] ??= [])[meaning.level] = HEX(colour);
  });
  return ramps;
}

/**
 * Which variant each region wears. A single name means «this one everywhere», which is what reproducing the
 * source wants; a map chooses per region, which is what a game wants.
 */
export type VariantChoice = string | Readonly<Record<string, string>>;

const variantFor = (choice: VariantChoice, region: string): string | undefined =>
  typeof choice === 'string' ? choice : choice[region];

/**
 * 🔴 THE OTHER HALF OF THE ROUND TRIP. Walk a sheet's grid, look each position up in `positions`, and take
 * the colour from the chosen ramp. A position meaning nothing stays transparent.
 *
 * ⚠️ THE CHOICE IS PER REGION. A single global variant could only recolour everything at once — there would
 * be no «light skin with a red shirt» — which empties the palette dictionary of its purpose.
 */
export function recompose(set: SemanticSet, sheetName: string, choice: VariantChoice): Uint8Array {
  const sheet = set.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`this file holds no sheet named "${sheetName}"`);

  const grid = decodeGrid(sheet.grid, sheet.width, sheet.height);
  const rgba = new Uint8Array(sheet.width * sheet.height * 4);

  for (let i = 0; i < grid.length; i++) {
    const meaning = set.positions[grid[i]!]!;
    if (meaning.region === null) continue; // already zeroed, and zero alpha is nothing
    const variant = variantFor(choice, meaning.region);
    if (variant === undefined) {
      throw new Error(`no palette was chosen for region "${meaning.region}", and this sheet uses it`);
    }
    const ramp = set.palettes[variant]?.[meaning.region];
    if (!ramp) throw new Error(`palette "${variant}" has no ramp for region "${meaning.region}"`);
    const hex = ramp[meaning.level];
    if (hex === undefined) {
      throw new Error(`the ramp for region "${meaning.region}" in palette "${variant}" has no level ${meaning.level}`);
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
