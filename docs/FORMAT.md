<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# The format

Two kinds of file. A **set file** describes what a group of sheets is made of; a **palette file** says what
colour each part wears. They are apart so that one palette can serve several sets and one set can wear
several palettes.

🔴 **This page is a contract, not documentation of an implementation.** The engine will write its own reader
against it (ADR-0134), and nothing else holds the two implementations together. If the format moves, this
page moves in the same commit.

---

## `<set>.semantic.json`

One file per **set** — the sheets that share a palette.

```json
{
  "schema": 1,
  "regions": { "1": "skin", "2": "shadow" },
  "levels": { "1": { "steps": 4, "outline": 3 }, "2": { "steps": 1, "outline": null } },
  "sheets": [
    {
      "name": "walk",
      "width": 576,
      "height": 256,
      "grid": ["576x0", "12x0 4x3 560x0", "..."],
      "frames": [
        { "name": "walk-south-0", "x": 0, "y": 0, "width": 64, "height": 64, "pivot": [32, 60], "durationMs": 100 }
      ]
    }
  ],
  "colorMap": [
    { "region": 0, "level": 0 },
    { "region": 1, "level": 0 },
    { "region": 1, "level": 1 }
  ],
  "palettes": ["source", "coffee", "amber"],
  "source": {
    "author": "…", "url": "https://…", "door": "bridge",
    "licence": "CC-BY-SA-3.0", "outgoingLicence": "GPL-3.0-only", "derivedFrom": "…"
  }
}
```

| field | what it is |
|---|---|
| `regions` | the vocabulary **this set** invents — id → name. It is content, so it is never translated. |
| `levels` | per region: how many steps its ramp has, and which step index is the outline (`null` if none). |
| `sheets[].grid` | one string per row of pixels, runs written `<count>x<index>`. |
| `colorMap` | indexed by canonical colour index: what that index MEANS. The record of the human decision. |
| `palettes` | the variant NAMES the companion `<set>.palette.json` holds — `source` first, then each harvested one. |
| `source` | the fields of `art/ATTRIBUTION.csv`, so the ledger is generated rather than written by hand. |

### The index is the set's canonical order

🔴 **A reader must not invent its own numbering.** The index in `grid` is the position of a colour in the
**set's canonical order: the union of every colour used by every sheet in the set, sorted ascending** as
packed `0xRRGGBBAA`, with fully transparent sorting first.

⚠️ It is deliberately **not** first-appearance order. Within one set, `walk` and `hurt` meet their shared
colours in different orders, so a first-appearance index would need a different `colorMap` per sheet — and
one annotation could not cover the set, which is the whole reason a set exists.

📌 First-appearance order is used elsewhere, for a different question: it is how the tool decides whether
two files are the *same drawing*. The two orderings answer different questions and must not be confused.

### Runs stop at the end of a row

Each entry of `grid` covers exactly one row and its runs must add up to exactly `width`. Letting runs cross
rows makes the file about 6 % smaller and makes a diff impossible to locate to a line of the picture;
gzipped — which is how git stores it — the two are within 0.4 % of each other, so the saving is
working-tree bytes only. A reader must **refuse** a row that does not add up rather than pad it.

### Validation a reader owes

- `schema` must be `1`. An unknown version is refused, not read hopefully.
- Every region named in `colorMap` must exist in `regions`.
- 🔴 **No two indices may claim the same `(region, level)`.** It makes a ramp ambiguous — two source colours
  claiming one step — and recomposition would silently take whichever came last. This is the check with the
  most teeth in the format.
- Every index a grid uses must exist in `colorMap`.
- Region `0` is **nothing** — a hole in the picture. It has no ramp and claims no level.

---

## `<name>.palette.json`

