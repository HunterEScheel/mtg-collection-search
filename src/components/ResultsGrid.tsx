import type { OwnedCard } from '../types';

interface Props {
  cards: OwnedCard[];
  onSelect: (card: OwnedCard) => void;
}

export function ResultsGrid({ cards, onSelect }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {cards.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c)}
          className="group relative text-left"
          title={c.scryfall?.name ?? c.card_name}
        >
          {c.scryfall?.image_small ? (
            <img
              src={c.scryfall.image_small}
              alt={c.scryfall.name ?? c.card_name}
              loading="lazy"
              className="w-full rounded-lg transition group-hover:brightness-110"
            />
          ) : (
            <div className="flex aspect-[5/7] items-center justify-center rounded-lg bg-zinc-800 p-2 text-center text-xs text-zinc-400">
              {c.card_name}
            </div>
          )}
          <span className="absolute right-1 top-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-semibold">
            ×{c.quantity}
          </span>
          {c.location_name && (
            <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-zinc-300">
              {c.location_name}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
