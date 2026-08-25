import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ownedPrice } from '../lib/scryfall';
import { useSearch, EMPTY_FILTERS } from '../hooks/useSearch';
import { SearchBar } from './SearchBar';
import { ResultsGrid } from './ResultsGrid';
import { ResultsTable } from './ResultsTable';
import { CardDetail } from './CardDetail';
import { SearchLegend } from './SearchLegend';
import type { ManaBoxRow, OwnedCard, ScryfallCard } from '../types';

interface SharedPayload {
  name: string;
  for_sale: boolean;
  reserved: boolean;
  cards: (ManaBoxRow & {
    id: number;
    collection_id: string;
    scryfall: ScryfallCard | null;
  })[];
}

interface ReserveResult {
  location_id: string;
  share_id: string;
  name: string;
  moved: number;
}

/** Read-only public view of one shared location — no login required. */
export function SharedLocationView({ shareId }: { shareId: string }) {
  const [name, setName] = useState<string | null>(null);
  const [forSale, setForSale] = useState(false);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [detail, setDetail] = useState<OwnedCard | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Reservation cart: card row id -> copies wanted.
  const [reserveMode, setReserveMode] = useState(false);
  const [cart, setCart] = useState<Map<number, number>>(new Map());
  const [buyerName, setBuyerName] = useState('');
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [reserved, setReserved] = useState<ReserveResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('get_shared_location', { p_share_id: shareId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(error.message);
        } else if (!data) {
          setError('This share link is invalid or has been revoked.');
        } else {
          const payload = data as SharedPayload;
          setName(payload.name);
          setForSale(payload.for_sale);
          setCards(payload.cards.map((c) => ({ ...c, location_name: payload.name })));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId, reloadKey]);

  const { results, error: queryError } = useSearch(cards, query, EMPTY_FILTERS);

  const totals = useMemo(() => {
    const copies = results.reduce((n, c) => n + c.quantity, 0);
    const value = results.reduce((n, c) => n + (ownedPrice(c) ?? 0) * c.quantity, 0);
    return { copies, value };
  }, [results]);

  const detailCopies = useMemo(
    () => (detail ? cards.filter((c) => c.scryfall_id === detail.scryfall_id) : []),
    [detail, cards],
  );

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const cartCount = [...cart.values()].reduce((n, q) => n + q, 0);

  function setCartQty(id: number, qty: number) {
    const max = cardById.get(id)?.quantity ?? 0;
    const next = new Map(cart);
    const clamped = Math.min(Math.max(qty, 0), max);
    if (clamped === 0) next.delete(id);
    else next.set(id, clamped);
    setCart(next);
  }

  function onCardClick(c: OwnedCard) {
    if (reserveMode && !reserved) setCartQty(c.id, (cart.get(c.id) ?? 0) + 1);
    else setDetail(c);
  }

  async function reserve() {
    setReserveError(null);
    if (buyerName.trim() === '') { setReserveError('Enter your name first'); return; }
    if (cartCount === 0) { setReserveError('Click cards to add them first'); return; }
    setReserving(true);
    const { data, error } = await supabase.rpc('reserve_cards', {
      p_share_id: shareId,
      p_items: [...cart.entries()].map(([id, quantity]) => ({ id, quantity })),
      p_buyer_name: buyerName.trim(),
    });
    setReserving(false);
    if (error) {
      setReserveError(error.message);
      return;
    }
    setReserved(data as ReserveResult);
  }

  const reservedUrl = reserved
    ? `${window.location.origin}${window.location.pathname}?share=${reserved.share_id}`
    : '';

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{name ?? 'Shared Location'}</h1>
        <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 ring-1 ring-zinc-700">
          shared view
        </span>
        {forSale && (
          <span className="rounded-full bg-emerald-950/60 px-2.5 py-0.5 text-xs text-emerald-400 ring-1 ring-emerald-900">
            for sale
          </span>
        )}
        {forSale && !reserved && (
          <button
            onClick={() => { setReserveMode((v) => !v); setReserveError(null); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              reserveMode
                ? 'bg-emerald-700 ring-emerald-600'
                : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {reserveMode ? 'Reserving — click cards to add' : 'Reserve cards'}
          </button>
        )}
      </header>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading shared location…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <>
          {reserveMode && !reserved && (
            <div className="space-y-2 rounded-md bg-zinc-900 p-3 ring-1 ring-emerald-900/60">
              {cartCount === 0 ? (
                <p className="text-sm text-zinc-400">
                  Click cards below to add them to your reservation.
                </p>
              ) : (
                <ul className="space-y-1">
                  {[...cart.entries()].map(([id, qty]) => {
                    const c = cardById.get(id);
                    if (!c) return null;
                    return (
                      <li key={id} className="flex items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {c.scryfall?.name ?? c.card_name}
                          <span className="text-zinc-500"> ({c.set_code?.toUpperCase()})</span>
                        </span>
                        <button
                          onClick={() => setCartQty(id, qty - 1)}
                          className="rounded bg-zinc-800 px-2 ring-1 ring-zinc-700 hover:bg-zinc-700"
                        >
                          −
                        </button>
                        <span className="w-10 text-center text-xs text-zinc-300">
                          {qty}/{c.quantity}
                        </span>
                        <button
                          onClick={() => setCartQty(id, qty + 1)}
                          className="rounded bg-zinc-800 px-2 ring-1 ring-zinc-700 hover:bg-zinc-700"
                        >
                          +
                        </button>
                        <button
                          onClick={() => setCartQty(id, 0)}
                          className="text-xs text-red-400 underline hover:text-red-300"
                        >
                          remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Your name"
                  className="min-w-0 flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
                />
                <button
                  onClick={reserve}
                  disabled={reserving || cartCount === 0 || buyerName.trim() === ''}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
                >
                  {reserving ? 'Reserving…' : `Reserve ${cartCount} cop${cartCount === 1 ? 'y' : 'ies'}`}
                </button>
              </div>
              {reserveError && <p className="text-sm text-red-400">{reserveError}</p>}
            </div>
          )}

          {reserved && (
            <div className="space-y-2 rounded-md bg-emerald-950/40 p-3 ring-1 ring-emerald-900">
              <p className="text-sm text-emerald-400">
                Reserved {reserved.moved} cop{reserved.moved === 1 ? 'y' : 'ies'} as
                “{reserved.name}”. Save this link — it's your reservation:
              </p>
              <div className="flex items-center gap-2">
                <a
                  href={reservedUrl}
                  className="min-w-0 flex-1 truncate font-mono text-xs text-indigo-300 underline"
                >
                  {reservedUrl}
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(reservedUrl);
                      setCopied(true);
                    } catch { /* leave link visible to copy manually */ }
                  }}
                  className="text-xs text-indigo-400 underline hover:text-indigo-300"
                >
                  {copied ? 'copied!' : 'copy link'}
                </button>
                <button
                  onClick={() => {
                    setReserved(null);
                    setReserveMode(false);
                    setCart(new Map());
                    setReloadKey((k) => k + 1);
                  }}
                  className="text-xs text-zinc-400 underline hover:text-zinc-200"
                >
                  back to list
                </button>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <SearchBar query={query} onChange={setQuery} error={queryError} />
            <button
              onClick={() => setShowLegend((v) => !v)}
              title="Search syntax"
              className={`rounded-md px-3 py-2 text-sm font-semibold ring-1 ${
                showLegend ? 'bg-indigo-600 ring-indigo-500' : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
              }`}
            >
              ?
            </button>
            <div className="flex rounded-md ring-1 ring-zinc-700">
              {(['grid', 'table'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-2 text-sm capitalize ${
                    view === v ? 'bg-zinc-700' : 'bg-zinc-800 hover:bg-zinc-700/50'
                  } first:rounded-l-md last:rounded-r-md`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-zinc-400">
            {results.length} cards / {totals.copies} copies / ${totals.value.toFixed(2)}
          </p>
          {view === 'grid' ? (
            <ResultsGrid
              cards={results}
              onSelect={onCardClick}
              selected={reserveMode && !reserved ? cart : undefined}
            />
          ) : (
            <ResultsTable
              cards={results}
              onSelect={onCardClick}
              selected={reserveMode && !reserved ? cart : undefined}
            />
          )}
        </>
      )}

      {detail && (
        <CardDetail card={detail} copies={detailCopies} onClose={() => setDetail(null)} />
      )}

      {showLegend && <SearchLegend onClose={() => setShowLegend(false)} />}
    </div>
  );
}
