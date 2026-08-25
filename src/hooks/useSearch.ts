import { useEffect, useMemo, useState } from 'react';
import type { OwnedCard } from '../types';
import { compileQuery, QueryError, setSearchPool } from '../lib/scryfall';

export interface UiFilters {
  minQty: number | null;
  maxQty: number | null;
  locations: string[]; // empty = all
}

export const EMPTY_FILTERS: UiFilters = { minQty: null, maxQty: null, locations: [] };

/** Debounced Scryfall-syntax search + UI filters (implicit trailing AND). */
export function useSearch(cards: OwnedCard[], query: string, filters: UiFilters) {
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  return useMemo(() => {
    // in:/notin: fields look up card names across the whole pool.
    setSearchPool(cards);
    let pred: (c: OwnedCard) => boolean;
    try {
      pred = compileQuery(debounced);
    } catch (e) {
      if (e instanceof QueryError) {
        return { results: [] as OwnedCard[], error: e.message };
      }
      throw e;
    }

    const locationSet = new Set(filters.locations);
    const results = cards.filter((c) => {
      if (!pred(c)) return false;
      if (filters.minQty !== null && c.quantity < filters.minQty) return false;
      if (filters.maxQty !== null && c.quantity > filters.maxQty) return false;
      if (locationSet.size > 0 && !locationSet.has(c.location_name)) return false;
      return true;
    });
    return { results, error: null as string | null };
  }, [cards, debounced, filters]);
}
