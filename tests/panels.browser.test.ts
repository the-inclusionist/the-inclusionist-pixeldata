// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2 IN A REAL BROWSER. The arithmetic is proved in Node; what is proved here is the part Node
// cannot see — that a click reaches the canvas, that the canvas holds the pixels `isolate` computed, and
// that a swatch says what it is to something that cannot see colour.
import { describe, it, expect, beforeEach } from 'vitest';
import { paintArt, paintColours, paintSet, artPixels, type Selection } from '../src/app/panels.ts';
import { packColour, NOTHING, type Meaning } from '../src/format/semantic.ts';
import type { SetView, SheetView } from '../src/app/import.ts';

const RED = packColour([200, 40, 40, 255]);
const DARK = packColour([30, 30, 30, 255]);

/** A 2×2: red, dark, dark, nothing. Small enough to read every pixel of the assertion. */
function aSelection(isolated: number | null): Selection {
  const order = [NOTHING, DARK, RED];
  const grid = Int32Array.from([2, 1, 1, 0]);
  const sheet: SheetView = {
    name: 'tiny.png',
    // ⚠️ The pixels MUST agree with (order, grid): the difference view compares what comes back out of the
    // file against this array, so a placeholder of zeros would light up every pixel and prove nothing.
    image: {
      width: 2, height: 2,
      rgba: Uint8Array.from([200, 40, 40, 255, 30, 30, 30, 255, 30, 30, 30, 255, 0, 0, 0, 0]),
      colorManagementChunks: [], colorType: 6,
    },
    grid,
    drawingHash: 'x',
  };
  const set: SetView = {
    paletteHash: 'p',
    order,
    sheets: [sheet],
    counts: [1, 2, 1],
    colorMap: [{ region: 0, level: 0 }, { region: 1, level: 0 }, { region: 1, level: 1 }] as Meaning[],
    regionNames: { 1: 'material' },
  };
  return { set, sheet, isolated, view: 'original' };
}

const NO_OP = { onIsolate: () => {}, onRegion: () => {}, onLevel: () => {} };

function pixelsOf(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d')!;
  return [...ctx.getImageData(0, 0, canvas.width, canvas.height).data];
}

let canvas: HTMLCanvasElement;
let host: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  canvas = document.createElement('canvas');
  host = document.createElement('div');
  document.body.append(canvas, host);
});

const SOURCE = { author: 'x', url: 'x', door: 'grant', licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null };
const draftFor = (selection: Selection) => ({ name: 'tiny', set: selection.set, source: SOURCE });

/** Draw whatever the current view says, the way `main.ts` does it. */
function show(selection: Selection): number[] {
  const drawn = artPixels(selection, draftFor(selection));
  if ('problem' in drawn) throw new Error(drawn.problem);
  paintArt(canvas, selection.sheet, drawn.rgba);
  return pixelsOf(canvas);
}

describe('paintArt', () => {
  it('Right: the canvas is the image at its own size, and CSS does the 4×', () => {
    // Scaling the backing store instead would blur the art on any browser that resamples, and the whole
    // point of showing pixel art larger is that each pixel stays a square.
    show(aSelection(null));
    expect(canvas.width).toBe(2);
    expect(canvas.style.width).toBe('8px');
  });

  it('🎯 THE GESTURE: with a colour chosen, it keeps its bytes and the rest go grey', () => {
    const pixels = show(aSelection(2)); // index 2 is the red
    expect(pixels.slice(0, 4)).toEqual([200, 40, 40, 255]); // the chosen one, untouched
    const grey = Math.round(0.299 * 30 + 0.587 * 30 + 0.114 * 30);
    expect(pixels.slice(4, 8)).toEqual([grey, grey, grey, 255]); // everything else
  });

  it('Right: with nothing chosen it is the true picture, undistorted', () => {
    const pixels = show(aSelection(null));
    expect(pixels.slice(0, 4)).toEqual([200, 40, 40, 255]);
    expect(pixels.slice(4, 8)).toEqual([30, 30, 30, 255]);
  });
});

