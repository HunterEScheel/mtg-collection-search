import Papa from 'papaparse';
import { detectFormat, type NormalizedRow } from './formats';
import { parseDecklistLines } from '../move/parseMoveList';

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

/**
 * Parse a Moxfield-style decklist (`2 Lightning Bolt (2XM) 123 *F*`;
 * count, set, collector number, and foil marker all optional).
 */
export function parseDecklist(text: string): ParseResult {
  const { lines, malformed } = parseDecklistLines(text);
  if (lines.length === 0) {
    throw new Error('No valid decklist lines found (expected e.g. "2 Lightning Bolt (2XM) 123").');
  }
  const rows: NormalizedRow[] = lines.map((l) => {
    const base: NormalizedRow = {
      binder_name: null,
      binder_type: null,
      // Moxfield writes DFC faces as "A / B"; Scryfall uses "A // B".
      card_name: l.name.replace(/\s+\/\s+/g, ' // '),
      set_code: l.setCode,
      set_name: null,
      collector_number: l.collectorNumber,
      foil: l.foil ? 'foil' : 'normal',
      rarity: null,
      quantity: l.quantity,
      manabox_id: null,
      scryfall_id: null,
      purchase_price: null,
      purchase_price_currency: null,
      misprint: false,
      altered: false,
      condition: null,
      language: null,
      added_at: null,
    };
    return base;
  });
  return { format: 'Moxfield Decklist', rows, malformed };
}

/**
 * Parse pasted or uploaded collection text: a supported CSV if the header
 * matches a known format, otherwise a Moxfield-style decklist.
 */
export function parseCollectionText(text: string): ParseResult {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '');
  if (firstLine) {
    const header = Papa.parse<string[]>(firstLine.trim(), { header: false });
    const headers = (header.data[0] ?? []).map((h) => (typeof h === 'string' ? h.trim() : ''));
    if (detectFormat(headers)) return parseCollectionCsv(text);
  }
  return parseDecklist(text);
}
