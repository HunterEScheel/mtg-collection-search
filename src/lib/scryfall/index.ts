import type { OwnedCard } from '../../types';
import { parse, QueryError } from './parse';
import { compile } from './compile';
import type { Predicate } from './fields';

export { QueryError };
export { ownedPrice } from './fields';

/** Compile a query string into a predicate. Empty/whitespace query matches everything. */
export function compileQuery(query: string): Predicate {
  const ast = parse(query);
  if (!ast) return () => true;
  return compile(ast);
}

/** Filter cards by a Scryfall-style query. Throws QueryError on malformed input. */
export function search(query: string, cards: OwnedCard[]): OwnedCard[] {
  const pred = compileQuery(query);
  return cards.filter(pred);
}
