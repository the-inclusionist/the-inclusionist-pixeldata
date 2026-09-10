// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE FOUR PANELS IN THE DOM. The arithmetic lives in `annotate.ts` and `workspace.ts` and is proved in
// Node; this file only puts it on screen and takes clicks back.
//
// 🎯 THE SENTENCE THE LAYOUT SERVES: «este software não é pra definir o que significa a COR, mas o que
// significa o PÍXEL naquela posição». So panel 4 lists POSITIONS, not colours — swapping the palette in
// panel 3 changes every swatch and moves not one annotation.
//
// ⚠️ THE EXPLANATION GOES TO THE FOOTER AND STAYS THERE (CLAUDE.md, by Gestalt). Nothing here writes prose
// into a panel: a panel shows the thing, the footer says what it means, and `aria-live` reads the change out.
import { isolate } from './annotate.ts';
import { annotationProblem, difference, recomposedPixels, type Draft } from './save.ts';
import { unpack, type SheetView } from './import.ts';
import { paletteColours, sheetIn, type Workspace, type PaletteView, type DrawingView } from './workspace.ts';
import { NOTHING } from '../format/semantic.ts';
import { t } from './i18n.ts';

/** What panel 1 is showing: the annotated art, what the FILE gives back, or where the two disagree. */
export type View = 'original' | 'recomposed' | 'difference';

export interface Selection {
  workspace: Workspace;
  drawing: DrawingView;
  palette: PaletteView;
  /** A position in the BASE palette's index space, singled out in panel 1 — or `null` for the whole picture. */
  isolated: number | null;
  view: View;
}

const SCALE = 4; // 📌 The Dev asked for 4× by name: it is what makes a 16-pixel tile readable to a person.

/** The file that is this drawing wearing this palette, when that palette holds it. */
export const currentSheet = (selection: Selection): SheetView =>
  sheetIn(selection.palette, selection.drawing) ?? selection.drawing.sheet;

/**
 * 🔴 PANEL 1 ALWAYS DRAWS THE BASE DRAWING'S GRID WEARING THE CURRENT PALETTE'S COLOURS, and that is the
 * decision that keeps everything else simple: `isolated` is a position in ONE index space no matter which
 * palette is on screen, so a click in panel 4 means the same thing before and after a swap.
 *
 * Drawing the chosen file's own pixels instead would need a second index space per palette, and the two
 * would have to be kept in step by hand — exactly the class of mistake that has no symptom.
 */
export function artPixels(
  selection: Selection,
  draft: Draft,
): { rgba: Uint8Array; unreachable: number } | { problem: string } {
  const { workspace, drawing, palette, isolated, view } = selection;
  const colours = paletteColours(workspace, palette);
  const unreachable = colours.filter((c) => c === undefined).length;

  if (view === 'original') return { rgba: isolate(colours, drawing.sheet.grid, isolated), unreachable };

  const problem = annotationProblem(draft);
  if (problem) return { problem };

  const back = recomposedPixels(draft, drawing.sheet.name);
  if (view === 'recomposed') return { rgba: back, unreachable };
  // The difference is against the FILE that palette actually holds — which is what proves the
  // correspondence, now ACROSS palettes rather than only within one.
  return { rgba: difference(back, currentSheet(selection).image.rgba).pixels, unreachable };
}

