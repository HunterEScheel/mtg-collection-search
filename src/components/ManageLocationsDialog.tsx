import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Location, OwnedCard } from '../types';
import { computeWrites, executeMove } from '../lib/move/executeMove';
import { DeleteLocationDialog } from './DeleteLocationDialog';

interface Props {
  locations: Location[];
  cards: OwnedCard[];
  /** Current user id — locations reserved FOR this user are visible but not manageable. */
  userId: string;
  /** Called after any rename/delete so the app can refetch. */
  onChanged: () => void;
  onClose: () => void;
}

export function ManageLocationsDialog({ locations, cards, userId, onChanged, onClose }: Props) {
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [transferConfirmId, setTransferConfirmId] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');

  const countFor = (id: string) => cards.filter((c) => c.collection_id === id).length;

  const shareUrl = (shareId: string) =>
    `${window.location.origin}${window.location.pathname}?share=${shareId}`;

  async function setShare(loc: Location, shareId: string | null) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('collections')
      // Unsharing also takes the location off sale.
      .update(shareId ? { share_id: shareId } : { share_id: null, for_sale: false })
      .eq('id', loc.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (shareId) {
      try {
        await navigator.clipboard.writeText(shareUrl(shareId));
        setCopiedId(loc.id);
      } catch {
        // Clipboard can fail (permissions); the link stays visible to copy manually.
      }
    }
    onChanged();
  }

  async function copyLink(loc: Location) {
    if (!loc.share_id) return;
    try {
      await navigator.clipboard.writeText(shareUrl(loc.share_id));
      setCopiedId(loc.id);
    } catch {
      setError('Could not copy — copy the link from the address below.');
    }
  }

  async function setForSale(loc: Location, on: boolean) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('collections')
      .update({ for_sale: on })
      .eq('id', loc.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onChanged();
  }

  async function transfer(loc: Location) {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('transfer_location', { p_location_id: loc.id });
    setBusy(false);
    setTransferConfirmId(null);
    if (error) {
      setError(error.message);
      return;
    }
    onChanged();
  }

  /** Move every card from `loc` into the target (natural-key merge), then delete `loc`. */
  async function merge(loc: Location, targetId: string) {
    if (!targetId || targetId === loc.id) return;
    setBusy(true);
    setError(null);
    try {
      const sourceRows = cards.filter((c) => c.collection_id === loc.id);
      const destCards = cards.filter((c) => c.collection_id === targetId);
      const transfers = sourceRows.map((r) => ({ sourceRow: r, qty: r.quantity }));
      await executeMove(computeWrites(transfers, destCards, targetId));
      const { error } = await supabase.from('collections').delete().eq('id', loc.id);
      if (error) throw new Error(error.message);
      setMergingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

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
        className="max-h-[85vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700"
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
          {locations.map((loc) => {
            const owned = loc.user_id === userId;
            return (
            <li key={loc.id} className="space-y-1 rounded-md bg-zinc-800 px-3 py-2">
              <div className="flex items-center gap-2">
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
                  {loc.reserved_from && (
                    <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-400 ring-1 ring-amber-900">
                      reservation
                    </span>
                  )}
                  {!owned && (
                    <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300">
                      reserved for you
                    </span>
                  )}
                  <span className="text-xs text-zinc-500">{countFor(loc.id)} rows</span>
                  {owned && (
                    <>
                      {loc.reserved_by && (
                        <button
                          onClick={() =>
                            transferConfirmId === loc.id
                              ? transfer(loc)
                              : setTransferConfirmId(loc.id)}
                          disabled={busy}
                          className="text-xs text-amber-400 underline hover:text-amber-300"
                        >
                          {transferConfirmId === loc.id
                            ? 'confirm: hand over to buyer?'
                            : 'transfer to buyer'}
                        </button>
                      )}
                      <button
                        onClick={() => { setRenamingId(loc.id); setRenameValue(loc.name); }}
                        className="text-xs text-zinc-400 underline hover:text-zinc-200"
                      >
                        rename
                      </button>
                      <button
                        onClick={() => {
                          setMergingId(mergingId === loc.id ? null : loc.id);
                          setMergeTargetId('');
                        }}
                        className="text-xs text-zinc-400 underline hover:text-zinc-200"
                      >
                        merge into…
                      </button>
                      <button
                        onClick={() => setDeleting(loc)}
                        className="text-xs text-red-400 underline hover:text-red-300"
                      >
                        delete
                      </button>
                    </>
                  )}
                </>
              )}
              </div>
              {mergingId === loc.id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Merge all cards into:</span>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-xs ring-1 ring-zinc-600"
                  >
                    <option value="">— pick a location —</option>
                    {locations
                      .filter((l) => l.id !== loc.id && l.user_id === userId)
                      .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button
                    onClick={() => merge(loc, mergeTargetId)}
                    disabled={busy || !mergeTargetId}
                    className="text-xs text-amber-400 underline hover:text-amber-300 disabled:opacity-40"
                  >
                    {busy ? 'merging…' : `merge & delete “${loc.name}”`}
                  </button>
                  <button
                    onClick={() => setMergingId(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    cancel
                  </button>
                </div>
              )}
              {owned && (
              <div className="flex items-center gap-2">
                {loc.share_id ? (
                  <>
                    <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">
                      {shareUrl(loc.share_id)}
                    </span>
                    <label className="flex items-center gap-1 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={loc.for_sale}
                        disabled={busy}
                        onChange={(e) => setForSale(loc, e.target.checked)}
                      />
                      for sale
                    </label>
                    <button
                      onClick={() => copyLink(loc)}
                      className="text-xs text-indigo-400 underline hover:text-indigo-300"
                    >
                      {copiedId === loc.id ? 'copied!' : 'copy link'}
                    </button>
                    <button
                      onClick={() => setShare(loc, null)}
                      disabled={busy}
                      className="text-xs text-zinc-400 underline hover:text-zinc-200"
                    >
                      unshare
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setShare(loc, crypto.randomUUID())}
                    disabled={busy}
                    className="text-xs text-zinc-400 underline hover:text-zinc-200"
                  >
                    share
                  </button>
                )}
              </div>
              )}
            </li>
            );
          })}
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
