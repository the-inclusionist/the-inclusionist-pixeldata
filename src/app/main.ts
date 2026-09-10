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
import { workspacesIn, paletteColours, type Workspace } from './workspace.ts';
import {
  buildOutputs, defaultSetName, annotationProblem, nonMonotonicRamps, toSemanticSet, SOURCE_VARIANT,
  type Draft, type OutputFile,
} from './save.ts';
import { collectPngFiles, collectFromInput, collectFromDrop, type Collected, type DirectoryLike } from './folder.ts';
import { harvestPalette, type Meaning, type Provenance, type Ramps } from '../format/semantic.ts';
import { luminance } from './annotate.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

let imported: Imported = { sets: [], refused: [] };
/** 🔴 An import is NOT one workspace — see `workspacesIn`. Biggest first, and the person can change. */
let workspaces: Workspace[] = [];
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
  harvested: everyPalette(),
});

/**
 * 🔴 EVERY PALETTE THE WORKSPACE FOUND GOES INTO THE FILE, and that is the point of one file: a game that
 * wants four team colours opens one thing. Only `source` would leave panel 3 showing palettes the saved file
 * does not carry — which is worse than not offering them.
 */
function everyPalette(): Record<string, Ramps> {
  if (!selection) return {};
  const { workspace, palette: current } = selection;
  const out: Record<string, Ramps> = {};
  for (const palette of workspace.palettes) {
    if (palette.set === workspace.base) continue; // `source` is written from the base itself
    out[palette.name] = harvestPalette(workspace.base.positions, paletteColours(workspace, palette));
  }
  void current;
  return out;
}

const meaningAt = (index: number): Meaning => selection!.workspace.base.positions[index]!;

function setMeaning(index: number, meaning: Meaning): void {
  selection!.workspace.base.positions[index] = meaning;
  render();
}

/**
 * 🔴 NAMING A REGION RE-RANKS ITS LEVELS BY LUMINANCE, and it has to.
 *
 * The draft ranks every opaque colour as ONE region, so the moment a person splits them into «pele», «cabelo»
 * and «roupa» the levels scatter — 1, 5, 2 where 0, 1, 2 was meant. That leaves ramps full of holes
 * (`[null, "#…", "#…", null, null, "#…"]`) and a `steps` count that lies: eleven steps for a region with one
 * colour. A ramp runs shadow to light, so the ranking IS the level, and it is recomputed whenever the
 * membership of a region changes.
 *
 * ⚠️ It overwrites a level set by hand in that region. That is the trade: a hand-set level is rare and
 * repeatable, and a silently broken ramp is neither.
 */
function renameRegion(index: number, region: string | null): void {
  const base = selection!.workspace.base;
  base.positions[index] = { region, level: base.positions[index]!.level };

  for (const name of new Set(base.positions.map((m) => m.region))) {
    if (name === null) continue;
    const members = base.positions
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.region === name)
      .sort((a, b) => luminance(base.order[a.i]!) - luminance(base.order[b.i]!));
    members.forEach(({ i }, level) => { base.positions[i] = { region: name, level }; });
  }
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
      onRegion: (index, region) => renameRegion(index, region),
      onLevel: (index, level) => setMeaning(index, { region: meaningAt(index).region, level }),
    });
  }

  // ⚠️ A WARNING, NEVER A GATE. A ramp that does not climb is probably two levels swapped — the art would
  // recolour with its shading inverted, which looks wrong and does not fail. But a FLAT ramp is legitimate.
  const rough = selection ? nonMonotonicRamps(toSemanticSet(draftOf(selection.workspace.base)), SOURCE_VARIANT) : [];
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
 * Point the panels at one workspace.
 *
 * ⚠️ TWO RULES DIED BEFORE THIS ONE, both on real art. «The WIDEST palette» picked one whose drawings nobody
 * shared. «The one that LOSES LEAST» picked the Skeleton out of 269 LPC body sheets — loss zero, because it
 * shares a drawing with nothing at all. The measure is now how many FILES an annotation would describe, and
 * it cannot be gamed by having nothing.
 */
function openWorkspace(index: number): void {
  const workspace = workspaces[index];
  if (!workspace) { selection = null; return; }

  const drawing = workspace.drawings[0];
  const palette = workspace.palettes.find((p) => p.set === workspace.base) ?? workspace.palettes[0];
  selection = drawing && palette ? { workspace, drawing, palette, isolated: null, view: 'original' } : null;
  $<HTMLInputElement>('set-name').value = defaultSetName(workspace.base.sheets.map((s) => s.name));
  $<HTMLSelectElement>('workspace').value = String(index);
}

/**
 * ⚠️ THE CHOOSER IS SHOWN WHENEVER THERE IS MORE THAN ONE, and that is the whole point of it. 📏 A person
 * importing the LPC's `Body/Base` hands over 269 files that partition into ELEVEN groups nothing can travel
 * between; showing one of them and saying nothing is how 269 files look like eight.
 */
function fillWorkspaceChooser(): void {
  const chooser = $<HTMLSelectElement>('workspace');
  chooser.replaceChildren();
  workspaces.forEach((workspace, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    const body = workspace.base.sheets[0]?.name.split('/')[0] ?? '';
    option.textContent = `${body || workspace.palettes[0]?.name} — ${workspace.files} ${t('workspace.files')}`;
    chooser.append(option);
  });
  chooser.hidden = workspaces.length < 2;
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
  workspaces = workspacesIn(imported);
  fillWorkspaceChooser();
  openWorkspace(0);
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

  // 🎯 ARRASTAR E SOLTAR. A folder dropped on the page arrives as a directory HANDLE, which is the shape
  // `collectPngFiles` already walks — `dataTransfer.files` would flatten it to nothing and look like the
  // page had ignored the drop.
  const drop = $('drop');
  for (const name of ['dragenter', 'dragover'] as const) {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  }
  for (const name of ['dragleave', 'drop'] as const) {
    drop.addEventListener(name, () => drop.classList.remove('is-over'));
  }
  drop.addEventListener('drop', async (event) => {
    event.preventDefault();
    // ⚠️ READ THE ITEMS BEFORE AWAITING ANYTHING. `DataTransfer` is emptied the moment this handler yields,
    // so a single `await` placed above this line loses every item, silently and with an empty result.
    const items = Array.from((event as DragEvent).dataTransfer?.items ?? []);
    await take(await collectFromDrop(items));
  });

  $<HTMLSelectElement>('workspace').addEventListener('change', (event) => {
    openWorkspace(Number((event.currentTarget as HTMLSelectElement).value));
    render();
  });

  $('views').addEventListener('change', (event) => {
    if (!selection) return;
    selection.view = (event.target as HTMLInputElement).value as View;
    render();
  });

  $<HTMLButtonElement>('save').addEventListener('click', () => { void save(); });

  setLanguage('pt-BR');
  applyTranslations();
  render();
}

start();
