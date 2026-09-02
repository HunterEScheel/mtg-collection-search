import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { ownedPrice } from './lib/scryfall';
import { useAllCards } from './hooks/useAllCards';
import { groupVariants } from './lib/groupVariants';
import { useSearch, EMPTY_FILTERS, type UiFilters } from './hooks/useSearch';
import { AuthGate } from './components/AuthGate';
import { SearchBar } from './components/SearchBar';
import { FilterBar } from './components/FilterBar';
import { ResultsGrid } from './components/ResultsGrid';
import { ResultsTable } from './components/ResultsTable';
import { ImportDialog } from './components/ImportDialog';
import { MoveDialog } from './components/MoveDialog';
import { LocationsPage } from './components/LocationsPage';
import { EdhrecDialog } from './components/EdhrecDialog';
import { CardDetail } from './components/CardDetail';
import { CardContextMenu, type CardMenuState } from './components/CardContextMenu';
import { computeWrites, executeMove } from './lib/move/executeMove';
import { searchScryfallRemote, type RemoteSearchResult } from './lib/scryfall/remoteSearch';
import { toMoxfieldList } from './lib/moxfieldExport';
import { SearchLegend } from './components/SearchLegend';
import { TokenTypesPanel } from './components/TokenTypesPanel';
import type { OwnedCard } from './types';

