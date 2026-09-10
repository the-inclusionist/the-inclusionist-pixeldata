// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The page shell, and what it can honestly do TODAY: open PNGs with our own decoder and say what it found.
// The four panels exist in the markup and are not wired; the footer says so in words.
//
// 🎯 This is not filler. It runs `decodePng` in a real browser, which is the half of ADR-0134 §7 that Node
// cannot prove: the decoder must work with `DecompressionStream` in Chromium, and it must be the thing that
// reads the file rather than `createImageBitmap`.
import { decodePng, type DecodedPng } from '../png/decode.ts';
import { applyTranslations, setLanguage, t, LANGUAGES, type Language } from './i18n.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

/** Count the distinct colours and how many pixels are neither fully opaque nor fully transparent. */
function survey(img: DecodedPng): { colors: number; partialAlpha: number } {
  const seen = new Set<number>();
  let partialAlpha = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const d = i * 4;
    const a = img.rgba[d + 3]!;
    if (a !== 0 && a !== 255) partialAlpha++;
    // A fully transparent pixel is the SAME absence whatever RGB sits under it, so it collapses to one key.
    seen.add(a === 0 ? -1 : ((img.rgba[d]! << 24) | (img.rgba[d + 1]! << 16) | (img.rgba[d + 2]! << 8) | a) >>> 0);
  }
  return { colors: seen.size, partialAlpha };
}

function row(label: string, value: string): HTMLElement {
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'k';
  name.textContent = label;
  const val = document.createElement('strong');
  val.textContent = value;
  li.append(name, val);
  return li;
}

async function report(file: File): Promise<HTMLElement> {
  const section = document.createElement('article');
  const title = document.createElement('h3');
  title.textContent = file.name;
  section.append(title);

  try {
    const img = await decodePng(new Uint8Array(await file.arrayBuffer()));
    const { colors, partialAlpha } = survey(img);
    const list = document.createElement('ul');
    list.className = 'facts';
    list.append(
      row(t('read.size'), `${img.width} × ${img.height}`),
      row(t('read.colorType'), String(img.colorType)),
      row(t('read.colors'), String(colors)),
      row(t('read.partialAlpha'), String(partialAlpha)),
      row(t('read.colorChunks'), img.colorManagementChunks.join(', ') || t('read.none')),
    );
    section.append(list);
  } catch (error) {
    const problem = document.createElement('p');
    problem.className = 'problem';
    problem.textContent = `${t('read.failed')} ${error instanceof Error ? error.message : String(error)}`;
    section.append(problem);
  }
  return section;
}

function start(): void {
  const select = $<HTMLSelectElement>('lang');
  select.addEventListener('change', () => {
    if (isLanguage(select.value)) {
      setLanguage(select.value);
      applyTranslations();
    }
  });

  $<HTMLInputElement>('files').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const art = $('art');
    art.replaceChildren();
    for (const file of Array.from(input.files ?? [])) art.append(await report(file));
    $('explain').textContent = art.childElementCount > 0 ? t('state.notBuilt') : t('state.empty');
  });

  setLanguage('pt-BR');
  applyTranslations();
}

start();
