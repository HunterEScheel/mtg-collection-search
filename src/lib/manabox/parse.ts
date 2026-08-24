import Papa from 'papaparse';
import type { ManaBoxRow } from '../../types';

export interface ParseResult {
  rows: ManaBoxRow[];
  malformed: { line: number; reason: string }[];
}

const REQUIRED_HEADERS = ['Name', 'Quantity', 'Scryfall ID'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

function bool(v: unknown): boolean {
  return typeof v === 'string' && v.trim().toLowerCase() === 'true';
}

function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Parse ManaBox CSV export text into rows; malformed rows are reported, not fatal. */
export function parseManaBoxCsv(csvText: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const headers = parsed.meta.fields ?? [];
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(`Not a ManaBox export: missing column(s) ${missing.join(', ')}`);
  }

  const rows: ManaBoxRow[] = [];
  const malformed: { line: number; reason: string }[] = [];

  parsed.data.forEach((raw, idx) => {
    const line = idx + 2; // header is line 1
    const name = str(raw['Name']);
    if (!name) {
      malformed.push({ line, reason: 'Missing card name' });
      return;
    }
    const scryfallId = str(raw['Scryfall ID']);
    if (!scryfallId || !UUID_RE.test(scryfallId)) {
      malformed.push({ line, reason: `Invalid Scryfall ID for "${name}"` });
      return;
    }
    const qty = num(raw['Quantity']);
    if (qty === null || !Number.isInteger(qty) || qty < 1) {
      malformed.push({ line, reason: `Invalid quantity for "${name}"` });
      return;
    }
    const addedRaw = str(raw['Added']);
    const added = addedRaw && !Number.isNaN(Date.parse(addedRaw)) ? addedRaw : null;

    rows.push({
      binder_name: str(raw['Binder Name']),
      binder_type: str(raw['Binder Type']),
      card_name: name,
      set_code: str(raw['Set code']),
      set_name: str(raw['Set name']),
      collector_number: str(raw['Collector number']),
      foil: str(raw['Foil'])?.toLowerCase() ?? null,
      rarity: str(raw['Rarity'])?.toLowerCase() ?? null,
      quantity: qty,
      manabox_id: str(raw['ManaBox ID']),
      scryfall_id: scryfallId.toLowerCase(),
      purchase_price: num(raw['Purchase price']),
      purchase_price_currency: str(raw['Purchase price currency']),
      misprint: bool(raw['Misprint']),
      altered: bool(raw['Altered']),
      condition: str(raw['Condition']),
      language: str(raw['Language']),
      added_at: added,
    });
  });

  return { rows, malformed };
}
