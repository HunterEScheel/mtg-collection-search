import { useMemo, useState } from 'react';
import type { OwnedCard } from '../types';
import { ownedPrice } from '../lib/scryfall';

type SortKey = 'name' | 'set' | 'foil' | 'condition' | 'qty' | 'location' | 'price';

interface Props {
  cards: OwnedCard[];
  onSelect: (card: OwnedCard) => void;
}

const getters: Record<SortKey, (c: OwnedCard) => string | number> = {
  name: (c) => (c.scryfall?.name ?? c.card_name).toLowerCase(),
  set: (c) => c.set_code ?? '',
  foil: (c) => c.foil ?? '',
  condition: (c) => c.condition ?? '',
  qty: (c) => c.quantity,
  location: (c) => c.location_name,
  price: (c) => ownedPrice(c) ?? -1,
};

export function ResultsTable({ cards, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const sorted = useMemo(() => {
    const get = getters[sortKey];
    return [...cards].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return asc ? r : -r;
    });
  }, [cards, sortKey, asc]);

  const header = (key: SortKey, label: string, align = 'text-left') => (
    <th
      className={`cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-200 ${align}`}
      onClick={() => {
        if (sortKey === key) setAsc(!asc);
        else { setSortKey(key); setAsc(true); }
      }}
    >
      {label}{sortKey === key ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900">
          <tr>
            {header('name', 'Name')}
            {header('set', 'Set')}
            <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">#</th>
            {header('foil', 'Foil')}
            {header('condition', 'Cond')}
            {header('qty', 'Qty', 'text-right')}
            {header('location', 'Location')}
            {header('price', 'Price', 'text-right')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const price = ownedPrice(c);
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-1.5">{c.scryfall?.name ?? c.card_name}</td>
                <td className="px-3 py-1.5 uppercase text-zinc-400">{c.set_code}</td>
                <td className="px-3 py-1.5 text-zinc-400">{c.collector_number}</td>
                <td className="px-3 py-1.5 text-zinc-400">{c.foil === 'normal' ? '' : c.foil}</td>
                <td className="px-3 py-1.5 text-zinc-400">{c.condition?.replaceAll('_', ' ')}</td>
                <td className="px-3 py-1.5 text-right">{c.quantity}</td>
                <td className="px-3 py-1.5 text-zinc-400">{c.location_name}</td>
                <td className="px-3 py-1.5 text-right text-zinc-400">
                  {price !== null ? `$${price.toFixed(2)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
