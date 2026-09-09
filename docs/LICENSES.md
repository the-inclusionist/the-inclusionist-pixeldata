<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# What governs what

⚠️ **The code licence is not the art licence, and this repository touches both.** It writes tools under
AGPL-3.0-or-later, and those tools read and write files describing art that is governed by something else
entirely. Carrying only the code licence here would teach the wrong thing by omission
([ADR-0067](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0067-a-repository-is-created-when-its-address-is-declared-and-it-is-born-saying-it-is-empty.yaml) §2).

| what | regime | where it is decided |
|---|---|---|
| **The code in this repository** | **AGPL-3.0-or-later** | ADR-0064 · full text in [`../LICENSE`](../LICENSE) |
| **Art that passes through it** | whatever licence its author chose, preserved and recorded | ADR-0133 |
| **The project's own art** | **not FOSS** — the author holds it, use restricted | ADR-0010 pillar 10 |

**The canonical file is the engine's**, and it is the one to read when these disagree:
[`the-inclusionist-engine/docs/LICENSES.md`](https://github.com/the-inclusionist/the-inclusionist-engine/blob/main/docs/LICENSES.md).
This page exists so that a visitor who lands here first is not misled; it does not decide anything on its own.

## Art enters by three doors, and this repository serves the third

[ADR-0133](https://github.com/the-inclusionist/the-inclusionist-docs/blob/main/docs/2-Architecture/adr/ADR-0133-art-enters-by-three-doors-grant-licence-test-and-the-gplv3-bridge.yaml)
names them: the **author's grant**; four **named licences** (CC0, CC BY 3.0, CC BY 4.0, OGA-BY); and the
**bridge**, by which CC BY-SA art crosses as `GPL-3.0-only`. ND and NC have no door at all.

🔴 **The bridge has a condition that is not legal, and it is why this repository exists.** Creative Commons
determined on 8 October 2015 that an adapter who cannot make the work available *in the preferred form for
modification* cannot use the one-way compatibility declaration. For this project that form is the semantic
file plus its palette dictionary — the artefacts produced here.

⚠️ **Until those artefacts exist, the third door is described and shut.** No CC BY-SA file enters as it is,
under any circumstances; the bridge opens for an **adaptation**, and every resource that crosses it leaves
with `GPL-3.0-only` as its outgoing licence, its origin URL, and its `derived-from` filled in.
