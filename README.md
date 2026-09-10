<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# the-inclusionist-pixeldata

An application that reads pixel art somebody already drew and writes down **what each pixel means** instead
of what colour it is. Every pixel becomes a pair — a **region** (skin, cloth, stone, water, outline…) and a
**level** on a shadow-to-light ramp — and the colours move out into a separate dictionary of palettes. The
same artwork can then be recoloured without limit, with its shading intact, and a game can render it in high
contrast by *reading* what a shape is rather than guessing from its brightness.

It does not draw pixel art. It imports art that exists, helps a person annotate it, and writes files.

## ⚠️ What exists today, and what does not

**This is not usable yet.** The four panels are in the page and none of them is wired.

What does work, and is proved rather than claimed:

- **A PNG decoder of our own** (`src/png/decode.ts`), covered by 13 cases across two Vitest projects — ten
  in Node for the arithmetic, three in Chromium for the platform. It returns the bytes the file holds and
  never obeys a colour-management chunk. Six mutations were applied to it one at a time and all six turned
  the suite red, so the green means something.
- **The page shell**, in the three zones the project mandates, with every string translatable from the first
  one (pt-BR · en · es). Opening a PNG reports its size, colour type, unique colours, pixels with partial
  alpha and any colour-management chunks.

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

- **The two groupings** (`src/group/`), which are what make the whole thing pay for itself. Each file is
  reduced to two exact summaries — one over its grid of colour indices, one over its set of colours — and
  those two comparisons fill panels 3 and 4 with no tolerance and no parameter anywhere.
  📏 Measured on 197 CC0 files: **34 groups of «same drawing, different palettes» cover 119 files**, so
  thirty-four annotations would cover a hundred and nineteen images.
- **`docs/FORMAT.md`** — the written specification of `<set>.semantic.json` and `<name>.palette.json`, plus
  `fixtures/` to go with it. It is the contract: the engine writes its own reader against it, and nothing
  else holds the two implementations together.
- **A round trip that is exact**, born red with its mutation confirmed: PNG → semantic file plus palette →
  recomposed → the same pixel. It is the case that catches the two corruptions that fail in silence, colour
  management and alpha premultiplication.
- **The panels themselves**, and with them the axe gate in `.github/workflows/ci.yml`, which stays `false`
  until there is a page worth auditing and somebody has watched it pass.

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
