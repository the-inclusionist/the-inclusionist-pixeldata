// SPDX-License-Identifier: AGPL-3.0-or-later
//
// OPENING A FOLDER, WHICH IS WHERE THE BATCH ACTUALLY LIVES (ADR-0134 §3c).
//
// The traversal is written against the SHAPE of `FileSystemDirectoryHandle`, not the class, so these cases
// walk plain objects. That is the same division every module in `src/app/` keeps: the browser adds the
// picker and nothing else, and everything the picker hands over is proved here.
import { describe, it, expect } from 'vitest';
import { collectPngFiles, type DirectoryLike, type FileLike } from '../src/app/folder.ts';

const file = (name: string, byte = 1): FileLike => ({
  kind: 'file',
  name,
  getFile: async () => ({ arrayBuffer: async () => Uint8Array.from([byte]).buffer }),
});

const dir = (name: string, children: (FileLike | DirectoryLike)[]): DirectoryLike => ({
  kind: 'directory',
  name,
  values: () => ({ async *[Symbol.asyncIterator]() { for (const child of children) yield child; } }),
});

describe('collectPngFiles', () => {
  it('Right: it goes all the way down, and a path keeps two same-named sheets apart', async () => {
    // The CC0 pack that every measurement in docs/MEASUREMENT.md comes from is laid out exactly like this —
    // `Warrior/Blue/Warrior_Blue.png` — so flattening to bare names would collide the moment a real pack
    // arrives, and collide silently.
    const root = dir('pack', [
      dir('Warrior', [dir('Blue', [file('sheet.png')]), dir('Red', [file('sheet.png')])]),
      file('cover.png'),
    ]);
    const { files } = await collectPngFiles(root);
    // ⚠️ `cover.png` comes first, and that is the sort rather than an accident: entries are ordered by name
    // WITHIN each folder, and `c` sorts before `W`. Directories are not hoisted to the top — the property
    // that matters is that the same folder always opens the same way, and the case below pins that.
    expect(files.map((f) => f.name)).toEqual(['cover.png', 'Warrior/Blue/sheet.png', 'Warrior/Red/sheet.png']);
  });

  it('Right: anything that is not a PNG is left where it is', async () => {
    const { files } = await collectPngFiles(dir('pack', [file('notes.txt'), file('art.PNG'), file('art.jpg')]));
    expect(files.map((f) => f.name)).toEqual(['art.PNG']);
  });

  it('🔴 Right: macOS resource forks are skipped, because a real pack is full of them', async () => {
    // 📏 The Tiny Swords archive ships a `__MACOSX/._Name.png` beside every real file. They are not PNGs.
    // Without this, a person opening that folder meets a wall of refusals as long as the art itself, and
    // has to work out that half of them are noise.
    const root = dir('pack', [dir('__MACOSX', [file('._art.png')]), file('._art.png'), file('art.png')]);
    const { files } = await collectPngFiles(root);
    expect(files.map((f) => f.name)).toEqual(['art.png']);
  });

  it('Right: the order is stable, so the same folder always opens the same way', async () => {
    const { files } = await collectPngFiles(dir('pack', [file('c.png'), file('a.png'), file('b.png')]));
    expect(files.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('Right: the bytes come through, not just the names', async () => {
    const { files } = await collectPngFiles(dir('pack', [file('art.png', 42)]));
    expect([...files[0]!.bytes]).toEqual([42]);
  });

  it('🔴 Boundary: reaching the cap is REPORTED, never a quietly short list', async () => {
    // A person can point this at a home directory by accident. Reading tens of thousands of files looks
    // like a hang; returning the first few hundred without saying so looks like the folder was small.
    const root = dir('pack', [file('a.png'), file('b.png'), file('c.png')]);
    const { files, capped } = await collectPngFiles(root, 2);
    expect(files).toHaveLength(2);
    expect(capped).toBe(true);
  });

  it('Boundary: under the cap, nothing is reported as capped', async () => {
    const { capped } = await collectPngFiles(dir('pack', [file('a.png')]), 2);
    expect(capped).toBe(false);
  });

  it('Zero: an empty folder gives no files and no complaint', async () => {
    expect(await collectPngFiles(dir('empty', []))).toEqual({ files: [], capped: false });
  });
});
