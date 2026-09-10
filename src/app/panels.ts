// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2 IN THE DOM. The arithmetic lives in `annotate.ts` and is proved in Node; this file only
// puts it on screen and takes clicks back.
//
// ⚠️ THE EXPLANATION GOES TO THE FOOTER AND STAYS THERE (CLAUDE.md, by Gestalt). Nothing here writes prose
// into a panel: a panel shows the thing, the footer says what it means, and `aria-live` reads the change
// out. That rule is what stops "it is nearby" from becoming a reason to move something.
import { isolate } from './annotate.ts';
import { annotationProblem, difference, recomposedPixels, type Draft } from './save.ts';
import { unpack, type SetView, type SheetView } from './import.ts';
import type { Variant } from './variants.ts';
import { NOTHING } from '../format/semantic.ts';
import { t } from './i18n.ts';

/** What panel 1 is showing: the art, what the FILE gives back, or where the two disagree. */
export type View = 'original' | 'recomposed' | 'difference';

export interface Selection {
  set: SetView;
  sheet: SheetView;
  /** Which canonical index is singled out in panel 1, or `null` for the true picture. */
  isolated: number | null;
  view: View;
}

const SCALE = 4; // 📌 The Dev asked for 4× by name: it is what makes a 16-pixel tile readable to a person.

/**
 * What panel 1 should draw right now, or the reason it cannot.
 *
 * 🔴 `recomposed` goes the LONG way round on purpose — the annotation is written to text, read back, and
 * rebuilt from the harvested palette. Recomposing the objects already in memory would prove nothing about
 * the file, and the file is the deliverable.
 */
export function artPixels(selection: Selection, draft: Draft): { rgba: Uint8Array } | { problem: string } {
  const { set, sheet, isolated, view } = selection;
  if (view === 'original') return { rgba: isolate(set.order, sheet.grid, isolated) };

  const problem = annotationProblem(draft);
  if (problem) return { problem };

  const back = recomposedPixels(draft, sheet.name);
  if (view === 'recomposed') return { rgba: back };
  return { rgba: difference(back, sheet.image.rgba).pixels };
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

/**
 * PANEL 3 — the other sheets that share this palette, which is the set one semantic file covers.
 *
 * 📏 42 of these groups in the 197-file sample, covering 139 files, and every one of them semantically
 * exact: the largest gathers four different subjects that share a palette because they share a MATERIAL.
 */
export function paintSet(host: HTMLElement, selection: Selection, onPick: (index: number) => void): void {
  const list = document.createElement('ul');
  list.className = 'thumbs';

  selection.set.sheets.forEach((sheet, index) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    if (sheet === selection.sheet) button.classList.add('is-current');
    button.setAttribute('aria-current', String(sheet === selection.sheet));

    const canvas = document.createElement('canvas');
    paintArt(canvas, sheet, isolate(selection.set.order, sheet.grid, null));
    // A thumbnail is a thumbnail: the 4× belongs to panel 1, and here the sheet has to fit in a strip.
    canvas.style.width = '';
    canvas.style.height = '';

    const name = document.createElement('span');
    name.className = 'thumb-name';
    name.textContent = sheet.name;

    button.append(canvas, name);
    button.addEventListener('click', () => onPick(index));
    item.append(button);
    list.append(item);
  });

  host.replaceChildren(list);
}

/**
 * PANEL 4 — the same drawing wearing other palettes, and the button that harvests one.
 *
 * 🎯 This is the panel that pays for the tool. 📏 34 groups of these in the 197-file sample covering 100
 * files: every troop and building in four team colours. One annotation, ninety-nine readings.
 */
export function paintVariants(
  host: HTMLElement,
  variants: readonly Variant[],
  taken: ReadonlySet<string>,
  onHarvest: (variant: Variant) => void,
): void {
  if (variants.length === 0) { host.replaceChildren(); return; }
  const list = document.createElement('ul');
  list.className = 'thumbs';

  for (const variant of variants) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'thumb';
    const already = taken.has(variant.name);
    if (already) button.classList.add('is-taken');
    button.setAttribute('aria-pressed', String(already));

    const canvas = document.createElement('canvas');
    // The variant is drawn from its OWN pixels: the person is choosing between colours, so showing them
    // through this set's palette would show them the thing they are trying to tell apart, twice.
    const rgba = new Uint8Array(variant.image.rgba);
    canvas.width = variant.image.width;
    canvas.height = variant.image.height;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), variant.image.width, variant.image.height), 0, 0);

    const name = document.createElement('span');
    name.className = 'thumb-name';
    name.textContent = already ? `✓ ${variant.name}` : variant.name;

    button.append(canvas, name);
    button.addEventListener('click', () => onHarvest(variant));
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
  readonly onRegion: (index: number, region: number) => void;
  readonly onLevel: (index: number, level: number) => void;
}

