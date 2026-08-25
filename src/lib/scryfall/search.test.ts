import { describe, it, expect } from 'vitest';
import { search, QueryError } from './index';
import type { OwnedCard, ScryfallCard } from '../../types';

let nextId = 1;

function card(over: Partial<OwnedCard> & { name: string; s?: Partial<ScryfallCard> }): OwnedCard {
  const { name, s, ...rest } = over;
  return {
    id: nextId++,
    collection_id: 'c1',
    location_name: 'Main',
    scryfall_id: `id-${nextId}`,
    binder_name: 'Main',
    binder_type: 'binder',
    card_name: name,
    set_code: 'tst',
    set_name: 'Test Set',
    collector_number: '1',
    foil: 'normal',
    rarity: 'common',
    quantity: 1,
    manabox_id: null,
    purchase_price: null,
    purchase_price_currency: 'USD',
    misprint: false,
    altered: false,
    condition: 'near_mint',
    language: 'en',
    added_at: null,
    scryfall: {
      id: `id-${nextId}`,
      name,
      oracle_text: null,
      type_line: null,
      mana_cost: null,
      cmc: null,
      colors: [],
      color_identity: [],
      keywords: [],
      rarity: 'common',
      set_code: 'tst',
      set_name: 'Test Set',
      power: null,
      toughness: null,
      loyalty: null,
      layout: 'normal',
      usd: null,
      usd_foil: null,
      image_small: null,
      image_normal: null,
      scryfall_uri: null,
      legalities: null,
      ...s,
    },
    ...rest,
  };
}

const FIXTURE: OwnedCard[] = [
  card({ name: 'Lightning Bolt', s: { type_line: 'Instant', colors: ['R'], color_identity: ['R'], cmc: 1, oracle_text: 'Lightning Bolt deals 3 damage to any target.', rarity: 'common', usd: 1.5, mana_cost: '{R}' }, quantity: 4 }),
  card({ name: 'Grizzly Bears', s: { type_line: 'Creature — Bear', colors: ['G'], color_identity: ['G'], cmc: 2, power: '2', toughness: '2', rarity: 'common', usd: 0.1 }, quantity: 2 }),
  card({ name: 'Goblin Guide', s: { type_line: 'Creature — Goblin Scout', colors: ['R'], color_identity: ['R'], cmc: 1, power: '2', toughness: '2', rarity: 'rare', usd: 3.2, oracle_text: 'Haste\nWhenever Goblin Guide attacks, defending player reveals the top card of their library.', keywords: ['Haste'] }, quantity: 1, binder_name: 'USD>20', location_name: 'Trade Box' }),
  card({ name: 'Aurelia, Exemplar of Justice', s: { type_line: 'Legendary Creature — Angel', colors: ['R', 'W'], color_identity: ['R', 'W'], cmc: 4, power: '2', toughness: '5', rarity: 'mythic', usd: 4.9, oracle_text: 'Mentor.' }, quantity: 1, binder_name: 'USD>20', location_name: 'Trade Box', foil: 'foil' }),
  card({ name: 'Divination', s: { type_line: 'Sorcery', colors: ['U'], color_identity: ['U'], cmc: 3, oracle_text: 'Draw two cards.', rarity: 'common', usd: 0.05 }, quantity: 3 }),
  card({ name: 'Command Tower', s: { type_line: 'Land', colors: [], color_identity: [], cmc: 0, oracle_text: '{T}: Add one mana of any color in your commander’s color identity.', rarity: 'common', usd: 0.5 }, quantity: 5, binder_name: 'Lands Box', location_name: 'Storage' }),
  card({ name: 'Tarmogoyf', s: { type_line: 'Creature — Lhurgoyf', colors: ['G'], color_identity: ['G'], cmc: 2, power: '*', toughness: '1+*', rarity: 'mythic', usd: 8.0 }, quantity: 1 }),
  card({ name: 'Clearwater Pathway // Murkwater Pathway', s: { type_line: 'Land // Land', colors: [], color_identity: ['U', 'B'], cmc: 0, layout: 'modal_dfc', rarity: 'rare', usd: 4.7 }, quantity: 1 }),
];

const names = (cards: OwnedCard[]) => cards.map((c) => c.scryfall!.name).sort();

