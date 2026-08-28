import { describe, it, expect } from 'vitest';
import { commanderSlug } from './edhrec';

describe('commanderSlug', () => {
  it('lowercases and hyphenates, dropping punctuation', () => {
    expect(commanderSlug('Kibo, Uktabi Prince')).toBe('kibo-uktabi-prince');
    expect(commanderSlug("Ghired, Mirror of the Wilds")).toBe('ghired-mirror-of-the-wilds');
    expect(commanderSlug("Ashnod's Transmogrant")).toBe('ashnods-transmogrant');
  });

  it('uses the front face of DFC names', () => {
    expect(commanderSlug('Valki, God of Lies // Tibalt, Cosmic Impostor')).toBe('valki-god-of-lies');
  });

  it('strips diacritics', () => {
    expect(commanderSlug('Séance Keeper')).toBe('seance-keeper');
  });
});
