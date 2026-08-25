import type { OwnedCard } from '../../types';

export interface TokenTypeSummary {
  /** Token name/subtype, e.g. "Goblin", "Treasure", "Eldrazi Scion", or "Copy". */
  type: string;
  /** Number of distinct cards in the input that spawn this token type. */
  cardCount: number;
}

/**
 * "create ..." clauses within a single sentence. Group 1 is the text up to
 * "token(s)" (where the name/subtypes live); group 2 is the rest of the
 * sentence (checked for "copy" wording).
 */
const CREATE_CLAUSE = /create[sd]?\b([^.\n;]*?\btokens?\b)([^.\n;]*)/gi;

/**
 * Runs of Capitalized words inside a create-clause. Oracle text lowercases
 * colors, counts, and adjectives ("two 1/1 white tapped"), so capitalized
 * words in a clause like "a Clue, Food, or Treasure token" or "two 1/1
 * colorless Eldrazi Scion creature tokens" are token names/subtypes.
 */
const CAPITALIZED_RUN = /[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*)*/g;

/** Token types a single card can spawn, judging by its oracle text. */
export function spawnedTokenTypes(card: OwnedCard): string[] {
  const oracle = card.scryfall?.oracle_text;
  if (!oracle) return [];
  const found = new Set<string>();
  for (const clause of oracle.matchAll(CREATE_CLAUSE)) {
    if (/\bcop(?:y|ies)\b/i.test(clause[1] + clause[2])) {
      found.add('Copy');
      continue;
    }
    for (const m of clause[1].matchAll(CAPITALIZED_RUN)) {
      // Skip the "X" count placeholder ("create X 1/1 red Goblin...")
      if (m[0] === 'X') continue;
      found.add(m[0]);
    }
  }
  return [...found];
}

/** Aggregate token types across a collection, sorted by card count then name. */
export function collectionTokenTypes(cards: OwnedCard[]): TokenTypeSummary[] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const card of cards) {
    // Count each printing/copy group once per distinct card
    const key = card.scryfall?.name ?? card.card_name;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const type of spawnedTokenTypes(card)) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([type, cardCount]) => ({ type, cardCount }))
    .sort((a, b) => b.cardCount - a.cardCount || a.type.localeCompare(b.type));
}
