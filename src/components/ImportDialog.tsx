import { useRef, useState } from 'react';
import { importCollectionCsv, type ImportMode } from '../lib/manabox/import';
import type { Location, ImportProgress, ImportReport } from '../types';

interface Props {
  locations: Location[];
  onDone: (locationId: string) => void;
  onClose: () => void;
}

const STAGE_LABEL: Record<ImportProgress['stage'], string> = {
  parsing: 'Parsing CSV',
  'checking-cache': 'Checking card cache',
  'fetching-scryfall': 'Fetching card data from Scryfall',
  'saving-cards': 'Saving to your collection',
  done: 'Done',
};

export function ImportDialog({ locations, onDone, onClose }: Props) {
  const [mode, setMode] = useState<ImportMode>(locations.length === 0 ? 'new' : 'update');
  const [name, setName] = useState('');
  const [targetId, setTargetId] = useState(locations[0]?.id ?? '');
  const [pasted, setPasted] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file && pasted.trim() === '') {
      setError('Choose a file or paste a decklist first');
      return;
    }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const text = pasted.trim() !== '' ? pasted : await file!.text();
      const { locationId, report } = await importCollectionCsv(text, {
        mode,
        newLocationName: name,
        locationId: targetId,
        onProgress: setProgress,
      });
      setReport(report);
      onDone(locationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md space-y-4 rounded-xl bg-zinc-900 p-6 ring-1 ring-zinc-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Import Cards into a Location</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('new')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 ${
              mode === 'new' ? 'bg-indigo-600 ring-indigo-500' : 'bg-zinc-800 ring-zinc-700'
            }`}
          >
            New Location
          </button>
          <button
            onClick={() => setMode('update')}
            disabled={locations.length === 0}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 disabled:opacity-40 ${
              mode === 'update' ? 'bg-indigo-600 ring-indigo-500' : 'bg-zinc-800 ring-zinc-700'
            }`}
          >
            Existing Location
          </button>
        </div>

        {mode === 'new' ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Location name (e.g. Trade Binder)"
            className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          />
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {mode === 'update' && (
          <p className="text-xs text-zinc-500">
            Matching cards are set to the imported quantities (a re-sync, not an add); cards not
            in the import are left alone.
          </p>
        )}

        <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" className="w-full text-sm" />

        <div className="space-y-1">
          <p className="text-xs text-zinc-500">…or paste a CSV / Moxfield decklist:</p>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'1 Sol Ring (M3C) 305\n23 Forest (UND) 95\n1 Roaming Throne (LCI) 344 *F*'}
            rows={5}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 font-mono text-xs ring-1 ring-zinc-700"
          />
        </div>

        {progress && busy && (
          <p className="text-sm text-zinc-400">
            {STAGE_LABEL[progress.stage]}
            {progress.total > 1 ? ` (${progress.current}/${progress.total})` : ''}…
          </p>
        )}

        {report && (
          <div className="space-y-1 rounded-md bg-zinc-800 p-3 text-sm">
            <p className="text-emerald-400">
              Imported {report.imported} card rows ({report.format} format).
            </p>
            {report.unresolvedNames.length > 0 && (
              <p className="text-amber-400">
                {report.unresolvedNames.length} card(s) not matched on Scryfall and skipped:
                {' '}{report.unresolvedNames.slice(0, 5).join('; ')}
                {report.unresolvedNames.length > 5 ? '…' : ''}
              </p>
            )}
            {report.malformedRows.length > 0 && (
              <p className="text-amber-400">
                Skipped {report.malformedRows.length} malformed row(s):
                {' '}{report.malformedRows.slice(0, 5).map((m) => `line ${m.line}`).join(', ')}
                {report.malformedRows.length > 5 ? '…' : ''}
              </p>
            )}
            {report.unresolvedScryfallIds.length > 0 && (
              <p className="text-amber-400">
                {report.unresolvedScryfallIds.length} card(s) not found on Scryfall — imported
                with CSV data only.
              </p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={run}
          disabled={busy || (mode === 'new' && name.trim() === '')}
          className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>
    </div>
  );
}
