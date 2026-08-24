interface Props {
  query: string;
  onChange: (q: string) => void;
  error: string | null;
}

export function SearchBar({ query, onChange, error }: Props) {
  return (
    <div className="flex-1">
      <input
        type="text"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'Scryfall syntax — e.g. t:creature c:r qty>=2 loc:"Trade Binder"'}
        spellCheck={false}
        className="w-full rounded-md bg-zinc-800 px-3 py-2 font-mono text-sm outline-none ring-1 ring-zinc-700 focus:ring-indigo-500"
      />
      {error && <p className="mt-1 text-xs text-amber-400">{error}</p>}
    </div>
  );
}
