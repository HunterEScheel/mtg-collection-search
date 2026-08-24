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

type Identifier =
  | { set: string; collector_number: string }
  | { name: string; set?: string }
  | { name: string };

/**
 * Resolve Scryfall printing ids for rows that lack one, using set+collector number
 * (exact printing) with a name(+set) fallback. Returns a key -> id map; the same
 * keys are produced by `resolutionKeys`. Also caches fetched cards.
 */
export async function resolveScryfallIds(
  identifiers: { key: string; identifier: Identifier }[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  for (let i = 0; i < identifiers.length; i += BATCH) {
    const chunk = identifiers.slice(i, i + BATCH);
    const res = await fetch(SCRYFALL_COLLECTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: chunk.map((c) => c.identifier) }),
    });
    if (!res.ok) throw new Error(`Scryfall request failed: HTTP ${res.status}`);
    const payload = (await res.json()) as { data: ScryfallApiCard[] };

    // Map results back by set+collector number and by name.
    const bySetCn = new Map<string, ScryfallApiCard>();
    const byName = new Map<string, ScryfallApiCard>();
    for (const card of payload.data) {
      const raw = card as ScryfallApiCard & { collector_number?: string };
      if (card.set && raw.collector_number) {
        bySetCn.set(`${card.set.toLowerCase()}:${raw.collector_number.toLowerCase()}`, card);
      }
      byName.set(card.name.toLowerCase(), card);
      // front-face name of DFCs ("A // B" -> "a")
      const front = card.name.split('//')[0].trim().toLowerCase();
      if (front) byName.set(front, card);
    }
    for (const { key, identifier } of chunk) {
      let card: ScryfallApiCard | undefined;
      if ('collector_number' in identifier) {
        card = bySetCn.get(`${identifier.set.toLowerCase()}:${identifier.collector_number.toLowerCase()}`);
      }
      if (!card && 'name' in identifier) card = byName.get(identifier.name.toLowerCase());
      if (card) resolved.set(key, card.id);
    }

    if (payload.data.length > 0) {
      const { error } = await supabase.from('scryfall_cards').upsert(payload.data.map(flattenCard));
      if (error) throw new Error(`Saving card data failed: ${error.message}`);
    }
    onProgress?.(Math.min(i + BATCH, identifiers.length), identifiers.length);
    if (i + BATCH < identifiers.length) await sleep(RATE_LIMIT_MS);
  }
  return resolved;
}

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
