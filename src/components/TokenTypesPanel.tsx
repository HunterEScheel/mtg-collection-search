import { useMemo, useState } from 'react';
import { collectionTokenTypes } from '../lib/scryfall/tokens';
import type { OwnedCard } from '../types';

interface Props {
  cards: OwnedCard[];
  onSearch: (query: string) => void;
}

function queryFor(type: string): string {
  if (type === 'Copy') return 'o:"token that\'s a copy"';
  return type.includes(' ') ? `spawns:"${type}"` : `spawns:${type}`;
}

export function TokenTypesPanel({ cards, onSearch }: Props) {
  const [open, setOpen] = useState(false);
  const types = useMemo(() => collectionTokenTypes(cards), [cards]);

  if (types.length === 0) return null;

  return (
    <div className="text-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-zinc-400 underline decoration-dotted hover:text-zinc-200"
      >
        {open ? 'Hide' : 'Show'} token types ({types.length})
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {types.map(({ type, cardCount }) => (
            <button
              key={type}
              onClick={() => onSearch(queryFor(type))}
              title={`Search cards that spawn ${type} tokens`}
              className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs ring-1 ring-zinc-700 hover:bg-zinc-700"
            >
              {type} <span className="text-zinc-500">{cardCount}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
