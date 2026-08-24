import { describe, it, expect } from 'vitest';
import { parseManaBoxCsv } from './parse';

const HEADER =
  'Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency,Added';

const rows = [
  `USD>20,binder,This Town Ain't Big Enough,OTJ,Outlaws of Thunder Junction,74,normal,uncommon,2,93322,bb206e27-da4d-4abe-9d8c-6d18c5f2f52a,0.25,false,false,near_mint,en,USD,2026-08-05T06:32:32.234Z`,
  `USD>20,binder,Clearwater Pathway // Murkwater Pathway,ZNR,Zendikar Rising,260,normal,rare,1,54709,b4b99ebb-0d54-4fe5-a495-979aaa564aa8,4.69,false,false,near_mint,en,USD,2026-08-05T06:33:07.286Z`,
  `Trade,binder,Sol Ring,M3C,Modern Horizons 3 Commander,305,foil,uncommon,3,11111,e1f723a8-0be9-4270-b451-a52d6b2fda4e,6.08,true,false,lightly_played,en,USD,2026-08-05T06:33:40.518Z`,
];

const csv = [HEADER, ...rows].join('\n');

describe('parseManaBoxCsv', () => {
  it('parses valid rows with commas and apostrophes in names', () => {
    const { rows: parsed, malformed } = parseManaBoxCsv(csv);
    expect(malformed).toHaveLength(0);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].card_name).toBe("This Town Ain't Big Enough");
    expect(parsed[0].quantity).toBe(2);
    expect(parsed[0].binder_name).toBe('USD>20');
    expect(parsed[1].card_name).toBe('Clearwater Pathway // Murkwater Pathway');
  });

  it('coerces foil, booleans, price and dates', () => {
    const { rows: parsed } = parseManaBoxCsv(csv);
    const sol = parsed[2];
    expect(sol.foil).toBe('foil');
    expect(sol.misprint).toBe(true);
    expect(sol.altered).toBe(false);
    expect(sol.purchase_price).toBe(6.08);
    expect(sol.added_at).toBe('2026-08-05T06:33:40.518Z');
    expect(sol.condition).toBe('lightly_played');
  });

  it('reports malformed rows without aborting', () => {
    const bad = [
      HEADER,
      rows[0],
      'X,binder,No Scryfall Id,OTJ,Set,1,normal,rare,1,1,not-a-uuid,,false,false,near_mint,en,USD,',
      'X,binder,Bad Qty,OTJ,Set,1,normal,rare,zero,1,bb206e27-da4d-4abe-9d8c-6d18c5f2f52a,,false,false,near_mint,en,USD,',
    ].join('\n');
    const { rows: parsed, malformed } = parseManaBoxCsv(bad);
    expect(parsed).toHaveLength(1);
    expect(malformed).toHaveLength(2);
    expect(malformed[0].line).toBe(3);
  });

  it('detects Moxfield format and normalizes fields', () => {
    const mox = [
      '"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"',
      '"2","0","Lightning Bolt","2x2","Near Mint","English","foil","","2024-01-01","117","False","False","1.50"',
    ].join('\n');
    const { format, rows: r } = parseManaBoxCsv(mox);
    expect(format).toBe('Moxfield');
    expect(r[0]).toMatchObject({
      card_name: 'Lightning Bolt', set_code: '2x2', collector_number: '117',
      quantity: 2, foil: 'foil', condition: 'near_mint', language: 'en',
      purchase_price: 1.5, scryfall_id: null,
    });
  });

  it('detects Dragon Shield format', () => {
    const ds = [
      'Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Condition,Printing,Language,Price Bought,Date Bought,LOW,MID,MARKET',
      'Binder A,3,0,Sol Ring,c21,Commander 2021,263,NearMint,Normal,English,1.00,2024-05-01,0.9,1.2,1.1',
    ].join('\n');
    const { format, rows: r } = parseManaBoxCsv(ds);
    expect(format).toBe('Dragon Shield');
    expect(r[0]).toMatchObject({
      card_name: 'Sol Ring', binder_name: 'Binder A', set_code: 'c21',
      collector_number: '263', quantity: 3, foil: 'normal',
      condition: 'near_mint', language: 'en', purchase_price: 1,
    });
  });

  it('detects TCGplayer format', () => {
    const tcg = [
      'Quantity,Name,Simple Name,Set,Card Number,Set Code,Printing,Condition,Rarity,Product ID,SKU',
      '1,Counterspell,Counterspell,Mystical Archive,267,sta,Foil,Near Mint,Rare,1111,2222',
    ].join('\n');
    const { format, rows: r } = parseManaBoxCsv(tcg);
    expect(format).toBe('TCGplayer');
    expect(r[0]).toMatchObject({
      card_name: 'Counterspell', set_code: 'sta', collector_number: '267',
      foil: 'foil', rarity: 'rare', condition: 'near_mint',
    });
  });

  it('still detects ManaBox first', () => {
    const { format } = parseManaBoxCsv(csv);
    expect(format).toBe('ManaBox');
  });

  it('rejects unrecognized CSVs', () => {
    expect(() => parseManaBoxCsv('a,b,c\n1,2,3')).toThrow(/unrecognized csv format/i);
  });
});
