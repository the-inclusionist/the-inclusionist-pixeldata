// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE TWO WAYS THE SAME FILES ARE ORGANISED, and the correspondence that lets a person move between them.
//
// 🎯 THE IDEA THIS MODULE EXISTS FOR, in the Dev's words: «este software não é pra definir o que significa a
// COR, mas o que significa o PÍXEL naquela posição». A meaning is attached to a POSITION in an index space,
// never to a colour value — so swapping the palette swaps every swatch and keeps every annotation.
//
// 📏 The Liberated Pixel Cup lays this out plainly. `Body/Base/Human_male/` holds eight palette folders
// (Coffee, Comet, Copper, Dove, Gold, Gray, Ivory, Sienna) and each holds the same eight sheets (hurt, idle,
// magic, run, shoot, swing, thrust, walk). Sixty-four files, eight DRAWINGS and eight PALETTES — and one
// annotation should cover all sixty-four.
//
// ⚠️ TWO INDEX SPACES MEET HERE AND THEY ARE NOT THE SAME. Across drawings of one palette the shared space
// is the CANONICAL order (the palette's colours, sorted). Across palettes of one drawing it is FIRST
// APPEARANCE. This module is where one is translated into the other; `docs/FORMAT.md` says why each exists.
import { indexColours } from '../group/group.ts';
import type { SetView, SheetView, Imported } from './import.ts';

/**
 * 🔴 WHAT MAKES TWO FILES THE SAME PALETTE, and it is a rule rather than a convention.
 *
 * Not an EXACT colour set: 📏 measured on `Body/Base/Human_male/`, that splits eight folders into
 * twenty-five groups, because `run` and `thrust` each carry a colour or two the other sheets never show.
 * A `hurt` frame that never displays the boots is still the same palette as the `walk` that does.
 *
 * So: one set CONTAINED IN the other, closed transitively. No threshold, no percentage, nothing to tune —
 * which matters, because a tuned number would have to be stored in the file and defended forever.
 * 📏 It takes the same folder from 25 groups to 13, and the closure never once crosses a folder boundary.
 *
 * ⚠️ It does not reach eight, and that is the corpus rather than the rule: `run.png` genuinely holds
 * colours nothing else in its folder does. A rule that reached eight would have to guess.
 */
export function groupByContainment<T extends { readonly colours: ReadonlySet<number> }>(items: readonly T[]): T[][] {
  // Distinct colour SETS first. A folder of sixty files holds about fifteen distinct sets, so comparing
  // sets instead of files turns a quadratic walk over the import into a quadratic walk over almost nothing.
  const distinct = new Map<string, { colours: ReadonlySet<number>; items: T[] }>();
  for (const item of items) {
    const key = [...item.colours].sort((a, b) => a - b).join(',');
    (distinct.get(key) ?? distinct.set(key, { colours: item.colours, items: [] }).get(key)!).items.push(item);
  }

  const sets = [...distinct.values()];
  const parent = sets.map((_, i) => i);
  const root = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!; return i; };

  const within = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => {
    if (a.size > b.size) return false;
    for (const colour of a) if (!b.has(colour)) return false;
    return true;
  };

  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      if (within(sets[i]!.colours, sets[j]!.colours) || within(sets[j]!.colours, sets[i]!.colours)) {
        parent[root(i)] = root(j);
      }
    }
  }

  const groups = new Map<number, T[]>();
  sets.forEach((set, i) => {
    const key = root(i);
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(...set.items);
  });
  return [...groups.values()];
}

/** One palette, and every sheet drawn in it. This is what `importFiles` already calls a set. */
export interface PaletteView {
  readonly set: SetView;
  /** A name a person recognises — `Coffee` from `…/Human_male/Coffee/walk.png`, not a hash. */
  readonly name: string;
}

/** One drawing, and how many palettes it was found in. Panel 2 is a list of these. */
export interface DrawingView {
  readonly sheet: SheetView;
  /** How many of the workspace's palettes hold this same drawing. The badge. */
  readonly paletteCount: number;
}

export interface Workspace {
  /** The palette whose canonical order the annotation is indexed by. Every meaning is a position in it. */
  readonly base: SetView;
  readonly palettes: readonly PaletteView[];
  readonly drawings: readonly DrawingView[];
}