/**
 * One row per colour of the set: a swatch that isolates it, how many pixels wear it, and the two fields that
 * say what it means.
 *
 * 📏 This is the table the whole tool exists to make short — a median measured file has 7 rows and the worst
 * has 35. The person does not paint; they decide seven times.
 */
export function paintColours(host: HTMLElement, selection: Selection, handlers: ColourRowHandlers): void {
  const { set, isolated } = selection;
  const list = document.createElement('ul');
  list.className = 'colours';

  set.order.forEach((colour, index) => {
    const meaning = set.colorMap[index]!;
    const row = document.createElement('li');
    row.className = 'colour';
    if (index === isolated) row.classList.add('is-isolated');

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'swatch';
    // 🔴 A CUSTOM PROPERTY, read by `.swatch::after`, and NOT `backgroundColor` on the element.
    // `background-color` is the BOTTOM layer in CSS and `background-image` paints over it, so the
    // chequerboard the stylesheet uses as a backdrop would sit IN FRONT of the colour — opaque swatches came
    // out wearing grey triangles. The pseudo-element puts the colour above the board, which is what lets an
    // opaque colour hide it and a semi-transparent one show through. 📏 119 of 197 measured files.
    swatch.style.setProperty('--swatch', swatchStyle(colour));
    swatch.setAttribute('aria-pressed', String(index === isolated));
    // The label carries the colour and the count, because a coloured square says nothing to a screen reader.
    swatch.setAttribute('aria-label', `${colour === NOTHING ? t('colour.nothing') : hex(colour)} · ${set.counts[index]}`);
    swatch.addEventListener('click', () => handlers.onIsolate(index === isolated ? null : index));

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(set.counts[index]);

    const region = document.createElement('select');
    region.className = 'region';
    region.setAttribute('aria-label', t('row.region'));
    for (const [id, name] of [[0, t('region.nothing')] as const, ...Object.entries(set.regionNames).map(([k, v]) => [Number(k), v] as const)]) {
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = name;
      option.selected = id === meaning.region;
      region.append(option);
    }
    region.addEventListener('change', () => handlers.onRegion(index, Number(region.value)));

    const level = document.createElement('input');
    level.type = 'number';
    level.min = '0';
    level.className = 'level';
    level.value = String(meaning.level);
    level.setAttribute('aria-label', t('row.level'));
    level.disabled = meaning.region === 0; // nothing has no ramp, so it has no step to sit on
    level.addEventListener('change', () => handlers.onLevel(index, Math.max(0, Number(level.value) | 0)));

    row.append(swatch, count, region, level);
    list.append(row);
  });

  host.replaceChildren(list);
}

const hex = (colour: number): string => {
  const [r, g, b, a] = unpack(colour);
  const pair = (n: number): string => n.toString(16).padStart(2, '0');
  return a === 255 ? `#${pair(r)}${pair(g)}${pair(b)}` : `#${pair(r)}${pair(g)}${pair(b)}${pair(a)}`;
};

/** What the footer says right now. It is the only place prose is allowed to live. */
export function explain(selection: Selection | null, refused: number): string {
  if (!selection) return t('state.empty');
  const { set, sheet, isolated } = selection;
  const parts = [
    `${sheet.name} · ${sheet.image.width}×${sheet.image.height}`,
    `${t('explain.colours')}: ${set.order.length}`,
    `${t('explain.sheets')}: ${set.sheets.length}`,
  ];
  if (isolated !== null) parts.push(`${t('explain.isolated')}: ${hex(set.order[isolated]!)}`);
  if (selection.view !== 'original') parts.push(t(`view.${selection.view}`));
  if (refused > 0) parts.push(`${t('explain.refused')}: ${refused}`);
  return parts.join(' · ');
}
