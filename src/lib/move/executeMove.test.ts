import { describe, it, expect } from 'vitest';
import { computeWrites } from './executeMove';
import type { OwnedCard } from '../../types';

let nextId = 1;

function row(over: Partial<OwnedCard>): OwnedCard {
  return {
    id: nextId++,
    collection_id: 'src',
    location_name: 'Source',
    scryfall_id: 'sid-1',
    binder_name: null,
    binder_type: null,
    card_name: 'Lightning Bolt',
    set_code: '2xm',
    set_name: 'Double Masters',
    collector_number: '123',
    foil: 'normal',
    rarity: 'common',
    quantity: 4,
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

describe('computeWrites', () => {
  it('merges into an existing destination row with an ADD update', () => {
    const src = row({ quantity: 4 });
    const dest = row({ id: 99, collection_id: 'dst', quantity: 2 });
    const w = computeWrites([{ sourceRow: src, qty: 3 }], [dest], 'dst');
    expect(w.inserts).toEqual([]);
    expect(w.destUpdates).toEqual([{ id: 99, quantity: 5 }]);
    expect(w.sourceUpdates).toEqual([{ id: src.id, quantity: 1 }]);
    expect(w.sourceDeletes).toEqual([]);
  });

  it('inserts a new destination row when no natural-key match exists', () => {
    const src = row({ quantity: 2 });
    const destOther = row({ id: 99, collection_id: 'dst', foil: 'foil', quantity: 1 });
    const w = computeWrites([{ sourceRow: src, qty: 2 }], [destOther], 'dst');
    expect(w.destUpdates).toEqual([]);
    expect(w.inserts).toHaveLength(1);
    expect(w.inserts[0]).toMatchObject({
      collection_id: 'dst',
      scryfall_id: 'sid-1',
      foil: 'normal',
      quantity: 2,
    });
    expect(w.inserts[0]).not.toHaveProperty('id');
    expect(w.inserts[0]).not.toHaveProperty('scryfall');
    expect(w.inserts[0]).not.toHaveProperty('location_name');
    expect(w.sourceDeletes).toEqual([src.id]);
  });

  it('nulls compare equal on the natural key (nulls not distinct)', () => {
    const src = row({ quantity: 1, binder_name: null, condition: null, language: null });
    const dest = row({
      id: 99, collection_id: 'dst', quantity: 1,
      binder_name: null, condition: null, language: null,
    });
    const w = computeWrites([{ sourceRow: src, qty: 1 }], [dest], 'dst');
    expect(w.destUpdates).toEqual([{ id: 99, quantity: 2 }]);
    expect(w.inserts).toEqual([]);
  });

  it('coalesces two transfers landing on the same new destination key', () => {
    const a = row({ quantity: 2, binder_name: 'A' });
    const b = row({ quantity: 3, binder_name: 'A' });
    // Same natural key at the destination (same scryfall/foil/binder/cond/lang).
    const w = computeWrites(
      [{ sourceRow: a, qty: 2 }, { sourceRow: b, qty: 1 }],
      [],
      'dst',
    );
    expect(w.inserts).toHaveLength(1);
    expect(w.inserts[0].quantity).toBe(3);
    expect(w.sourceDeletes).toEqual([a.id]);
    expect(w.sourceUpdates).toEqual([{ id: b.id, quantity: 2 }]);
  });

  it('accumulates multiple transfers from one source row', () => {
    const src = row({ quantity: 4 });
    const w = computeWrites(
      [{ sourceRow: src, qty: 2 }, { sourceRow: src, qty: 2 }],
      [],
      'dst',
    );
    expect(w.sourceDeletes).toEqual([src.id]);
    expect(w.inserts[0].quantity).toBe(4);
  });
});
