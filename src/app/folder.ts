// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OPENING A FOLDER, WHICH IS WHERE THE BATCH ACTUALLY LIVES (ADR-0134 §3c).
//
// There is no separate command-line tool because this is the thing that would have justified one: pointing
// at a directory and having every sheet in it grouped, counted and ready to annotate. A file picker used one
// selection at a time is not a batch, however many files a person shift-clicks.
//
// Only the traversal is here. It is written against the shape of `FileSystemDirectoryHandle` rather than the
// class itself, so it can be walked over plain objects in a test — the browser adds the picker and nothing
// else, which is the same division every other module in this folder keeps.

/** The part of `FileSystemFileHandle` this needs. */
export interface FileLike {
  readonly kind: 'file';
  readonly name: string;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

/** The part of `FileSystemDirectoryHandle` this needs. */
export interface DirectoryLike {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<FileLike | DirectoryLike>;
}

export interface Found {
  /** Path relative to the chosen folder, so two `walk.png` in different folders stay two files. */
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface Collected {
  readonly files: readonly Found[];
  /** True when the walk stopped at `limit`. Said out loud rather than left as a short list. */
  readonly capped: boolean;
}

/**
 * ⚠️ macOS RESOURCE FORKS ARE SKIPPED, and this is measured rather than defensive. The CC0 pack used for
 * every figure in `docs/MEASUREMENT.md` ships a `__MACOSX/._Name.png` beside each real file. They are not
 * PNGs; without this a person opening that folder meets a wall of refusals as long as the art itself.
 */
const isPixelArt = (name: string): boolean => name.toLowerCase().endsWith('.png') && !name.startsWith('._');

/**
 * Walk a folder and every folder inside it, gathering PNGs.
 *
 * The cap exists because a person can point this at a home directory by accident, and reading tens of
 * thousands of files would look like a hang. Reaching it is reported, never silent.
 */
export async function collectPngFiles(root: DirectoryLike, limit = 2000): Promise<Collected> {
  const files: Found[] = [];
  let capped = false;

  async function walk(directory: DirectoryLike, prefix: string): Promise<void> {
    if (capped) return;
    // Sorted, so the same folder always imports in the same order — and so the first sheet a person sees is
    // predictable rather than whatever the file system happened to hand back.
    const entries: (FileLike | DirectoryLike)[] = [];
    for await (const entry of directory.values()) entries.push(entry);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (capped) return;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await walk(entry, path);
        continue;
      }
      if (!isPixelArt(entry.name)) continue;
      if (files.length >= limit) { capped = true; return; }
      files.push({ name: path, bytes: new Uint8Array(await (await entry.getFile()).arrayBuffer()) });
    }
  }

  await walk(root, '');
  return { files, capped };
}

/**
 * The same gathering from a `<input webkitdirectory>`, which is the fallback where the picker does not exist.
 * The browser hands back a flat list with `webkitRelativePath` already filled in, so there is nothing to walk.
 */
export async function collectFromInput(list: readonly File[], limit = 2000): Promise<Collected> {
  const usable = list
    .filter((file) => isPixelArt(file.name))
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));
  const kept = usable.slice(0, limit);
  return {
    files: await Promise.all(kept.map(async (file) => ({
      name: file.webkitRelativePath || file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    }))),
    capped: usable.length > limit,
  };
}

/**
 * WHAT A DROP CARRIES, and it is not simply files.
 *
 * 🎯 A folder dragged onto the page arrives as a `DataTransferItem` whose `getAsFileSystemHandle()` gives a
 * DIRECTORY handle — the same shape `collectPngFiles` already walks. A plain `event.dataTransfer.files`
 * would flatten a dropped folder to nothing at all, which is the behaviour a person reads as "it ignored me".
 *
 * ⚠️ THE ITEM LIST MUST BE READ SYNCHRONOUSLY. `DataTransfer` is emptied the moment the drop handler yields,
 * so awaiting anything before collecting the items loses them — with no error, and no items.
 */
export async function collectFromDrop(items: readonly DataTransferItem[], limit = 2000): Promise<Collected> {
  const handles = await Promise.all(
    items
      .filter((item) => item.kind === 'file')
      .map((item) => {
        const get = (item as { getAsFileSystemHandle?: () => Promise<FileLike | DirectoryLike | null> }).getAsFileSystemHandle;
        return get ? get.call(item) : Promise.resolve(null);
      }),
  );

  const files: Found[] = [];
  let capped = false;
  for (const handle of handles) {
    if (!handle || capped) continue;
    if (handle.kind === 'directory') {
      const inside = await collectPngFiles(handle, limit - files.length);
      files.push(...inside.files.map((f) => ({ ...f, name: `${handle.name}/${f.name}` })));
      capped ||= inside.capped;
      continue;
    }
    if (!isPixelArt(handle.name)) continue;
    if (files.length >= limit) { capped = true; break; }
    files.push({ name: handle.name, bytes: new Uint8Array(await (await handle.getFile()).arrayBuffer()) });
  }
  return { files, capped };
}
