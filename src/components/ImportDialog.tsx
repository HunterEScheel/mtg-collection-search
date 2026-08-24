import { useRef, useState } from 'react';
import { importManaBoxCsv, type ImportMode } from '../lib/manabox/import';
import type { Collection, ImportProgress, ImportReport } from '../types';

interface Props {
  collections: Collection[];
  currentCollectionId: string | null;
  onDone: (collectionId: string) => void;
  onClose: () => void;
}

const STAGE_LABEL: Record<ImportProgress['stage'], string> = {
  parsing: 'Parsing CSV',
  'checking-cache': 'Checking card cache',
  'fetching-scryfall': 'Fetching card data from Scryfall',
  'saving-cards': 'Saving to your collection',
  done: 'Done',
};

export function ImportDialog({ collections, currentCollectionId, onDone, onClose }: Props) {
  const [mode, setMode] = useState<ImportMode>(collections.length === 0 ? 'new' : 'update');
  const [name, setName] = useState('');
  const [targetId, setTargetId] = useState(currentCollectionId ?? collections[0]?.id ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a CSV file first'); return; }
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const text = await file.text();
      const { collectionId, report } = await importManaBoxCsv(text, {
        mode,
        newCollectionName: name,
        collectionId: targetId,
        onProgress: setProgress,
      });
      setReport(report);
      onDone(collectionId);
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
          <h2 className="text-lg font-semibold">Import ManaBox CSV</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setMode('new')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 ${
              mode === 'new' ? 'bg-indigo-600 ring-indigo-500' : 'bg-zinc-800 ring-zinc-700'
            }`}
          >
            New Collection
          </button>
          <button
            onClick={() => setMode('update')}
            disabled={collections.length === 0}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ring-1 disabled:opacity-40 ${
              mode === 'update' ? 'bg-indigo-600 ring-indigo-500' : 'bg-zinc-800 ring-zinc-700'
            }`}
          >
            Update Collection
          </button>
        </div>

        {mode === 'new' ? (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
            className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          />
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md bg-zinc-800 px-3 py-2 text-sm ring-1 ring-zinc-700"
          >
            {collections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        <input ref={fileRef} type="file" accept=".csv,text/csv" className="w-full text-sm" />

        {progress && busy && (
          <p className="text-sm text-zinc-400">
            {STAGE_LABEL[progress.stage]}
            {progress.total > 1 ? ` (${progress.current}/${progress.total})` : ''}…
          </p>
        )}

        {report && (
          <div className="space-y-1 rounded-md bg-zinc-800 p-3 text-sm">
            <p className="text-emerald-400">Imported {report.imported} card rows.</p>
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
