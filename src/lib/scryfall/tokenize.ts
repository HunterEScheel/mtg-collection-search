export type Op = ':' | '=' | '!=' | '<' | '>' | '<=' | '>=';

export type Token =
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'neg' }
  | { kind: 'or' }
  | { kind: 'and' }
  | { kind: 'word'; value: string }
  | { kind: 'phrase'; value: string }
  | { kind: 'field'; field: string; op: Op; value: string };

export class QueryError extends Error {}

const FIELD_RE = /^([a-zA-Z]+)(<=|>=|!=|:|=|<|>)/;

/** Read a double-quoted string starting at `i` (which points at the opening quote). */
function readQuoted(input: string, i: number): { value: string; next: number } {
  let out = '';
  let j = i + 1;
  while (j < input.length) {
    const ch = input[j];
    if (ch === '"') return { value: out, next: j + 1 };
    out += ch;
    j++;
  }
  throw new QueryError('Unbalanced quote in query');
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(') { tokens.push({ kind: 'lparen' }); i++; continue; }
    if (ch === ')') { tokens.push({ kind: 'rparen' }); i++; continue; }
    if (ch === '-') { tokens.push({ kind: 'neg' }); i++; continue; }
    if (ch === '"') {
      const { value, next } = readQuoted(input, i);
      tokens.push({ kind: 'phrase', value });
      i = next;
      continue;
    }
    // read a run up to whitespace/paren, but stop before a quote so field
    // values like loc:"USD>20" can capture the quoted part themselves
    let j = i;
    while (j < input.length && !/[\s()]/.test(input[j]) && input[j] !== '"') j++;
    let run = input.slice(i, j);
    const m = FIELD_RE.exec(run);
    if (m) {
      const field = m[1].toLowerCase();
      const op = m[2] === ':' ? ':' : (m[2] as Op);
      let value = run.slice(m[0].length);
      let next = j;
      if (value === '' && input[j] === '"') {
        const q = readQuoted(input, j);
        value = q.value;
        next = q.next;
      }
      if (value === '') throw new QueryError(`Missing value for "${field}${m[2]}"`);
      tokens.push({ kind: 'field', field, op, value });
      i = next;
      continue;
    }
    if (run === '') throw new QueryError(`Unexpected character "${input[i]}"`);
    const lower = run.toLowerCase();
    if (lower === 'or') tokens.push({ kind: 'or' });
    else if (lower === 'and') tokens.push({ kind: 'and' });
    else tokens.push({ kind: 'word', value: run });
    i = j;
  }
  return tokens;
}
