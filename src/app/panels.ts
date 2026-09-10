// SPDX-License-Identifier: AGPL-3.0-or-later
//
// PANELS 1 AND 2 IN THE DOM. The arithmetic lives in `annotate.ts` and is proved in Node; this file only
// puts it on screen and takes clicks back.
//
// ⚠️ THE EXPLANATION GOES TO THE FOOTER AND STAYS THERE (CLAUDE.md, by Gestalt). Nothing here writes prose
// into a panel: a panel shows the thing, the footer says what it means, and `aria-live` reads the change
// out. That rule is what stops "it is nearby" from becoming a reason to move something.
import { isolate } from './annotate.ts';
import { unpack, type SetView, type SheetView } from './import.ts';
import { NOTHING } from '../format/semantic.ts';
import { t } from './i18n.ts';

export interface Selection {
  set: SetView;
  sheet: SheetView;
  /** Which canonical index is singled out in panel 1, or `null` for the true picture. */
  isolated: number | null;
}

const SCALE = 4; // 📌 The Dev asked for 4× by name: it is what makes a 16-pixel tile readable to a person.

/** Draw one sheet at 4×, with one colour singled out if the person asked for that. */
export function paintArt(canvas: HTMLCanvasElement, selection: Selection): void {
  const { sheet, set, isolated } = selection;
  const rgba = isolate(set.order, sheet.grid, isolated);

  canvas.width = sheet.image.width;
  canvas.height = sheet.image.height;
  canvas.style.width = `${sheet.image.width * SCALE}px`;
  canvas.style.height = `${sheet.image.height * SCALE}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), sheet.image.width, sheet.image.height), 0, 0);
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
  if (refused > 0) parts.push(`${t('explain.refused')}: ${refused}`);
  return parts.join(' · ');
}
