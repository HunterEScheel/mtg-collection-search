import { useEffect, useRef } from 'react';
import type { Location, OwnedCard } from '../types';

export interface CardMenuState {
  card: OwnedCard;
  x: number;
  y: number;
}

interface Props {
  menu: CardMenuState;
  /** Locations the card can be moved to (current one is filtered out here). */
  locations: Location[];
  busy: boolean;
  onViewDetails: (card: OwnedCard) => void;
  onMove: (card: OwnedCard, destId: string) => void;
  onClose: () => void;
}

/**
 * Right-click menu for a card in the results. Built as a general action menu
 * so future card actions slot in as new sections.
 */
export function CardContextMenu({ menu, locations, busy, onViewDetails, onMove, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Keep the menu on-screen near the click point.
  const style: React.CSSProperties = {
    left: Math.min(menu.x, window.innerWidth - 240),
    top: Math.min(menu.y, window.innerHeight - 300),
  };

  const targets = locations.filter((l) => l.id !== menu.card.collection_id);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
    >
      <div
        ref={ref}
        style={style}
        onClick={(e) => e.stopPropagation()}
        className="absolute w-56 overflow-hidden rounded-md bg-zinc-900 py-1 text-sm shadow-2xl ring-1 ring-zinc-700"
      >
        <p className="truncate px-3 py-1.5 text-xs font-semibold text-zinc-400">
          {menu.card.scryfall?.name ?? menu.card.card_name}
        </p>
        <button
          onClick={() => { onViewDetails(menu.card); onClose(); }}
          className="block w-full px-3 py-1.5 text-left hover:bg-zinc-800"
        >
          View details
        </button>
        <div className="my-1 h-px bg-zinc-800" />
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Move to
        </p>
        {targets.length === 0 && (
          <p className="px-3 py-1.5 text-xs text-zinc-500">No other locations</p>
        )}
        {targets.map((l) => (
          <button
            key={l.id}
            disabled={busy}
            onClick={() => onMove(menu.card, l.id)}
            className="block w-full truncate px-3 py-1.5 text-left hover:bg-zinc-800 disabled:opacity-40"
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}