/** Put pixels on a canvas at 4×, scaling with CSS so every pixel stays a square. */
export function paintArt(canvas: HTMLCanvasElement, sheet: SheetView, rgba: Uint8Array): void {
  const { width, height } = sheet.image;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * SCALE}px`;
  canvas.style.height = `${height * SCALE}px`;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
}

function thumbnail(sheet: SheetView, colours: readonly (number | undefined)[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  paintArt(canvas, sheet, isolate(colours, sheet.grid, null));
  // A thumbnail is a thumbnail: the 4× belongs to panel 1, and here a sheet has to fit in a strip.
  canvas.style.width = '';
  canvas.style.height = '';
  return canvas;
}

/**
 * PANEL 2 — the unique images, one per DRAWING, each badged with how many palettes hold it.
 *
 * 📏 The badge is the fact the Liberated Pixel Cup hides: `Body/Base/Human_male/` looks like eight sheets in
 * eight palettes and it is not. `walk.png` is FOUR different drawings across those folders and `idle.png` is
 * two, at two different dimensions. A badge reading 3 is telling the truth.
 */
export function paintDrawings(host: HTMLElement, selection: Selection, onPick: (drawing: DrawingView) => void): void {
  const colours = paletteColours(selection.workspace, selection.palette);
  const list = document.createElement('ul');
  list.className = 'thumbs';

  for (const drawing of selection.workspace.drawings) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    const current = drawing.sheet.drawingHash === selection.drawing.sheet.drawingHash;
    if (current) button.classList.add('is-current');
    button.setAttribute('aria-current', String(current));

    const name = document.createElement('span');
    name.className = 'thumb-name';
    name.textContent = drawing.sheet.name.split('/').pop() ?? drawing.sheet.name;

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(drawing.paletteCount);
    // A number in a circle says nothing on its own to something that cannot see it.
    badge.setAttribute('aria-label', `${drawing.paletteCount} ${t('badge.palettes')}`);

    button.append(thumbnail(drawing.sheet, colours), name, badge);
    button.addEventListener('click', () => onPick(drawing));
    item.append(button);
    list.append(item);
  }
  host.replaceChildren(list);
}

/**
 * PANEL 3 — the palettes found, and swapping between them is the whole point.
 *
 * 🎯 A swap changes every swatch in panel 4 and every colour in panel 1, and moves NOT ONE annotation. That
 * is what «what the pixel at that position means» buys: the meaning was never attached to a colour.
 */
export function paintPalettes(host: HTMLElement, selection: Selection, onPick: (palette: PaletteView) => void): void {
  const list = document.createElement('ul');
  list.className = 'thumbs';

  for (const palette of selection.workspace.palettes) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb thumb--palette';
    const current = palette === selection.palette;
    if (current) button.classList.add('is-current');
    button.setAttribute('aria-current', String(current));

    // The strip of colours IS the palette, and it is more recognisable than any name.
    const strip = document.createElement('span');
    strip.className = 'strip';
    for (const colour of paletteColours(selection.workspace, palette)) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      if (colour !== undefined) chip.style.setProperty('--swatch', swatchStyle(colour));
      strip.append(chip);
    }

    const name = document.createElement('span');
    name.className = 'thumb-name';
    name.textContent = palette.name;

    button.append(strip, name);
    button.addEventListener('click', () => onPick(palette));
    item.append(button);
    list.append(item);
  }
  host.replaceChildren(list);
}

const swatchStyle = (colour: number): string => {
  const [r, g, b, a] = unpack(colour);
  return colour === NOTHING ? 'transparent' : `rgba(${r}, ${g}, ${b}, ${a / 255})`;
};

export interface ColourRowHandlers {
  readonly onIsolate: (index: number | null) => void;
  readonly onRegion: (index: number, region: string | null) => void;
  readonly onLevel: (index: number, level: number) => void;
}

/**
 * PANEL 4 — one row per POSITION in the base palette's index space, wearing the current palette's colour.
 *
 * 🔴 THIS IS WHERE THE IDEA IS VISIBLE. The swatch changes when the palette changes; the region and the
 * level do not, because they were never about the colour. 📏 A median measured file has 7 positions and the
 * worst in the LPC has 253 — the person decides once, for every palette at once.
 */
export function paintColours(host: HTMLElement, selection: Selection, handlers: ColourRowHandlers): void {
  const { workspace, palette, isolated } = selection;
  const base = workspace.base;
  const colours = paletteColours(workspace, palette);
  const list = document.createElement('ul');
  list.className = 'colours';

  base.order.forEach((_, index) => {
    const meaning = base.positions[index]!;
    const colour = colours[index];
    const row = document.createElement('li');
    row.className = 'colour';
    if (index === isolated) row.classList.add('is-isolated');
    if (colour === undefined) row.classList.add('is-unreachable');

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    // 🔴 A CUSTOM PROPERTY, read by `.swatch::after`, and NOT `backgroundColor` on the element.
    // `background-color` is the BOTTOM layer in CSS and `background-image` paints over it, so the
    // chequerboard the stylesheet uses as a backdrop would sit IN FRONT of the colour.
    if (colour !== undefined) swatch.style.setProperty('--swatch', swatchStyle(colour));
    swatch.setAttribute('aria-pressed', String(index === isolated));
    swatch.setAttribute('aria-label', `${describe(colour)} · ${base.counts[index]}`);
    swatch.addEventListener('click', () => handlers.onIsolate(index === isolated ? null : index));

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(base.counts[index]);

    // 🔴 FREE TEXT, NOT A LIST. The vocabulary is whatever this artwork needs, and the file is written to be
    // read by a language model — «pele», «couro do cinto», «brilho da lâmina» are all better answers than
    // anything a dropdown could have offered. An empty field means the position is nothing at all.
    const region = document.createElement('input');
    region.type = 'text';
    region.className = 'region';
    region.value = meaning.region ?? '';
    region.placeholder = t('row.regionPlaceholder');
    region.setAttribute('aria-label', t('row.region'));
    region.addEventListener('change', () => handlers.onRegion(index, region.value.trim() || null));

    const level = document.createElement('input');
    level.type = 'number';
    level.min = '0';
    level.className = 'level';
    level.value = String(meaning.level);
    level.setAttribute('aria-label', t('row.level'));
    level.disabled = meaning.region === null; // nothing has no ramp, so it has no step to sit on
    level.addEventListener('change', () => handlers.onLevel(index, Math.max(0, Number(level.value) | 0)));

    row.append(swatch, count, region, level);
    list.append(row);
  });

  host.replaceChildren(list);
}

const describe = (colour: number | undefined): string =>
  colour === undefined ? t('colour.unreachable') : colour === NOTHING ? t('colour.nothing') : hex(colour);

const hex = (colour: number): string => {
  const [r, g, b, a] = unpack(colour);
  const pair = (n: number): string => n.toString(16).padStart(2, '0');
  return a === 255 ? `#${pair(r)}${pair(g)}${pair(b)}` : `#${pair(r)}${pair(g)}${pair(b)}${pair(a)}`;
};

/** What the footer says right now. It is the only place prose is allowed to live. */
export function explain(selection: Selection | null, refused: number, unreachable: number): string {
  if (!selection) return t('state.empty');
  const { workspace, drawing, palette, isolated } = selection;
  const sheet = currentSheet(selection);
  const parts = [
    `${drawing.sheet.name.split('/').pop()} · ${sheet.image.width}×${sheet.image.height}`,
    `${t('explain.palette')}: ${palette.name}`,
    `${t('explain.images')}: ${workspace.drawings.length}`,
    `${t('explain.palettes')}: ${workspace.palettes.length}`,
    `${t('explain.positions')}: ${workspace.base.order.length}`,
    `${t('workspace.files')}: ${workspace.files}`,
  ];
  if (isolated !== null) {
    parts.push(`${t('explain.isolated')}: ${describe(paletteColours(workspace, palette)[isolated])}`);
  }
  if (unreachable > 0) parts.push(`⚠️ ${t('explain.unreachable')}: ${unreachable}`);
  if (selection.view !== 'original') parts.push(t(`view.${selection.view}`));
  if (refused > 0) parts.push(`${t('explain.refused')}: ${refused}`);
  return parts.join(' · ');
}
