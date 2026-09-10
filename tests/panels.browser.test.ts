// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE FOUR PANELS IN A REAL BROWSER. The arithmetic is proved in Node; what is proved here is the part Node
// cannot see — that a click reaches the canvas, that the canvas holds the pixels the model computed, and
// that a swatch says what it is to something that cannot see colour.
//
// 🎯 THE CASE THIS FILE EXISTS FOR is in panel 4: swap the palette, and every swatch changes while not one
// annotation moves. That is «o que significa o PÍXEL naquela posição» made visible.
import { describe, it, expect, beforeEach } from 'vitest';
import { buildPng } from './helpers/build-png.ts';
import { importFiles } from '../src/app/import.ts';
import { workspaceFor } from '../src/app/workspace.ts';
import {
  artPixels, paintArt, paintColours, paintDrawings, paintPalettes, currentSheet, type Selection,
} from '../src/app/panels.ts';

const COFFEE = [[90, 60, 40, 255], [40, 26, 18, 255]];
const IVORY = [[230, 220, 200, 255], [150, 140, 120, 255]];

const CLEAR = [0, 0, 0, 0];

// ⚠️ Both carry a transparent pixel, because «nothing» is a POSITION like any other and the panel has to
// show it. A fixture with no transparency quietly skips the one row whose level field must be disabled.
const walk = (a: number[], b: number[]): Promise<Uint8Array> =>
  buildPng({ width: 3, height: 1, colorType: 6, scanlines: [[0, ...a, ...b, ...CLEAR]] });
// A different drawing, and its colours are a SUBSET of walk's — which is what containment grouping is for.
const hurt = (a: number[], _b: number[]): Promise<Uint8Array> =>
  buildPng({ width: 3, height: 1, colorType: 6, scanlines: [[0, ...a, ...a, ...CLEAR]] });

/** Two drawings in two palettes, laid out the way the Liberated Pixel Cup lays them out. */
async function aSelection(): Promise<Selection> {
  const imported = await importFiles([
    { name: 'Human_male/Coffee/walk.png', bytes: await walk(COFFEE[0]!, COFFEE[1]!) },
    { name: 'Human_male/Coffee/hurt.png', bytes: await hurt(COFFEE[0]!, COFFEE[1]!) },
    { name: 'Human_male/Ivory/walk.png', bytes: await walk(IVORY[0]!, IVORY[1]!) },
    { name: 'Human_male/Ivory/hurt.png', bytes: await hurt(IVORY[0]!, IVORY[1]!) },
  ]);
  const workspace = workspaceFor(imported, imported.sets[0]!);
  return {
    workspace,
    drawing: workspace.drawings[0]!,
    palette: workspace.palettes[0]!,
    isolated: null,
    view: 'original',
  };
}

const SOURCE = { author: 'x', url: 'x', door: 'grant', licence: 'CC0-1.0', outgoingLicence: 'CC0-1.0', derivedFrom: null };
const draftFor = (s: Selection) => ({ name: 'human', set: s.workspace.base, source: SOURCE });
const NO_OP = { onIsolate: (): void => {}, onRegion: (): void => {}, onLevel: (): void => {} };

let canvas: HTMLCanvasElement;
let host: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  canvas = document.createElement('canvas');
  host = document.createElement('div');
  document.body.append(canvas, host);
});

function show(selection: Selection): number[] {
  const drawn = artPixels(selection, draftFor(selection));
  if ('problem' in drawn) throw new Error(drawn.problem);
  paintArt(canvas, currentSheet(selection), drawn.rgba);
  return [...canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data];
}

describe('panel 1 — the image at 4×', () => {
  it('Right: the canvas is the image at its own size, and CSS does the 4×', async () => {
    // Scaling the backing store instead would blur the art on any browser that resamples, and the whole
    // point of showing pixel art larger is that each pixel stays a square.
    show(await aSelection());
    expect(canvas.width).toBe(3);
    expect(canvas.style.width).toBe('12px');
  });

  it('🎯 THE GESTURE: with a position chosen, everything else drops to grey', async () => {
    const selection = await aSelection();
    const opaque = selection.workspace.base.order.findIndex((c) => c !== -1);
    const pixels = show({ ...selection, isolated: opaque });
    let greys = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      if (pixels[i] === pixels[i + 1] && pixels[i + 1] === pixels[i + 2]) greys++;
    }
    expect(greys).toBeGreaterThan(0);
  });

  it('🔴 Right: swapping the palette repaints the SAME shape in other colours', async () => {
    const selection = await aSelection();
    const other = selection.workspace.palettes.find((p) => p.set !== selection.workspace.base)!;
    const before = show(selection);
    const after = show({ ...selection, palette: other });

    // The alpha channel is the shape, and the shape must not move.
    const shape = (px: number[]): number[] => px.filter((_, i) => i % 4 === 3);
    expect(shape(after)).toEqual(shape(before));
    expect(after).not.toEqual(before); // the colours must
  });
});

