import { supabase } from '../supabase';

const SCRYFALL_COLLECTION_URL = 'https://api.scryfall.com/cards/collection';
const BATCH = 75; // Scryfall /cards/collection identifier cap
const CACHE_CHECK_CHUNK = 500;
const RATE_LIMIT_MS = 100;

interface ScryfallApiCard {
  id: string;
  name: string;
  oracle_text?: string;
  type_line?: string;
  mana_cost?: string;
  cmc?: number;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  rarity?: string;
  set?: string;
  set_name?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout?: string;
  prices?: { usd?: string | null; usd_foil?: string | null };
  image_uris?: { small?: string; normal?: string };
  scryfall_uri?: string;
  legalities?: Record<string, string>;
  card_faces?: {
    oracle_text?: string;
    mana_cost?: string;
    type_line?: string;
    power?: string;
    toughness?: string;
    loyalty?: string;
    colors?: string[];
    image_uris?: { small?: string; normal?: string };
  }[];
}

/** Flatten a Scryfall API payload (incl. multi-faced cards) into a scryfall_cards row. */
export function flattenCard(card: ScryfallApiCard) {
  const faces = card.card_faces ?? [];
  const face0 = faces[0];

  const oracle = card.oracle_text
    ?? (faces.length ? faces.map((f) => f.oracle_text ?? '').join('\n//\n') : null);
  const manaCost = card.mana_cost ?? face0?.mana_cost ?? null;
  const colors = card.colors ?? (faces.length
    ? [...new Set(faces.flatMap((f) => f.colors ?? []))]
    : null);
  const images = card.image_uris ?? face0?.image_uris;

  return {
    id: card.id,
    name: card.name,
    oracle_text: oracle,
    type_line: card.type_line ?? face0?.type_line ?? null,
    mana_cost: manaCost,
    cmc: card.cmc ?? null,
    colors,
    color_identity: card.color_identity ?? null,
    keywords: card.keywords ?? null,
    rarity: card.rarity ?? null,
    set_code: card.set ?? null,
    set_name: card.set_name ?? null,
    power: card.power ?? face0?.power ?? null,
    toughness: card.toughness ?? face0?.toughness ?? null,
    loyalty: card.loyalty ?? face0?.loyalty ?? null,
    layout: card.layout ?? null,
    usd: card.prices?.usd ? Number(card.prices.usd) : null,
    usd_foil: card.prices?.usd_foil ? Number(card.prices.usd_foil) : null,
    image_small: images?.small ?? null,
    image_normal: images?.normal ?? null,
    scryfall_uri: card.scryfall_uri ?? null,
    legalities: card.legalities ?? null,
    data: card,
    fetched_at: new Date().toISOString(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Which of these ids are already in the shared scryfall_cards cache? */
async function findCachedIds(ids: string[]): Promise<Set<string>> {
  const cached = new Set<string>();
  for (let i = 0; i < ids.length; i += CACHE_CHECK_CHUNK) {
    const chunk = ids.slice(i, i + CACHE_CHECK_CHUNK);
    const { data, error } = await supabase
      .from('scryfall_cards')
      .select('id')
      .in('id', chunk);
    if (error) throw new Error(`Cache check failed: ${error.message}`);
    for (const row of data ?? []) cached.add(row.id);
  }
  return cached;
}

/**
 * Ensure every Scryfall id has a row in scryfall_cards.
 * Returns ids Scryfall could not resolve.
 */
export async function hydrateScryfallCards(
  scryfallIds: string[],
  onProgress?: (current: number, total: number) => void,
): Promise<string[]> {
  const unique = [...new Set(scryfallIds)];
  const cached = await findCachedIds(unique);
  const missing = unique.filter((id) => !cached.has(id));
  if (missing.length === 0) return [];

  const unresolved: string[] = [];
  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const res = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((id) => ({ id })) }),
    });
    if (!res.ok) throw new Error(`Scryfall request failed: HTTP ${res.status}`);
    const payload = (await res.json()) as {
      data: ScryfallApiCard[];
      not_found?: { id: string }[];
    };
    for (const nf of payload.not_found ?? []) unresolved.push(nf.id);

    if (payload.data.length > 0) {
      const rows = payload.data.map(flattenCard);
      const { error } = await supabase.from('scryfall_cards').upsert(rows);
      if (error) throw new Error(`Saving card data failed: ${error.message}`);
    }

    onProgress?.(Math.min(i + BATCH, missing.length), missing.length);
    if (i + BATCH < missing.length) await sleep(RATE_LIMIT_MS);
  }
  return unresolved;
}
