import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Collection } from '../types';

interface Props {
  collection: Collection;
  cardCount: number;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

export function DeleteCollectionDialog({ collection, cardCount, onDeleted, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.from('collections').delete().eq('id', collection.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    onDeleted(collection.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-4 rounded-xl bg-zinc-900 p-6 ring-1 ring-red-900/60"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-red-400">Delete collection?</h2>
        <p className="text-sm text-zinc-300">
          This permanently deletes <span className="font-semibold">“{collection.name}”</span>
          {cardCount > 0 && <> and its <span className="font-semibold">{cardCount}</span> card rows</>}.
          This cannot be undone. Your ManaBox CSV is unaffected — you can re-import it any time.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            disabled={busy}
            className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
