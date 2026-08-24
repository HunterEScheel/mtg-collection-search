import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { OwnedCard, ScryfallCard } from '../types';

const PAGE = 1000;
const ID_CHUNK = 500;

// Projected columns only — never the full `data` jsonb blob.
const SCRYFALL_PROJECTION =
  'id,name,oracle_text,type_line,mana_cost,cmc,colors,color_identity,keywords,' +
  'rarity,set_code,set_name,power,toughness,loyalty,layout,usd,usd_foil,' +
  'image_small,image_normal,scryfall_uri,legalities';

async function loadAll(collectionId: string): Promise<OwnedCard[]> {
  // 1. Page through the collection rows (Supabase caps a request at 1000 rows).
  const rows: Omit<OwnedCard, 'scryfall'>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('collection_cards')
      .select('*')
      .eq('collection_id', collectionId)
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as Omit<OwnedCard, 'scryfall'>[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }

  // 2. Fetch cached Scryfall data for the distinct printings and join in memory.
  //    (No FK join: rows with unresolved Scryfall ids must still import.)
  const ids = [...new Set(rows.map((r) => r.scryfall_id))];
  const byId = new Map<string, ScryfallCard>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('scryfall_cards')
      .select(SCRYFALL_PROJECTION)
      .in('id', ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const card of (data ?? []) as unknown as ScryfallCard[]) byId.set(card.id, card);
  }

  return rows.map((r) => ({ ...r, scryfall: byId.get(r.scryfall_id) ?? null }));
}

/** Load a collection's cards (joined with cached Scryfall data) into memory. */
export function useCollection(collectionId: string | null) {
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!collectionId) {
      setCards([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAll(collectionId)
      .then((all) => { if (!cancelled) setCards(all); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [collectionId, reloadKey]);

  return { cards, loading, error, reload };
}
