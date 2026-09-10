<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# The format

**One file per set**, holding the pixels and the colours together (ADR-0135). A set is the sheets that share
a palette; the file describes what each pixel IS, and every palette that art was found wearing.

🔴 **This page is a contract, not documentation of an implementation.** The engine will write its own reader
against it (ADR-0134), and nothing else holds the two implementations together. If the format moves, this
page moves in the same commit.

---

## `<set>.semantic.json`

```json
{
  "schema": 2,
  "//": "Semantic pixel art: `grid` holds run-length rows of POSITION indices, `positions` says what each position means, and `palettes` gives the colours each meaning wears. A pixel is described by what it IS, never by what colour it happens to be.",
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
  "positions": [
    { "region": null,   "level": 0 },
    { "region": "pele", "level": 0 },
    { "region": "pele", "level": 1 }
  ],
  "levels": {
    "pele": { "steps": 2, "outline": null }
  },
  "palettes": {
    "source": { "pele": ["#3b2418ff", "#9c6a4dff"] },
    "Ivory":  { "pele": ["#4a2c14ff", "#bb8148ff"] }
  },
  "source": {
    "author": "…", "url": "https://…", "door": "bridge",
    "licence": "CC-BY-SA-3.0", "outgoingLicence": "GPL-3.0-only", "derivedFrom": "…"
  }
}
```

| field | what it is |
|---|---|
| `//` | one sentence saying what the file is, because the first thing to open it may be a model with no other context |
| `sheets[].grid` | one string per row of pixels, runs written `<count>x<position>` |
| `positions` | indexed by the position a grid names: **what that position MEANS**. The record of the human decision |
| `levels` | per region name: how many steps its ramp has, and which step is the outline (`null` if none) |
| `palettes` | `palettes[name][region][level]` is a colour `#rrggbbaa`. Every palette this art was found wearing |
| `source` | the fields of `art/ATTRIBUTION.csv`, so the ledger is generated rather than written by hand |

### A region is a WORD, and `null` is nothing

🔴 **`{"region": "pele", "level": 1}` answers in place.** There is no id and no lookup table: schema 1 kept a
`regions` map and wrote numbers, which meant holding two structures at once to answer the one question the
file exists to answer. The file is imported for a language model to read, and a join is where a reader goes
wrong (ADR-0135).

`region: null` is nothing at all — the hole in the picture. It is `null` rather than a word like «nothing»
because a word could collide with one a person typed.

⚠️ **The vocabulary belongs to the artwork.** «metal da fivela» is a legitimate region. Nothing validates the
spelling, so two typings of one word are two regions and no check catches it.

### One file, every palette

🎯 **`palettes` holds all of them, not just the one that reproduces the source.** A game offering four team
colours opens one thing. `source` is the palette that reproduces the original files exactly; the rest are
harvested from other palettes of the same drawings.

## The index is the set's canonical order

🔴 **A reader must not invent its own numbering.** The number in `grid` is the position of a colour in the
**set's canonical order: the union of every colour used by every sheet in the set, sorted ascending** as
packed `0xRRGGBBAA`, with fully transparent sorting first.

⚠️ It is deliberately **not** first-appearance order. Within one set, `walk` and `hurt` meet their shared
colours in different orders, so a first-appearance index would need a different `positions` list per
sheet — and one annotation could not cover the set, which is the whole reason a set exists.

📌 First-appearance order is used elsewhere, for a different question: it is how the tool decides whether
two files are the *same drawing*. The two orderings answer different questions and must not be confused.

### Runs stop at the end of a row

Each entry of `grid` covers exactly one row and its runs must add up to exactly `width`. Letting runs cross
rows makes the file about 6 % smaller and makes a diff impossible to locate to a line of the picture;
gzipped — which is how git stores it — the two are within 0.4 % of each other, so the saving is
working-tree bytes only. A reader must **refuse** a row that does not add up rather than pad it.

### Validation a reader owes

- `schema` must be `2`. An unknown version is refused, not read hopefully — schema 1 and 2 disagree about
  where a region's name lives, and there is no reading that half-works.