describe('the view switcher, which is where the round trip is watched', () => {
  it('🔴 THE PROOF ON SCREEN: what comes back out of the FILE is the picture that went in', () => {
    const selection = { ...aSelection(null), view: 'recomposed' as const };
    const pixels = show(selection);
    expect(pixels.slice(0, 4)).toEqual([200, 40, 40, 255]);
    expect(pixels.slice(4, 8)).toEqual([30, 30, 30, 255]);
  });

  it('🔴 Right: with a sound annotation the difference view is empty — nothing lights up', () => {
    const pixels = show({ ...aSelection(null), view: 'difference' as const });
    expect(pixels.every((byte) => byte === 0)).toBe(true);
  });

  it('🔴 Boundary: an annotation that cannot be read back REFUSES to draw and says why', () => {
    // Drawing something plausible here would be the worst outcome: the person would believe the annotation
    // closes, and find out when a game renders their art wrong.
    const selection = { ...aSelection(null), view: 'recomposed' as const };
    selection.set.colorMap = [{ region: 0, level: 0 }, { region: 1, level: 0 }, { region: 1, level: 0 }];
    const drawn = artPixels(selection, draftFor(selection));
    expect('problem' in drawn && drawn.problem).toMatch(/claimed twice/i);
  });
});

describe('paintSet — panel 3', () => {
  it('Right: one thumbnail per sheet of the set, and the current one is marked', () => {
    const selection = aSelection(null);
    paintSet(host, selection, () => {});
    const thumbs = host.querySelectorAll('.thumb');
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0]!.getAttribute('aria-current')).toBe('true');
  });

  it('Interface: clicking a thumbnail asks for that sheet by index', () => {
    const picked: number[] = [];
    paintSet(host, aSelection(null), (i) => picked.push(i));
    host.querySelector<HTMLButtonElement>('.thumb')!.click();
    expect(picked).toEqual([0]);
  });

  it('Right: a thumbnail is the TRUE picture, never the isolated one', () => {
    // Panel 3 is for recognising a sheet. Greying it to match whatever panel 1 is doing would make every
    // thumbnail look alike at the exact moment the person is trying to tell them apart.
    paintSet(host, aSelection(2), () => {});
    const thumb = host.querySelector('canvas') as HTMLCanvasElement;
    const pixels = [...thumb.getContext('2d')!.getImageData(0, 0, 2, 2).data];
    expect(pixels.slice(4, 8)).toEqual([30, 30, 30, 255]);
  });
});

describe('paintColours', () => {
  it('Right: one row per colour of the SET, not of the sheet on screen', () => {
    paintColours(host, aSelection(null), NO_OP);
    expect(host.querySelectorAll('.colour')).toHaveLength(3);
  });

  it('🔴 Right: a swatch says what it is, because a coloured square says nothing to a screen reader', () => {
    paintColours(host, aSelection(null), NO_OP);
    const labels = [...host.querySelectorAll('.swatch')].map((s) => s.getAttribute('aria-label'));
    expect(labels[2]).toContain('#c82828');
    expect(labels[0]).toMatch(/nada|nothing|nada \(/i); // the transparent one is named, not left blank
  });

  it('🎯 Interface: clicking a swatch asks to isolate it, and clicking it again asks to stop', () => {
    const asked: (number | null)[] = [];
    paintColours(host, aSelection(null), { ...NO_OP, onIsolate: (i) => asked.push(i) });
    host.querySelectorAll<HTMLButtonElement>('.swatch')[2]!.click();

    paintColours(host, aSelection(2), { ...NO_OP, onIsolate: (i) => asked.push(i) });
    host.querySelectorAll<HTMLButtonElement>('.swatch')[2]!.click();

    expect(asked).toEqual([2, null]);
  });

  it('Right: the isolated row is marked, and the swatch reports it as pressed', () => {
    paintColours(host, aSelection(2), NO_OP);
    const rows = host.querySelectorAll('.colour');
    expect(rows[2]!.classList.contains('is-isolated')).toBe(true);
    expect(rows[2]!.querySelector('.swatch')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('Boundary: the level field is disabled for nothing, which has no ramp to sit on', () => {
    paintColours(host, aSelection(null), NO_OP);
    const level = host.querySelectorAll<HTMLInputElement>('.colour .level')[0]!;
    expect(level.disabled).toBe(true);
  });

  it('🔴 Right: the colour goes ABOVE the chequerboard, not behind it', () => {
    // The defect this guards was found on screen, not in a test: `background-color` is the bottom layer and
    // `background-image` paints over it, so the stylesheet's chequerboard sat IN FRONT of the colour and
    // opaque swatches wore grey triangles. The colour travels as a custom property that `.swatch::after`
    // reads, which puts it on the upper layer — where an opaque colour hides the board and a
    // semi-transparent one shows through. 📏 119 of 197 measured files carry partial alpha.
    paintColours(host, aSelection(null), NO_OP);
    const swatch = host.querySelectorAll<HTMLElement>('.swatch')[2]!; // the opaque red
    expect(swatch.style.getPropertyValue('--swatch')).toBe('rgba(200, 40, 40, 1)');
    expect(swatch.style.backgroundColor).toBe('');
    expect(swatch.style.backgroundImage).toBe('');
  });
});
