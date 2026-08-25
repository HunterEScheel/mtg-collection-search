import { describe, it, expect } from 'vitest';
import { spawnedTokenTypes, collectionTokenTypes } from './tokens';
import type { OwnedCard } from '../../types';

let nextId = 1;

function card(name: string, oracle_text: string | null): OwnedCard {
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
      oracle_text,
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
    },
  };
}

describe('spawnedTokenTypes', () => {
  it('extracts creature token subtypes', () => {
    expect(spawnedTokenTypes(card('Krenko', 'Create X 1/1 red Goblin creature tokens.')))
      .toEqual(['Goblin']);
  });

  it('extracts predefined artifact tokens', () => {
    expect(spawnedTokenTypes(card('Smuggler', 'When this enters, create a Treasure token.')))
      .toEqual(['Treasure']);
    expect(spawnedTokenTypes(card('Detective', 'Investigate. (Create a colorless Clue artifact token with "{2}, Sacrifice this token: Draw a card.")')))
      .toEqual(['Clue']);
  });

  it('extracts multi-word subtypes', () => {
    expect(spawnedTokenTypes(card('Drone', 'Create two 1/1 colorless Eldrazi Scion creature tokens.')))
      .toEqual(['Eldrazi Scion']);
  });

  it('handles multiple token types on one card', () => {
    expect(spawnedTokenTypes(card('Academy Manufactor', 'If you would create a Clue, Food, or Treasure token, instead create one of each.')).sort())
      .toEqual(['Clue', 'Food', 'Treasure']);
  });

  it('labels copy tokens as Copy', () => {
    expect(spawnedTokenTypes(card('Cackling Counterpart', "Create a token that's a copy of target creature you control.")))
      .toEqual(['Copy']);
  });

  it('ignores cards that mention subtypes without creating tokens', () => {
    expect(spawnedTokenTypes(card('Goblin Lackey', 'You may put a Goblin permanent card from your hand onto the battlefield.')))
      .toEqual([]);
    expect(spawnedTokenTypes(card('Grizzly Bears', null))).toEqual([]);
  });
});

describe('collectionTokenTypes', () => {
  it('aggregates and sorts by card count, counting duplicates once', () => {
    const cards = [
      card('Krenko', 'Create X 1/1 red Goblin creature tokens.'),
      card('Krenko', 'Create X 1/1 red Goblin creature tokens.'),
      card('Dragon Fodder', 'Create two 1/1 red Goblin creature tokens.'),
      card('Smuggler', 'Create a Treasure token.'),
    ];
    expect(collectionTokenTypes(cards)).toEqual([
      { type: 'Goblin', cardCount: 2 },
      { type: 'Treasure', cardCount: 1 },
    ]);
  });
});
