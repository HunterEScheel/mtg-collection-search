import { describe, it, expect } from 'vitest';
import { extractOwnershipFilter } from './remoteSearch';

describe('extractOwnershipFilter', () => {
  it('pulls in:all out as an owned filter', () => {
    expect(extractOwnershipFilter('t:goblin in:all cmc<=2')).toEqual({
      remoteQuery: 't:goblin cmc<=2',
      owned: 'owned',
    });
  });

  it('pulls -in:all out as an unowned filter', () => {
    expect(extractOwnershipFilter('-in:all t:dragon')).toEqual({
      remoteQuery: 't:dragon',
      owned: 'unowned',
    });
  });

  it('leaves queries without the term untouched', () => {
    expect(extractOwnershipFilter('t:goblin in:bulk')).toEqual({
      remoteQuery: 't:goblin in:bulk',
      owned: null,
    });
  });

  it('does not eat substrings of other words', () => {
    expect(extractOwnershipFilter('o:"in:all"')).toMatchObject({ owned: null });
  });
});
