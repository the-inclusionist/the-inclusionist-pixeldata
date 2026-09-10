// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2 IN A REAL BROWSER. The arithmetic is proved in Node; what is proved here is the part Node
// cannot see — that a click reaches the canvas, that the canvas holds the pixels `isolate` computed, and
// that a swatch says what it is to something that cannot see colour.
import { describe, it, expect, beforeEach } from 'vitest';
import { paintArt, paintColours, type Selection } from '../src/app/panels.ts';
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
    image: { width: 2, height: 2, rgba: new Uint8Array(16), colorManagementChunks: [], colorType: 6 },
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
  return { set, sheet, isolated };
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

describe('paintArt', () => {
  it('Right: the canvas is the image at its own size, and CSS does the 4×', () => {
    // Scaling the backing store instead would blur the art on any browser that resamples, and the whole
    // point of showing pixel art larger is that each pixel stays a square.
    paintArt(canvas, aSelection(null));
    expect(canvas.width).toBe(2);
    expect(canvas.style.width).toBe('8px');
  });

  it('🎯 THE GESTURE: with a colour chosen, it keeps its bytes and the rest go grey', () => {
    paintArt(canvas, aSelection(2)); // index 2 is the red
    const pixels = pixelsOf(canvas);
    expect(pixels.slice(0, 4)).toEqual([200, 40, 40, 255]); // the chosen one, untouched
    const grey = Math.round(0.299 * 30 + 0.587 * 30 + 0.114 * 30);
    expect(pixels.slice(4, 8)).toEqual([grey, grey, grey, 255]); // everything else
  });

  it('Right: with nothing chosen it is the true picture, undistorted', () => {
    paintArt(canvas, aSelection(null));
    const pixels = pixelsOf(canvas);
    expect(pixels.slice(0, 4)).toEqual([200, 40, 40, 255]);
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
