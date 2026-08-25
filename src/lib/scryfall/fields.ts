import type { OwnedCard } from '../../types';
import { QueryError } from './tokenize';
import type { Op } from './tokenize';

export type Predicate = (card: OwnedCard) => boolean;

function cmp(op: Op, a: number, b: number): boolean {
  switch (op) {
    case ':':
    case '=': return a === b;
    case '!=': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
  }
}

function numericField(get: (c: OwnedCard) => number | null) {
  return (op: Op, value: string): Predicate => {
    const n = Number(value);
    if (Number.isNaN(n)) throw new QueryError(`Expected a number, got "${value}"`);
    return (c) => {
      const v = get(c);
      return v !== null && cmp(op, v, n);
    };
  };
}

function textContainsField(get: (c: OwnedCard) => string | null) {
  return (op: Op, value: string): Predicate => {
    if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for text fields`);
    const needle = value.toLowerCase();
    return (c) => {
      let hay = get(c)?.toLowerCase() ?? '';
      return hay.includes(needle);
    };
  };
}

// ---- colors ----

const COLOR_LETTERS = ['w', 'u', 'b', 'r', 'g'] as const;
const COLOR_NAMES: Record<string, string> = {
  white: 'w', blue: 'u', black: 'b', red: 'r', green: 'g',
};

function parseColorValue(value: string): Set<string> | 'colorless' | 'multicolor' {
  const v = value.toLowerCase();
  if (v === 'c' || v === 'colorless') return 'colorless';
  if (v === 'm' || v === 'multicolor' || v === 'multi') return 'multicolor';
  if (COLOR_NAMES[v]) return new Set([COLOR_NAMES[v]]);
  const set = new Set<string>();
  for (const ch of v) {
    if (!(COLOR_LETTERS as readonly string[]).includes(ch)) {
      throw new QueryError(`Unknown color "${ch}" in "${value}"`);
    }
    set.add(ch);
  }
  return set;
}

function setCompare(op: Op, card: Set<string>, query: Set<string>): boolean {
  const superset = [...query].every((x) => card.has(x));
  const subset = [...card].every((x) => query.has(x));
  switch (op) {
    case '=': return superset && subset;
    case '!=': return !(superset && subset);
    case '>=': return superset;
    case '<=': return subset;
    case '>': return superset && card.size > query.size;
    case '<': return subset && card.size < query.size;
    case ':': return superset; // callers override for identity
  }
}

function colorField(get: (c: OwnedCard) => string[] | null, colonMeans: '>=' | '<=') {
  return (op: Op, value: string): Predicate => {
    const parsed = parseColorValue(value);
    const effOp: Op = op === ':' ? colonMeans : op;
    return (c) => {
      const cardColors = new Set((get(c) ?? []).map((x) => x.toLowerCase()));
      if (parsed === 'colorless') return cardColors.size === 0;
      if (parsed === 'multicolor') return cardColors.size >= 2;
      return setCompare(effOp, cardColors, parsed);
    };
  };
}

// ---- rarity ----

const RARITY_ORDER: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5,
};
const RARITY_ALIAS: Record<string, string> = {
  c: 'common', u: 'uncommon', r: 'rare', m: 'mythic', mythic_rare: 'mythic',
};

function rarityField(op: Op, value: string): Predicate {
  const name = RARITY_ALIAS[value.toLowerCase()] ?? value.toLowerCase();
  const rank = RARITY_ORDER[name];
  if (rank === undefined) throw new QueryError(`Unknown rarity "${value}"`);
  return (c) => {
    const r = (c.scryfall?.rarity ?? c.rarity)?.toLowerCase();
    if (!r || RARITY_ORDER[r] === undefined) return false;
    return cmp(op, RARITY_ORDER[r], rank);
  };
}

// ---- price ----

/** Price of the owned copy: foil copies use usd_foil when available. */
export function ownedPrice(c: OwnedCard): number | null {
  const s = c.scryfall;
  if (!s) return c.purchase_price;
  const isFoil = c.foil !== null && c.foil !== 'normal';
  if (isFoil) return s.usd_foil ?? s.usd ?? c.purchase_price;
  return s.usd ?? s.usd_foil ?? c.purchase_price;
}

// ---- is: / not: ----

function isCreature(c: OwnedCard): boolean {
  return (c.scryfall?.type_line ?? '').toLowerCase().includes('creature');
}

/** Oracle text with reminder text "(...)" stripped, split into non-empty lines. */
function abilityLines(c: OwnedCard): string[] {
  return (c.scryfall?.oracle_text ?? '')
    .replace(/\([^)]*\)/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== '//');
}

/** Every ability line is just a comma-separated list of the card's own keywords. */
function isFrenchVanilla(c: OwnedCard): boolean {
  if (!isCreature(c)) return false;
  const lines = abilityLines(c);
  if (lines.length === 0) return false; // that's plain vanilla
  const keywords = new Set((c.scryfall?.keywords ?? []).map((k) => k.toLowerCase()));
  if (keywords.size === 0) return false;
  return lines.every((line) =>
    line
      .split(/[,;]/)
      .map((part) => part.trim().replace(/\.$/, '').toLowerCase())
      .filter((part) => part !== '')
      // "ward {2}", "protection from red" still count as their keyword
      .every((part) =>
        keywords.has(part) || [...keywords].some((k) => part.startsWith(k + ' '))),
  );
}

const IS_PREDICATES: Record<string, Predicate> = {
  vanilla: (c) => isCreature(c) && abilityLines(c).length === 0,
  frenchvanilla: isFrenchVanilla,
  foil: (c) => c.foil !== null && c.foil !== 'normal',
  nonfoil: (c) => c.foil === null || c.foil === 'normal',
  etched: (c) => c.foil === 'etched',
  altered: (c) => c.altered,
  misprint: (c) => c.misprint,
  dfc: (c) => ['transform', 'modal_dfc', 'double_faced_token'].includes(c.scryfall?.layout ?? ''),
  fullart: (c) => c.scryfall?.full_art === true,
  full: (c) => c.scryfall?.full_art === true,
  land: (c) => (c.scryfall?.type_line ?? '').toLowerCase().includes('land'),
  creature: (c) => (c.scryfall?.type_line ?? '').toLowerCase().includes('creature'),
  commander: (c) => {
    const type = (c.scryfall?.type_line ?? '').toLowerCase();
    const oracle = (c.scryfall?.oracle_text ?? '').toLowerCase();
    return (type.includes('legendary') && type.includes('creature'))
      || oracle.includes('can be your commander');
  },
};

function isField(op: Op, value: string): Predicate {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for is:`);
  const pred = IS_PREDICATES[value.toLowerCase()];
  if (!pred) throw new QueryError(`Unknown is: value "${value}"`);
  return pred;
}

