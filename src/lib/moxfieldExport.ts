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
