<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# the-inclusionist-pixeldata

An application that reads pixel art somebody already drew and writes down **what each pixel means** instead
of what colour it is. Every pixel becomes a pair — a **region** (skin, cloth, stone, water, outline…) and a
**level** on a shadow-to-light ramp — and the colours move out into a separate dictionary of palettes. The
same artwork can then be recoloured without limit, with its shading intact, and a game can render it in high
contrast by *reading* what a shape is rather than guessing from its brightness.

It does not draw pixel art. It imports art that exists, helps a person annotate it, and writes files.

## ⚠️ This has NOT been built

There is no application here yet. This repository holds a licence, a README and a CI caller, and nothing
else. Nothing in it runs, and nothing in it can be used.

This sentence is a debt with a due date: it becomes false on the commit that lands the first product code,
and removing it is part of that commit.

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

## What has to exist before the first product commit lands

- **`docs/FORMAT.md`** — the written specification of `<set>.semantic.json` and `<name>.palette.json`. It is
  the contract, because the engine will write its own reader against it and nothing else holds the two
  implementations together.
- **`fixtures/`** — reference files any reader must reproduce exactly.
- **The toolchain the CI caller already assumes**: `package.json` with `typecheck`, `test` and `build`, a
  lockfile, TypeScript in `strict` mode, and Vitest with its two projects (`node` and `browser`). The caller
  in `.github/workflows/ci.yml` invokes the engine's reusable gate, which runs all four — so the first
  product commit is also the first commit whose CI can pass.
- **A round trip that is exact**, born red with its mutation confirmed: PNG → semantic file plus palette →
  recomposed → the same pixel. It is the case that catches the two corruptions that fail in silence, colour
  management and alpha premultiplication.

## Licence

Code is **AGPL-3.0-or-later** ([`LICENSE`](LICENSE)). Art is **not** — see [`docs/LICENSES.md`](docs/LICENSES.md),
because a repository that carries only the code licence teaches the wrong thing by omission.
