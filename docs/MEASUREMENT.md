<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Stage 0 — the measurement that chooses the format

The plan forbids fixing the grid encoding by taste. This is the table it demanded, and it was taken before a
line of `src/format/` existed.

**Subject:** 197 PNGs from *Tiny Swords (Update 010)*, CC0, decoded with a dependency-free reader (zlib
inflate, all five filter types, colour types 0/2/3/4/6 at bit depth 8). Total source weight **1 777 268 bytes**.

⚠️ **This is not the Liberated Pixel Cup.** The LPC is not on this machine and its measurement (2026-09-09,
three sheets, 15 united colours, zero partial alpha) came from another context. Where the two disagree, both
numbers are reported and neither is discarded.

## 1 · Grid encodings

All four describe the **same** index grid — the honest proxy for a `(region, level)` grid, since it has the
same run structure. Ratios are against the source PNG.

| candidate | raw | gzipped | verdict |
|---|---|---|---|
| A · plain text, 2 chars per pixel | **46.80×** | 0.64× | ❌ the baseline that was already dead |
| B · RLE per row, readable (`48x0 4x1`) | **3.12×** | 0.49× | ⚠️ just over the stop rule |
| C · RLE per row, base36 (`1c:0,4:1`) | **2.97×** | 0.49× | ✅ just under |
| D · RLE flat, runs cross rows | **2.79×** | 0.47× | ✅ smallest, and unreadable by row |

🎯 **The finding that decides it: gzipped, B and C differ by 0.4 %.** Git stores objects zlib-compressed, so
**in the repository these encodings cost the same**; the 5 % gap between them is working-tree bytes only.
When the cost in git is equal, the readable one wins — and D's extra 6 % is paid in diffs that can no longer
be located to a row.

⚠️ **Correction to an earlier estimate.** The 2026-09-09 measurement put the plain-text grid at «~295 KB
against a 30 KB PNG», roughly ten times. Across 197 real files it is **46.8×**. The conclusion was right; the
number was optimistic by nearly a factor of five.

## 2 · Partial alpha — 🔴 the hard-mask assumption fails on real art

| files with any partial alpha | **119 of 197** |
|---|---|
| files with **1** semi-transparent colour | 85 |
| files with **2** | 24 |
| files with **3** | 10 |
| files with more than 3 | **0** |

The earlier format said `A` is «0 or 255 and nothing else». That rule would **reject 60 % of this pack**.

📌 **But the shape of the failure is benign, and that is what matters:** never more than three
semi-transparent colours in a file. This is not thousands of anti-aliased tones — it is a **shadow**, one or
two fixed colours at a constant alpha. So alpha is not a mask that must be flattened; it is **part of the
colour**, and it travels in the palette ramp beside R, G and B. A shadow becomes a region like any other.

## 3 · The two groupings, on real art

| grouping | groups found | what it covers |
|---|---|---|
| **same drawing, different palettes** (panel 4) | **34** | 119 files — every troop and building × 4 team colours, buttons, ribbons × 3 |
| **same palette, different drawings** (panel 3) | **7** | e.g. `Wood_Tower_InConstruction` + `Castle_Construction` + `Tower_Construction` + `Bridge_All` |

🎯 **Panel 4 is confirmed on real art and it is not marginal: 34 annotations would cover 119 files.**

⚠️ **Panel 3 is rare in this pack, and that is a finding about the file boundary.** In this art each unit
carries its own palette, so «one file per same-palette set» degenerates to roughly one file per image. It is
not wrong — the seven groups it does find are semantically exact, all of them shared *materials* (scaffolding
and wood) rather than shared subjects. But the grouping that pays for itself here is the drawing one, not the
palette one, and the LPC (where `walk`/`thrust`/`hurt` of one body share a palette) is the case that has to
justify the boundary.

## 4 · Colour counts

| median unique colours per file | **7** |
|---|---|
| maximum in any file | 35 |

The annotation table is **shorter than the LPC measurement suggested** (15 colours across three sheets). The
person decides seven times for a typical file. Panel 2 holds.

## 5 · Colour management

**Every one of the 197 files carries an `sRGB` chunk.** Colour-management chunks are not an edge case in
distributed pixel art — they are the norm. The decision to decode with our own reader in both the browser
and Node stands on measured ground, not on caution.
