import { useMemo, useState } from 'react';
import type { Location, MovePlan, OwnedCard } from '../types';
import { parseMoveList } from '../lib/move/parseMoveList';
import { planMove } from '../lib/move/planMove';
import { computeWrites, executeMove } from '../lib/move/executeMove';

interface Props {
  locations: Location[];
  cards: OwnedCard[];
  onDone: () => void;
  onClose: () => void;
}

export function MoveDialog({ locations, cards, onDone, onClose }: Props) {
  const [sourceId, setSourceId] = useState(locations[0]?.id ?? '');
  const [destId, setDestId] = useState(locations[1]?.id ?? '');
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<MovePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalToMove = useMemo(
    () => plan?.transfers.reduce((n, t) => n + t.qty, 0) ?? 0,
    [plan],
  );

  function preview() {
    setError(null);
    if (sourceId === destId) { setError('Source and destination must differ'); return; }
    if (text.trim() === '') { setError('Paste a card list first'); return; }
    try {
      const parsed = parseMoveList(text);
      const sourceCards = cards.filter((c) => c.collection_id === sourceId);
      setPlan(planMove(parsed.lines, sourceCards, parsed.malformed));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function run() {
    if (!plan || plan.transfers.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const destCards = cards.filter((c) => c.collection_id === destId);
      await executeMove(computeWrites(plan.transfers, destCards, destId));
      setDone(true);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? '?';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Move Cards</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={sourceId}
            onChange={(e) => { setSourceId(e.target.value); setPlan(null); setDone(false); }}
            className="min-w-0 flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="text-zinc-400">→</span>
          <select
            value={destId}
            onChange={(e) => { setDestId(e.target.value); setPlan(null); setDone(false); }}
            className="min-w-0 flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          >
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPlan(null); setDone(false); }}
          placeholder={'One card per line, Moxfield format:\n2 Lightning Bolt (2XM) 123\n1 Sol Ring *F*\nGrizzly Bears\n\n(Pasting a supported CSV also works.)'}
          rows={7}
          className="w-full rounded-md bg-zinc-800 px-3 py-2 font-mono text-xs ring-1 ring-zinc-700"
        />

        {plan && (
          <div className="space-y-1 rounded-md bg-zinc-800 p-3 text-sm">
            {plan.report.lines.map((l, i) => (
              <p
                key={i}
                className={
                  l.notFound ? 'text-red-400'
                  : l.short > 0 ? 'text-amber-400'
                  : 'text-emerald-400'
                }
              >
                {l.line.name}
                {l.line.setCode ? ` (${l.line.setCode.toUpperCase()})` : ''}: {l.moved}/{l.requested}
                {l.notFound ? ' — not at source'
                  : l.short > 0 ? ` — only ${l.moved} available` : ''}
                {l.printingFallback ? ' (different printing)' : ''}
              </p>
            ))}
            {plan.report.malformed.length > 0 && (
              <p className="text-amber-400">
                Skipped {plan.report.malformed.length} unparseable line(s):
                {' '}{plan.report.malformed.slice(0, 5).map((m) => `line ${m.line}`).join(', ')}
                {plan.report.malformed.length > 5 ? '…' : ''}
              </p>
            )}
            {done ? (
              <p className="font-medium text-emerald-400">
                Moved {totalToMove} cop{totalToMove === 1 ? 'y' : 'ies'} from {locName(sourceId)} to {locName(destId)}.
              </p>
            ) : (
              <p className="text-zinc-400">
                {totalToMove} cop{totalToMove === 1 ? 'y' : 'ies'} will move from {locName(sourceId)} to {locName(destId)}.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={preview}
            disabled={busy || locations.length < 2}
            className="flex-1 rounded-md bg-zinc-800 px-3 py-2 text-sm font-medium ring-1 ring-zinc-700 hover:bg-zinc-700 disabled:opacity-40"
          >
            Preview
          </button>
          <button
            onClick={run}
            disabled={busy || done || !plan || plan.transfers.length === 0}
            className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? 'Moving…' : done ? 'Done' : `Move ${totalToMove} cop${totalToMove === 1 ? 'y' : 'ies'}`}
          </button>
        </div>
        {locations.length < 2 && (
          <p className="text-xs text-zinc-500">You need at least two locations to move cards.</p>
        )}
      </div>
    </div>
  );
}