// ---- pow/tou/loy: '*' and other non-numerics never match numeric compares ----

function statField(get: (c: OwnedCard) => string | null) {
  return (op: Op, value: string): Predicate => {
    const n = Number(value);
    if (Number.isNaN(n)) throw new QueryError(`Expected a number, got "${value}"`);
    return (c) => {
      const raw = get(c);
      if (raw === null || raw === undefined) return false;
      const v = Number(raw);
      if (Number.isNaN(v)) return false; // '*', '1+*', etc.
      return cmp(op, v, n);
    };
  };
}

// ---- registry ----

type FieldBuilder = (op: Op, value: string) => Predicate;

const oracleField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for oracle text`);
  const needle = value.toLowerCase();
  return (c) => {
    const s = c.scryfall;
    if (!s?.oracle_text) return false;
    // Scryfall's "~" placeholder expands to the card's own name
    const cardName = (s.name ?? c.card_name).toLowerCase();
    return s.oracle_text.toLowerCase().includes(needle.replaceAll('~', cardName));
  };
};

const manaField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for mana cost`);
  const needle = value.toLowerCase();
  return (c) => (c.scryfall?.mana_cost ?? '').toLowerCase().includes(needle);
};

const setField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for set`);
  const code = value.toLowerCase();
  return (c) => (c.scryfall?.set_code ?? c.set_code ?? '').toLowerCase() === code;
};

const langField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for lang`);
  const code = value.toLowerCase();
  return (c) => (c.language ?? '').toLowerCase() === code;
};