/**
 * The folder a file sits in, which for the LPC is the palette's name. Falls back to the file's own name so
 * a flat import still says something, and never to a hash — a person picking a palette needs to recognise it.
 */
export function paletteNameOf(set: SetView): string {
  const folders = set.sheets.map((sheet) => {
    const parts = sheet.name.split('/');
    return parts.length > 1 ? parts[parts.length - 2]! : '';
  });
  const first = folders[0];
  if (first && folders.every((f) => f === first)) return first;
  return set.sheets[0]?.name.replace(/\.[^.]+$/, '') ?? 'palette';
}

/**
 * Organise an import around one palette: the palettes that share a drawing with it, and the drawings it
 * holds with a count of how many palettes carry each.
 *
 * ⚠️ A palette that shares NO drawing is left out, and that is not tidiness. Its colours cannot be reached
 * from this annotation — there is no correspondence to travel along — so offering it as a swap would offer
 * a swap that cannot be made.
 */
export function workspaceFor(imported: Imported, base: SetView): Workspace {
  const baseDrawings = new Set(base.sheets.map((sheet) => sheet.drawingHash));

  const palettes: PaletteView[] = [];
  for (const set of imported.sets) {
    const shares = set === base || set.sheets.some((sheet) => baseDrawings.has(sheet.drawingHash));
    if (shares) palettes.push({ set, name: paletteNameOf(set) });
  }

  const drawings = base.sheets.map((sheet) => ({
    sheet,
    paletteCount: palettes.filter((p) => p.set.sheets.some((s) => s.drawingHash === sheet.drawingHash)).length,
  }));

  return { base, palettes, drawings };
}

/** The sheet that is this drawing wearing this palette, or nothing when that palette does not hold it. */
export function sheetIn(palette: PaletteView, drawing: DrawingView): SheetView | undefined {
  return palette.set.sheets.find((sheet) => sheet.drawingHash === drawing.sheet.drawingHash);
}

/**
 * 🔴 THE TRANSLATION, and the whole design rests on it: for each position in the BASE palette's canonical
 * order, the colour that position wears in another palette.
 *
 * It travels through a drawing the two palettes share. Two files with the same `drawingHash` have identical
 * grids of first-appearance indices — that is what the hash IS — so position `i` of one names the same thing
 * as position `i` of the other, and no colour is ever matched or approximated.
 *
 * Returns `undefined` at a position the correspondence cannot reach, which happens when the shared drawing
 * does not itself use every colour of the base palette. Reported, never filled with something plausible.
 */
export function coloursIn(base: SetView, through: SheetView, other: SheetView): (number | undefined)[] {
  const here = indexColours(through.image);
  const there = indexColours(other.image);

  if (here.indexGrid.length !== there.indexGrid.length
    || here.indexGrid.some((value, i) => value !== there.indexGrid[i])) {
    throw new Error(`"${other.name}" is not the same drawing as "${through.name}"`);
  }

  const translate = new Map<number, number>();
  here.order.forEach((colour, i) => translate.set(colour, there.order[i]!));
  return base.order.map((colour) => translate.get(colour));
}

/**
 * Every colour of the base palette as it appears in `palette`, using whichever shared drawing reaches the
 * most positions.
 *
 * 📌 Trying the drawings in turn and keeping the best one is not thoroughness for its own sake: a single
 * sheet often uses only part of a palette — a `hurt` frame may never show the boots — so one drawing alone
 * would leave real positions blank that another fills.
 */
export function paletteColours(workspace: Workspace, palette: PaletteView): (number | undefined)[] {
  if (palette.set === workspace.base) return [...workspace.base.order];

  let best: (number | undefined)[] = workspace.base.order.map(() => undefined);
  let reached = -1;
  for (const drawing of workspace.drawings) {
    const other = sheetIn(palette, drawing);
    if (!other) continue;
    const colours = coloursIn(workspace.base, drawing.sheet, other);
    const filled = colours.filter((c) => c !== undefined).length;
    if (filled > reached) { reached = filled; best = colours; }
    if (filled === colours.length) break; // nothing left to improve on
  }
  return best;
}
