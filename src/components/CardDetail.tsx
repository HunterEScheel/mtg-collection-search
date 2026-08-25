import { useState } from 'react';
import type { Location, OwnedCard } from '../types';
import { ownedPrice } from '../lib/scryfall';
import { computeWrites, executeMove } from '../lib/move/executeMove';

interface Props {
  card: OwnedCard;
  /** Every owned copy of this printing (any location/condition). */
  copies: OwnedCard[];
  /** When provided, each copy gets a "move" control targeting these locations. */
  locations?: Location[];
  /** Called after a successful move so the app can refetch. */
  onMoved?: () => void;
  onClose: () => void;
}

export function CardDetail({ card, copies, locations, onMoved, onClose }: Props) {
  const s = card.scryfall;
  const legal = Object.entries(s?.legalities ?? {}).filter(([, v]) => v === 'legal');

  const [movingId, setMovingId] = useState<number | null>(null);
  const [destId, setDestId] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canMove = (locations?.length ?? 0) >= 2 && onMoved;

  function startMove(c: OwnedCard) {
    setMovingId(c.id);
    setQty(c.quantity);
    setDestId(locations?.find((l) => l.id !== c.collection_id)?.id ?? '');
    setError(null);
  }

  async function move(c: OwnedCard) {
    if (!destId || destId === c.collection_id) return;
    setBusy(true);
    setError(null);
    try {
      const take = Math.min(Math.max(qty, 1), c.quantity);
      // No destination rows passed: a natural-key collision at the target is
      // resolved by executeMove's conflict fallback (converts to an ADD update).
      await executeMove(computeWrites([{ sourceRow: c, qty: take }], [], destId));
      onMoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl gap-5 overflow-y-auto rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-64 shrink-0">
          {s?.image_normal ? (
            <img src={s.image_normal} alt={s.name ?? card.card_name} className="w-full rounded-xl" />
          ) : (
            <div className="flex aspect-[5/7] items-center justify-center rounded-xl bg-zinc-800 text-sm text-zinc-400">
              No image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold">{s?.name ?? card.card_name}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
          </div>
          <p className="text-zinc-400">
            {s?.type_line} {s?.mana_cost && <span className="font-mono">{s.mana_cost}</span>}
          </p>
          {s?.oracle_text && (
            <p className="whitespace-pre-wrap text-zinc-200">{s.oracle_text}</p>
          )}
          {(s?.power || s?.toughness) && (
            <p className="text-zinc-400">{s.power}/{s.toughness}</p>
          )}
          {legal.length > 0 && (
            <p className="text-xs text-zinc-500">
              Legal: {legal.map(([f]) => f).join(', ')}
            </p>
          )}
          {s?.scryfall_uri && (
            <a href={s.scryfall_uri} target="_blank" rel="noreferrer" className="text-xs text-indigo-400 underline">
              View on Scryfall
            </a>
          )}
          <div className="rounded-md bg-zinc-800 p-3">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Owned copies
            </h3>
            <ul className="space-y-1">
              {copies.map((c) => {
                const price = ownedPrice(c);
                return (
                  <li key={c.id} className="space-y-1">
                    <div className="flex justify-between gap-3">
                      <span>
                        ×{c.quantity} {c.foil !== 'normal' && c.foil ? `(${c.foil}) ` : ''}
                        {c.condition?.replaceAll('_', ' ')}
                        {c.location_name ? ` — ${c.location_name}` : ''}
                        {c.binder_name && c.binder_name !== c.location_name ? ` – ${c.binder_name}` : ''}
                      </span>
                      <span className="flex items-center gap-2">
                        {canMove && movingId !== c.id && (
                          <button
                            onClick={() => startMove(c)}
                            className="text-xs text-indigo-400 underline hover:text-indigo-300"
                          >
                            move
                          </button>
                        )}
                        <span className="text-zinc-400">{price !== null ? `$${price.toFixed(2)}` : ''}</span>
                      </span>
                    </div>
                    {movingId === c.id && (
                      <div className="flex items-center gap-2 rounded bg-zinc-900 p-2">
                        <input
                          type="number"
                          min={1}
                          max={c.quantity}
                          value={qty}
                          onChange={(e) => setQty(Number(e.target.value))}
                          className="w-14 rounded bg-zinc-800 px-2 py-1 text-xs ring-1 ring-zinc-600"
                        />
                        <span className="text-xs text-zinc-500">of {c.quantity} to</span>
                        <select
                          value={destId}
                          onChange={(e) => setDestId(e.target.value)}
                          className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 text-xs ring-1 ring-zinc-600"
                        >
                          {locations
                            ?.filter((l) => l.id !== c.collection_id)
                            .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <button
                          onClick={() => move(c)}
                          disabled={busy || !destId}
                          className="text-xs text-indigo-400 underline hover:text-indigo-300 disabled:opacity-40"
                        >
                          {busy ? 'moving…' : 'go'}
                        </button>
                        <button
                          onClick={() => setMovingId(null)}
                          className="text-xs text-zinc-400 hover:text-zinc-200"
                        >
                          cancel
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
