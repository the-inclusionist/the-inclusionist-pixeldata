// SPDX-License-Identifier: AGPL-3.0-or-later
//
// IMPORT IS WHERE THE BATCH LIVES (ADR-0134 §3c). There is no separate command-line tool: opening a folder
// at once is what makes a hundred files one job, and a second surface would be maintained for work this
// already does.
//
// What comes out is a SET per palette — the sheets that share colours, which is the boundary of one
// `.semantic.json` — each carrying its canonical order, a grid per sheet, a per-colour pixel count for the
// annotation table, and a first draft of the annotation.
import { decodePng, type DecodedPng } from '../png/decode.ts';
import { groupImages } from '../group/group.ts';
import { canonicalOrder, gridFor, packColour, NOTHING, type Meaning } from '../format/semantic.ts';
import { suggest } from './annotate.ts';

export interface SheetView {
  readonly name: string;
  readonly image: DecodedPng;
  /** Indices into the SET's canonical order — see `docs/FORMAT.md` for why it is not first appearance. */
  readonly grid: Int32Array;
  readonly drawingHash: string;
}

export interface SetView {
  readonly paletteHash: string;
  readonly order: readonly number[];
  readonly sheets: readonly SheetView[];
  /** How many pixels in the whole set wear each canonical colour. Panel 2 shows it beside the swatch. */
  readonly counts: readonly number[];
  /** The draft annotation, index-aligned with `order`. A person edits this; nothing else here changes. */
  colorMap: Meaning[];
  /** Region id → the name a person gave it. Content, so never translated. */
  regionNames: Record<number, string>;
}

export interface Imported {
  readonly sets: readonly SetView[];
  /** Files that could not be read, with the reason, so a refusal is shown rather than swallowed. */
  readonly refused: readonly { readonly name: string; readonly why: string }[];
}

/** Default names for what `suggest` proposes. A person renames them; they are a starting point, not a rule. */
const DRAFT_REGION_NAMES: Readonly<Record<number, string>> = { 1: 'material', 2: 'shadow' };

export async function importFiles(files: readonly { name: string; bytes: Uint8Array }[]): Promise<Imported> {
  const decoded: { name: string; image: DecodedPng }[] = [];
  const refused: { name: string; why: string }[] = [];

  for (const file of files) {
    try {
      decoded.push({ name: file.name, image: await decodePng(file.bytes) });
    } catch (error) {
      refused.push({ name: file.name, why: error instanceof Error ? error.message : String(error) });
    }
  }

  // ONE pass. Each member already carries both hashes, so grouping twice would only cost two SHA walks over
  // every pixel of every file for a map that is already in hand.
  const { byPalette } = await groupImages(decoded);

  const sets: SetView[] = [];
  for (const [paletteHash, members] of byPalette) {
    const order = canonicalOrder(members.map((m) => m.image));
    const sheets = members.map((m) => ({
      name: m.name,
      image: m.image as DecodedPng,
      grid: gridFor(m.image, order),
      drawingHash: m.drawingHash,
    }));

    // Counted across the whole set, because the annotation covers the set and not one sheet.
    const counts = new Array<number>(order.length).fill(0);
    for (const sheet of sheets) for (const index of sheet.grid) counts[index]!++;

    sets.push({
      paletteHash,
      order,
      sheets,
      counts,
      colorMap: suggest(order).map(({ region, level }) => ({ region, level })),
      regionNames: { ...DRAFT_REGION_NAMES },
    });
  }
  return { sets, refused };
}

/** Split a packed colour into the four bytes a swatch needs. */
export function unpack(colour: number): [number, number, number, number] {
  if (colour === NOTHING) return [0, 0, 0, 0];
  return [(colour >>> 24) & 0xff, (colour >>> 16) & 0xff, (colour >>> 8) & 0xff, colour & 0xff];
}

export { packColour };
