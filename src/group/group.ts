// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE TWO GROUPINGS (ADR-0134 §4). Everything the four panels show comes out of exactly two comparisons,
// and neither of them has a parameter.
//
// For each image, once: scan in raster order, collect the distinct colours in order of FIRST APPEARANCE,
// and replace every pixel by its index in that list. Then
//
//   · `drawingHash` = hash of (width, height, index grid) — the same DRAWING, whatever colours it wears;
//   · `paletteHash` = hash of the sorted colour set — the same COLOURS, whatever picture they make.
//
// 🎯 The first is what makes the Liberated Pixel Cup affordable. Dozens of palette variants stop being
// dozens of files to annotate and become ONE annotation plus dozens of palettes harvested exactly: if index
// 4 was annotated `(skin, 3)`, then the colour at index 4 of any file with the same `drawingHash` IS level 3
// of skin in that variant. No matching, no nearest-colour, no drift.
//
// 📏 Measured on 197 CC0 files before any of this was written: 34 drawing groups covering 119 files, and 7
// palette groups. The first grouping is the one that pays; the second is rarer and semantically exact when
// it fires (in that sample, every one of its groups was a shared MATERIAL — scaffolding and wood).
//
// ⚠️ SIMILARITY IS DELIBERATELY ABSENT. Colours that merely look alike do not group, by the Dev's decision:
// exact now, clustering later if a real case demands it. A threshold would have to be stored in the file,
// defended and explained, and nothing so far needs one.

/** A pixel that is fully transparent. It is the same absence whatever RGB the file happened to store. */
export const TRANSPARENT = -1;

/** The minimum an image has to be for either grouping to read it — the decoder's output satisfies this. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface Indexed {
  /** The distinct colours, in order of first appearance. `order[i]` is the colour of index `i`. */
  readonly order: readonly number[];
  /** One index per pixel, row-major. This, and not the colours, is what identifies the drawing. */
  readonly indexGrid: Int32Array;
  /** How many pixels are neither fully opaque nor fully transparent. Reported so a caller can say so. */
  readonly partialAlphaPixels: number;
}

/**
 * Reduce an image to indices plus a colour list.
 *
 * ⚠️ ALPHA IS PART OF THE COLOUR. The earlier format flattened it to a hard 0-or-255 mask, and the
 * measurement killed that: 119 of 197 real files carry partial alpha, never more than three semi-transparent
 * colours in a file. That is a shadow at constant alpha, and a shadow has to be annotatable as its own
 * region — which it cannot be if alpha is thrown away here.
 */
export function indexColours(image: Pixels): Indexed {
  const count = image.width * image.height;
  const byColour = new Map<number, number>();
  const order: number[] = [];
  const indexGrid = new Int32Array(count);
  let partialAlphaPixels = 0;

  for (let i = 0; i < count; i++) {
    const d = i * 4;
    const a = image.rgba[d + 3]!;
    if (a !== 0 && a !== 255) partialAlphaPixels++;
    // 🔴 Fully transparent collapses to ONE key. Two files identical to the eye can store white-at-zero-alpha
    // where the other stores black; without this they get different index grids and the harvest finds nothing.
    const colour = a === 0
      ? TRANSPARENT
      : ((image.rgba[d]! << 24) | (image.rgba[d + 1]! << 16) | (image.rgba[d + 2]! << 8) | a) >>> 0;
    let index = byColour.get(colour);
    if (index === undefined) {
      index = order.length;
      byColour.set(colour, index);
      order.push(colour);
    }
    indexGrid[i] = index;
  }

  return { order, indexGrid, partialAlphaPixels };
}

/**
 * SHA-256 through `crypto.subtle`, which Node 24 and every browser have — so this module, like the decoder,
 * is one implementation rather than two. It is also why both hashes are async.
 */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The identity of a DRAWING: its size and its arrangement of colour indices, with the colours themselves
 * left out. Two files match if and only if one is a recolouring of the other.
 *
 * ⚠️ The dimensions are in the hash on purpose. The same run of pixels laid out 4×1 and 2×2 is two different
 * pictures, and a hash over the grid alone would call them one.
 */
export async function drawingHash(image: Pixels, indexed?: Indexed): Promise<string> {
  const { indexGrid } = indexed ?? indexColours(image);
  return sha256(`${image.width}x${image.height}:${indexGrid.join(',')}`);
}

/**
 * The identity of a PALETTE: the SET of colours, sorted, with the arrangement left out. Sheets of one
 * character share this even though each is a different drawing — which is what makes them one annotation.
 */
export async function paletteHash(image: Pixels, indexed?: Indexed): Promise<string> {
  const { order } = indexed ?? indexColours(image);
  return sha256([...order].sort((a, b) => a - b).join(','));
}

export interface Member<T> {
  readonly name: string;
  readonly image: Pixels;
  readonly indexed: Indexed;
  readonly drawingHash: string;
  readonly paletteHash: string;
  readonly source: T;
}

export interface Grouping<T> {
  /** Panel 4: the same drawing wearing different palettes. Keyed by `drawingHash`. */
  readonly byDrawing: ReadonlyMap<string, readonly Member<T>[]>;
  /** Panel 3: different drawings sharing one palette — the set a semantic file covers. Keyed by `paletteHash`. */
  readonly byPalette: ReadonlyMap<string, readonly Member<T>[]>;
  /** Every image, in the order it was given, so a caller can show them without re-deriving anything. */
  readonly members: readonly Member<T>[];
}

/**
 * Index and hash every image once, then bucket it twice. Insertion order is preserved inside each bucket,
 * so the panels show files in the order the person opened them rather than in hash order.
 */
export async function groupImages<T extends { name: string; image: Pixels }>(items: readonly T[]): Promise<Grouping<T>> {
  const members: Member<T>[] = [];
  for (const item of items) {
    const indexed = indexColours(item.image);
    members.push({
      name: item.name,
      image: item.image,
      indexed,
      drawingHash: await drawingHash(item.image, indexed),
      paletteHash: await paletteHash(item.image, indexed),
      source: item,
    });
  }

  const byDrawing = new Map<string, Member<T>[]>();
  const byPalette = new Map<string, Member<T>[]>();
  for (const member of members) {
    (byDrawing.get(member.drawingHash) ?? byDrawing.set(member.drawingHash, []).get(member.drawingHash)!).push(member);
    (byPalette.get(member.paletteHash) ?? byPalette.set(member.paletteHash, []).get(member.paletteHash)!).push(member);
  }

  return { byDrawing, byPalette, members };
}
