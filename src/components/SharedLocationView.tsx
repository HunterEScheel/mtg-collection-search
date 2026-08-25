import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ownedPrice } from '../lib/scryfall';
import { useSearch, EMPTY_FILTERS } from '../hooks/useSearch';
import { SearchBar } from './SearchBar';
import { ResultsGrid } from './ResultsGrid';
import { ResultsTable } from './ResultsTable';
import { CardDetail } from './CardDetail';
import type { ManaBoxRow, OwnedCard, ScryfallCard } from '../types';

interface SharedPayload {
  name: string;
  cards: (ManaBoxRow & {
    id: number;
    collection_id: string;
    scryfall: ScryfallCard | null;
  })[];
}

/** Read-only public view of one shared location — no login required. */
export function SharedLocationView({ shareId }: { shareId: string }) {
  const [name, setName] = useState<string | null>(null);
  const [cards, setCards] = useState<OwnedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [detail, setDetail] = useState<OwnedCard | null>(null);

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
          setCards(payload.cards.map((c) => ({ ...c, location_name: payload.name })));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [shareId]);

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

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{name ?? 'Shared Location'}</h1>
        <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 ring-1 ring-zinc-700">
          shared view
        </span>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading shared location…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : (
        <>
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

      {detail && (
        <CardDetail card={detail} copies={detailCopies} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
