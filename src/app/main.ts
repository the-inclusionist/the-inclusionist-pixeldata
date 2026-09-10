// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The wiring, and nothing else. Decoding is in `src/png/`, grouping in `src/group/`, the format in
// `src/format/`, the two views in `workspace.ts`, the arithmetic of the panels in `annotate.ts`, what comes
// out in `save.ts`, and the drawing in `panels.ts` — every one of those is proved without a browser. What is
// left here is what only a browser can do: read a file the person chose, hand a click back, and write a file
// where they say.
import { applyTranslations, setLanguage, t, LANGUAGES, type Language } from './i18n.ts';
import { importFiles, type Imported, type SetView } from './import.ts';
import {
  artPixels, paintArt, paintColours, paintDrawings, paintPalettes, explain, currentSheet,
  type Selection, type View,
} from './panels.ts';
import { workspaceFor, chooseBase } from './workspace.ts';
import {
  buildOutputs, defaultSetName, annotationProblem, nonMonotonicRamps, toPalette, SOURCE_VARIANT,
  type Draft, type OutputFile,
} from './save.ts';
import { collectPngFiles, collectFromInput, type Collected, type DirectoryLike } from './folder.ts';
import type { Provenance } from '../format/semantic.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

let imported: Imported = { sets: [], refused: [] };
let selection: Selection | null = null;
let notice = '';

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

/**
 * ⚠️ THE DRAFT IS ALWAYS AGAINST THE BASE PALETTE, whichever palette is on screen. The annotation lives in
 * ONE index space; the palette showing only decides which colours those positions are currently wearing.
 */
const draftOf = (set: SetView): Draft => ({
  name: $<HTMLInputElement>('set-name').value || 'set',
  set,
  source: provenance(),
});

const meaningAt = (index: number): { region: number; level: number } => selection!.workspace.base.colorMap[index]!;

function setMeaning(index: number, meaning: { region: number; level: number }): void {
  selection!.workspace.base.colorMap[index] = meaning;
  render();
}

/** Rebuild everything from the current state. Small enough to redraw whole; big enough to be one function. */
function render(): void {
  const canvas = $<HTMLCanvasElement>('art-canvas');
  const problem = $('art-problem');

  for (const el of [$('views'), $('save-panel')]) el.hidden = selection === null;

  let unreachable = 0;
  if (!selection) {
    canvas.hidden = true;
    problem.hidden = true;
    for (const id of ['colours', 'drawings', 'palettes']) $(id).replaceChildren();
  } else {
    const drawn = artPixels(selection, draftOf(selection.workspace.base));
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
      unreachable = drawn.unreachable;
      paintArt(canvas, currentSheet(selection), drawn.rgba);
    }

    paintDrawings($('drawings'), selection, (drawing) => { selection!.drawing = drawing; render(); });
    paintPalettes($('palettes'), selection, (palette) => { selection!.palette = palette; render(); });
    paintColours($('colours'), selection, {
      onIsolate: (index) => { selection!.isolated = index; render(); },
      onRegion: (index, region) => setMeaning(index, { region, level: meaningAt(index).level }),
      onLevel: (index, level) => setMeaning(index, { region: meaningAt(index).region, level }),
    });
  }

  // ⚠️ A WARNING, NEVER A GATE. A ramp that does not climb is probably two levels swapped — the art would
  // recolour with its shading inverted, which looks wrong and does not fail. But a FLAT ramp is legitimate.
  const rough = selection ? nonMonotonicRamps(toPalette(draftOf(selection.workspace.base)), SOURCE_VARIANT) : [];
  const warning = rough.length > 0 ? ` ⚠️ ${t('ramp.warning')} ${rough.length}` : '';
  const tail = notice || t('state.notWired');
  $('explain').textContent = `${explain(selection, imported.refused.length, unreachable)} — ${tail}${warning}`;
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

/**
 * Open the workspace around the palette that leaves the fewest positions unreachable.
 *
 * ⚠️ It used to be the WIDEST palette, which looked obvious and was the worst rule available — see
 * `unreachableFrom`. A base is good when its drawings are SHARED, not when its palette is large.
 */
function openWorkspace(): void {
  const base = chooseBase(imported);
  if (!base) { selection = null; return; }

  const workspace = workspaceFor(imported, base);
  const drawing = workspace.drawings[0];
  const palette = workspace.palettes.find((p) => p.set === base) ?? workspace.palettes[0];
  selection = drawing && palette ? { workspace, drawing, palette, isolated: null, view: 'original' } : null;
  $<HTMLInputElement>('set-name').value = defaultSetName(base.sheets.map((s) => s.name));
}

function addRegion(name: string): void {
  if (!selection || !name.trim()) return;
  const names = selection.workspace.base.regionNames;
  names[Math.max(0, ...Object.keys(names).map(Number)) + 1] = name.trim();
  render();
}

/**
 * ⚠️ REFUSE BEFORE WRITING, not after. An annotation that cannot be read back would otherwise reach disk and
 * be discovered by whatever tries to open it, which is far from the person who could fix it.
 */
async function save(): Promise<void> {
  if (!selection) return;
  const draft = draftOf(selection.workspace.base);
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

/** Everything that follows opening files or a folder, so every route lands in exactly the same place. */
async function take(collected: Collected): Promise<void> {
  imported = await importFiles(collected.files);
  notice = collected.capped
    ? `${t('import.capped')} ${collected.files.length}`
    : collected.files.length === 0 ? t('import.none') : '';
  openWorkspace();
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
    const chosen = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    await take({
      files: await Promise.all(chosen.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }))),
      capped: false,
    });
  });

  // 🎯 THE BATCH. A picker used one selection at a time is not a batch however many files a person
  // shift-clicks; pointing at a folder and getting every sheet in it grouped and counted is.
  const folderPicker = (globalThis as { showDirectoryPicker?: () => Promise<DirectoryLike> }).showDirectoryPicker;
  if (folderPicker) {
    $<HTMLButtonElement>('open-folder').addEventListener('click', async () => {
      let root: DirectoryLike;
      try { root = await folderPicker.call(globalThis); } catch { return; } // closed the picker; not an error
      await take(await collectPngFiles(root));
    });
  } else {
    // ⚠️ The fallback is SHOWN and the real button hidden, rather than both being present. Two buttons that
    // do the same thing on a browser that only supports one of them is a way to have half of them fail.
    $('open-folder').hidden = true;
    $('folder-fallback').hidden = false;
    $<HTMLInputElement>('folder-input').addEventListener('change', async (event) => {
      await take(await collectFromInput(Array.from((event.currentTarget as HTMLInputElement).files ?? [])));
    });
  }

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
