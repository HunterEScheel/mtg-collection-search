import { describe, it, expect } from 'vitest';
import { parseMoveList } from './parseMoveList';

describe('parseMoveList (text format)', () => {
  it('parses count, name, set, collector number, foil', () => {
    const { lines, malformed } = parseMoveList(
      '2 Lightning Bolt (2XM) 123\n1 Sol Ring *F*\n3x Grizzly Bears (M11)\n',
    );
    expect(malformed).toEqual([]);
    expect(lines).toEqual([
      { quantity: 2, name: 'Lightning Bolt', setCode: '2xm', collectorNumber: '123', foil: null },
      { quantity: 1, name: 'Sol Ring', setCode: null, collectorNumber: null, foil: true },
      { quantity: 3, name: 'Grizzly Bears', setCode: 'm11', collectorNumber: null, foil: null },
    ]);
  });

  it('bare name lines default to quantity 1', () => {
    const { lines } = parseMoveList('Tarmogoyf');
    expect(lines).toEqual([
      { quantity: 1, name: 'Tarmogoyf', setCode: null, collectorNumber: null, foil: null },
    ]);
  });

  it('accepts etched marker *E* as foil', () => {
    const { lines } = parseMoveList('1 Sol Ring (CMR) 472 *E*');
    expect(lines[0].foil).toBe(true);
    expect(lines[0].collectorNumber).toBe('472');
  });

  it('skips blanks and comments', () => {
    const { lines, malformed } = parseMoveList('\n// sideboard\n# note\n2 Divination\n\n');
    expect(malformed).toEqual([]);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Divination');
  });

  it('keeps DFC names with slashes intact', () => {
    const { lines } = parseMoveList('1 Clearwater Pathway // Murkwater Pathway (ZNR)');
    expect(lines[0].name).toBe('Clearwater Pathway // Murkwater Pathway');
    expect(lines[0].setCode).toBe('znr');
  });

  it('handles commas and apostrophes in names', () => {
    const { lines } = parseMoveList("2 Aurelia, Exemplar of Justice (GRN) 153");
    expect(lines[0].name).toBe('Aurelia, Exemplar of Justice');
    expect(lines[0].setCode).toBe('grn');
  });

  it('delegates to the CSV parser when the first line is a known header', () => {
    const csv = [
      '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
      '"2","0","Lightning Bolt","2xm","Near Mint","English","","","2024-01-01","123","False","False","1.00"',
      '"1","0","Sol Ring","cmr","Near Mint","English","foil","","2024-01-01","472","False","False",""',
    ].join('\n');
    const { lines, malformed } = parseMoveList(csv);
    expect(malformed).toEqual([]);
    expect(lines).toEqual([
      { quantity: 2, name: 'Lightning Bolt', setCode: '2xm', collectorNumber: '123', foil: null },
      { quantity: 1, name: 'Sol Ring', setCode: 'cmr', collectorNumber: '472', foil: true },
    ]);
  });

  it('reports unparseable lines as malformed', () => {
    const { lines, malformed } = parseMoveList('2 Lightning Bolt\n0');
    expect(lines).toHaveLength(1);
    expect(malformed).toHaveLength(1);
    expect(malformed[0].line).toBe(2);
  });
});
