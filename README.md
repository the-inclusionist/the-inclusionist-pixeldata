<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# the-inclusionist-pixeldata

An application that reads pixel art somebody already drew and writes down **what each pixel means** instead
of what colour it is. Every pixel becomes a pair — a **region** (skin, cloth, stone, water, outline…) and a
**level** on a shadow-to-light ramp — and the colours move out into a separate dictionary of palettes. The
same artwork can then be recoloured without limit, with its shading intact, and a game can render it in high
contrast by *reading* what a shape is rather than guessing from its brightness.

It does not draw pixel art. It imports art that exists, helps a person annotate it, and writes files.

## What exists today

**All four panels are wired, and the tool can take a folder of pixel art through to two files on disk.**

What does work, and is proved rather than claimed:

- **A PNG decoder of our own** (`src/png/decode.ts`), covered by 13 cases across two Vitest projects — ten
  in Node for the arithmetic, three in Chromium for the platform. It returns the bytes the file holds and
  never obeys a colour-management chunk. Six mutations were applied to it one at a time and all six turned
  the suite red, so the green means something.
- **The page shell**, in the three zones the project mandates, with every string translatable from the first
  one (pt-BR · en · es). Opening a PNG reports its size, colour type, unique colours, pixels with partial
  alpha and any colour-management chunks.
- **The two groupings** (`src/group/group.ts`), which are what make the whole thing pay for itself. Each file
  is reduced to two exact summaries — one over its grid of colour indices, one over its set of colours — and
  those two comparisons are what panels 3 and 4 read, with no tolerance and no parameter anywhere.
  📏 Run over the 197 CC0 files of [`docs/MEASUREMENT.md`](docs/MEASUREMENT.md) it reproduces that
  measurement exactly — **34 «same drawing» groups covering 100 files, 42 «same palette» groups covering
  139** — from a second implementation written afterwards from tests, which is why the figures are trusted.
- **The four panels.** The sheet at 4× with one colour singled out and the rest dropped to grey; the colour
  table where the meaning is decided; the set that shares this palette; and the same drawing in other
  palettes, each one clickable to **harvest** its ramps.
- **`fixtures/`** — a valid file worked out BY HAND, with the exact pixels each palette choice must produce,
  and five files a conforming reader must refuse. They are what makes [`docs/FORMAT.md`](docs/FORMAT.md)
  checkable from the other side rather than merely written down.
- **ONE file out** ([ADR-0135](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0135-one-file-carries-the-pixels-and-the-colours-and-a-region-is-a-word.yaml)),
  carrying the pixels and every palette the art was found wearing — and a region written as a **word**, in
  place, because the file is imported for a language model to read and a join is where a reader goes wrong.
- **The format, written and read** ([`docs/FORMAT.md`](docs/FORMAT.md)), with the round trip watched on
  screen: the «recomposed» view goes the long way — written to text, read back, rebuilt from the palette —
  and «difference» lights up where the two disagree, so an empty panel is the proof.
  📏 Verified over the same 197 files: **41 512 960 pixels compared and 197 of 197 identical**, plus
  **218 palette harvests, all exact, over 107 118 592 recoloured pixels**.
- **Opening a folder**, which is where the batch lives — a picker used one selection at a time is not a
  batch however many files a person shift-clicks. It walks every folder inside, keeps the path so two
  `walk.png` stay two files, skips the macOS resource forks a real pack is full of, and says so out loud
  when it stops at its limit.
  📏 Pointed at the real CC0 pack it finds **197 PNGs, refuses none, and groups them into the same 100 sets**
  the measurement found.

The scaffold sentence that used to stand here — *"this has not been built"* — was removed by the commit that
made it false, which is the rule that put it there
([ADR-0067](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0067-a-repository-is-created-when-its-address-is-declared-and-it-is-born-saying-it-is-empty.yaml) §3).

## Which record declares this repository

[**ADR-0134**](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0134-the-pixel-data-pipeline-is-its-own-repository-and-the-engine-only-reads-what-it-writes.yaml)
— *«The pixel-data pipeline gets a repository of its own, and the engine becomes a reader of what it writes»*.

A repository is created when a record declares its address, not when somebody makes a folder
([ADR-0067](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0067-a-repository-is-created-when-its-address-is-declared-and-it-is-born-saying-it-is-empty.yaml) §5).
ADR-0134 is that declaration, and it also records why this work lives here rather than inside the engine.

**Why it exists now:** [ADR-0133](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0133-art-enters-by-three-doors-grant-licence-test-and-the-gplv3-bridge.yaml)
lets CC BY-SA art cross into this AGPL project as GPL-3.0-only, but only for an adapter who can make the work
available *in the preferred form for modification*. That form is exactly what this repository produces —
so until it exists, the door is described and shut.

## What comes next

- **The axe gate** in `.github/workflows/ci.yml`, which stays `false` until somebody has watched it pass.
  There is now a page worth auditing, so this is a debt rather than a placeholder.
- **Frames and pivots.** The format carries them and nothing fills them in yet; a spritesheet is annotated
  as one image until it does.

## Running it

```
npm ci
npm run typecheck      # tsc --noEmit, and it must be clean
npm test               # both Vitest projects: node and Chromium
npm run build          # writes dist/
npm run preview        # serves dist/
```

⚠️ Use `build` + `preview` rather than `dev` when checking the page in a constrained sandbox: Vite's
dependency pre-bundling may never finish there, leaving a dead module graph and a blank screen with no error.

## Licence

Code is **AGPL-3.0-or-later** ([`LICENSE`](LICENSE)). Art is **not** — see [`docs/LICENSES.md`](docs/LICENSES.md),
because a repository that carries only the code licence teaches the wrong thing by omission.
