import type { ManaBoxRow } from '../../types';

/** A parsed CSV row before Scryfall id resolution. */
export type NormalizedRow = Omit<ManaBoxRow, 'scryfall_id'> & {
  scryfall_id: string | null;
};

export interface CsvFormat {
  name: string;
  /** Headers that must all be present for this format to match. */
  signature: string[];
  normalize: (raw: Record<string, string>) => NormalizedRow | string; // string = error reason
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/^\$/, ''));
  return Number.isNaN(n) ? null : n;
};
const qty = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 1 ? n : null;
};

/** "Near Mint" / "NearMint" / "near_mint" -> "near_mint" */
const condition = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replaceAll(' ', '_');
};

/** "foil"/"Foil"/"etched" -> foil value; anything else -> "normal" */
const foil = (v: unknown): string => {
  const s = str(v)?.toLowerCase();
  if (!s) return 'normal';
  if (s.includes('etched')) return 'etched';
  if (s === 'foil' || s === 'true' || s.includes('foil')) return 'foil';
  return 'normal';
};

const LANG_MAP: Record<string, string> = {
  english: 'en', japanese: 'ja', german: 'de', french: 'fr', italian: 'it',
  spanish: 'es', portuguese: 'pt', korean: 'ko', russian: 'ru',
  'chinese simplified': 'zhs', 'chinese traditional': 'zht',
};
const lang = (v: unknown): string | null => {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  return LANG_MAP[s] ?? s;
};

function base(name: string): NormalizedRow {
  return {
    binder_name: null,
    binder_type: null,
    card_name: name,
    set_code: null,
    set_name: null,
    collector_number: null,
    foil: 'normal',
    rarity: null,
    quantity: 1,
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
}

const manabox: CsvFormat = {
  name: 'ManaBox',
  signature: ['Name', 'Quantity', 'Scryfall ID'],
  normalize(raw) {
    const name = str(raw['Name']);
    if (!name) return 'Missing card name';
    const id = str(raw['Scryfall ID']);
    if (!id || !UUID_RE.test(id)) return `Invalid Scryfall ID for "${name}"`;
    const q = qty(raw['Quantity']);
    if (q === null) return `Invalid quantity for "${name}"`;
    const addedRaw = str(raw['Added']);
    return {
      ...base(name),
      binder_name: str(raw['Binder Name']),
      binder_type: str(raw['Binder Type']),
      set_code: str(raw['Set code']),
      set_name: str(raw['Set name']),
      collector_number: str(raw['Collector number']),
      foil: str(raw['Foil'])?.toLowerCase() ?? 'normal',
      rarity: str(raw['Rarity'])?.toLowerCase() ?? null,
      quantity: q,
      manabox_id: str(raw['ManaBox ID']),
      scryfall_id: id.toLowerCase(),
      purchase_price: num(raw['Purchase price']),
      purchase_price_currency: str(raw['Purchase price currency']),
      misprint: str(raw['Misprint'])?.toLowerCase() === 'true',
      altered: str(raw['Altered'])?.toLowerCase() === 'true',
      condition: condition(raw['Condition']),
      language: lang(raw['Language']),
      added_at: addedRaw && !Number.isNaN(Date.parse(addedRaw)) ? addedRaw : null,
    };
  },
};

const moxfield: CsvFormat = {
  name: 'Moxfield',
  signature: ['Count', 'Name', 'Edition', 'Collector Number'],
  normalize(raw) {
    const name = str(raw['Name']);
    if (!name) return 'Missing card name';
    const q = qty(raw['Count']);
    if (q === null) return `Invalid count for "${name}"`;
    return {
      ...base(name),
      set_code: str(raw['Edition'])?.toLowerCase() ?? null,
      collector_number: str(raw['Collector Number']),
      foil: foil(raw['Foil']),
      quantity: q,
      purchase_price: num(raw['Purchase Price']),
      altered: str(raw['Alter'])?.toLowerCase() === 'true',
      condition: condition(raw['Condition']),
      language: lang(raw['Language']),
    };
  },
};

const deckbox: CsvFormat = {
  name: 'Deckbox',
  signature: ['Count', 'Name', 'Edition', 'Card Number'],
  normalize(raw) {
    const name = str(raw['Name']);
    if (!name) return 'Missing card name';
    const q = qty(raw['Count']);
    if (q === null) return `Invalid count for "${name}"`;
    return {
      ...base(name),
      set_name: str(raw['Edition']),
      collector_number: str(raw['Card Number']),
      foil: foil(raw['Foil']),
      quantity: q,
      altered: str(raw['Altered Art'])?.toLowerCase() === 'foil' || !!str(raw['Altered Art']),
      misprint: !!str(raw['Misprint']),
      condition: condition(raw['Condition']),
      language: lang(raw['Language']),
      purchase_price: num(raw['My Price']),
    };
  },
};

const dragonShield: CsvFormat = {
  name: 'Dragon Shield',
  signature: ['Card Name', 'Set Code', 'Card Number', 'Printing'],
  normalize(raw) {
    const name = str(raw['Card Name']);
    if (!name) return 'Missing card name';
    const q = qty(raw['Quantity']);
    if (q === null) return `Invalid quantity for "${name}"`;
    const bought = str(raw['Date Bought']);
    return {
      ...base(name),
      binder_name: str(raw['Folder Name']),
      set_code: str(raw['Set Code'])?.toLowerCase() ?? null,
      set_name: str(raw['Set Name']),
      collector_number: str(raw['Card Number']),
      foil: foil(raw['Printing']),
      quantity: q,
      purchase_price: num(raw['Price Bought']),
      condition: condition(raw['Condition']),
      language: lang(raw['Language']),
      added_at: bought && !Number.isNaN(Date.parse(bought)) ? new Date(bought).toISOString() : null,
    };
  },
};

const tcgplayer: CsvFormat = {
  name: 'TCGplayer',
  signature: ['Quantity', 'Name', 'Set Code', 'Card Number'],
  normalize(raw) {
    const name = str(raw['Name']);
    if (!name) return 'Missing card name';
    const q = qty(raw['Quantity']);
    if (q === null) return `Invalid quantity for "${name}"`;
    return {
      ...base(name),
      set_code: str(raw['Set Code'])?.toLowerCase() ?? null,
      set_name: str(raw['Set']),
      collector_number: str(raw['Card Number']),
      foil: foil(raw['Printing']),
      rarity: str(raw['Rarity'])?.toLowerCase() ?? null,
      quantity: q,
      condition: condition(raw['Condition']),
      language: lang(raw['Language']),
    };
  },
};

// Order matters: more specific signatures first (ManaBox before the Count-based ones,
// Dragon Shield/TCGplayer before generic matches).
export const FORMATS: CsvFormat[] = [manabox, dragonShield, tcgplayer, moxfield, deckbox];

export function detectFormat(headers: string[]): CsvFormat | null {
  const set = new Set(headers);
  return FORMATS.find((f) => f.signature.every((h) => set.has(h))) ?? null;
}
