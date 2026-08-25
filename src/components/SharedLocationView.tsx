import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ownedPrice } from '../lib/scryfall';
import { useSearch, EMPTY_FILTERS } from '../hooks/useSearch';
import { groupVariants } from '../lib/groupVariants';
import { toMoxfieldList } from '../lib/moxfieldExport';
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

interface ReserveConflict {
  id: number;
  name: string | null;
  requested: number;
  available: number;
}

type ReserveResponse =
  | { ok: true; location_id: string; share_id: string; name: string; moved: number }
  | { ok: false; conflicts: ReserveConflict[] };

type ReserveResult = Extract<ReserveResponse, { ok: true }>;

/**
 * Inline sign-in for buyers. Auth redirects go to the site origin (GUID share
 * URLs can't all be registered as redirect URLs); the share id is stashed in
 * localStorage and main.tsx routes back to this page after sign-in.
 */
export const RESUME_SHARE_KEY = 'resume-share-id';

function SignInPanel({ shareId }: { shareId: string }) {
  const redirectTo = window.location.origin;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function oauth(provider: 'github' | 'discord') {
    setError(null);
    localStorage.setItem(RESUME_SHARE_KEY, shareId);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    localStorage.setItem(RESUME_SHARE_KEY, shareId);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <form onSubmit={sendLink} className="space-y-3 rounded-md bg-zinc-900 p-3 ring-1 ring-emerald-900/60">
      <p className="text-sm text-zinc-300">Sign in to reserve cards:</p>
      <div className="flex gap-2">
        {([['github', 'GitHub'], ['discord', 'Discord']] as const).map(([provider, label]) => (
          <button
            key={provider}
            type="button"
            onClick={() => oauth(provider)}
            className="flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Continue with {label}
          </button>
        ))}
      </div>
      {sent ? (
        <p className="text-sm text-emerald-400">Check your email for a sign-in link.</p>
      ) : (
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
          >
            Send magic link
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}

/** Read-only public view of one shared location — no login required. */
export function SharedLocationView({ shareId }: { shareId: string }) {
  const [name, setName] = useState<string | null>(null);
  const [forSale, setForSale] = useState(false);
  const [isReservation, setIsReservation] = useState(false);
  const [listCopied, setListCopied] = useState(false);
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
  const [reserving, setReserving] = useState(false);
  const [reserveError, setReserveError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ReserveConflict[] | null>(null);
  const [reserved, setReserved] = useState<ReserveResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);


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
          setIsReservation(payload.reserved);
          setCards(payload.cards.map((c) => ({ ...c, location_name: payload.name })));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId, reloadKey]);

  const { results, error: queryError } = useSearch(cards, query, EMPTY_FILTERS);
  // Combine foil/condition variants for browsing — but NOT in reserve mode,
  // where buyers must pick the exact variant row they want.
  const picking = reserveMode && !reserved && !!user;
  const displayResults = useMemo(
    () => (picking ? results : groupVariants(results)),
    [picking, results],
  );

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
    if (reserveMode && !reserved && user) setCartQty(c.id, (cart.get(c.id) ?? 0) + 1);
    else setDetail(c);
  }

  async function reserve() {
    setReserveError(null);
    setConflicts(null);
    if (cartCount === 0) { setReserveError('Click cards to add them first'); return; }
    setReserving(true);
    const { data, error } = await supabase.rpc('reserve_cards', {
      p_share_id: shareId,
      p_items: [...cart.entries()].map(([id, quantity]) => ({ id, quantity })),
    });
    setReserving(false);
    if (error) {
      setReserveError(error.message);
      return;
    }
    const response = data as ReserveResponse;
    if (!response.ok) {
      // Fill in names the server no longer knows from our (stale) card list.
      const named = response.conflicts.map((c) => ({
        ...c,
        name: c.name ?? cardById.get(c.id)?.scryfall?.name
          ?? cardById.get(c.id)?.card_name ?? 'Unknown card',
      }));
      setConflicts(named);
      // Drop what's gone, clamp what's short, and refresh the list.
      const next = new Map(cart);
      for (const c of response.conflicts) {
        if (c.available <= 0) next.delete(c.id);
        else next.set(c.id, Math.min(next.get(c.id) ?? 0, c.available));
      }
      setCart(next);
      setReloadKey((k) => k + 1);
      return;
    }
    setReserved(response);
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
        {isReservation && (
          <>
            <span className="rounded-full bg-amber-950/60 px-2.5 py-0.5 text-xs text-amber-400 ring-1 ring-amber-900">
              reservation
            </span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(toMoxfieldList(cards));
                  setListCopied(true);
                  setTimeout(() => setListCopied(false), 2000);
                } catch { /* clipboard unavailable */ }
              }}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
            >
              {listCopied ? 'Copied!' : 'Copy list for Moxfield'}
            </button>
          </>
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
        <a
          href={`${window.location.origin}${window.location.pathname}`}
          className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
        >
          {user ? 'My Collection' : 'Sign in to your collection'}
        </a>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading shared location…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <>
          {reserveMode && !reserved && !user && <SignInPanel shareId={shareId} />}

          {reserveMode && !reserved && user && (
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
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                  Reserving as {user?.email ?? 'your account'}
                </span>
                <button
                  onClick={reserve}
                  disabled={reserving || cartCount === 0}
                  className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600 disabled:opacity-40"
                >
                  {reserving ? 'Reserving…' : `Reserve ${cartCount} cop${cartCount === 1 ? 'y' : 'ies'}`}
                </button>
              </div>
              {reserveError && <p className="text-sm text-red-400">{reserveError}</p>}
              {conflicts && (
                <div className="space-y-1 rounded-md bg-red-950/40 p-2 ring-1 ring-red-900">
                  <p className="text-sm font-medium text-red-400">Someone beat you to it.</p>
                  <ul className="space-y-0.5 text-xs text-red-300">
                    {conflicts.map((c) => (
                      <li key={c.id}>
                        {c.name} — {c.available <= 0
                          ? 'already reserved'
                          : `only ${c.available} of ${c.requested} left`}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-zinc-400">
                    The list has been refreshed and your selection adjusted — nothing was
                    reserved yet.
                  </p>
                </div>
              )}
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
            {displayResults.length} cards / {totals.copies} copies / ${totals.value.toFixed(2)}
          </p>
          {view === 'grid' ? (
            <ResultsGrid
              cards={displayResults}
              onSelect={onCardClick}
              selected={picking ? cart : undefined}
            />
          ) : (
            <ResultsTable
              cards={displayResults}
              onSelect={onCardClick}
              selected={picking ? cart : undefined}
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
