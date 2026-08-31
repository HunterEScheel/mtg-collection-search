import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ownedPrice } from '../lib/scryfall';
import type { Location, OwnedCard } from '../types';
import { computeWrites, executeMove } from '../lib/move/executeMove';
import { toManaBoxCsv, toMoxfieldList } from '../lib/moxfieldExport';
import { DeleteLocationDialog } from './DeleteLocationDialog';

interface Props {
  locations: Location[];
  cards: OwnedCard[];
  /** Current user id — locations reserved FOR this user are visible but not manageable. */
  userId: string;
  /** Called after any change so the app can refetch. */
  onChanged: () => void;
  onBack: () => void;
}

export function LocationsPage({ locations, cards, userId, onChanged, onBack }: Props) {
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportedId, setExportedId] = useState<string | null>(null);
  const [transferConfirmId, setTransferConfirmId] = useState<string | null>(null);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [commanderEditId, setCommanderEditId] = useState<string | null>(null);
  const [commanderValue, setCommanderValue] = useState('');

  // Commander-eligible cards you own, suggested when marking a location EDH.
  const commanderNames = useMemo(() => {
    const names = new Set<string>();
    for (const c of cards) {
      const type = (c.scryfall?.type_line ?? '').toLowerCase();
      const oracle = (c.scryfall?.oracle_text ?? '').toLowerCase();
      if ((type.includes('legendary') && type.includes('creature'))
        || oracle.includes('can be your commander')) {
        names.add(c.scryfall?.name ?? c.card_name);
      }
    }
    return [...names].sort();
  }, [cards]);

  const statsFor = useMemo(() => {
    const map = new Map<string, { rows: number; copies: number; value: number }>();
    for (const c of cards) {
      const s = map.get(c.collection_id) ?? { rows: 0, copies: 0, value: 0 };
      s.rows += 1;
      s.copies += c.quantity;
      s.value += (ownedPrice(c) ?? 0) * c.quantity;
      map.set(c.collection_id, s);
    }
    return (id: string) => map.get(id) ?? { rows: 0, copies: 0, value: 0 };
  }, [cards]);

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
      setError('Could not copy — copy the link shown on the row instead.');
    }
  }

  async function exportMoxfield(loc: Location) {
    const rows = cards.filter((c) => c.collection_id === loc.id);
    try {
      await navigator.clipboard.writeText(toMoxfieldList(rows));
      setExportedId(loc.id);
      setTimeout(() => setExportedId(null), 2000);
    } catch {
      setError('Could not copy to clipboard.');
    }
  }

  /** Download the location as a ManaBox-importable CSV file. */
  function exportManaBox(loc: Location) {
    const rows = cards.filter((c) => c.collection_id === loc.id);
    const blob = new Blob([toManaBoxCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${loc.name.replace(/[^\w\- ]+/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  /** Switch to 'collection' immediately; switching to 'edh' opens the commander input. */
  async function setType(loc: Location, type: Location['location_type']) {
    if (type === 'edh') {
      setCommanderEditId(loc.id);
      setCommanderValue(loc.commander ?? '');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('collections')
      .update({ location_type: 'collection', commander: null })
      .eq('id', loc.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCommanderEditId(null);
    onChanged();
  }

  async function saveCommander(loc: Location) {
    const commander = commanderValue.trim();
    if (!commander) {
      setError('An EDH location needs a commander');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('collections')
      .update({ location_type: 'edh', commander })
      .eq('id', loc.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCommanderEditId(null);
    onChanged();
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

  const actionClass = 'text-xs underline';

  // Sections: EDH decks, plain collections, and reservations (either carved
  // out of one of your sale lists, or reserved for you by a seller).
  const isReservation = (l: Location) => l.reserved_from !== null || l.user_id !== userId;
  const sections: { title: string; list: Location[] }[] = [
    { title: 'Decks', list: locations.filter((l) => !isReservation(l) && l.location_type === 'edh') },
    { title: 'Collections', list: locations.filter((l) => !isReservation(l) && l.location_type !== 'edh') },
    { title: 'Reservations', list: locations.filter(isReservation) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700"
        >
          ← Back to cards
        </button>
        <h2 className="text-lg font-semibold">Locations</h2>
      </div>

      {locations.length === 0 && (
        <p className="text-sm text-zinc-400">No locations yet — import a collection to create one.</p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {sections.map(({ title, list }) => list.length > 0 && (
      <section key={title} className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="space-y-3">
        {list.map((loc) => {
          const owned = loc.user_id === userId;
          const stats = statsFor(loc.id);
          return (
            <li key={loc.id} className="space-y-2 rounded-xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
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
                      className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 text-sm ring-1 ring-zinc-600"
                    />
                    <button
                      onClick={() => saveRename(loc)}
                      disabled={busy}
                      className={`${actionClass} text-indigo-400 hover:text-indigo-300`}
                    >
                      save
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                    >
                      cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 truncate text-base font-medium">{loc.name}</span>
                    {loc.location_type === 'edh' && (
                      <span className="rounded-full bg-indigo-950/60 px-2 py-0.5 text-[10px] text-indigo-300 ring-1 ring-indigo-900">
                        EDH{loc.commander ? ` — ${loc.commander}` : ''}
                      </span>
                    )}
                    {loc.reserved_from && (
                      <span className="rounded-full bg-amber-950/60 px-2 py-0.5 text-[10px] text-amber-400 ring-1 ring-amber-900">
                        reservation
                      </span>
                    )}
                    {loc.for_sale && (
                      <span className="rounded-full bg-emerald-950/60 px-2 py-0.5 text-[10px] text-emerald-400 ring-1 ring-emerald-900">
                        for sale
                      </span>
                    )}
                    {!owned && (
                      <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300">
                        reserved for you
                      </span>
                    )}
                    <span className="ml-auto text-xs text-zinc-500">
                      {stats.rows} rows / {stats.copies} copies / ${stats.value.toFixed(2)}
                    </span>
                  </>
                )}
              </div>

              {owned && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-500">type:</span>
                  <select
                    value={commanderEditId === loc.id ? 'edh' : loc.location_type}
                    disabled={busy}
                    onChange={(e) => setType(loc, e.target.value as Location['location_type'])}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs ring-1 ring-zinc-600"
                  >
                    <option value="collection">Collection</option>
                    <option value="edh">EDH</option>
                  </select>
                  {commanderEditId === loc.id ? (
                    <>
                      <input
                        autoFocus
                        list="location-commanders"
                        value={commanderValue}
                        onChange={(e) => setCommanderValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveCommander(loc); }}
                        placeholder="Commander (required)"
                        className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 text-xs ring-1 ring-zinc-600"
                      />
                      <button
                        onClick={() => saveCommander(loc)}
                        disabled={busy || commanderValue.trim() === ''}
                        className={`${actionClass} text-indigo-400 hover:text-indigo-300 disabled:opacity-40`}
                      >
                        save
                      </button>
                      <button
                        onClick={() => setCommanderEditId(null)}
                        className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                      >
                        cancel
                      </button>
                    </>
                  ) : loc.location_type === 'edh' && (
                    <button
                      onClick={() => { setCommanderEditId(loc.id); setCommanderValue(loc.commander ?? ''); }}
                      className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                    >
                      change commander
                    </button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-zinc-500">export:</span>
                <button
                  onClick={() => exportMoxfield(loc)}
                  className={`${actionClass} text-indigo-400 hover:text-indigo-300`}
                >
                  {exportedId === loc.id ? 'copied!' : 'Moxfield'}
                </button>
                <button
                  onClick={() => exportManaBox(loc)}
                  className={`${actionClass} text-indigo-400 hover:text-indigo-300`}
                >
                  ManaBox
                </button>
                {owned && (
                  <>
                    {loc.reserved_by && (
                      <button
                        onClick={() =>
                          transferConfirmId === loc.id ? transfer(loc) : setTransferConfirmId(loc.id)}
                        disabled={busy}
                        className={`${actionClass} text-amber-400 hover:text-amber-300`}
                      >
                        {transferConfirmId === loc.id
                          ? 'confirm: hand over to buyer?'
                          : 'transfer to buyer'}
                      </button>
                    )}
                    <button
                      onClick={() => { setRenamingId(loc.id); setRenameValue(loc.name); }}
                      className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                    >
                      rename
                    </button>
                    <button
                      onClick={() => {
                        setMergingId(mergingId === loc.id ? null : loc.id);
                        setMergeTargetId('');
                      }}
                      className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                    >
                      merge into…
                    </button>
                    <button
                      onClick={() => setDeleting(loc)}
                      className={`${actionClass} text-red-400 hover:text-red-300`}
                    >
                      delete
                    </button>
                  </>
                )}
              </div>

              {mergingId === loc.id && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-400">Merge all cards into:</span>
                  <select
                    value={mergeTargetId}
                    onChange={(e) => setMergeTargetId(e.target.value)}
                    className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 text-xs ring-1 ring-zinc-600"
                  >
                    <option value="">— pick a location —</option>
                    {locations
                      .filter((l) => l.id !== loc.id && l.user_id === userId)
                      .map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button
                    onClick={() => merge(loc, mergeTargetId)}
                    disabled={busy || !mergeTargetId}
                    className={`${actionClass} text-amber-400 hover:text-amber-300 disabled:opacity-40`}
                  >
                    {busy ? 'merging…' : `merge & delete “${loc.name}”`}
                  </button>
                  <button
                    onClick={() => setMergingId(null)}
                    className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                  >
                    cancel
                  </button>
                </div>
              )}

              {owned && (
                <div className="flex flex-wrap items-center gap-3">
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
                        className={`${actionClass} text-indigo-400 hover:text-indigo-300`}
                      >
                        {copiedId === loc.id ? 'copied!' : 'copy link'}
                      </button>
                      <button
                        onClick={() => setShare(loc, null)}
                        disabled={busy}
                        className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
                      >
                        unshare
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setShare(loc, crypto.randomUUID())}
                      disabled={busy}
                      className={`${actionClass} text-zinc-400 hover:text-zinc-200`}
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
      </section>
      ))}

      <datalist id="location-commanders">
        {commanderNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      {deleting && (
        <DeleteLocationDialog
          location={deleting}
          cardCount={statsFor(deleting.id).rows}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
