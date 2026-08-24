import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Location, OwnedCard } from '../types';
import { DeleteLocationDialog } from './DeleteLocationDialog';

interface Props {
  locations: Location[];
  cards: OwnedCard[];
  /** Called after any rename/delete so the app can refetch. */
  onChanged: () => void;
  onClose: () => void;
}

export function ManageLocationsDialog({ locations, cards, onChanged, onClose }: Props) {
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countFor = (id: string) => cards.filter((c) => c.collection_id === id).length;

  async function saveRename(loc: Location) {
    const name = renameValue.trim();
    if (!name || name === loc.name) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('collections').update({ name }).eq('id', loc.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRenamingId(null);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md space-y-4 rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Locations</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        {locations.length === 0 && (
          <p className="text-sm text-zinc-400">No locations yet — import a CSV to create one.</p>
        )}

        <ul className="space-y-2">
          {locations.map((loc) => (
            <li key={loc.id} className="flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2">
              {renamingId === loc.id ? (
                <>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(loc);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-sm ring-1 ring-zinc-600"
                  />
                  <button
                    onClick={() => saveRename(loc)}
                    disabled={busy}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    save
                  </button>
                  <button
                    onClick={() => setRenamingId(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{loc.name}</span>
                  <span className="text-xs text-zinc-500">{countFor(loc.id)} rows</span>
                  <button
                    onClick={() => { setRenamingId(loc.id); setRenameValue(loc.name); }}
                    className="text-xs text-zinc-400 underline hover:text-zinc-200"
                  >
                    rename
                  </button>
                  <button
                    onClick={() => setDeleting(loc)}
                    className="text-xs text-red-400 underline hover:text-red-300"
                  >
                    delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {deleting && (
          <DeleteLocationDialog
            location={deleting}
            cardCount={countFor(deleting.id)}
            onClose={() => setDeleting(null)}
            onDeleted={() => {
              setDeleting(null);
              onChanged();
            }}
          />
        )}
      </div>
    </div>
  );
}
