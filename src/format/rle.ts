// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE GRID ENCODING, AND IT WAS CHOSEN BY MEASUREMENT (ADR-0134 §5, `docs/MEASUREMENT.md`).
//
// One line of text per row of pixels; each run is `<count>x<index>`, runs separated by spaces. The index is
// the position of a colour in the SET's canonical colour order, and `colorMap` in the semantic file says
// what each index means.
//
// 🎯 STORING THE COLOUR INDEX RATHER THAN THE (region, level) PAIR IS THE DECISION THAT MATTERS HERE, and it
// pays three times. The run carries one number instead of two, which is what the measurement actually
// measured. Re-annotating changes ONLY `colorMap` and leaves the grid byte-for-byte identical, so a review
// sees the human decision and nothing else. And the grid stops depending on the annotation, so a file can be
// imported today and annotated next week without its pixels being rewritten.
//
// 🔴 RUNS STOP AT THE END OF A ROW. Letting them cross saves 6 % and costs a diff that can be located to a
// line of the picture. Gzipped — which is how git stores it — the two are within 0.4 % of each other, so the
// saving is working-tree bytes only and the readability is permanent.

/**
 * Encode one grid of indices, row-major, into one string per row.
 *
 * ⚠️ The size is checked first. Without it a grid that disagrees with its declared width encodes happily,
 * reading `undefined` off the end and writing runs like `4xundefined` — text that looks like a file and
 * fails only when somebody tries to read it back.
 */
export function encodeGrid(grid: Int32Array, width: number, height: number): string[] {
  if (grid.length !== width * height) {
    throw new Error(`a grid of ${grid.length} values cannot be ${width}×${height} (${width * height} pixels)`);
  }
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    const runs: string[] = [];
    let value = grid[y * width]!;
    let length = 0;
    for (let x = 0; x < width; x++) {
      const here = grid[y * width + x]!;
      if (here === value) { length++; continue; }
      runs.push(`${length}x${value}`);
      value = here;
      length = 1;
    }
    runs.push(`${length}x${value}`);
    rows.push(runs.join(' '));
  }
  return rows;
}

const RUN = /^(\d+)x(\d+)$/;

/**
 * Decode rows back into a grid.
 *
 * ⚠️ IT REFUSES A MALFORMED FILE RATHER THAN HALF-READING ONE. A row whose runs do not add up to the width
 * would otherwise leave the rest of the picture shifted, and the only thing that would ever notice is a
 * round trip somebody remembered to run.
 */
export function decodeGrid(rows: readonly string[], width: number, height: number): Int32Array {
  if (rows.length !== height) {
    throw new Error(`the file declares height ${height} but carries ${rows.length} rows`);
  }
  const grid = new Int32Array(width * height);
  for (let y = 0; y < height; y++) {
    let x = 0;
    for (const run of rows[y]!.split(' ')) {
      const parsed = RUN.exec(run);
      if (!parsed) throw new Error(`row ${y}: "${run}" is not a run of the form <count>x<index>`);
      const length = Number(parsed[1]);
      const value = Number(parsed[2]);
      if (length === 0) throw new Error(`row ${y}: a run of length zero is not a run`);
      if (x + length > width) {
        throw new Error(`row ${y}: the runs reach ${x + length} pixels, past the declared width ${width}`);
      }
      grid.fill(value, y * width + x, y * width + x + length);
      x += length;
    }
    if (x !== width) throw new Error(`row ${y}: the runs cover ${x} pixels, not the declared width ${width}`);
  }
  return grid;
}
