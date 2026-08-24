import type { Collection } from '../types';

interface Props {
  collections: Collection[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CollectionPicker({ collections, selectedId, onSelect }: Props) {
  if (collections.length === 0) {
    return <span className="text-sm text-zinc-500">No collections yet — import a CSV.</span>;
  }
  return (
    <select
      value={selectedId ?? ''}
      onChange={(e) => onSelect(e.target.value)}
      className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm ring-1 ring-zinc-700"
    >
      {collections.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
