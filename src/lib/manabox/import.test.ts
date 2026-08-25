import { describe, it, expect } from 'vitest';
import { addExistingQuantities } from './import';

const row = (over: Partial<{
  scryfall_id: string; foil: string | null; binder_name: string | null;
  condition: string | null; language: string | null; quantity: number;
}> = {}) => ({
  scryfall_id: 'sid-1',
  foil: 'normal',
  binder_name: null,
  condition: 'near_mint',
  language: 'en',
  quantity: 1,
  ...over,
});

describe('addExistingQuantities', () => {
  it('sums imported quantities onto existing rows by natural key', () => {
    const out = addExistingQuantities(
      [row({ quantity: 2 })],
      [row({ quantity: 3 })],
    );
    expect(out[0].quantity).toBe(5);
  });

  it('leaves rows without an existing match untouched', () => {
    const out = addExistingQuantities(
      [row({ quantity: 2, foil: 'foil' })],
      [row({ quantity: 3, foil: 'normal' })],
    );
    expect(out[0].quantity).toBe(2);
  });

  it('nulls compare equal on the key', () => {
    const out = addExistingQuantities(
      [row({ quantity: 1, condition: null, language: null })],
      [row({ quantity: 4, condition: null, language: null })],
    );
    expect(out[0].quantity).toBe(5);
  });

  it('does not mutate the input rows', () => {
    const input = [row({ quantity: 2 })];
    addExistingQuantities(input, [row({ quantity: 3 })]);
    expect(input[0].quantity).toBe(2);
  });
});
