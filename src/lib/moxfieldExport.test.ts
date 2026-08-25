import { describe, it, expect } from 'vitest';
import { toMoxfieldList } from './moxfieldExport';
import type { OwnedCard } from '../types';

let nextId = 1;

function row(over: Partial<OwnedCard> = {}): OwnedCard {
  return {
    id: nextId++,
    collection_id: 'loc1',
    location_name: 'Reserved',
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

describe('toMoxfieldList', () => {
  it('renders count, name, set, collector, and foil marker', () => {
    const out = toMoxfieldList([
      row({ quantity: 2 }),
      row({ card_name: 'Sol Ring', set_code: 'm3c', collector_number: '305', foil: 'foil', quantity: 1 }),
    ]);
    expect(out).toBe('2 Lightning Bolt (2XM) 123\n1 Sol Ring (M3C) 305 *F*');
  });

  it('merges condition/language variants of the same printing+foil', () => {
    const out = toMoxfieldList([
      row({ quantity: 2, condition: 'near_mint' }),
      row({ quantity: 3, condition: 'lightly_played', language: 'ja' }),
    ]);
    expect(out).toBe('5 Lightning Bolt (2XM) 123');
  });

  it('keeps foil lines separate and handles missing set/collector', () => {
    const out = toMoxfieldList([
      row({ quantity: 1 }),
      row({ quantity: 1, foil: 'etched' }),
      row({ card_name: 'Mystery Card', set_code: null, collector_number: null, quantity: 4 }),
    ]);
    expect(out.split('\n')).toEqual([
      '1 Lightning Bolt (2XM) 123',
      '1 Lightning Bolt (2XM) 123 *F*',
      '4 Mystery Card',
    ]);
  });
});
