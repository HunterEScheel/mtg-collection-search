import Papa from 'papaparse';
import { detectFormat } from '../manabox/formats';
import { parseCollectionCsv } from '../manabox/parse';
import type { MoveLine } from '../../types';

export interface ParsedMoveList {
  lines: MoveLine[];
  malformed: { line: number; reason: string }[];
}

// Moxfield/Arena-style text line: `2 Lightning Bolt (2XM) 123 *F*`
// Count, set, collector number, and foil marker are all optional.
const LINE_RE =
  /^(?:(\d+)x?\s+)?(.+?)(?:\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?)?(?:\s+\*(F|E)\*)?$/i;

function parseTextLines(text: string): ParsedMoveList {
  const lines: MoveLine[] = [];
  const malformed: { line: number; reason: string }[] = [];

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('#')) return;

    const m = LINE_RE.exec(line);
    // A "name" that is just digits (e.g. a stray count) is not a card line.
    if (!m || !m[2]?.trim() || /^\d+x?$/i.test(m[2].trim())) {
      malformed.push({ line: idx + 1, reason: `Could not parse "${line}"` });
      return;
    }
    const [, count, name, set, collector, foilMark] = m;
    const quantity = count ? parseInt(count, 10) : 1;
    if (quantity < 1) {
      malformed.push({ line: idx + 1, reason: `Invalid count in "${line}"` });
      return;
    }
    lines.push({
      quantity,
      name: name.trim(),
      setCode: set ? set.toLowerCase() : null,
      collectorNumber: collector ?? null,
      foil: foilMark ? true : null,
    });
  });

  return { lines, malformed };
}

/**
 * Parse a pasted move list. Primary format is the Moxfield text list; if the
 * first line matches a known collection-CSV header (ManaBox, Moxfield, Dragon
 * Shield, TCGplayer, Deckbox), the whole text is parsed as that CSV instead.
 */
export function parseMoveList(text: string): ParsedMoveList {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '');
  if (firstLine) {
    const header = Papa.parse<string[]>(firstLine.trim(), { header: false });
    const headers = (header.data[0] ?? []).map((h) => (typeof h === 'string' ? h.trim() : ''));
    if (detectFormat(headers)) {
      const { rows, malformed } = parseCollectionCsv(text);
      return {
        lines: rows.map((r) => ({
          quantity: r.quantity,
          name: r.card_name,
          setCode: r.set_code,
          collectorNumber: r.collector_number,
          foil: r.foil !== null && r.foil !== 'normal' ? true : null,
        })),
        malformed,
      };
    }
  }
  return parseTextLines(text);
}
