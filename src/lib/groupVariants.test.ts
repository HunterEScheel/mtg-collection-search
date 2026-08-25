import { describe, it, expect } from 'vitest';
import { groupVariants } from './groupVariants';
import type { OwnedCard } from '../types';

let nextId = 1;

function row(over: Partial<OwnedCard> = {}): OwnedCard {
  return {
    id: nextId++,
    collection_id: 'loc1',
    location_name: 'Main',
    scryfall_id: 'sid-1',
    binder_name: null,
    binder_type: null,
    card_name: 'Lightning Bolt',
    set_code: '2xm',
    set_name: 'Double Masters',
    collector_number: '123',
    foil: 'normal',
    rarity: 'common',
    quantity: 2,
    manabox_id: null,
    purchase_price: null,
    purchase_price_currency: null,
    misprint: false,
    altered: false,
    condition: 'near_mint',
    language: 'en',
    added_at: null,
    scryfall: null,
    ...over,
  };
}

describe('groupVariants', () => {
  it('combines foil and condition variants of one printing in one location', () => {
    const out = groupVariants([
      row({ quantity: 2, foil: 'normal', condition: 'near_mint' }),
      row({ quantity: 1, foil: 'foil', condition: 'near_mint' }),
      row({ quantity: 3, foil: 'normal', condition: 'lightly_played' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(6);
    expect(out[0].foil).toBe('mixed');
    expect(out[0].condition).toBe('mixed');
  });

  it('prefers a nonfoil representative for price display', () => {
    const foilRow = row({ quantity: 1, foil: 'foil', purchase_price: 10 });
    const normalRow = row({ quantity: 2, foil: 'normal', purchase_price: 2 });
    const out = groupVariants([foilRow, normalRow]);
    expect(out).toHaveLength(1);
    expect(out[0].purchase_price).toBe(2);
    expect(out[0].foil).toBe('mixed');
  });

  it('keeps locations, languages, and binders separate', () => {
    const out = groupVariants([
      row({ collection_id: 'loc1' }),
      row({ collection_id: 'loc2' }),
      row({ language: 'ja' }),
      row({ binder_name: 'Trades' }),
    ]);
    expect(out).toHaveLength(4);
  });

  it('keeps different printings separate', () => {
    const out = groupVariants([
      row({ scryfall_id: 'sid-1' }),
      row({ scryfall_id: 'sid-2' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('does not mark uniform variants as mixed', () => {
    const out = groupVariants([
      row({ quantity: 1, foil: 'foil' }),
      row({ quantity: 2, foil: 'foil', condition: 'near_mint' }),
    ]);
    expect(out[0].foil).toBe('foil');
    expect(out[0].quantity).toBe(3);
  });
});
