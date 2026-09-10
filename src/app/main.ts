// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The wiring, and nothing else. Decoding is in `src/png/`, grouping in `src/group/`, the format in
// `src/format/`, the arithmetic of the panels in `annotate.ts`, and the drawing in `panels.ts` — every one
// of those is proved in Node without a browser. What is left here is what only a browser can do: read a
// file the person chose, and hand a click back.
import { applyTranslations, setLanguage, t, LANGUAGES, type Language } from './i18n.ts';
import { importFiles, type Imported, type SetView } from './import.ts';
import { paintArt, paintColours, explain, type Selection } from './panels.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

let imported: Imported = { sets: [], refused: [] };
let selection: Selection | null = null;

/** Rebuild everything from the current state. Small enough to redraw whole; big enough to be one function. */
function render(): void {
  const art = $<HTMLCanvasElement>('art-canvas');
  const chooser = $<HTMLSelectElement>('sheet');

  if (!selection) {
    art.hidden = true;
    chooser.hidden = true;
    $('colours').replaceChildren();
  } else {
    art.hidden = false;
    chooser.hidden = false;
    paintArt(art, selection);
    paintColours($('colours'), selection, {
      onIsolate: (index) => { selection!.isolated = index; render(); },
      onRegion: (index, region) => { selection!.set.colorMap[index] = { region, level: selection!.set.colorMap[index]!.level }; render(); },
      onLevel: (index, level) => { selection!.set.colorMap[index] = { region: selection!.set.colorMap[index]!.region, level }; render(); },
    });
  }

  $('explain').textContent = `${explain(selection, imported.refused.length)} — ${t('state.notWired')}`;
  renderRefusals();
}

/** ⚠️ A refused file is NAMED. Silently dropping one lets a person annotate a set that is missing a sheet. */
function renderRefusals(): void {
  const host = $('refused');
  if (imported.refused.length === 0) { host.replaceChildren(); return; }
  const list = document.createElement('ul');
  list.className = 'refused';
  for (const { name, why } of imported.refused) {
    const item = document.createElement('li');
    item.textContent = `${name} — ${t('read.failed')} ${why}`;
    list.append(item);
  }
  host.replaceChildren(list);
}

/** Every sheet of every set, so panel 1 has something to show before panel 3 exists to choose from. */
function fillChooser(): void {
  const chooser = $<HTMLSelectElement>('sheet');
  chooser.replaceChildren();
  imported.sets.forEach((set, s) => {
    set.sheets.forEach((sheet, i) => {
      const option = document.createElement('option');
      option.value = `${s}:${i}`;
      option.textContent = imported.sets.length > 1 ? `${sheet.name} (${s + 1})` : sheet.name;
      chooser.append(option);
    });
  });
}

function select(setIndex: number, sheetIndex: number): void {
  const set = imported.sets[setIndex] as SetView | undefined;
  const sheet = set?.sheets[sheetIndex];
  selection = set && sheet ? { set, sheet, isolated: null } : null;
}

function addRegion(name: string): void {
  if (!selection || !name.trim()) return;
  const ids = Object.keys(selection.set.regionNames).map(Number);
  selection.set.regionNames[Math.max(0, ...ids) + 1] = name.trim();
  render();
}

function start(): void {
  const languageChooser = $<HTMLSelectElement>('lang');
  languageChooser.addEventListener('change', () => {
    if (isLanguage(languageChooser.value)) {
      setLanguage(languageChooser.value);
      applyTranslations();
      render();
    }
  });

  $<HTMLInputElement>('files').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const chosen = Array.from(input.files ?? []);
    imported = await importFiles(
      await Promise.all(chosen.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))),
    );
    fillChooser();
    select(0, 0);
    render();
  });

  $<HTMLSelectElement>('sheet').addEventListener('change', (event) => {
    const [s, i] = (event.currentTarget as HTMLSelectElement).value.split(':').map(Number);
    select(s!, i!);
    render();
  });

  const newRegion = $<HTMLInputElement>('new-region');
  $<HTMLButtonElement>('add-region').addEventListener('click', () => {
    addRegion(newRegion.value);
    newRegion.value = '';
  });

  setLanguage('pt-BR');
  applyTranslations();
  render();
}

start();