function Main({ user }: { user: User }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UiFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [importing, setImporting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [page, setPage] = useState<'cards' | 'locations'>('cards');
  const [edhrec, setEdhrec] = useState(false);
  const [detail, setDetail] = useState<OwnedCard | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null);
  const [menuBusy, setMenuBusy] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(true);
  // Deckbuilder: a temporary pick list (display row id -> copies). Cleared on exit.
  const [deckMode, setDeckMode] = useState(false);
  const [deck, setDeck] = useState<Map<number, number>>(new Map());
  const [deckCopied, setDeckCopied] = useState(false);
  const [remote, setRemote] = useState<RemoteSearchResult | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const { cards, locations, loading, error: loadError, reload } = useAllCards();
  const { results, error: queryError } = useSearch(cards, query, filters);
  // One entry per printing+location: foil/condition variants combine for
  // display; the card detail still lists every variant separately.
  const displayResults = useMemo(() => groupVariants(results), [results]);

  // Results split by the type of the location each card lives in.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const resultSections = useMemo(() => {
    const locById = new Map(locations.map((l) => [l.id, l]));
    const groups = { Decks: [] as OwnedCard[], Collections: [] as OwnedCard[], Reservations: [] as OwnedCard[] };
    for (const c of displayResults) {
      const loc = locById.get(c.collection_id);
      if (loc && (loc.reserved_from !== null || loc.user_id !== user.id)) groups.Reservations.push(c);
      else if (loc?.location_type === 'edh') groups.Decks.push(c);
      else groups.Collections.push(c);
    }
    return (Object.entries(groups) as [string, OwnedCard[]][]).filter(([, list]) => list.length > 0);
  }, [displayResults, locations, user.id]);

  const toggleSection = (title: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const ownedByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) {
      const key = (c.scryfall?.name ?? c.card_name).toLowerCase();
      m.set(key, (m.get(key) ?? 0) + c.quantity);
    }
    return m;
  }, [cards]);

  // Scryfall-wide search when "My collection only" is unchecked.
  useEffect(() => {
    if (onlyMine) return;
    const t = setTimeout(() => {
      if (query.trim() === '') {
        setRemote(null);
        setRemoteError(null);
        return;
      }
      setRemoteLoading(true);
      setRemoteError(null);
      searchScryfallRemote(query, ownedByName)
        .then(setRemote)
        .catch((e: Error) => { setRemote(null); setRemoteError(e.message); })
        .finally(() => setRemoteLoading(false));
    }, 600);
    return () => clearTimeout(t);
  }, [onlyMine, query, ownedByName]);

  const locationGroups = useMemo(() => {
    const isReservation = (l: (typeof locations)[number]) =>
      l.reserved_from !== null || l.user_id !== user.id;
    return [
      {
        title: 'Decks',
        names: locations.filter((l) => !isReservation(l) && l.location_type === 'edh').map((l) => l.name).sort(),
      },
      {
        title: 'Collections',
        names: locations.filter((l) => !isReservation(l) && l.location_type !== 'edh').map((l) => l.name).sort(),
      },
      {
        title: 'Reservations',
        names: locations.filter(isReservation).map((l) => l.name).sort(),
      },
    ];
  }, [locations, user.id]);

  const totals = useMemo(() => {
    const copies = results.reduce((n, c) => n + c.quantity, 0);
    const value = results.reduce((n, c) => n + (ownedPrice(c) ?? 0) * c.quantity, 0);
    return { copies, value };
  }, [results]);

  const detailCopies = useMemo(
    () => (detail ? cards.filter((c) => c.scryfall_id === detail.scryfall_id) : []),
    [detail, cards],
  );

  const displayById = useMemo(
    () => new Map(displayResults.map((c) => [c.id, c])),
    [displayResults],
  );
  const deckCount = [...deck.values()].reduce((n, q) => n + q, 0);

  function setDeckQty(id: number, qty: number) {
    const max = displayById.get(id)?.quantity ?? cards.find((c) => c.id === id)?.quantity ?? 0;
    const next = new Map(deck);
    const clamped = Math.min(Math.max(qty, 0), max);
    if (clamped === 0) next.delete(id);
    else next.set(id, clamped);
    setDeck(next);
  }

  function onCardClick(c: OwnedCard) {
    if (deckMode) setDeckQty(c.id, (deck.get(c.id) ?? 0) + 1);
    else setDetail(c);
  }

  /**
   * Move a displayed card entry to another location. Display rows are grouped
   * (foil/condition combined), so move every underlying variant row in the
   * same location/printing/language/binder group.
   */
  /** Delete every variant row of a displayed entry (e.g. sold in person). */
  async function deleteCard(card: OwnedCard) {
    setMenuBusy(true);
    setMenuError(null);
    try {
      const rows = cards.filter((r) =>
        r.collection_id === card.collection_id
        && r.scryfall_id === card.scryfall_id
        && r.language === card.language
        && r.binder_name === card.binder_name);
      const { data, error } = await supabase
        .from('collection_cards')
        .delete()
        .in('id', rows.map((r) => r.id))
        .select('id');
      if (error) throw new Error(error.message);
      if ((data ?? []).length !== rows.length) {
        throw new Error('Delete failed: you do not have permission to delete these cards.');
      }
      setCardMenu(null);
      reload();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : String(e));
    } finally {
      setMenuBusy(false);
    }
  }

  /** True when the card sits in a location reserved FOR this user (seller still owns it). */
  const isPendingSale = (card: OwnedCard) =>
    locations.some((l) => l.id === card.collection_id && l.user_id !== user.id);

  async function moveCard(card: OwnedCard, destId: string) {
    if (isPendingSale(card)) {
      setMenuError('This card is reserved for you but the sale has not been confirmed yet — it cannot be moved until the seller transfers it.');
      return;
    }
    setMenuBusy(true);
    setMenuError(null);
    try {
      const rows = cards.filter((r) =>
        r.collection_id === card.collection_id
        && r.scryfall_id === card.scryfall_id
        && r.language === card.language
        && r.binder_name === card.binder_name);
      const transfers = rows.map((r) => ({ sourceRow: r, qty: r.quantity }));
      const destCards = cards.filter((r) => r.collection_id === destId);
      await executeMove(computeWrites(transfers, destCards, destId));
      setCardMenu(null);
      reload();
    } catch (e) {
      setMenuError(e instanceof Error ? e.message : String(e));
    } finally {
      setMenuBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">MTG Collection Search</h1>
        <button
          onClick={() => setImporting(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
        >
          Import Collection
        </button>
        {locations.length >= 1 && (
          <button
            onClick={() => setMoving(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Move Cards
          </button>
        )}
        {locations.length > 0 && (
          <button
            onClick={() => setPage(page === 'locations' ? 'cards' : 'locations')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              page === 'locations'
                ? 'bg-indigo-600 ring-indigo-500'
                : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            Locations
          </button>
        )}
        {locations.length > 0 && (() => {
          const hasEdh = locations.some((l) => l.location_type === 'edh' && l.commander);
          return (
            <button
              onClick={() => setEdhrec(true)}
              disabled={!hasEdh}
              title={hasEdh ? undefined : 'Set a location\'s type to EDH (with a commander) on the Locations page first'}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-40"
            >
              EDHREC
            </button>
          );
        })()}
        {locations.length > 0 && (
          <button
            onClick={() => {
              // Leaving deckbuilder discards the temporary list.
              setDeckMode((v) => !v);
              setDeck(new Map());
              setDeckCopied(false);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ring-1 ${
              deckMode
                ? 'bg-emerald-700 ring-emerald-600'
                : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {deckMode ? 'Exit Deckbuilder' : 'Deckbuilder'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-zinc-500">{user.email}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-xs text-zinc-400 underline hover:text-zinc-200"
          >
            sign out
          </button>
        </div>
      </header>

      {page === 'locations' ? (
        <LocationsPage
          locations={locations}
          cards={cards}
          userId={user.id}
          onChanged={() => reload()}
          onBack={() => setPage('cards')}
        />
      ) : (
      <>
      <div className="flex items-start gap-3">
        <SearchBar query={query} onChange={setQuery} error={onlyMine ? queryError : remoteError} />
        <label className="flex items-center gap-1.5 whitespace-nowrap py-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={onlyMine}
            onChange={(e) => setOnlyMine(e.target.checked)}
          />
          My collection only
        </label>
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

      {onlyMine && (
        <FilterBar filters={filters} onChange={setFilters} locationGroups={locationGroups} />
      )}

      {deckMode && (
        <div className="space-y-2 rounded-md bg-zinc-900 p-3 ring-1 ring-emerald-900/60">
          {deckCount === 0 ? (
            <p className="text-sm text-zinc-400">
              Deckbuilder: click cards to add them to a temporary list. It disappears when you
              exit.
            </p>
          ) : (
            <ul className="space-y-1">
              {[...deck.entries()].map(([id, qty]) => {
                const c = displayById.get(id) ?? cards.find((r) => r.id === id);
                if (!c) return null;
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {c.scryfall?.name ?? c.card_name}
                      <span className="text-zinc-500"> ({c.set_code?.toUpperCase()})</span>
                    </span>
                    <button
                      onClick={() => setDeckQty(id, qty - 1)}
                      className="rounded bg-zinc-800 px-2 ring-1 ring-zinc-700 hover:bg-zinc-700"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-xs text-zinc-300">
                      {qty}/{c.quantity}
                    </span>
                    <button
                      onClick={() => setDeckQty(id, qty + 1)}
                      className="rounded bg-zinc-800 px-2 ring-1 ring-zinc-700 hover:bg-zinc-700"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setDeckQty(id, 0)}
                      className="text-xs text-red-400 underline hover:text-red-300"
                    >
                      remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {deckCount > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500">
                {deckCount} cop{deckCount === 1 ? 'y' : 'ies'}
              </span>
              <button
                onClick={async () => {
                  const rows = [...deck.entries()]
                    .map(([id, qty]) => {
                      const c = displayById.get(id) ?? cards.find((r) => r.id === id);
                      return c ? { ...c, quantity: qty } : null;
                    })
                    .filter((r): r is OwnedCard => r !== null);
                  try {
                    await navigator.clipboard.writeText(toMoxfieldList(rows));
                    setDeckCopied(true);
                    setTimeout(() => setDeckCopied(false), 2000);
                  } catch { /* clipboard unavailable */ }
                }}
                className="text-xs text-indigo-400 underline hover:text-indigo-300"
              >
                {deckCopied ? 'copied!' : 'copy for Moxfield'}
              </button>
              <button
                onClick={() => setDeck(new Map())}
                className="text-xs text-zinc-400 underline hover:text-zinc-200"
              >
                clear
              </button>
            </div>
          )}
        </div>
      )}

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading collection…</p>
      ) : !onlyMine ? (
        <>
          {remoteLoading ? (
            <p className="text-sm text-zinc-400">Searching Scryfall…</p>
          ) : remote ? (
            <p className="text-sm text-zinc-400">
              {remote.cards.length} of {remote.total} Scryfall results
              {remote.truncated ? ' (first pages only — refine the search)' : ''} — ×N shows
              copies you own; add -in:all for cards you don't have
            </p>
          ) : (
            <p className="text-sm text-zinc-400">
              Searching all of Scryfall — type a query (e.g. t:goblin cmc&lt;=2 -in:all).
            </p>
          )}
          {remote && (view === 'grid' ? (
            <ResultsGrid cards={remote.cards} onSelect={setDetail} />
          ) : (
            <ResultsTable cards={remote.cards} onSelect={setDetail} />
          ))}
        </>
      ) : locations.length === 0 ? (
        <p className="text-sm text-zinc-400">Import a CSV to create your first location.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {displayResults.length} cards / {totals.copies} copies / ${totals.value.toFixed(2)}
          </p>
          <TokenTypesPanel cards={results} onSearch={setQuery} />
          {resultSections.map(([title, list]) => {
            const open = !collapsed.has(title);
            const copies = list.reduce((n, c) => n + c.quantity, 0);
            return (
              <section key={title} className="space-y-2">
                <button
                  onClick={() => toggleSection(title)}
                  className="flex w-full items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-left ring-1 ring-zinc-800 hover:bg-zinc-800"
                >
                  <span className="text-xs text-zinc-500">{open ? '▾' : '▸'}</span>
                  <span className="text-sm font-semibold">{title}</span>
                  <span className="text-xs text-zinc-500">
                    {list.length} cards / {copies} copies
                  </span>
                </button>
                {open && (view === 'grid' ? (
                  <ResultsGrid
                    cards={list}
                    onSelect={onCardClick}
                    onContext={(card, e) => setCardMenu({ card, x: e.clientX, y: e.clientY })}
                    selected={deckMode ? deck : undefined}
                  />
                ) : (
                  <ResultsTable
                    cards={list}
                    onSelect={onCardClick}
                    onContext={(card, e) => setCardMenu({ card, x: e.clientX, y: e.clientY })}
                    selected={deckMode ? deck : undefined}
                  />
                ))}
              </section>
            );
          })}
        </>
      )}
      </>
      )}

      {importing && (
        <ImportDialog
          locations={locations}
          onClose={() => setImporting(false)}
          onDone={() => reload()}
        />
      )}

      {moving && (
        <MoveDialog
          locations={locations}
          cards={cards}
          onClose={() => setMoving(false)}
          onDone={() => reload()}
        />
      )}

      {edhrec && (
        <EdhrecDialog
          locations={locations}
          cards={cards}
          moveTargets={locations.filter((l) => l.user_id === user.id)}
          onChanged={() => reload()}
          onSelectCard={setDetail}
          onClose={() => setEdhrec(false)}
        />
      )}

      {detail && (
        <CardDetail card={detail} copies={detailCopies} onClose={() => setDetail(null)} />
      )}

      {menuError && <p className="text-sm text-red-400">{menuError}</p>}
      {cardMenu && (
        <CardContextMenu
          menu={cardMenu}
          locations={locations.filter((l) => l.user_id === user.id)}
          moveDisabledReason={isPendingSale(cardMenu.card)
            ? 'Sale not confirmed yet — the seller must transfer this reservation before you can move its cards.'
            : undefined}
          busy={menuBusy}
          onViewDetails={setDetail}
          onMove={moveCard}
          onDelete={deleteCard}
          onClose={() => setCardMenu(null)}
        />
      )}

      {showLegend && <SearchLegend onClose={() => setShowLegend(false)} />}
    </div>
  );
}

export default function App() {
  return <AuthGate>{(user) => <Main user={user} />}</AuthGate>;
}
