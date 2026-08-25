import type { OwnedCard } from '../types';

/**
 * Display-level grouping: combine rows of the same printing in the same
 * location that differ only by foil and/or condition into one entry with the
 * summed quantity. Language and binder still split rows; the DB rows are
 * untouched — CardDetail's owned-copies list keeps showing every variant.
 *
 * The representative row prefers a nonfoil variant (so the shown price is the
 * nonfoil price); mixed foil/condition render as "mixed".
 */
export function groupVariants(cards: OwnedCard[]): OwnedCard[] {
  const map = new Map<string, OwnedCard>();
  const order: string[] = [];

  const isFoil = (c: OwnedCard) => c.foil !== null && c.foil !== 'normal';

  for (const c of cards) {
    const key = [c.collection_id, c.scryfall_id, c.language, c.binder_name].join('|');
    const g = map.get(key);
    if (!g) {
      map.set(key, { ...c });
      order.push(key);
      continue;
    }
    // Prefer a nonfoil representative so price/foil fields default sensibly.
    if (isFoil(g) && !isFoil(c)) {
      const merged = { ...c, quantity: g.quantity + c.quantity };
      merged.foil = g.foil === c.foil ? c.foil : 'mixed';
      merged.condition = g.condition === c.condition ? c.condition : 'mixed';
      map.set(key, merged);
      continue;
    }
    g.quantity += c.quantity;
    if (g.foil !== c.foil) g.foil = 'mixed';
    if (g.condition !== c.condition) g.condition = 'mixed';
  }

  return order.map((k) => map.get(k)!);
}