```json
{
  "schema": 1,
  "name": "human",
  "regions": {
    "1": {
      "variants": {
        "source": ["#3b2418ff", "#6b4530ff", "#9c6a4dff", "#140c08ff"],
        "amber":  ["#4a2c14ff", "#82552cff", "#bb8148ff", "#1a0f06ff"]
      }
    },
    "2": { "variants": { "source": ["#0000005a"], "amber": ["#0000005a"] } }
  }
}
```

🎯 **One file per SET, not per variant.** The structure is already `region → variants → ramp`, so a variant
is exactly what a variant entry is for; splitting it would leave a game loading four files to offer four
team colours. Every harvested variant joins this file.

`regions[regionId].variants[variantName][level]` is a colour written `#rrggbbaa`.

⚠️ **A variant is chosen PER REGION, never for the whole resource.** «Light skin with a red shirt» is the
normal case, and a single global variant name cannot express it — which would empty the dictionary of its
purpose. A reader takes a map from region id to variant name; a bare name is shorthand for «this one
everywhere», and it is only really useful for reproducing the source.

### Alpha is part of the colour

🔴 A ramp entry carries alpha, and a semi-transparent colour is a colour like any other. 📏 Measured across
197 CC0 files: **119 of them carry partial alpha**, never more than three semi-transparent colours in a file.
That is a shadow at a constant alpha, not anti-aliasing — so a shadow is annotated as its own region, and a
hard 0-or-255 mask would have rejected sixty per cent of a real pack.

---

## Harvesting a variant

🎯 **The mechanism that makes a large asset pack affordable.** Two files with the same drawing — the same
grid of first-appearance colour indices — name the same steps in the same order. So if index `i` of the
annotated sheet was called `(skin, 3)`, the colour at index `i` of any file with that same drawing IS level 3
of skin in that variant. No matching, no nearest-colour, nothing approximate.

📏 Verified over the 197-file sample: **218 harvests, 218 exact, 107 118 592 pixels recoloured and compared**
against the file each palette came from.

⚠️ **THE TWO ORDERINGS MUST NOT BE CONFUSED.** `colorMap` is indexed by the set's CANONICAL order (its
colours, sorted). The correspondence between an annotated sheet and a variant runs through FIRST APPEARANCE.
A reader that harvests must translate between them, and a reader that only recomposes never needs the second
one at all.

⚠️ A variant can only fill the steps the ANNOTATED sheet itself uses. When another sheet of the set brings a
colour the annotated one never shows, the variant has nothing to say about that step — it must be reported
as missing, never filled with a nearby colour.

## The round trip, and the one thing it does not preserve

**Every visible pixel survives exactly.** 📏 Verified over the same 197 files: decode → canonical order →
grid → write → read → recompose with the harvested palette, **41 512 960 pixels compared, 197 of 197 files
identical**.

⚠️ **RGB stored underneath a fully transparent pixel is NOT preserved.** 📏 12 560 pixels in the sample carry
one, and they come back as zeroes. This is a trade and not an oversight:

🎯 **The collapse is what makes the tool work.** Without it, two files identical to the eye get different
index grids because one stored white-at-zero-alpha where the other stored black — and the variant harvest,
the thing that turns 34 annotations into 100 files, finds nothing.

⚠️ **It would matter under bilinear filtering or mipmapping**, which sample transparent texels and bleed
their colour into visible edges. It does not matter for this project because its art renders NEAREST by
mandate (ADR-0027). That is a **condition**, not a coincidence: if it ever stops holding, this decision has
to be revisited rather than rediscovered.

## What a reader must never do

- **Never apply colour management.** A PNG carrying `gAMA`, `iCCP` or `sRGB` must decode to the bytes it
  holds. 📏 All 197 measured files carry an `sRGB` chunk, so this is the norm rather than an edge case, and a
  transformed byte produces a wrong mapping instead of an error.
- **Never premultiply alpha.** Straight RGBA throughout.
- **Never resize or recompress source art.** Any «image optimisation» step destroys the correspondence
  between a file and the annotation made against it.
