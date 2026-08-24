export interface Collection {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** One row of a ManaBox CSV export, after coercion. */
export interface ManaBoxRow {
  binder_name: string | null;
  binder_type: string | null;
  card_name: string;
  set_code: string | null;
  set_name: string | null;
  collector_number: string | null;
  foil: string | null;
  rarity: string | null;
  quantity: number;
  manabox_id: string | null;
  scryfall_id: string;
  purchase_price: number | null;
  purchase_price_currency: string | null;
  misprint: boolean;
  altered: boolean;
  condition: string | null;
  language: string | null;
  added_at: string | null;
}

/** Projected Scryfall printing data (never the full jsonb blob). */
export interface ScryfallCard {
  id: string;
  name: string | null;
  oracle_text: string | null;
  type_line: string | null;
  mana_cost: string | null;
  cmc: number | null;
  colors: string[] | null;
  color_identity: string[] | null;
  keywords: string[] | null;
  rarity: string | null;
  set_code: string | null;
  set_name: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  layout: string | null;
  usd: number | null;
  usd_foil: number | null;
  image_small: string | null;
  image_normal: string | null;
  scryfall_uri: string | null;
  legalities: Record<string, string> | null;
}

/** A collection row joined with its cached Scryfall data — the search unit. */
export interface OwnedCard extends ManaBoxRow {
  id: number;
  collection_id: string;
  scryfall: ScryfallCard | null;
}

export interface ImportProgress {
  stage: 'parsing' | 'checking-cache' | 'fetching-scryfall' | 'saving-cards' | 'done';
  current: number;
  total: number;
}

export interface ImportReport {
  imported: number;
  malformedRows: { line: number; reason: string }[];
  unresolvedScryfallIds: string[];
}
