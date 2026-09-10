// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2, in the half that can be proved without a browser.
//
// The gesture the Dev asked for — click a colour and watch every OTHER colour drop to grey while that one
// stays — is what replaces a brush. The person does not paint pixels; they see where a colour LIVES and then
// say what it means. 📏 The measurement says that is 7 decisions for a median file and 35 for the worst one.
//
// And the suggestion is not a hope: 📏 the six most frequent colours of a real LPC body sheet descend
// 80 → 64 → 47 → 35 → 21 → 6 in luminance, which is a clean body ramp. Sorting by luminance proposes the
// ramp; the person corrects it.
import { describe, it, expect } from 'vitest';
import { isolate, suggest, luminance } from '../src/app/annotate.ts';
import { NOTHING, packColour } from '../src/format/semantic.ts';

const RED = packColour([200, 40, 40, 255]);
const DARK = packColour([30, 30, 30, 255]);
const LIGHT = packColour([220, 220, 220, 255]);
const MID = packColour([120, 120, 120, 255]);
const SHADOW = packColour([0, 0, 0, 90]);

describe('luminance', () => {
  it('Right: it is the usual weighted sum, so a green reads brighter than a blue of the same number', () => {
    expect(luminance(packColour([0, 255, 0, 255]))).toBeGreaterThan(luminance(packColour([0, 0, 255, 255])));
  });

  it('Boundary: nothing has no luminance to speak of, and sorts below every real colour', () => {
    expect(luminance(NOTHING)).toBe(-1);
  });
});

describe('isolate — the gesture that replaces a brush', () => {
  // A two-by-two: red, dark, light, nothing.
  const order = [NOTHING, DARK, RED, LIGHT];
  const grid = Int32Array.from([2, 1, 3, 0]);

  it('🎯 Right: the chosen colour keeps its own bytes, exactly', () => {
    const out = isolate(order, grid, 2);
    expect([...out.slice(0, 4)]).toEqual([200, 40, 40, 255]);
  });

  it('🔴 Right: every other colour drops to grey at the same alpha', () => {
    const out = isolate(order, grid, 2);
    const grey = Math.round(luminance(DARK));
    expect([...out.slice(4, 8)]).toEqual([grey, grey, grey, 255]);
  });

  it('Right: a semi-transparent colour greys without its alpha moving', () => {
    // 📏 119 of 197 measured files carry partial alpha, and it is a shadow. Changing the alpha here would
    // make the shadow read as solid and the person would annotate the wrong thing.
    const out = isolate([NOTHING, SHADOW], Int32Array.from([1]), 0);
    expect(out[3]).toBe(90);
  });

  it('Boundary: nothing stays nothing, chosen or not', () => {
    const out = isolate(order, grid, 2);
    expect([...out.slice(12, 16)]).toEqual([0, 0, 0, 0]);
  });

  it('Boundary: with nothing chosen, every colour keeps its own bytes', () => {
    // The resting state has to be the true picture. A person judging colour cannot be shown a distorted one.
    const out = isolate(order, grid, null);
    expect([...out.slice(0, 4)]).toEqual([200, 40, 40, 255]);
    expect([...out.slice(4, 8)]).toEqual([30, 30, 30, 255]);
  });

  it('Exercise the exceptional: choosing an index the order does not hold is refused', () => {
    expect(() => isolate(order, grid, 9)).toThrow(/index 9/);
  });
});

describe('suggest — the first draft of the annotation, by luminance', () => {
  it('🎯 Right: opaque colours are ranked shadow-to-light, so the ramp comes out ordered', () => {
    const proposal = suggest([NOTHING, LIGHT, DARK, MID]);
    const levels = new Map(proposal.map((p) => [p.colour, p.level]));
    expect(levels.get(DARK)).toBe(0);
    expect(levels.get(MID)).toBe(1);
    expect(levels.get(LIGHT)).toBe(2);
  });

  it('🔴 Right: semi-transparent colours are proposed as their OWN region, not as a light step', () => {
    // 📏 Never more than three semi-transparent colours in a measured file, and they are a shadow at a
    // constant alpha. Ranking a shadow among the opaque steps by luminance would put it at the dark end of
    // the skin ramp, which is exactly the wrong answer and a plausible-looking one.
    const proposal = suggest([NOTHING, DARK, SHADOW, LIGHT]);
    const shadow = proposal.find((p) => p.colour === SHADOW)!;
    const skin = proposal.find((p) => p.colour === DARK)!;
    expect(shadow.region).not.toBe(skin.region);
    expect(shadow.level).toBe(0);
  });

  it('Right: nothing gets NO region at all — the hole in the picture is never a material', () => {
    // `null` rather than a word like «nothing», because the region is now free text and a word could
    // collide with one a person types.
    expect(suggest([NOTHING, DARK]).find((p) => p.colour === NOTHING)!.region).toBeNull();
  });

  it('Right: the proposal is index-aligned with the order it was given', () => {
    // It becomes `colorMap` directly, and `colorMap` is indexed by canonical position. An off-by-one here
    // would annotate every colour as its neighbour.
    const order = [NOTHING, LIGHT, DARK];
    const proposal = suggest(order);
    expect(proposal.map((p) => p.colour)).toEqual(order);
  });

  it('Zero: an empty order proposes nothing rather than failing', () => {
    expect(suggest([])).toEqual([]);
  });
});