describe('panel 2 — the unique images, with the badge', () => {
  it('🎯 Right: one thumbnail per DRAWING, and the badge is how many palettes hold it', async () => {
    const selection = await aSelection();
    paintDrawings(host, selection, () => {});
    expect(host.querySelectorAll('.thumb')).toHaveLength(selection.workspace.drawings.length);
    expect([...host.querySelectorAll('.badge')].map((b) => b.textContent))
      .toEqual(selection.workspace.drawings.map((d) => String(d.paletteCount)));
  });

  it('🔴 Right: the badge says what it is, because a number in a circle is silent', async () => {
    paintDrawings(host, await aSelection(), () => {});
    expect(host.querySelector('.badge')!.getAttribute('aria-label')).toMatch(/\d+ (paletas|palettes)/);
  });

  it('Interface: clicking a thumbnail asks for that drawing', async () => {
    const selection = await aSelection();
    const picked: string[] = [];
    paintDrawings(host, selection, (d) => picked.push(d.sheet.name));
    host.querySelectorAll<HTMLButtonElement>('.thumb')[1]!.click();
    expect(picked).toEqual([selection.workspace.drawings[1]!.sheet.name]);
  });
});

describe('panel 3 — the palettes found', () => {
  it('Right: one entry per palette, named by its folder and the current one marked', async () => {
    paintPalettes(host, await aSelection(), () => {});
    expect([...host.querySelectorAll('.thumb-name')].map((n) => n.textContent).sort()).toEqual(['Coffee', 'Ivory']);
    expect(host.querySelector('.thumb.is-current')!.getAttribute('aria-current')).toBe('true');
  });

  it('Right: a palette is shown by its COLOURS, which is what a person recognises', async () => {
    const selection = await aSelection();
    paintPalettes(host, selection, () => {});
    expect(host.querySelectorAll('.chip').length)
      .toBe(selection.workspace.base.order.length * selection.workspace.palettes.length);
  });

  it('Interface: clicking a palette asks for it', async () => {
    const selection = await aSelection();
    const picked: string[] = [];
    paintPalettes(host, selection, (p) => picked.push(p.name));
    host.querySelectorAll<HTMLButtonElement>('.thumb')[1]!.click();
    expect(picked).toEqual([selection.workspace.palettes[1]!.name]);
  });
});

describe('panel 4 — the positions, and what each one means', () => {
  it('Right: one row per POSITION in the base index space, not per colour of the sheet on screen', async () => {
    const selection = await aSelection();
    paintColours(host, selection, NO_OP);
    expect(host.querySelectorAll('.colour')).toHaveLength(selection.workspace.base.order.length);
  });

  it('🎯 🔴 THE WHOLE IDEA: swapping the palette changes every swatch and moves NOT ONE annotation', async () => {
    const selection = await aSelection();
    const other = selection.workspace.palettes.find((p) => p.set !== selection.workspace.base)!;

    const read = (): { swatches: string[]; meanings: string[] } => ({
      swatches: [...host.querySelectorAll<HTMLElement>('.swatch')].map((s) => s.style.getPropertyValue('--swatch')),
      meanings: [...host.querySelectorAll('.colour')].map((row) =>
        `${row.querySelector<HTMLSelectElement>('.region')!.value}/${row.querySelector<HTMLInputElement>('.level')!.value}`),
    });

    paintColours(host, selection, NO_OP);
    const before = read();
    paintColours(host, { ...selection, palette: other }, NO_OP);
    const after = read();

    expect(after.meanings).toEqual(before.meanings); // the annotation did not move
    expect(after.swatches).not.toEqual(before.swatches); // the colours did
  });

  it('🔴 Right: the colour goes ABOVE the chequerboard, not behind it', async () => {
    // `background-color` is the BOTTOM layer and `background-image` paints over it, so setting the colour on
    // the element would put the stylesheet's chequerboard IN FRONT of it.
    const selection = await aSelection();
    paintColours(host, selection, NO_OP);
    const opaque = selection.workspace.base.order.findIndex((c) => c !== -1);
    const swatch = host.querySelectorAll<HTMLElement>('.swatch')[opaque]!;
    expect(swatch.style.getPropertyValue('--swatch')).toMatch(/^rgba\(/);
    expect(swatch.style.backgroundColor).toBe('');
    expect(swatch.style.backgroundImage).toBe('');
  });

  it('Boundary: the level field is disabled for nothing, which has no ramp to sit on', async () => {
    const selection = await aSelection();
    paintColours(host, selection, NO_OP);
    const nothing = selection.workspace.base.order.indexOf(-1);
    expect(host.querySelectorAll<HTMLInputElement>('.colour .level')[nothing]!.disabled).toBe(true);
  });
});
