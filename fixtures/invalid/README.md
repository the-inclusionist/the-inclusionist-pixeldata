<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Files a conforming reader must REFUSE

Each of these parses as JSON and is wrong in exactly one way. A reader that accepts any of them will produce
a plausible picture that is not the picture the file describes, and nothing downstream will say so — which is
why they are here beside the valid fixture rather than left to be discovered.

| file | what is wrong | why refusing matters |
|---|---|---|
| `unknown-schema.json` | `schema` is 99 | Reading a future version hopefully is how a reader silently mis-reads a format that grew. |
| `claimed-twice.json` | two positions claim `skin` level 0 | The ramp is ambiguous. Recomposition would take whichever came last, and half the art would wear the wrong step. |
| `short-row.json` | a row's runs cover 3 pixels of a declared width of 4 | Padding it shifts every pixel after that row. The picture stays plausible. |
| `unknown-region.json` | a position names region `boots`, absent from `levels` | The vocabulary is what a human typed. A region nobody described is a mistake, not a default. |
| `index-past-map.json` | the grid uses position 9 and the file describes five | There is no meaning to read. Skipping the pixel would leave a hole nobody asked for. |

⚠️ **A reader that refuses must say WHICH file and WHAT is wrong.** «Invalid semantic file» sends a person
back to a folder of hundreds with nothing to look for.
