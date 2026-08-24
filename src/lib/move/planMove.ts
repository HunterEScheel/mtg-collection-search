import type { MoveLine, MovePlan, OwnedCard, Transfer } from '../../types';

const isFoilRow = (c: OwnedCard) => c.foil !== null && c.foil !== 'normal';

// Moxfield decklists separate DFC faces with " / ", Scryfall with " // ".
const normalizeName = (name: string) =>
  name.toLowerCase().replace(/\s+\/{1,2}\s+/g, ' // ').trim();

function nameMatches(line: MoveLine, c: OwnedCard): boolean {
  const owned = normalizeName(c.scryfall?.name ?? c.card_name);
  const wanted = normalizeName(line.name);
  if (owned === wanted) return true;
  // DFC: allow matching by front face on either side.
  const ownedFront = owned.split('//')[0].trim();
  const wantedFront = wanted.split('//')[0].trim();
  return ownedFront === wanted || owned === wantedFront || ownedFront === wantedFront;
}

/**
 * Match parsed move lines against the source location's rows, in memory.
 * Pure function: no I/O. Shortfall policy is move-what-exists.
 */
export function planMove(
  lines: MoveLine[],
  sourceCards: OwnedCard[],
  malformed: { line: number; reason: string }[] = [],
): MovePlan {
  // Remaining quantity per source row, shared across lines so duplicate
  // lines can never consume the same copies twice.
  const remaining = new Map<number, number>(sourceCards.map((c) => [c.id, c.quantity]));
  const transfers: Transfer[] = [];
  const reportLines: MovePlan['report']['lines'] = [];

  for (const line of lines) {
    const byName = sourceCards.filter((c) => nameMatches(line, c));
    const notFound = byName.length === 0;

    let candidates = line.foil === true ? byName.filter(isFoilRow) : byName;

    // Printing restriction: only if the requested set actually exists at the
    // source; otherwise fall back to any printing (flagged).
    let printingFallback = false;
    if (line.setCode) {
      const inSet = candidates.filter((c) => c.set_code === line.setCode);
      if (inSet.length > 0) candidates = inSet;
      else if (candidates.length > 0) printingFallback = true;
    }

    // Consumption order: exact set+collector first, then same set, then the
    // rest; nonfoil before foil when foil was unspecified (protect foils);
    // stable id order last.
    const tier = (c: OwnedCard): number => {
      if (
        line.setCode &&
        c.set_code === line.setCode &&
        line.collectorNumber &&
        c.collector_number === line.collectorNumber
      ) return 0;
      if (line.setCode && c.set_code === line.setCode) return 1;
      return 2;
    };
    const ordered = [...candidates].sort((a, b) => {
      const t = tier(a) - tier(b);
      if (t !== 0) return t;
      if (line.foil === null) {
        const f = Number(isFoilRow(a)) - Number(isFoilRow(b));
        if (f !== 0) return f;
      }
      return a.id - b.id;
    });

    let needed = line.quantity;
    for (const row of ordered) {
      if (needed <= 0) break;
      const avail = remaining.get(row.id) ?? 0;
      if (avail <= 0) continue;
      const qty = Math.min(avail, needed);
      transfers.push({ sourceRow: row, qty });
      remaining.set(row.id, avail - qty);
      needed -= qty;
    }

    const moved = line.quantity - needed;
    reportLines.push({
      line,
      requested: line.quantity,
      moved,
      short: needed,
      notFound,
      printingFallback: printingFallback && moved > 0,
    });
  }

  return { transfers, report: { lines: reportLines, malformed } };
}
