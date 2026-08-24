/** A physical location (binder, box, shelf…) — stored in the `collections` table. */
export interface Location {
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

/** A card row joined with its cached Scryfall data — the search unit. */
export interface OwnedCard extends ManaBoxRow {
  id: number;
  collection_id: string;
  /** Name of the location this row lives in (joined client-side). */
  location_name: string;
  scryfall: ScryfallCard | null;
}

export interface ImportProgress {
  stage: 'parsing' | 'checking-cache' | 'fetching-scryfall' | 'saving-cards' | 'done';
  current: number;
  total: number;
}

/** One parsed line of a Moxfield-style move list. */
export interface MoveLine {
  quantity: number;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  /** true = foil requested (`*F*` or `*E*` marker), null = unspecified. */
  foil: boolean | null;
}

/** A planned transfer of `qty` copies out of one source row. */
export interface Transfer {
  sourceRow: OwnedCard;
  qty: number;
}

export interface MoveReport {
  lines: {
    line: MoveLine;
    requested: number;
    moved: number;
    short: number;
    /** No copies of this card exist at the source at all. */
    notFound: boolean;
    /** Requested printing not at source; fell back to another printing by name. */
    printingFallback: boolean;
  }[];
  malformed: { line: number; reason: string }[];
}

export interface MovePlan {
  transfers: Transfer[];
  report: MoveReport;
}

export interface ImportReport {
  format: string;
  imported: number;
  malformedRows: { line: number; reason: string }[];
  unresolvedScryfallIds: string[];
  /** Cards from id-less formats that could not be matched on Scryfall. */
  unresolvedNames: string[];
}
