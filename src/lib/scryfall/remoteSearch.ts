import type { OwnedCard, ScryfallCard } from '../../types';

const SEARCH_URL = 'https://api.scryfall.com/cards/search';
const MAX_PAGES = 2; // 175 cards per page
const RATE_LIMIT_MS = 100;

interface ApiCard {
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
  collector_number?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout?: string;
  full_art?: boolean;
  prices?: { usd?: string | null; usd_foil?: string | null };
  image_uris?: { small?: string; normal?: string };
  card_faces?: { oracle_text?: string; image_uris?: { small?: string; normal?: string } }[];
  scryfall_uri?: string;
  legalities?: Record<string, string>;
}

/**
 * Pull `in:all` / `-in:all` out of a query destined for the Scryfall API
 * (Scryfall rejects unknown keywords). Returns the cleaned query and the
 * ownership filter those terms imply. Pure — unit tested.
 */
export function extractOwnershipFilter(query: string): {
  remoteQuery: string;
  owned: 'owned' | 'unowned' | null;
} {
  let owned: 'owned' | 'unowned' | null = null;
  const remoteQuery = query
    .replace(/(^|\s)(-?)in:all(?=\s|$)/gi, (_m, pre: string, neg: string) => {
      owned = neg === '-' ? 'unowned' : 'owned';
      return pre;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { remoteQuery, owned };
}

function toRow(api: ApiCard, index: number, ownedQty: number): OwnedCard {
  const face0 = api.card_faces?.[0];
  const images = api.image_uris ?? face0?.image_uris;
  const scryfall: ScryfallCard = {
    id: api.id,
    name: api.name,
    oracle_text: api.oracle_text
      ?? (api.card_faces ? api.card_faces.map((f) => f.oracle_text ?? '').join('\n//\n') : null),
    type_line: api.type_line ?? null,
    mana_cost: api.mana_cost ?? null,
    cmc: api.cmc ?? null,
    colors: api.colors ?? null,
    color_identity: api.color_identity ?? null,
    keywords: api.keywords ?? null,
    rarity: api.rarity ?? null,
    set_code: api.set ?? null,
    set_name: api.set_name ?? null,
    power: api.power ?? null,
    toughness: api.toughness ?? null,
    loyalty: api.loyalty ?? null,
    layout: api.layout ?? null,
    full_art: api.full_art ?? null,
    usd: api.prices?.usd ? Number(api.prices.usd) : null,
    usd_foil: api.prices?.usd_foil ? Number(api.prices.usd_foil) : null,
    image_small: images?.small ?? null,
    image_normal: images?.normal ?? null,
    scryfall_uri: api.scryfall_uri ?? null,
    legalities: api.legalities ?? null,
  };
  return {
    // Synthetic negative ids: these rows are not collection rows.
    id: -(index + 1),
    collection_id: '',
    location_name: '',
    scryfall_id: api.id,
    binder_name: null,
    binder_type: null,
    card_name: api.name,
    set_code: api.set ?? null,
    set_name: api.set_name ?? null,
    collector_number: api.collector_number ?? null,
    foil: 'normal',
    rarity: api.rarity ?? null,
    quantity: ownedQty,
    manabox_id: null,
    purchase_price: null,
    purchase_price_currency: null,
    misprint: false,
    altered: false,
    condition: null,
    language: null,
    added_at: null,
    scryfall,
  };
}

export interface RemoteSearchResult {
  cards: OwnedCard[];
  total: number;
  truncated: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Search the full Scryfall database. `ownedByName` maps lowercased card names
 * to total copies owned; result rows carry that count as their quantity so
 * the grid's ×N badge shows what you already have. `in:all` / `-in:all` in
 * the query filter to owned / not-owned cards.
 */
export async function searchScryfallRemote(
  query: string,
  ownedByName: Map<string, number>,
): Promise<RemoteSearchResult> {
  const { remoteQuery, owned } = extractOwnershipFilter(query);
  if (remoteQuery === '') return { cards: [], total: 0, truncated: false };

  const apiCards: ApiCard[] = [];
  let url: string | null = `${SEARCH_URL}?q=${encodeURIComponent(remoteQuery)}`;
  let total = 0;
  let truncated = false;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    if (page > 0) await sleep(RATE_LIMIT_MS);
    const res: Response = await fetch(url);
    if (res.status === 404) return { cards: [], total: 0, truncated: false };
    const body = await res.json();
    if (!res.ok) {
      throw new Error(body?.details ?? `Scryfall search failed (${res.status})`);
    }
    apiCards.push(...(body.data ?? []));
    total = body.total_cards ?? apiCards.length;
    url = body.has_more ? body.next_page : null;
    truncated = page === MAX_PAGES - 1 && !!body.has_more;
  }

  let cards = apiCards.map((c, i) =>
    toRow(c, i, ownedByName.get(c.name.toLowerCase()) ?? 0));
  if (owned === 'owned') cards = cards.filter((c) => c.quantity > 0);
  if (owned === 'unowned') cards = cards.filter((c) => c.quantity === 0);

  return { cards, total, truncated };
}