- Every region named by a position must appear in `levels`.
- 🔴 **No two positions may claim the same `(region, level)`.** It makes a ramp ambiguous — two source
  colours claiming one step — and recomposition would silently take whichever came last. This is the check
  with the most teeth in the format.
- Every position a grid uses must be described in `positions`.
- `region: null` is **nothing** — a hole in the picture. It has no ramp and claims no level.

---

## Choosing a palette

A reader is given a **choice**: either one palette name for everything, or a map from region name to palette
name.

```
recompose(file, "walk", "Ivory")
recompose(file, "walk", { "pele": "Ivory", "roupa": "source" })
```

⚠️ **THE CHOICE IS PER REGION, never for the whole resource.** «Light skin with a red shirt» is the ordinary
thing a game asks for, and a single global name cannot express it — which would empty the palette dictionary
of its purpose. A bare name is shorthand for «this one everywhere», and is chiefly useful for reproducing the
source exactly.

A reader must REFUSE, and say which, when: the chosen palette has no ramp for a region the sheet uses; the
ramp has no entry at the level a position names; or a region the sheet uses was left out of the choice.
Filling any of those with a nearby colour would put a colour the palette does not have into the art, and
nothing downstream could tell.

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

⚠️ **THE TWO ORDERINGS MUST NOT BE CONFUSED.** `positions` is indexed by the set's CANONICAL order (its
colours, sorted). The correspondence between an annotated sheet and a variant runs through FIRST APPEARANCE.
A reader that harvests must translate between them, and a reader that only recomposes never needs the second
one at all.

⚠️ A variant can only fill the steps the ANNOTATED sheet itself uses. When another sheet of the set brings a
colour the annotated one never shows, the variant has nothing to say about that step — it must be reported
as missing, never filled with a nearby colour.

## The round trip, and the one thing it does not preserve

**Every visible pixel survives exactly.** 📏 Verified over the same 197 files: decode → canonical order →
grid → write → read → recompose with the harvested palette, **41 512 960 pixels compared, 197 of 197 files
identical**; and on the LPC, **1 117 299 008 pixels across 8 155 of 8 155 files**.

⚠️ **RGB stored underneath a fully transparent pixel is NOT preserved.** 📏 12 560 pixels in the sample carry
one, and they come back as zeroes. This is a trade and not an oversight:

🎯 **The collapse is what makes the tool work.** Without it, two files identical to the eye get different
index grids because one stored white-at-zero-alpha where the other stored black — and the variant harvest,
the thing that turns 34 annotations into 100 files, finds nothing.

⚠️ **It would matter under bilinear filtering or mipmapping**, which sample transparent texels and bleed
their colour into visible edges. It does not matter for this project because its art renders NEAREST by
mandate (ADR-0027). That is a **condition**, not a coincidence: if it ever stops holding, this decision has
to be revisited rather than rediscovered.

## The fixtures, which are how this page is checked from the other side

`fixtures/valid/` holds a small set worked out **by hand**: the file, and the exact
pixels each palette choice must produce — including the per-region case, which is the one a reader is most
likely to get wrong.

🔴 **They were not generated by any reader.** A fixture produced by the implementation it checks proves only
that the code agrees with itself, and the point of these is that a SECOND reader — the engine's — must agree
with them too.

`fixtures/invalid/` holds five files that parse as JSON and are each wrong in exactly one way. A conforming
reader refuses every one of them, and says which file and what is wrong: «invalid semantic file» sends a
person back to a folder of hundreds with nothing to look for.

## What a reader must never do

- **Never apply colour management.** A PNG carrying `gAMA`, `iCCP` or `sRGB` must decode to the bytes it
  holds. 📏 All 197 measured files carry an `sRGB` chunk, so this is the norm rather than an edge case, and a
  transformed byte produces a wrong mapping instead of an error.
- **Never premultiply alpha.** Straight RGBA throughout.
- **Never resize or recompress source art.** Any «image optimisation» step destroys the correspondence
  between a file and the annotation made against it.