const spawnsField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for spawns`);
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // A "create ..." clause that names the subtype before "token", within one sentence
  const re = new RegExp(`create[^.\\n]*\\b${escaped}\\b[^.\\n]*\\btokens?\\b`, 'i');
  return (c) => re.test(c.scryfall?.oracle_text ?? '');
};

// ---- zone: ----

// Keywords that interact with a zone even when the zone is only named in
// reminder text (which some data omits) — e.g. all the cast-from-graveyard
// mechanics count as graveyard interaction.
const GRAVEYARD_KEYWORDS = [
  'flashback', 'escape', 'disturb', 'embalm', 'eternalize', 'unearth',
  'jump-start', 'retrace', 'dredge', 'scavenge', 'delve', 'aftermath',
  'encore', 'recover', 'threshold', 'delirium', 'undergrowth', 'flareback',
];
const HAND_KEYWORDS = ['madness', 'cycling', 'channel', 'evoke', 'discard', 'reveal'];
const LIBRARY_KEYWORDS = [
  'mill', 'scry', 'surveil', 'explore', 'cascade', 'discover', 'transmute',
  'miracle', 'ripple', 'fateseal', 'clash', 'learn',
];
const COMMAND_KEYWORDS = ['eminence', 'commander ninjutsu', 'partner'];

const ZONE_ALIAS: Record<string, string> = {
  graveyard: 'graveyard', grave: 'graveyard', gy: 'graveyard', yard: 'graveyard',
  hand: 'hand',
  command: 'command', commander: 'command', commandzone: 'command',
  battlefield: 'battlefield', bf: 'battlefield', play: 'battlefield',
  library: 'library', lib: 'library', deck: 'library',
};

/**
 * `zone:graveyard` etc. — cards whose effects interact with that zone:
 * scaling on its contents, triggers on cards entering/leaving it, moving
 * cards out of it, or being castable/activatable from it.
 */
const zoneField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for zone`);
  const zone = ZONE_ALIAS[value.toLowerCase().replaceAll(' ', '')];
  if (!zone) {
    throw new QueryError(
      `Unknown zone "${value}" (try graveyard, hand, command, battlefield, library)`,
    );
  }
  const hasKeyword = (c: OwnedCard, list: string[]) => {
    const kws = (c.scryfall?.keywords ?? []).map((k) => k.toLowerCase());
    return kws.some((k) => list.includes(k));
  };
  return (c) => {
    const o = (c.scryfall?.oracle_text ?? '').toLowerCase();
    switch (zone) {
      case 'graveyard':
        return o.includes('graveyard') || hasKeyword(c, GRAVEYARD_KEYWORDS);
      case 'hand':
        return o.includes('hand') || hasKeyword(c, HAND_KEYWORDS);
      case 'command':
        return o.includes('command zone') || o.includes('commander')
          || hasKeyword(c, COMMAND_KEYWORDS);
      case 'battlefield':
        return o.includes('battlefield') || o.includes('enters') || o.includes('leaves');
      case 'library':
        // "library"/"libraries" covers tutors (own and opponents'), reveal /
        // look at / cast from the top of a library, and shuffle effects.
        // Draw and mill are library interactions whose text often omits the
        // word, so match the action words too.
        return o.includes('library') || o.includes('libraries')
          || /\bdraws?\b|\bdrawn\b|\bmills?\b|\bmilled\b/.test(o)
          || hasKeyword(c, LIBRARY_KEYWORDS);
      default:
        return false;
    }
  };
};

/**
 * Scryfall's `commander:` — cards that fit in a commander deck of the given
 * color identity: their identity is a subset of the colors AND they are
 * legal in the commander format.
 */
const commanderField = (op: Op, value: string): Predicate => {
  if (op !== ':' && op !== '=') throw new QueryError(`Operator "${op}" not valid for commander`);
  const idPred = colorField((c) => c.scryfall?.color_identity ?? null, '<=')(':', value);
  return (c) => idPred(c) && c.scryfall?.legalities?.commander === 'legal';
};

const REGISTRY: Record<string, FieldBuilder> = {
  zone: zoneField,
  commander: commanderField,
  spawns: spawnsField,
  t: textContainsField((c) => c.scryfall?.type_line ?? null),
  type: textContainsField((c) => c.scryfall?.type_line ?? null),
  o: oracleField,
  oracle: oracleField,
  c: colorField((c) => c.scryfall?.colors ?? null, '>='),
  color: colorField((c) => c.scryfall?.colors ?? null, '>='),
  id: colorField((c) => c.scryfall?.color_identity ?? null, '<='),
  identity: colorField((c) => c.scryfall?.color_identity ?? null, '<='),
  m: manaField,
  mana: manaField,
  cmc: numericField((c) => c.scryfall?.cmc ?? null),
  mv: numericField((c) => c.scryfall?.cmc ?? null),
  pow: statField((c) => c.scryfall?.power ?? null),
  power: statField((c) => c.scryfall?.power ?? null),
  tou: statField((c) => c.scryfall?.toughness ?? null),
  toughness: statField((c) => c.scryfall?.toughness ?? null),
  loy: statField((c) => c.scryfall?.loyalty ?? null),
  loyalty: statField((c) => c.scryfall?.loyalty ?? null),
  r: rarityField,
  rarity: rarityField,
  s: setField,
  set: setField,
  e: setField,
  usd: numericField(ownedPrice),
  price: numericField(ownedPrice),
  is: isField,
  not: (op, value) => {
    const pred = isField(op, value);
    return (c) => !pred(c);
  },
  lang: langField,
  language: langField,
  qty: numericField((c) => c.quantity),
  quantity: numericField((c) => c.quantity),
  loc: textContainsField((c) => c.location_name),
  location: textContainsField((c) => c.location_name),
  binder: textContainsField((c) => c.binder_name),
  name: textContainsField((c) => c.scryfall?.name ?? c.card_name),
};

export function buildFieldPredicate(field: string, op: Op, value: string): Predicate {
  const builder = REGISTRY[field];
  if (!builder) throw new QueryError(`Unknown search field "${field}"`);
  return builder(op, value);
}

export function namePredicate(value: string): Predicate {
  const needle = value.toLowerCase();
  return (c) => (c.scryfall?.name ?? c.card_name).toLowerCase().includes(needle);
}
