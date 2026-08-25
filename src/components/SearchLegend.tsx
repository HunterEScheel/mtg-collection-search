interface Entry {
  term: string;
  desc: string;
}

interface Group {
  title: string;
  entries: Entry[];
}

const GROUPS: Group[] = [
  {
    title: 'Text',
    entries: [
      { term: 'bolt', desc: 'Bare words match card names (ANDed together)' },
      { term: '"exact phrase"', desc: 'Quoted text matches verbatim' },
      { term: 'name:', desc: 'Card name contains text' },
      { term: 'o: / oracle:', desc: 'Rules text contains text (~ = the card’s own name)' },
      { term: 't: / type:', desc: 'Type line contains text' },
    ],
  },
  {
    title: 'Numbers & stats',
    entries: [
      { term: 'cmc / mv', desc: 'Mana value (cmc<=3, mv=2)' },
      { term: 'pow / tou / loy', desc: 'Power, toughness, loyalty (pow>=4). * never matches' },
      { term: 'm: / mana:', desc: 'Mana cost contains symbols (m:{G}{G})' },
    ],
  },
  {
    title: 'Colors',
    entries: [
      { term: 'c: / color:', desc: 'Card colors (c:rg = has R and G; c=rg exact; c:colorless, c:multi)' },
      { term: 'id: / identity:', desc: 'Color identity fits within (id<=gu = castable in Simic)' },
      { term: 'commander:', desc: 'Fits a commander deck of those colors AND commander-legal (commander:gruul)' },
    ],
  },
  {
    title: 'Printing',
    entries: [
      { term: 'r: / rarity:', desc: 'Rarity, ordered (r:rare, r>=rare)' },
      { term: 's: / set: / e:', desc: 'Exact set code (s:neo)' },
      { term: 'lang:', desc: 'Printed language (lang:ja)' },
    ],
  },
  {
    title: 'Your collection',
    entries: [
      { term: 'qty: / quantity:', desc: 'Copies owned (qty>=2)' },
      { term: 'loc: / location:', desc: 'Location name contains text' },
      { term: 'binder:', desc: 'Binder name from ManaBox/Dragon Shield imports' },
      { term: 'in:', desc: 'Card also exists (by name) in that location (loc:deck in:bulk); -in: negates' },
      { term: 'in:all', desc: 'Owned anywhere. With "My collection only" unchecked, -in:all finds Scryfall cards you don\'t have' },
      { term: 'usd / price:', desc: 'Price of your copy — foils use foil price (usd<5)' },
    ],
  },
  {
    title: 'Effects',
    entries: [
      { term: 'zone:graveyard', desc: 'Graveyard interaction: recursion, cast-from-yard mechanics, scaling, triggers (also gy, grave, yard)' },
      { term: 'zone:hand', desc: 'Hand interaction: discard, reveal, madness, cycling…' },
      { term: 'zone:library', desc: 'Library interaction: draw, tutor, scry, mill, top-of-library (also lib, deck)' },
      { term: 'zone:command', desc: 'Command zone / commander references, eminence' },
      { term: 'zone:battlefield', desc: 'Battlefield: enters/leaves triggers (also bf, play)' },
      { term: 'spawns:', desc: 'Creates tokens of a subtype (spawns:goblin)' },
    ],
  },
  {
    title: 'is: / not:',
    entries: [
      { term: 'is:foil / nonfoil / etched', desc: 'Finish of your copy' },
      { term: 'is:altered / misprint', desc: 'Flags on your copy' },
      { term: 'is:commander', desc: 'Can be your commander' },
      { term: 'is:dfc', desc: 'Double-faced card' },
      { term: 'is:fullart', desc: 'Full-art printing (also is:full)' },
      { term: 'is:land / creature', desc: 'Quick type checks' },
      { term: 'is:vanilla / frenchvanilla', desc: 'No abilities / keyword-only abilities' },
      { term: 'not:x', desc: 'Negates any is: value (not:foil)' },
    ],
  },
  {
    title: 'Combining',
    entries: [
      { term: 'a b', desc: 'Space = AND' },
      { term: 'a or b', desc: 'Either matches' },
      { term: '(a or b) c', desc: 'Parentheses group' },
      { term: '-a', desc: 'Negate a term (-t:land)' },
      { term: '= != < > <= >=', desc: 'Comparison operators where numeric/ordered' },
    ],
  },
];

interface Props {
  onClose: () => void;
}

/** Right-side drawer documenting every supported search term. */
export function SearchLegend({ onClose }: Props) {
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto bg-zinc-900 p-5 shadow-2xl ring-1 ring-zinc-700">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Search Syntax</h2>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">✕</button>
      </div>
      <div className="space-y-4">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {g.title}
            </h3>
            <dl className="space-y-1">
              {g.entries.map((e) => (
                <div key={e.term} className="grid grid-cols-[8.5rem_1fr] gap-2 text-sm">
                  <dt className="break-words font-mono text-xs leading-5 text-indigo-300">
                    {e.term}
                  </dt>
                  <dd className="text-xs leading-5 text-zinc-300">{e.desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
