import type { UiFilters } from '../hooks/useSearch';

interface Props {
  filters: UiFilters;
  onChange: (f: UiFilters) => void;
  locationNames: string[];
}

export function FilterBar({ filters, onChange, locationNames }: Props) {
  const toggleLocation = (name: string) => {
    const next = filters.locations.includes(name)
      ? filters.locations.filter((b) => b !== name)
      : [...filters.locations, name];
    onChange({ ...filters, locations: next });
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
        {locationNames.map((name) => (
          <button
            key={name}
            onClick={() => toggleLocation(name)}
            className={`rounded-full px-2.5 py-0.5 text-xs ring-1 ${
              filters.locations.includes(name)
                ? 'bg-indigo-600 ring-indigo-500'
                : 'bg-zinc-800 ring-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      {(filters.minQty !== null || filters.maxQty !== null || filters.locations.length > 0) && (
        <button
          onClick={() => onChange({ minQty: null, maxQty: null, locations: [] })}
          className="text-xs text-zinc-400 underline hover:text-zinc-200"
        >
          clear
        </button>
      )}
    </div>
  );
}
