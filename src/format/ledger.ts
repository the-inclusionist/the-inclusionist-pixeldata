// SPDX-License-Identifier: AGPL-3.0-or-later
//
// THE LEDGER ROW, GENERATED RATHER THAN WRITTEN BY HAND.
//
// `source` in a set file carries exactly the fields of the engine's `art/ATTRIBUTION.csv`, so the ledger is
// derived from the artefact instead of being kept in step with it by somebody remembering to.
//
// 🔴 AND THE COMMA IS A REAL HAZARD, not a hypothetical. An author called «Smith, J.» or a URL with a query
// string splits a naive row in two, and every field after it shifts by one — a licence lands in the door
// column and the row still parses. Nothing reports it.
//
// ⚠️ THE CONSUMER CANNOT YET READ WHAT THIS WRITES, and that has to be said rather than discovered.
// `tests/arte-licencas-aceites.node.test.js` in the engine parses with a bare `ln.split(',')`, which
// understands no quoting at all. So a correctly quoted row would be MIS-READ there, quietly. Two things
// follow, and both are done here rather than half of one:
//   · the generator quotes per RFC 4180, because writing a knowingly ambiguous row is not an option;
//   · `unsafeForNaiveParser` names the rows that would break that reader, so a caller can refuse to ship
//     them until the engine's parser is upgraded. The debt is the engine's, and it is now visible.

/** The columns, in the order `art/ATTRIBUTION.csv` already uses. Its header is pt-BR and stays that way. */
export const LEDGER_HEADER = 'caminho,autor,fonte,porta,licenca,licenca-de-saida,entrega,derivado-de';

export interface LedgerRow {
  readonly path: string;
  readonly author: string;
  readonly url: string;
  readonly door: string;
  readonly licence: string;
  readonly outgoingLicence: string;
  readonly delivery: string;
  readonly derivedFrom: string | null;
}

/**
 * RFC 4180: a field is quoted when it holds a comma, a quote or a newline, and an inner quote is doubled.
 * A field with none of those is left bare, so an ordinary ledger stays readable at a glance.
 */
export function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.split('"').join('""')}"` : value;
}

const FIELDS = (row: LedgerRow): string[] => [
  row.path, row.author, row.url, row.door, row.licence, row.outgoingLicence, row.delivery, row.derivedFrom ?? '',
];

export function toLedgerRow(row: LedgerRow): string {
  return FIELDS(row).map(escapeField).join(',');
}

export function toLedgerCsv(rows: readonly LedgerRow[]): string {
  return [LEDGER_HEADER, ...rows.map(toLedgerRow)].join('\n') + '\n';
}

/**
 * 🔴 Which rows a `split(',')` reader would get wrong — the reader the engine's gate uses today.
 *
 * A row is unsafe the moment any field needs quoting, because that reader does not know what a quote is: it
 * would take the opening quote as part of the value and split the field in two. Returned so a caller can
 * refuse rather than ship a row that parses into the wrong columns without complaint.
 */
export function unsafeForNaiveParser(rows: readonly LedgerRow[]): LedgerRow[] {
  return rows.filter((row) => FIELDS(row).some((field) => /[",\r\n]/.test(field)));
}
