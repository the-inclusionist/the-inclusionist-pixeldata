// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANEL 4 — THE MECHANISM THAT PAYS FOR THE WHOLE TOOL (ADR-0134 §4).
//
// 📏 Measured on 197 CC0 files: 34 groups of «same drawing, different palettes» covering 100 files. Every
// troop and every building arrives in four team colours; buttons in two; ribbons in three. Annotating each
// one would be a hundred jobs. Annotating one and HARVESTING the rest is one job and ninety-nine readings.
//
// 🎯 AND THE HARVEST IS EXACT, not a match. Two files with the same `drawingHash` have identical grids of
// first-appearance indices — that is what the hash IS — so index `i` of one names the same step as index `i`
// of the other. Walking that correspondence turns a variant into a ramp with no nearest-colour anywhere.
//
// ⚠️ THE TWO ORDERINGS MEET HERE, and confusing them would be silent. The set's `colorMap` is indexed by the
// SET's canonical order (its colours, sorted); the correspondence with a variant runs through FIRST
// APPEARANCE. This module is where one is translated into the other, and it is the only place that does.
import { indexColours } from '../group/group.ts';
import { NOTHING, type Meaning, type Palette, type Pixels } from '../format/semantic.ts';
import type { Imported, SetView, SheetView } from './import.ts';

export interface Variant {
  readonly name: string;
  readonly image: Pixels;
  /** The sheet of the current set whose drawing this repeats — the one the correspondence runs through. */
  readonly matches: SheetView;
}

/**
 * Every imported file that draws the same picture as one of this set's sheets, in a different palette.
 *
 * ⚠️ It looks across ALL sets, not within this one. A variant is by definition somewhere else: sharing this
 * set's palette is what would have put it in this set to begin with.
 */
export function variantsFor(imported: Imported, set: SetView): Variant[] {
  const byDrawing = new Map(set.sheets.map((sheet) => [sheet.drawingHash, sheet]));
  const found: Variant[] = [];
  for (const other of imported.sets) {
    if (other === set) continue;
    for (const sheet of other.sheets) {
      const matches = byDrawing.get(sheet.drawingHash);
      if (matches) found.push({ name: sheet.name, image: sheet.image, matches });
    }
  }
  return found;
}

export interface Harvest {
  readonly palette: Palette;
  /**
   * The `(region, level)` pairs this variant could not fill. It happens when the annotated sheet does not
   * itself use every colour of the set — another sheet does — so the correspondence has nothing to say
   * about those steps. Reported rather than filled with a guess.
   */
  readonly missing: readonly Meaning[];
}

const HEX = (colour: number): string =>
  colour === NOTHING ? '#00000000' : `#${(colour >>> 0).toString(16).padStart(8, '0')}`;

/**
 * Turn a variant into a palette, by walking the first-appearance correspondence its `drawingHash` guarantees.
 *
 * 🔴 It refuses a variant whose drawing does not actually match. The whole correspondence rests on the two
 * index grids being identical, and taking colours across a mismatch would produce a palette that looks
 * plausible and recolours the art wrongly — with nothing to say it had.
 */
export function harvestFromVariant(set: SetView, variant: Variant, name: string): Harvest {
  const annotated = indexColours(variant.matches.image);
  const other = indexColours(variant.image);

  if (annotated.indexGrid.length !== other.indexGrid.length
    || annotated.indexGrid.some((value, i) => value !== other.indexGrid[i])) {
    throw new Error(`"${variant.name}" is not the same drawing as "${variant.matches.name}", so no colour of one names a step of the other`);
  }

  // First-appearance position i is the same step in both, so this is the whole translation.
  const asVariant = new Map<number, number>();
  annotated.order.forEach((colour, i) => asVariant.set(colour, other.order[i]!));

  const regions: Record<string, { variants: Record<string, string[]> }> = {};
  const missing: Meaning[] = [];

  set.colorMap.forEach((meaning, index) => {
    if (meaning.region === 0) return; // nothing has no ramp
    const here = asVariant.get(set.order[index]!);
    if (here === undefined) { missing.push(meaning); return; }
    const region = (regions[String(meaning.region)] ??= { variants: {} });
    (region.variants[name] ??= [])[meaning.level] = HEX(here);
  });

  return { palette: { schema: 1, name, regions }, missing };
}

/** A palette's name, from the file it was harvested from: `warrior.red` reads better than `palette-3`. */
export function variantName(setName: string, fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const tail = base.split(/[-_\s]+/).pop() ?? base;
  return `${setName}.${tail.toLowerCase()}`;
}
