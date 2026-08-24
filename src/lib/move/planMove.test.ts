import { describe, it, expect } from 'vitest';
import { planMove } from './planMove';
import type { MoveLine, OwnedCard } from '../../types';

let nextId = 1;

function row(over: Partial<OwnedCard> & { name: string }): OwnedCard {
  const { name, ...rest } = over;
  return {
    id: nextId++,
    collection_id: 'src',
    location_name: 'Source',
    scryfall_id: `sid-${name.toLowerCase().replace(/\W+/g, '-')}`,
    binder_name: null,
    binder_type: null,
    card_name: name,
    set_code: 'tst',
    set_name: 'Test Set',
    collector_number: '1',
    foil: 'normal',
    rarity: 'common',
    quantity: 1,
    manabox_id: null,
    purchase_price: null,
    purchase_price_currency: null,
    misprint: false,
    altered: false,
    condition: 'near_mint',
    language: 'en',
    added_at: null,
    scryfall: null,
    ...rest,
  };
}

const line = (over: Partial<MoveLine> & { name: string; quantity: number }): MoveLine => ({
  setCode: null,
  collectorNumber: null,
  foil: null,
  ...over,
});

describe('planMove', () => {
  it('moves an exact printing match first', () => {
    const a = row({ name: 'Lightning Bolt', set_code: '2xm', collector_number: '123', quantity: 4 });
    const b = row({ name: 'Lightning Bolt', set_code: 'm11', collector_number: '146', quantity: 4 });
    const plan = planMove([line({ name: 'Lightning Bolt', quantity: 2, setCode: '2xm', collectorNumber: '123' })], [b, a]);
    expect(plan.transfers).toEqual([{ sourceRow: a, qty: 2 }]);
    expect(plan.report.lines[0]).toMatchObject({ moved: 2, short: 0, notFound: false, printingFallback: false });
  });

  it('falls back to another printing when the requested set is absent, flagged', () => {
    const a = row({ name: 'Sol Ring', set_code: 'cmr', quantity: 1 });
    const plan = planMove([line({ name: 'Sol Ring', quantity: 1, setCode: 'c21' })], [a]);
    expect(plan.transfers).toEqual([{ sourceRow: a, qty: 1 }]);
    expect(plan.report.lines[0].printingFallback).toBe(true);
  });

  it('consumes nonfoil before foil when foil unspecified', () => {
    const foilRow = row({ name: 'Divination', foil: 'foil', quantity: 2 });
    const normalRow = row({ name: 'Divination', foil: 'normal', quantity: 1 });
    const plan = planMove([line({ name: 'Divination', quantity: 2 })], [foilRow, normalRow]);
    expect(plan.transfers).toEqual([
      { sourceRow: normalRow, qty: 1 },
      { sourceRow: foilRow, qty: 1 },
    ]);
  });

  it('*F* restricts to foil rows, including etched', () => {
    const normalRow = row({ name: 'Sol Ring', foil: 'normal', quantity: 4 });
    const etched = row({ name: 'Sol Ring', foil: 'etched', quantity: 1 });
    const plan = planMove([line({ name: 'Sol Ring', quantity: 2, foil: true })], [normalRow, etched]);
    expect(plan.transfers).toEqual([{ sourceRow: etched, qty: 1 }]);
    expect(plan.report.lines[0]).toMatchObject({ moved: 1, short: 1, notFound: false });
  });

  it('spills across condition/language variant rows', () => {
    const nm = row({ name: 'Grizzly Bears', condition: 'near_mint', quantity: 2 });
    const lp = row({ name: 'Grizzly Bears', condition: 'lightly_played', quantity: 2 });
    const plan = planMove([line({ name: 'Grizzly Bears', quantity: 3 })], [nm, lp]);
    expect(plan.transfers).toEqual([
      { sourceRow: nm, qty: 2 },
      { sourceRow: lp, qty: 1 },
    ]);
  });

  it('reports shortfall and notFound', () => {
    const a = row({ name: 'Tarmogoyf', quantity: 1 });
    const plan = planMove(
      [line({ name: 'Tarmogoyf', quantity: 3 }), line({ name: 'Black Lotus', quantity: 1 })],
      [a],
    );
    expect(plan.report.lines[0]).toMatchObject({ moved: 1, short: 2, notFound: false });
    expect(plan.report.lines[1]).toMatchObject({ moved: 0, short: 1, notFound: true });
  });

  it('duplicate lines never double-spend the same copies', () => {
    const a = row({ name: 'Divination', quantity: 3 });
    const plan = planMove(
      [line({ name: 'Divination', quantity: 2 }), line({ name: 'Divination', quantity: 2 })],
      [a],
    );
    expect(plan.transfers.reduce((n, t) => n + t.qty, 0)).toBe(3);
    expect(plan.report.lines[1]).toMatchObject({ moved: 1, short: 1 });
  });

  it('matches DFC by front face name', () => {
    const dfc = row({
      name: 'Clearwater Pathway // Murkwater Pathway',
      scryfall: null,
      quantity: 1,
    });
    const plan = planMove([line({ name: 'Clearwater Pathway', quantity: 1 })], [dfc]);
    expect(plan.transfers).toEqual([{ sourceRow: dfc, qty: 1 }]);
  });

  it('passes malformed entries through to the report', () => {
    const plan = planMove([], [], [{ line: 3, reason: 'nope' }]);
    expect(plan.report.malformed).toEqual([{ line: 3, reason: 'nope' }]);
  });
});
