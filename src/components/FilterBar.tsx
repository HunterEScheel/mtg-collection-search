import type { UiFilters } from '../hooks/useSearch';

interface Props {
  filters: UiFilters;
  onChange: (f: UiFilters) => void;
  binderNames: string[];
}

export function FilterBar({ filters, onChange, binderNames }: Props) {
  const toggleBinder = (name: string) => {
    const next = filters.binders.includes(name)
      ? filters.binders.filter((b) => b !== name)
      : [...filters.binders, name];
    onChange({ ...filters, binders: next });
  };

  const numInput = (value: number | null, set: (v: number | null) => void, label: string) => (
    <label className="flex items-center gap-1 text-xs text-zinc-400">
      {label}
      <input
        type="number"
        min={0}
        value={value ?? ''}
        onChange={(e) => set(e.target.value === '' ? null : Number(e.target.value))}
        className="w-16 rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-100 ring-1 ring-zinc-700"
      />
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Qty</span>
      {numInput(filters.minQty, (v) => onChange({ ...filters, minQty: v }), 'min')}
      {numInput(filters.maxQty, (v) => onChange({ ...filters, maxQty: v }), 'max')}
      <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Location</span>
      <div className="flex flex-wrap gap-1">
        {binderNames.map((name) => (
          <button
            key={name}
            onClick={() => toggleBinder(name)}
            className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${
              filters.binders.includes(name)
                ? 'bg-indigo-600 ring-indigo-500'
                : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {name || '(no binder)'}
          </button>
        ))}
      </div>
      {(filters.minQty !== null || filters.maxQty !== null || filters.binders.length > 0) && (
        <button
          onClick={() => onChange({ minQty: null, maxQty: null, binders: [] })}
          className="text-xs text-zinc-400 underline hover:text-zinc-200"
        >
          clear
        </button>
      )}
    </div>
  );
}
