// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE GRID ENCODING, CHOSEN BY MEASUREMENT (ADR-0134 §5, `docs/MEASUREMENT.md`).
//
// Four candidates were measured against 197 CC0 files before a line of this existed. Plain text at two
// characters per pixel is 46.8× the source PNG; run-length per row in readable form is 3.12×; the compact
// variants are 2.97× and 2.79×.
//
// 🎯 Gzipped, the readable and the compact differ by 0.4 %, and git stores objects zlib-compressed — so IN A
// REPOSITORY THEY COST THE SAME. When the cost in history is equal the readable one wins, and the flat
// variant's extra 6 % is paid in diffs that can no longer be located to a row.
//
// One row per line of pixels, runs as `<count>x<index>` separated by spaces.
import { describe, it, expect } from 'vitest';
import { encodeGrid, decodeGrid } from '../src/format/rle.ts';

describe('encodeGrid', () => {
  it('Zero: an empty grid is no rows at all, not one empty row', () => {
    expect(encodeGrid(new Int32Array(0), 0, 0)).toEqual([]);
  });

  it('One: a single pixel is one run of one', () => {
    expect(encodeGrid(Int32Array.from([7]), 1, 1)).toEqual(['1x7']);
  });

  it('Right: a run is collapsed, and a change starts a new one', () => {
    expect(encodeGrid(Int32Array.from([0, 0, 0, 1, 1, 2]), 6, 1)).toEqual(['3x0 2x1 1x2']);
  });

  it('🔴 Boundary: runs STOP at the end of a row, even when the value continues', () => {
    // This is what the flat variant would not do, and it is what buys a diff that can be read by row. A row
    // is a line of the picture; a run crossing into the next row makes the encoding 6 % smaller and the
    // review 100 % harder.
    expect(encodeGrid(Int32Array.from([5, 5, 5, 5]), 2, 2)).toEqual(['2x5', '2x5']);
  });

  it('Right: an index of more than one digit survives, because a set can carry many colours', () => {
    // 📏 The measured maximum in the sample is 35 unique colours in one file; the median is 7.
    expect(encodeGrid(Int32Array.from([12, 12, 7]), 3, 1)).toEqual(['2x12 1x7']);
  });

  it('Exercise the exceptional: a grid that disagrees with its declared size is refused', () => {
    // Without the check it reads past the end and writes `4xundefined` — text that looks like a file and
    // fails only when somebody tries to read it back.
    expect(() => encodeGrid(Int32Array.from([1, 2, 3]), 2, 2)).toThrow(/cannot be 2×2/);
  });
});

describe('decodeGrid', () => {
  it('Right: it puts back exactly what was encoded', () => {
    expect([...decodeGrid(['3x0 2x1 1x2'], 6, 1)]).toEqual([0, 0, 0, 1, 1, 2]);
  });

  describe('Exercise the exceptional — a malformed file is refused, never half-read', () => {
    it('refuses a row whose runs do not add up to the width', () => {
      // Silently padding would produce a picture that is subtly wrong everywhere after the short row, and
      // the round trip would be the only thing that ever noticed.
      expect(() => decodeGrid(['2x0'], 6, 1)).toThrow(/row 0/i);
    });

    it('refuses a row count that disagrees with the declared height', () => {
      expect(() => decodeGrid(['1x0'], 1, 2)).toThrow(/height/i);
    });

    it('refuses a run that is not a run', () => {
      expect(() => decodeGrid(['nonsense'], 1, 1)).toThrow(/run/i);
    });

    it('refuses a zero-length run rather than accepting a no-op', () => {
      expect(() => decodeGrid(['0x1 1x1'], 1, 1)).toThrow(/run/i);
    });
  });
});

describe('🔴 the round trip, which is the case the whole format rests on', () => {
  it('Property: any grid survives encode → decode unchanged', () => {
    // Deterministic pseudo-random, so a failure is reproducible rather than a story about last Tuesday.
    let seed = 20260909;
    const next = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);

    for (let trial = 0; trial < 200; trial++) {
      const width = 1 + (next() % 40);
      const height = 1 + (next() % 40);
      const distinct = 1 + (next() % 36); // up to the 35 measured in one real file, plus one
      const grid = new Int32Array(width * height);
      for (let i = 0; i < grid.length; i++) grid[i] = next() % distinct;

      expect([...decodeGrid(encodeGrid(grid, width, height), width, height)]).toEqual([...grid]);
    }
  });

  it('Property: a grid of one repeated value is one run per row, whatever its size', () => {
    const rows = encodeGrid(new Int32Array(300 * 7).fill(3), 300, 7);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r === '300x3')).toBe(true);
  });
});
