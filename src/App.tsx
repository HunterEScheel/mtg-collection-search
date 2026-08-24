import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { ownedPrice } from './lib/scryfall';
import { useCollection } from './hooks/useCollection';
import { useSearch, EMPTY_FILTERS, type UiFilters } from './hooks/useSearch';
import { AuthGate } from './components/AuthGate';
import { CollectionPicker } from './components/CollectionPicker';
import { SearchBar } from './components/SearchBar';
import { FilterBar } from './components/FilterBar';
import { ResultsGrid } from './components/ResultsGrid';
import { ResultsTable } from './components/ResultsTable';
import { ImportDialog } from './components/ImportDialog';
import { DeleteCollectionDialog } from './components/DeleteCollectionDialog';
import { CardDetail } from './components/CardDetail';
import type { Collection, OwnedCard } from './types';

function Main({ user }: { user: User }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<UiFilters>(EMPTY_FILTERS);
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detail, setDetail] = useState<OwnedCard | null>(null);

  const { cards, loading, error: loadError, reload } = useCollection(selectedId);
  const { results, error: queryError } = useSearch(cards, query, filters);

  useEffect(() => {
    supabase
      .from('collections')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const list = (data ?? []) as Collection[];
        setCollections(list);
        setSelectedId((cur) => cur ?? list[0]?.id ?? null);
      });
  }, []);

  const binderNames = useMemo(
    () => [...new Set(cards.map((c) => c.binder_name ?? ''))].sort(),
    [cards],
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
        <CollectionPicker
          collections={collections}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <button
          onClick={() => setImporting(true)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
        >
          Import CSV
        </button>
        {selectedId && (
          <button
            onClick={() => setDeleting(true)}
            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-red-400 ring-1 ring-zinc-700 hover:bg-red-950/60 hover:ring-red-900"
          >
            Delete Collection
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

      <FilterBar filters={filters} onChange={setFilters} binderNames={binderNames} />

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}
      {loading ? (
        <p className="text-sm text-zinc-400">Loading collection…</p>
      ) : selectedId === null ? (
        <p className="text-sm text-zinc-400">Import a ManaBox CSV to get started.</p>
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
          collections={collections}
          currentCollectionId={selectedId}
          onClose={() => setImporting(false)}
          onDone={(id) => {
            supabase
              .from('collections')
              .select('*')
              .order('created_at')
              .then(({ data }) => setCollections((data ?? []) as Collection[]));
            setSelectedId(id);
            reload();
          }}
        />
      )}

      {deleting && selectedId && (() => {
        const col = collections.find((c) => c.id === selectedId);
        return col ? (
          <DeleteCollectionDialog
            collection={col}
            cardCount={cards.length}
            onClose={() => setDeleting(false)}
            onDeleted={(id) => {
              setDeleting(false);
              const rest = collections.filter((c) => c.id !== id);
              setCollections(rest);
              setSelectedId(rest[0]?.id ?? null);
            }}
          />
        ) : null;
      })()}

      {detail && (
        <CardDetail card={detail} copies={detailCopies} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

export default function App() {
  return <AuthGate>{(user) => <Main user={user} />}</AuthGate>;
}
