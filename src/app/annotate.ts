// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2, in the half that is arithmetic rather than DOM.
//
// 🎯 `isolate` is what replaces a brush. Click a colour and every OTHER colour drops to grey while that one
// keeps its own bytes — so the person SEES where a colour lives before deciding what it means. They never
// paint a pixel. 📏 The measurement says that is 7 decisions for a median file, 35 for the worst.
//
// `suggest` writes the first draft of those decisions, and it is not a hope: 📏 the six most frequent colours
// of a real LPC body sheet descend 80 → 64 → 47 → 35 → 21 → 6 in luminance, which is a clean body ramp.
import { NOTHING, type Meaning } from '../format/semantic.ts';

/** Perceived brightness, 0–255. `NOTHING` returns -1 so it sorts below every real colour. */
export function luminance(colour: number): number {
  if (colour === NOTHING) return -1;
  const r = (colour >>> 24) & 0xff, g = (colour >>> 16) & 0xff, b = (colour >>> 8) & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const alphaOf = (colour: number): number => (colour === NOTHING ? 0 : colour & 0xff);

/**
 * Paint a sheet with one colour singled out: the chosen index keeps its own bytes, everything else drops to
 * grey at its own alpha, and nothing stays nothing.
 *
 * ⚠️ THE ALPHA NEVER MOVES. A shadow greyed to full opacity would read as solid, and the person would
 * annotate the wrong thing — 📏 and 119 of 197 measured files carry exactly that shadow.
 *
 * ⚠️ AND WITH NOTHING CHOSEN IT RETURNS THE TRUE PICTURE, undistorted. Somebody deciding what a colour MEANS
 * cannot be shown an altered version of it; the contrast comes from everything else going grey, which is
 * what makes the chosen one stand out.
 */
export function isolate(order: readonly (number | undefined)[], grid: Int32Array, chosen: number | null): Uint8Array {
  if (chosen !== null && (chosen < 0 || chosen >= order.length)) {
    throw new Error(`index ${chosen} is not in an order of ${order.length} colours`);
  }
  const rgba = new Uint8Array(grid.length * 4);
  for (let i = 0; i < grid.length; i++) {
    const colour = order[grid[i]!];
    // ⚠️ `undefined` is a position the CURRENT palette cannot reach, not a bug: another palette may simply
    // not show that colour anywhere the two share a drawing. It draws as nothing, and the count of them is
    // reported beside the panel — filling it with a nearby colour would be a lie with no symptom.
    if (colour === undefined || colour === NOTHING) continue; // already zeroed
    const d = i * 4;
    if (chosen === null || grid[i] === chosen) {
      rgba[d] = (colour >>> 24) & 0xff;
      rgba[d + 1] = (colour >>> 16) & 0xff;
      rgba[d + 2] = (colour >>> 8) & 0xff;
    } else {
      const grey = Math.round(luminance(colour));
      rgba[d] = rgba[d + 1] = rgba[d + 2] = grey;
    }
    rgba[d + 3] = alphaOf(colour);
  }
  return rgba;
}

/** One proposed meaning, carrying the colour it belongs to so a caller can show them side by side. */
export interface Proposal extends Meaning {
  readonly colour: number;
  readonly luminance: number;
}

/** Region 1 is the material a person will rename; region 2 is where semi-transparent colours land. */
const MATERIAL = 1;
const SEMI_TRANSPARENT = 2;

/**
 * Propose a `colorMap`, index-aligned with the canonical order it is given.
 *
 * 🔴 SEMI-TRANSPARENT COLOURS GET THEIR OWN REGION rather than a step in the main ramp. 📏 A measured file
 * never carries more than three of them and they are a shadow at constant alpha — ranking a shadow among
 * the opaque steps by luminance would put it at the dark end of the skin ramp, which is the wrong answer
 * and a plausible-looking one.
 */
export function suggest(order: readonly number[]): Proposal[] {
  const rank = (group: readonly number[]): Map<number, number> =>
    new Map([...group].sort((a, b) => luminance(a) - luminance(b)).map((colour, level) => [colour, level]));

  const opaque = rank(order.filter((c) => alphaOf(c) === 255));
  const partial = rank(order.filter((c) => c !== NOTHING && alphaOf(c) !== 255));

  return order.map((colour) => {
    if (colour === NOTHING) return { colour, luminance: -1, region: 0, level: 0 };
    const asOpaque = opaque.get(colour);
    return asOpaque !== undefined
      ? { colour, luminance: luminance(colour), region: MATERIAL, level: asOpaque }
      : { colour, luminance: luminance(colour), region: SEMI_TRANSPARENT, level: partial.get(colour)! };
  });
}
