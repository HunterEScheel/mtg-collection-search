import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Location, OwnedCard, ScryfallCard } from '../types';

const PAGE = 1000;
const ID_CHUNK = 500;

// Projected columns only — never the full `data` jsonb blob.
const SCRYFALL_PROJECTION =
  'id,name,oracle_text,type_line,mana_cost,cmc,colors,color_identity,keywords,' +
  'rarity,set_code,set_name,power,toughness,loyalty,layout,usd,usd_foil,' +
  'image_small,image_normal,scryfall_uri,legalities';

type DbRow = Omit<OwnedCard, 'scryfall' | 'location_name'>;

async function loadAll(): Promise<{ cards: OwnedCard[]; locations: Location[] }> {
  // 1. Fetch the user's locations (RLS scopes to the signed-in user).
  const { data: locData, error: locError } = await supabase
    .from('collections')
    .select('*')
    .order('created_at');
  if (locError) throw new Error(locError.message);
  const locations = (locData ?? []) as Location[];
  const nameById = new Map(locations.map((l) => [l.id, l.name]));

  // 2. Page through every card row across all locations
  //    (Supabase caps a request at 1000 rows).
  const rows: DbRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('collection_cards')
      .select('*')
      .order('id')
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as DbRow[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }

  // 3. Fetch cached Scryfall data for the distinct printings and join in memory.
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

  const cards = rows.map((r) => ({
    ...r,
    location_name: nameById.get(r.collection_id) ?? '',
    scryfall: byId.get(r.scryfall_id) ?? null,
  }));
  return { cards, locations };
}

/** Load every owned card across all locations (joined with cached Scryfall data). */
export function useAllCards() {
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadAll()
      .then(({ cards, locations }) => {
        if (cancelled) return;
        setCards(cards);
        setLocations(locations);
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [reloadKey]);

  return { cards, locations, loading, error, reload };
}
