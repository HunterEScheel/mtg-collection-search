import type { OwnedCard } from '../types';

/**
 * Render cards as a Moxfield-importable text list:
 *   `2 Lightning Bolt (2XM) 123 *F*`
 * Rows identical up to (name, set, collector, foil) merge their quantities —
 * condition/language/binder don't exist in the Moxfield text format.
 */
export function toMoxfieldList(cards: OwnedCard[]): string {
  const merged = new Map<string, { qty: number; line: string }>();

  for (const c of cards) {
    const name = c.scryfall?.name ?? c.card_name;
    const foil = c.foil !== null && c.foil !== 'normal';
    const set = c.set_code?.toUpperCase() ?? null;
    const printing = set
      ? ` (${set})${c.collector_number ? ` ${c.collector_number}` : ''}`
      : '';
    const suffix = `${printing}${foil ? ' *F*' : ''}`;
    const key = `${name.toLowerCase()}|${suffix}`;

    const existing = merged.get(key);
    if (existing) existing.qty += c.quantity;
    else merged.set(key, { qty: c.quantity, line: `${name}${suffix}` });
  }

  return [...merged.values()].map(({ qty, line }) => `${qty} ${line}`).join('\n');
}

const csvField = (v: string | number | boolean | null): string => {
  const s = v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * Render cards as a ManaBox-importable CSV — the same column set our own
 * ManaBox importer reads, so a round trip is lossless.
 */
export function toManaBoxCsv(cards: OwnedCard[]): string {
  const header =
    'Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,' +
    'Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,' +
    'Language,Purchase price currency,Added';
  const rows = cards.map((c) =>
    [
      c.binder_name,
      c.binder_type,
      c.scryfall?.name ?? c.card_name,
      c.set_code,
      c.set_name,
      c.collector_number,
      c.foil ?? 'normal',
      c.rarity,
      c.quantity,
      c.manabox_id,
      c.scryfall_id,
      c.purchase_price,
      c.misprint,
      c.altered,
      c.condition,
      c.language,
      c.purchase_price_currency,
      c.added_at,
    ].map(csvField).join(','));
  return [header, ...rows].join('\n');
}
