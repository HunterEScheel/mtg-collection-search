/** EDHREC recommendation lookup — public JSON endpoints, CORS-enabled. */

export interface EdhrecRec {
  /** -1..1-ish synergy score from EDHREC. */
  synergy: number;
  /** Decks running the card / decks that could. */
  numDecks: number;
  potentialDecks: number;
  /** EDHREC list header the card came from, e.g. "High Synergy Cards". */
  category: string;
}

/** "Kibo, Uktabi Prince" -> "kibo-uktabi-prince" (front face only for DFCs). */
export function commanderSlug(name: string): string {
  return name
    .split('//')[0]
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

interface EdhrecJson {
  container?: {
    json_dict?: {
      cardlists?: {
        header?: string;
        tag?: string;
        cardviews?: {
          name?: string;
          synergy?: number;
          num_decks?: number;
          potential_decks?: number;
        }[];
      }[];
    };
  };
}

/**
 * Fetch EDHREC's recommendations for a commander. Returns a map of
 * lowercased card name -> rec. When a card appears in several lists, the
 * first list (EDHREC orders them by importance) wins.
 */
export async function fetchEdhrecRecs(commanderName: string): Promise<Map<string, EdhrecRec>> {
  const slug = commanderSlug(commanderName);
  if (!slug) throw new Error('Pick a commander first');
  const res = await fetch(`https://json.edhrec.com/pages/commanders/${slug}.json`);
  if (res.status === 403 || res.status === 404) {
    throw new Error(`EDHREC has no page for "${commanderName}" — is it a valid commander?`);
  }
  if (!res.ok) throw new Error(`EDHREC request failed (${res.status})`);
  const body = (await res.json()) as EdhrecJson;

  const recs = new Map<string, EdhrecRec>();
  for (const list of body.container?.json_dict?.cardlists ?? []) {
    const category = list.header ?? list.tag ?? 'Recommended';
    for (const cv of list.cardviews ?? []) {
      if (!cv.name) continue;
      const key = cv.name.toLowerCase();
      if (!recs.has(key)) {
        recs.set(key, {
          synergy: cv.synergy ?? 0,
          numDecks: cv.num_decks ?? 0,
          potentialDecks: cv.potential_decks ?? 0,
          category,
        });
      }
    }
  }
  if (recs.size === 0) throw new Error(`EDHREC returned no recommendations for "${commanderName}"`);
  return recs;
}
