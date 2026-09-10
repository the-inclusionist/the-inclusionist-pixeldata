// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE LEDGER ROW, AND THE COMMA THAT SPLITS IT.
//
// 🔴 The failure this file exists for has no symptom. An author called «Smith, J.» splits a naive row in
// two, every field after it shifts by one — a licence lands in the door column — and the row still parses.
// The gate that reads it reports nothing, because nothing looks wrong.
import { describe, it, expect } from 'vitest';
import { escapeField, toLedgerRow, toLedgerCsv, unsafeForNaiveParser, LEDGER_HEADER, type LedgerRow } from '../src/format/ledger.ts';

const ROW: LedgerRow = {
  path: 'art/warrior.semantic.json',
  author: 'Pixel Frog',
  url: 'https://pixelfrog-assets.itch.io/tiny-swords',
  door: 'licence',
  licence: 'CC0-1.0',
  outgoingLicence: 'CC0-1.0',
  delivery: 'file',
  derivedFrom: null,
};

describe('escapeField', () => {
  it('Zero: an ordinary field is left bare, so an ordinary ledger reads at a glance', () => {
    expect(escapeField('Pixel Frog')).toBe('Pixel Frog');
  });

  it('🔴 Right: a comma is quoted, because it is the character that moves every later column', () => {
    expect(escapeField('Smith, J.')).toBe('"Smith, J."');
  });

  it('Right: a quote is doubled inside quotes, per RFC 4180', () => {
    expect(escapeField('the "pixel" frog')).toBe('"the ""pixel"" frog"');
  });

  it('Boundary: a newline is quoted too — a bare one would end the row early', () => {
    expect(escapeField('two\nlines')).toBe('"two\nlines"');
  });
});

describe('toLedgerRow', () => {
  it('Right: eight fields in the order `art/ATTRIBUTION.csv` already uses', () => {
    expect(toLedgerRow(ROW).split(',')).toHaveLength(8);
    expect(toLedgerRow(ROW)).toBe('art/warrior.semantic.json,Pixel Frog,https://pixelfrog-assets.itch.io/tiny-swords,licence,CC0-1.0,CC0-1.0,file,');
  });

  it('Boundary: a missing `derivedFrom` is an empty field, not the word null', () => {
    expect(toLedgerRow(ROW).endsWith(',')).toBe(true);
  });

  it('🔴 Right: a comma in a field does NOT add a column', () => {
    // The whole point. Without the quoting this row would have nine fields and the licence would be read
    // as the door.
    const row = toLedgerRow({ ...ROW, author: 'Smith, J.' });
    expect(row).toContain('"Smith, J."');
  });

  it('Right: the header is the one the engine already carries, in its own language', () => {
    expect(toLedgerCsv([ROW]).split('\n')[0]).toBe(LEDGER_HEADER);
  });
});

describe('🔴 unsafeForNaiveParser — the debt, named rather than discovered', () => {
  it('Right: an ordinary row is safe for the reader the engine uses today', () => {
    expect(unsafeForNaiveParser([ROW])).toEqual([]);
  });

  it('🔴 Right: a row needing quotes is REPORTED, because the engine parses with a bare split', () => {
    // `tests/arte-licencas-aceites.node.test.js` in the engine does `ln.split(',')` and understands no
    // quoting at all — so a correctly quoted row would be MIS-READ there, silently. Writing an ambiguous
    // row instead is not an option, so the row is written correctly and named as one that reader cannot
    // take yet. The debt is the engine's; this makes it visible instead of leaving it to be found.
    const risky = { ...ROW, author: 'Smith, J.' };
    expect(unsafeForNaiveParser([ROW, risky])).toEqual([risky]);
  });

  it('Boundary: a quote alone is enough to make a row unsafe, comma or not', () => {
    expect(unsafeForNaiveParser([{ ...ROW, author: 'the "frog"' }])).toHaveLength(1);
  });
});
