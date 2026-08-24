import { tokenize, QueryError, type Token, type Op } from './tokenize';

export type Node =
  | { kind: 'and'; children: Node[] }
  | { kind: 'or'; children: Node[] }
  | { kind: 'not'; child: Node }
  | { kind: 'name'; value: string; exact: boolean }
  | { kind: 'field'; field: string; op: Op; value: string };

/**
 * Grammar (OR lowest precedence, adjacency = AND):
 *   or   := and ('or' and)*
 *   and  := unary (('and')? unary)*
 *   unary:= '-' unary | atom
 *   atom := '(' or ')' | field | word | phrase
 */
export function parse(input: string): Node | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  let pos = 0;

  const peek = () => tokens[pos];
  const eof = () => pos >= tokens.length;

  function parseOr(): Node {
    const children = [parseAnd()];
    while (!eof() && peek().kind === 'or') {
      pos++;
      children.push(parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  }

  function parseAnd(): Node {
    const children = [parseUnary()];
    while (!eof() && peek().kind !== 'or' && peek().kind !== 'rparen') {
      if (peek().kind === 'and') pos++;
      children.push(parseUnary());
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  }

  function parseUnary(): Node {
    if (!eof() && peek().kind === 'neg') {
      pos++;
      if (eof()) throw new QueryError('Dangling "-" at end of query');
      return { kind: 'not', child: parseUnary() };
    }
    return parseAtom();
  }

  function parseAtom(): Node {
    if (eof()) throw new QueryError('Unexpected end of query');
    const t: Token = tokens[pos];
    switch (t.kind) {
      case 'lparen': {
        pos++;
        const inner = parseOr();
        if (eof() || peek().kind !== 'rparen') throw new QueryError('Unbalanced parenthesis');
        pos++;
        return inner;
      }
      case 'word':
        pos++;
        return { kind: 'name', value: t.value, exact: false };
      case 'phrase':
        pos++;
        return { kind: 'name', value: t.value, exact: true };
      case 'field':
        pos++;
        return { kind: 'field', field: t.field, op: t.op, value: t.value };
      case 'rparen':
        throw new QueryError('Unbalanced parenthesis');
      default:
        throw new QueryError('Unexpected token in query');
    }
  }

  const root = parseOr();
  if (!eof()) throw new QueryError('Unbalanced parenthesis');
  return root;
}

export { QueryError };
