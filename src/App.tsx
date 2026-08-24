import { useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { ownedPrice } from './lib/scryfall';
import { useAllCards } from './hooks/useAllCards';
import { useSearch, EMPTY_FILTERS, type UiFilters } from './hooks/useSearch';
import { AuthGate } from './components/AuthGate';
import { SearchBar } from './components/SearchBar';
import { FilterBar } from './components/FilterBar';
import { ResultsGrid } from './components/ResultsGrid';
import { ResultsTable } from './components/ResultsTable';
import { ImportDialog } from './components/ImportDialog';
import { MoveDialog } from './components/MoveDialog';
import { ManageLocationsDialog } from './components/ManageLocationsDialog';
import { CardDetail } from './components/CardDetail';
import type { OwnedCard } from './types';

function Main({ user }: { user: User }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UiFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [importing, setImporting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [detail, setDetail] = useState<OwnedCard | null>(null);

  const { cards, locations, loading, error: loadError, reload } = useAllCards();
  const { results, error: queryError } = useSearch(cards, query, filters);

  const locationNames = useMemo(
    () => locations.map((l) => l.name).sort(),
    [locations],
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">MTG Collection Search</h1>
        <button
          onClick={() => setImporting(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
        >
          Import CSV
        </button>
        {locations.length >= 2 && (
          <button
            onClick={() => setMoving(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Move Cards
          </button>
        )}
        {locations.length > 0 && (
          <button
            onClick={() => setManaging(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Manage Locations
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

      <div className="flex items-start gap-3">
        <SearchBar query={query} onChange={setQuery} error={queryError} />
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

      <FilterBar filters={filters} onChange={setFilters} locationNames={locationNames} />

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading collection…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-zinc-400">Import a CSV to create your first location.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-400">
            {results.length} cards / {totals.copies} copies / ${totals.value.toFixed(2)}
          </p>
          {view === 'grid' ? (
            <ResultsGrid cards={results} onSelect={setDetail} />
          ) : (
            <ResultsTable cards={results} onSelect={setDetail} />
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

      {managing && (
        <ManageLocationsDialog
          locations={locations}
          cards={cards}
          onClose={() => setManaging(false)}
          onChanged={() => reload()}
        />
      )}

      {detail && (
        <CardDetail card={detail} copies={detailCopies} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

export default function App() {
  return <AuthGate>{(user) => <Main user={user} />}</AuthGate>;
}
