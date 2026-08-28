import { useMemo, useState } from 'react';
import type { Location, OwnedCard } from '../types';
import { fetchEdhrecRecs, type EdhrecRec } from '../lib/edhrec';
import { computeWrites, executeMove } from '../lib/move/executeMove';
import { CardContextMenu, type CardMenuState } from './CardContextMenu';

interface Props {
  locations: Location[];
  cards: OwnedCard[];
  /** Locations the user owns — valid move targets for right-click moves. */
  moveTargets: Location[];
  /** Called after a move so the app refetches. */
  onChanged: () => void;
  onSelectCard: (card: OwnedCard) => void;
  onClose: () => void;
}

interface Hit {
  card: OwnedCard;
  rec: EdhrecRec;
}

/**
 * EDHREC recommendations for one of your EDH locations' commanders,
 * intersected with a chosen source location (binder/box) to search.
 */
export function EdhrecDialog({
  locations, cards, moveTargets, onChanged, onSelectCard, onClose,
}: Props) {
  const edhLocations = useMemo(
    () => locations.filter((l) => l.location_type === 'edh' && l.commander),
    [locations],
  );
  const [deckId, setDeckId] = useState(edhLocations[0]?.id ?? '');
  const [locationId, setLocationId] = useState(
    locations.find((l) => l.id !== edhLocations[0]?.id)?.id ?? locations[0]?.id ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [menu, setMenu] = useState<CardMenuState | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  const deck = edhLocations.find((l) => l.id === deckId);

  /** Move every owned variant of the hit's name out of the searched location. */
  async function moveHit(card: OwnedCard, destId: string) {
    setMoveBusy(true);
    setError(null);
    try {
      const name = (card.scryfall?.name ?? card.card_name).toLowerCase();
      const rows = cards.filter((r) =>
        r.collection_id === card.collection_id
        && (r.scryfall?.name ?? r.card_name).toLowerCase() === name);
      const transfers = rows.map((r) => ({ sourceRow: r, qty: r.quantity }));
      const destCards = cards.filter((r) => r.collection_id === destId);
      await executeMove(computeWrites(transfers, destCards, destId));
      setMenu(null);
      setHits((h) => h?.filter((x) => x.card.id !== card.id) ?? null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMoveBusy(false);
    }
  }

  async function run() {
    setError(null);
    setHits(null);
    if (!deck?.commander) { setError('Pick an EDH deck first'); return; }
    setBusy(true);
    try {
      const recs = await fetchEdhrecRecs(deck.commander);
      // Skip recommendations the deck already contains.
      const inDeck = new Set(
        cards
          .filter((c) => c.collection_id === deck.id)
          .map((c) => (c.scryfall?.name ?? c.card_name).toLowerCase()),
      );
      const seen = new Set<string>();
      const found: Hit[] = [];
      for (const c of cards) {
        if (c.collection_id !== locationId) continue;
        const name = (c.scryfall?.name ?? c.card_name);
        const key = name.toLowerCase();
        if (seen.has(key) || inDeck.has(key)) continue;
        // EDHREC keys single faces sometimes — try full name then front face.
        const rec = recs.get(key) ?? recs.get(key.split('//')[0].trim());
        if (!rec) continue;
        seen.add(key);
        found.push({ card: c, rec });
      }
      found.sort((a, b) => b.rec.synergy - a.rec.synergy);
      setHits(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">EDHREC picks from your collection</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        {edhLocations.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No EDH decks yet — on the Locations page, set a location's type to EDH and give it
            a commander.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={deckId}
              onChange={(e) => setDeckId(e.target.value)}
              className="min-w-0 flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
            >
              {edhLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name} — {l.commander}</option>
              ))}
            </select>
            <span className="text-xs text-zinc-500">search in</span>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
            >
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              onClick={run}
              disabled={busy}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? 'Searching…' : 'Find picks'}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {hits && (
          <>
            <p className="text-sm text-zinc-400">
              {hits.length === 0
                ? 'No EDHREC-recommended cards for this commander in that location.'
                : `${hits.length} recommended card${hits.length === 1 ? '' : 's'} found — sorted by synergy.`}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {hits.map(({ card, rec }) => (
                <button
                  key={card.id}
                  onClick={() => onSelectCard(card)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ card, x: e.clientX, y: e.clientY });
                  }}
                  className="group relative text-left"
                  title={`${card.scryfall?.name ?? card.card_name} — ${rec.category}`}
                >
                  {card.scryfall?.image_small ? (
                    <img
                      src={card.scryfall.image_small}
                      alt={card.scryfall.name ?? card.card_name}
                      loading="lazy"
                      className="w-full rounded-lg transition group-hover:brightness-110"
                    />
                  ) : (
                    <div className="flex aspect-[5/7] items-center justify-center rounded-lg bg-zinc-800 p-2 text-center text-xs text-zinc-400">
                      {card.card_name}
                    </div>
                  )}
                  <span className="absolute right-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                    {rec.synergy >= 0 ? '+' : ''}{Math.round(rec.synergy * 100)}%
                  </span>
                  <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
                    {rec.category}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {menu && (
          <CardContextMenu
            menu={menu}
            locations={moveTargets}
            moveDisabledReason={
              moveTargets.some((l) => l.id === menu.card.collection_id)
                ? undefined
                : 'Sale not confirmed yet — the seller must transfer this reservation before you can move its cards.'
            }
            busy={moveBusy}
            onViewDetails={onSelectCard}
            onMove={moveHit}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </div>
  );
}
