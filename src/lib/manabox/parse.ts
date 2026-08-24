import Papa from 'papaparse';
import { detectFormat, type NormalizedRow } from './formats';

export interface ParseResult {
  format: string;
  rows: NormalizedRow[];
  malformed: { line: number; reason: string }[];
}

/**
 * Parse a collection CSV from any supported scanner
 * (ManaBox, Dragon Shield, TCGplayer, Moxfield, Deckbox).
 * Format is auto-detected from the header row; malformed rows are reported, not fatal.
 */
export function parseCollectionCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const format = detectFormat(headers);
  if (!format) {
    throw new Error(
      'Unrecognized CSV format. Supported: ManaBox, Dragon Shield, TCGplayer, Moxfield, Deckbox.',
    );
  }

  const rows: NormalizedRow[] = [];
  const malformed: { line: number; reason: string }[] = [];

  parsed.data.forEach((raw, idx) => {
    const line = idx + 2; // header is line 1
    const result = format.normalize(raw);
    if (typeof result === 'string') malformed.push({ line, reason: result });
    else rows.push(result);
  });

  return { format: format.name, rows, malformed };
}

/** @deprecated kept for compatibility; use parseCollectionCsv */
export const parseManaBoxCsv = parseCollectionCsv;
