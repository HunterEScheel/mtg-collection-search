import { supabase } from '../supabase';
import type { ManaBoxRow, OwnedCard, Transfer } from '../../types';

const INSERT_BATCH = 500;

type InsertRow = ManaBoxRow & { collection_id: string };

export interface MoveWrites {
  inserts: InsertRow[];
  /** ADD updates on existing destination rows: quantity = new absolute value. */
  destUpdates: { id: number; quantity: number }[];
  /** Decrements on partially-consumed source rows: quantity = new absolute value. */
  sourceUpdates: { id: number; quantity: number }[];
  /** Fully-consumed source rows. */
  sourceDeletes: number[];
}

// Natural key of collection_cards minus collection_id, with `nulls not
// distinct` semantics (null compares equal to null, as in the DB constraint).
const naturalKey = (r: {
  scryfall_id: string;
  foil: string | null;
  binder_name: string | null;
  condition: string | null;
  language: string | null;
}) => JSON.stringify([r.scryfall_id, r.foil, r.binder_name, r.condition, r.language]);

function toInsertRow(c: OwnedCard, destId: string, qty: number): InsertRow {
  return {
    collection_id: destId,
    binder_name: c.binder_name,
    binder_type: c.binder_type,
    card_name: c.card_name,
    set_code: c.set_code,
    set_name: c.set_name,
    collector_number: c.collector_number,
    foil: c.foil,
    rarity: c.rarity,
    quantity: qty,
    manabox_id: c.manabox_id,
    scryfall_id: c.scryfall_id,
    purchase_price: c.purchase_price,
    purchase_price_currency: c.purchase_price_currency,
    misprint: c.misprint,
    altered: c.altered,
    condition: c.condition,
    language: c.language,
    added_at: c.added_at,
  };
}

/**
 * Turn planned transfers into concrete writes. Pure function.
 *
 * Never uses upsert: the import upsert REPLACES quantity, but a move must ADD
 * at the destination. Existing destination rows matching a transfer's natural
 * key get an additive update; new keys become inserts (coalesced when several
 * transfers land on the same key).
 */
export function computeWrites(
  transfers: Transfer[],
  destCards: OwnedCard[],
  destId: string,
): MoveWrites {
  const destByKey = new Map(destCards.map((c) => [naturalKey(c), c]));
  const pendingInserts = new Map<string, InsertRow>();
  const destAdd = new Map<number, number>(); // dest row id -> qty to add
  const sourceConsumed = new Map<number, { row: OwnedCard; qty: number }>();

  for (const t of transfers) {
    const key = naturalKey(t.sourceRow);
    const existing = destByKey.get(key);
    if (existing) {
      destAdd.set(existing.id, (destAdd.get(existing.id) ?? 0) + t.qty);
    } else {
      const pending = pendingInserts.get(key);
      if (pending) pending.quantity += t.qty;
      else pendingInserts.set(key, toInsertRow(t.sourceRow, destId, t.qty));
    }

    const consumed = sourceConsumed.get(t.sourceRow.id);
    if (consumed) consumed.qty += t.qty;
    else sourceConsumed.set(t.sourceRow.id, { row: t.sourceRow, qty: t.qty });
  }

  const sourceUpdates: MoveWrites['sourceUpdates'] = [];
  const sourceDeletes: number[] = [];
  for (const { row, qty } of sourceConsumed.values()) {
    if (qty >= row.quantity) sourceDeletes.push(row.id);
    else sourceUpdates.push({ id: row.id, quantity: row.quantity - qty });
  }

  return {
    inserts: [...pendingInserts.values()],
    destUpdates: [...destAdd.entries()].map(([id, add]) => {
      const row = destCards.find((c) => c.id === id)!;
      return { id, quantity: row.quantity + add };
    }),
    sourceUpdates,
    sourceDeletes,
  };
}

/** Insert one row, converting a unique-key conflict (stale cache) into an ADD update. */
async function insertWithConflictFallback(row: InsertRow): Promise<void> {
  const { error } = await supabase.from('collection_cards').insert(row);
  if (!error) return;
  if (error.code !== '23505') throw new Error(`Moving cards failed: ${error.message}`);

  // A row with this natural key appeared since we loaded — add to it instead.
  let q = supabase
    .from('collection_cards')
    .select('id,quantity')
    .eq('collection_id', row.collection_id)
    .eq('scryfall_id', row.scryfall_id);
  for (const col of ['foil', 'binder_name', 'condition', 'language'] as const) {
    const v = row[col];
    q = v === null ? q.is(col, null) : q.eq(col, v);
  }
  const { data, error: selError } = await q.single();
  if (selError) throw new Error(`Moving cards failed: ${selError.message}`);
  const { error: updError } = await supabase
    .from('collection_cards')
    .update({ quantity: data.quantity + row.quantity })
    .eq('id', data.id);
  if (updError) throw new Error(`Moving cards failed: ${updError.message}`);
}

/**
 * Apply the writes, destination first: if anything fails mid-way the worst
 * case is duplicated copies (visible and fixable), never lost ones.
 */
export async function executeMove(writes: MoveWrites): Promise<void> {
  for (let i = 0; i < writes.inserts.length; i += INSERT_BATCH) {
    const batch = writes.inserts.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from('collection_cards').insert(batch);
    if (error) {
      if (error.code !== '23505') throw new Error(`Moving cards failed: ${error.message}`);
      // Batch hit a conflict — retry row by row with the fallback.
      for (const row of batch) await insertWithConflictFallback(row);
    }
  }

  for (const u of writes.destUpdates) {
    const { error } = await supabase
      .from('collection_cards')
      .update({ quantity: u.quantity })
      .eq('id', u.id);
    if (error) throw new Error(`Moving cards failed: ${error.message}`);
  }

  for (const u of writes.sourceUpdates) {
    const { error } = await supabase
      .from('collection_cards')
      .update({ quantity: u.quantity })
      .eq('id', u.id);
    if (error) throw new Error(`Moving cards failed: ${error.message}`);
  }

  if (writes.sourceDeletes.length > 0) {
    const { error } = await supabase
      .from('collection_cards')
      .delete()
      .in('id', writes.sourceDeletes);
    if (error) throw new Error(`Moving cards failed: ${error.message}`);
  }
}
