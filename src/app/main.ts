// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The wiring, and nothing else. Decoding is in `src/png/`, grouping in `src/group/`, the format in
// `src/format/`, the arithmetic of the panels in `annotate.ts`, what comes out in `save.ts`, and the drawing
// in `panels.ts` — every one of those is proved without a browser. What is left here is what only a browser
// can do: read a file the person chose, hand a click back, and write a file where they say.
import { applyTranslations, setLanguage, t, LANGUAGES, type Language } from './i18n.ts';
import { importFiles, type Imported, type SetView } from './import.ts';
import { artPixels, paintArt, paintColours, paintSet, paintVariants, explain, type Selection, type View } from './panels.ts';
import { variantsFor, harvestFromVariant, variantName, type Variant } from './variants.ts';
import { buildOutputs, defaultSetName, annotationProblem, type Draft, type OutputFile } from './save.ts';
import type { Palette, Provenance } from '../format/semantic.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

let imported: Imported = { sets: [], refused: [] };
let selection: Selection | null = null;
let notice = '';
/** Palettes harvested in panel 4, per set. They ride along into the one palette file the set writes. */
const harvested = new Map<SetView, { palette: Palette; from: string }[]>();

function provenance(): Provenance {
  return {
    author: $<HTMLInputElement>('src-author').value,
    url: $<HTMLInputElement>('src-url').value,
    door: $<HTMLSelectElement>('src-door').value,
    licence: $<HTMLInputElement>('src-licence').value,
    outgoingLicence: $<HTMLInputElement>('src-licence').value,
    derivedFrom: null,
  };
}

const draftOf = (set: SetView): Draft => ({
  name: $<HTMLInputElement>('set-name').value || 'set',
  set,
  source: provenance(),
  harvested: (harvested.get(set) ?? []).map((h) => h.palette),
});

/**
 * ⚠️ HARVESTING IS A TOGGLE. Clicking a variant that is already taken removes it, because a variant added by
 * mistake would otherwise be stuck in the palette file with no way to take it out but starting over.
 */
function harvest(variant: Variant): void {
  if (!selection) return;
  const set = selection.set;
  const taken = harvested.get(set) ?? [];
  const already = taken.findIndex((h) => h.from === variant.name);
  if (already >= 0) {
    taken.splice(already, 1);
    harvested.set(set, taken);
    notice = '';
    render();
    return;
  }
  try {
    const name = variantName($<HTMLInputElement>('set-name').value || 'set', variant.name);
    const { palette, missing } = harvestFromVariant(set, variant, name);
    taken.push({ palette, from: variant.name });
    harvested.set(set, taken);
    notice = missing.length === 0
      ? `${t('harvest.done')} ${name}`
      : `${t('harvest.partial')} ${name} (${missing.length})`;
  } catch (error) {
    notice = error instanceof Error ? error.message : String(error);
  }
  render();
}

/** Rebuild everything from the current state. Small enough to redraw whole; big enough to be one function. */
function render(): void {
  const canvas = $<HTMLCanvasElement>('art-canvas');
  const problem = $('art-problem');
  const chooser = $<HTMLSelectElement>('sheet');
  const views = $('views');
  const savePanel = $('save-panel');

  for (const el of [chooser, views, savePanel]) el.hidden = selection === null;

  if (!selection) {
    canvas.hidden = true;
    problem.hidden = true;
    $('colours').replaceChildren();
    $('set').replaceChildren();
    $('variants').replaceChildren();
  } else {
    const drawn = artPixels(selection, draftOf(selection.set));
    if ('problem' in drawn) {
      canvas.hidden = true;
      problem.hidden = false;
      problem.textContent = drawn.problem;
    } else {
      problem.hidden = true;
      // Cleared, not just hidden. A hidden element holding the last problem is a stale answer waiting for
      // the next time something reads the DOM instead of the screen.
      problem.textContent = '';
      canvas.hidden = false;
      paintArt(canvas, selection.sheet, drawn.rgba);
    }

    paintColours($('colours'), selection, {
      onIsolate: (index) => { selection!.isolated = index; render(); },
      onRegion: (index, region) => { selection!.set.colorMap[index] = { region, level: selection!.set.colorMap[index]!.level }; render(); },
      onLevel: (index, level) => { selection!.set.colorMap[index] = { region: selection!.set.colorMap[index]!.region, level }; render(); },
    });
    paintSet($('set'), selection, (index) => { select(imported.sets.indexOf(selection!.set), index); render(); });
    paintVariants(
      $('variants'),
      variantsFor(imported, selection.set),
      new Set((harvested.get(selection.set) ?? []).map((h) => h.from)),
      harvest,
    );
  }

  const tail = notice || t('state.notWired');
  $('explain').textContent = `${explain(selection, imported.refused.length)} — ${tail}`;
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

/** Every sheet of every set, so panel 1 can be pointed anywhere without leaving the set panel. */
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
  const view = selection?.view ?? 'original';
  selection = set && sheet ? { set, sheet, isolated: null, view } : null;
  if (set) $<HTMLInputElement>('set-name').value = defaultSetName(set.sheets.map((s) => s.name));
  $<HTMLSelectElement>('sheet').value = `${setIndex}:${sheetIndex}`;
}

function addRegion(name: string): void {
  if (!selection || !name.trim()) return;
  const ids = Object.keys(selection.set.regionNames).map(Number);
  selection.set.regionNames[Math.max(0, ...ids) + 1] = name.trim();
  render();
}

/**
 * ⚠️ REFUSE BEFORE WRITING, not after. An annotation that cannot be read back would otherwise reach disk and
 * be discovered by whatever tries to open it, which is far from the person who could fix it.
 */
async function save(): Promise<void> {
  if (!selection) return;
  const draft = draftOf(selection.set);
  const problem = annotationProblem(draft);
  if (problem) {
    notice = `${t('save.blocked')} ${problem}`;
    render();
    return;
  }
  const files = buildOutputs(draft);
  notice = (await write(files)) ? `${t('save.done')} ${files.map((f) => f.name).join(', ')}` : t('save.cancelled');
  render();
}

/**
 * Write with the File System Access API where it exists, and fall back to a download otherwise. A person on
 * a browser without the picker still gets their files; they just land wherever downloads land.
 */
async function write(files: readonly OutputFile[]): Promise<boolean> {
  const picker = (globalThis as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (picker) {
    try {
      const directory = await picker.call(globalThis);
      for (const file of files) {
        const handle = await directory.getFileHandle(file.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.text);
        await writable.close();
      }
      return true;
    } catch {
      return false; // the person closed the picker, or denied it — not an error to shout about
    }
  }
  for (const file of files) {
    const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }
  return true;
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
    notice = '';
    harvested.clear();
    fillChooser();
    select(0, 0);
    render();
  });

  $<HTMLSelectElement>('sheet').addEventListener('change', (event) => {
    const [s, i] = (event.currentTarget as HTMLSelectElement).value.split(':').map(Number);
    select(s!, i!);
    render();
  });

  $('views').addEventListener('change', (event) => {
    if (!selection) return;
    selection.view = (event.target as HTMLInputElement).value as View;
    render();
  });

  const newRegion = $<HTMLInputElement>('new-region');
  $<HTMLButtonElement>('add-region').addEventListener('click', () => {
    addRegion(newRegion.value);
    newRegion.value = '';
  });

  $<HTMLButtonElement>('save').addEventListener('click', () => { void save(); });

  setLanguage('pt-BR');
  applyTranslations();
  render();
}

start();