describe('search', () => {
  it('empty query matches everything', () => {
    expect(search('', FIXTURE)).toHaveLength(FIXTURE.length);
  });

  it('bare words match name substrings, ANDed', () => {
    expect(names(search('bolt', FIXTURE))).toEqual(['Lightning Bolt']);
    expect(names(search('goblin guide', FIXTURE))).toEqual(['Goblin Guide']);
    expect(search('goblin bears', FIXTURE)).toHaveLength(0);
  });

  it('quoted phrases match verbatim', () => {
    expect(names(search('"lightning bolt"', FIXTURE))).toEqual(['Lightning Bolt']);
  });

  it('t: and c: combine', () => {
    expect(names(search('t:creature c:r', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice',
      'Goblin Guide',
    ]);
  });

  it('qty, loc, and binder filters', () => {
    expect(names(search('qty>=2', FIXTURE))).toEqual([
      'Command Tower', 'Divination', 'Grizzly Bears', 'Lightning Bolt',
    ]);
    expect(names(search('qty>=2 loc:"Trade Box"', FIXTURE))).toEqual([]);
    expect(names(search('loc:"Trade Box"', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice', 'Goblin Guide',
    ]);
    expect(names(search('location:storage', FIXTURE))).toEqual(['Command Tower']);
    expect(names(search('binder:"USD>20"', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice', 'Goblin Guide',
    ]);
    expect(names(search('binder:lands', FIXTURE))).toEqual(['Command Tower']);
  });

  it('oracle text with negation', () => {
    expect(names(search('o:draw -t:land', FIXTURE))).toEqual(['Divination']);
  });

  it('or groups with parens and price', () => {
    expect(names(search('(r:rare or r:mythic) usd<5', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice', 'Clearwater Pathway // Murkwater Pathway', 'Goblin Guide',
    ]);
  });

  it('color set comparisons', () => {
    expect(names(search('c>=rw', FIXTURE))).toEqual(['Aurelia, Exemplar of Justice']);
    expect(names(search('c>=rw cmc<=3', FIXTURE))).toEqual([]);
    expect(names(search('id<=ub -c:u', FIXTURE))).toContain('Clearwater Pathway // Murkwater Pathway');
    expect(names(search('c:colorless t:land', FIXTURE))).toEqual([
      'Clearwater Pathway // Murkwater Pathway', 'Command Tower',
    ]);
  });

  it('cmc, pow with star, rarity order', () => {
    expect(names(search('cmc=1', FIXTURE))).toEqual(['Goblin Guide', 'Lightning Bolt']);
    expect(names(search('pow>=2 t:creature', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice', 'Goblin Guide', 'Grizzly Bears',
    ]); // Tarmogoyf's '*' never matches numeric compares
    expect(names(search('r>=rare', FIXTURE))).toEqual([
      'Aurelia, Exemplar of Justice', 'Clearwater Pathway // Murkwater Pathway',
      'Goblin Guide', 'Tarmogoyf',
    ]);
  });

  it('is: predicates', () => {
    expect(names(search('is:foil', FIXTURE))).toEqual(['Aurelia, Exemplar of Justice']);
    expect(names(search('is:dfc', FIXTURE))).toEqual(['Clearwater Pathway // Murkwater Pathway']);
    expect(names(search('is:commander', FIXTURE))).toEqual(['Aurelia, Exemplar of Justice']);
    expect(names(search('not:foil t:instant', FIXTURE))).toEqual(['Lightning Bolt']);
  });

  it('is:vanilla / frenchvanilla / unfinity', () => {
    const extra = [
      ...FIXTURE,
      card({ name: 'Wind Drake', s: { type_line: 'Creature — Drake', oracle_text: 'Flying (This creature can only be blocked by creatures with flying.)', keywords: ['Flying'], power: '2', toughness: '2' } }),
      card({ name: 'Silly Goose', s: { type_line: 'Creature — Bird', oracle_text: null, set_code: 'unf' } }),
      card({ name: 'Knight Errant', s: { type_line: 'Creature — Knight', oracle_text: 'First strike, protection from red\nWard {2}', keywords: ['First strike', 'Protection', 'Ward'] } }),
    ];
    // vanilla: no ability text at all
    expect(names(search('is:vanilla', extra))).toEqual(['Grizzly Bears', 'Silly Goose', 'Tarmogoyf']);
    expect(names(search('is:frenchvanilla', extra))).toEqual(['Knight Errant', 'Wind Drake']);
    expect(names(search('is:unfinity', extra))).toEqual(['Silly Goose']);
    // Aurelia has 'Mentor.' oracle text but no keywords array entry -> not french vanilla
    expect(names(search('is:frenchvanilla c:rw', extra))).toEqual([]);
  });

  it('spawns: matches token subtypes in create clauses', () => {
    const extra = [
      ...FIXTURE,
      card({ name: 'Krenko, Mob Boss', s: { type_line: 'Legendary Creature — Goblin Warrior', oracle_text: '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.' } }),
      card({ name: 'Pirated Copy', s: { type_line: 'Enchantment', oracle_text: 'When Pirated Copy enters the battlefield, create a Treasure token.' } }),
      card({ name: 'Goblin Lackey', s: { type_line: 'Creature — Goblin', oracle_text: 'Whenever Goblin Lackey deals damage to a player, you may put a Goblin permanent card from your hand onto the battlefield.' } }),
    ];
    expect(names(search('spawns:goblin', extra))).toEqual(['Krenko, Mob Boss']);
    expect(names(search('spawns:treasure', extra))).toEqual(['Pirated Copy']);
    expect(names(search('spawns:soldier', extra))).toEqual([]);
    expect(() => search('spawns>goblin', extra)).toThrow(QueryError);
  });

  it('zone: finds cards interacting with a zone', () => {
    const extra = [
      ...FIXTURE,
      card({ name: 'Reassembling Skeleton', s: { type_line: 'Creature — Skeleton Warrior', oracle_text: '{1}{B}: Return Reassembling Skeleton from your graveyard to the battlefield tapped.' } }),
      card({ name: 'Deep Analysis', s: { type_line: 'Sorcery', oracle_text: 'Target player draws two cards.\nFlashback—{1}{U}, Pay 3 life.', keywords: ['Flashback'] } }),
      card({ name: 'Windfall', s: { type_line: 'Sorcery', oracle_text: 'Each player discards their hand, then draws cards equal to the greatest number of cards a player discarded this way.' } }),
      card({ name: 'Command Beacon', s: { type_line: 'Land', oracle_text: '{T}, Sacrifice Command Beacon: Put your commander into your hand from the command zone.' } }),
    ];
    // Oracle text mentions the graveyard, or a cast-from-graveyard keyword.
    expect(names(search('zone:graveyard', extra))).toEqual([
      'Deep Analysis', 'Reassembling Skeleton',
    ]);
    expect(names(search('zone:gy t:creature', extra))).toEqual(['Reassembling Skeleton']);
    expect(names(search('zone:hand', extra))).toEqual(['Command Beacon', 'Windfall']);
    expect(names(search('zone:command', extra))).toContain('Command Beacon');
    expect(names(search('zone:battlefield', extra))).toContain('Reassembling Skeleton');
    expect(() => search('zone:exile', extra)).toThrow(QueryError);
  });

  it('zone:library finds library interaction', () => {
    const extra = [
      ...FIXTURE,
      card({ name: 'Demonic Tutor', s: { type_line: 'Sorcery', oracle_text: 'Search your library for a card, put that card into your hand, then shuffle.' } }),
      card({ name: 'Opt', s: { type_line: 'Instant', oracle_text: 'Scry 1.\nDraw a card.', keywords: ['Scry'] } }),
    ];
    // "Search your library" text, or a library keyword like Scry with the
    // zone only in reminder text.
    // Goblin Guide reveals the top card of a library; Divination draws.
    expect(names(search('zone:library', extra))).toEqual([
      'Demonic Tutor', 'Divination', 'Goblin Guide', 'Opt',
    ]);
    expect(names(search('zone:deck t:instant', extra))).toEqual(['Opt']);
    // Mill action word counts even without the word "library".
    const miller = card({ name: 'Mind Sculpt', s: { type_line: 'Sorcery', oracle_text: 'Target opponent mills seven cards.' } });
    expect(names(search('zone:library', [miller]))).toEqual(['Mind Sculpt']);
  });

  it('malformed queries throw QueryError', () => {
    expect(() => search('t:creature (c:r', FIXTURE)).toThrow(QueryError);
    expect(() => search('o:"unclosed', FIXTURE)).toThrow(QueryError);
    expect(() => search('bogus:x', FIXTURE)).toThrow(QueryError);
    expect(() => search('cmc>banana', FIXTURE)).toThrow(QueryError);
    expect(() => search('-', FIXTURE)).toThrow(QueryError);
  });
});
