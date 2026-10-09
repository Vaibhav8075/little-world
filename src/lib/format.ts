import type { MediaItem, Memory, User } from '../types';

/** Parse a `YYYY-MM-DD` string as a local date (new Date('YYYY-MM-DD') is UTC and can shift a day). */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
  if (!y) return new Date(value);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDate(
  value: string,
  style: 'short' | 'long' | 'full' | 'month-day' = 'long'
): string {
  const date = parseLocalDate(value);
  const options: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : style === 'full'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'month-day'
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('en-GB', options);
}

export function placeName(memory: Memory): string | undefined {
  return memory.location?.city || memory.location?.name;
}

export function authorOf(memory: Memory, partner1: User | null, partner2: User | null): User | null {
  if (partner1 && memory.authorId === partner1.id) return partner1;
  if (partner2 && memory.authorId === partner2.id) return partner2;
  return null;
}

export function coverOf(memory: Memory | undefined): MediaItem | undefined {
  if (!memory) return undefined;
  return memory.media.find((m) => m.id === memory.coverMediaId) || memory.media[0];
}

export function imageSrc(item: MediaItem | undefined, size: 'thumb' | 'medium' | 'large'): string | undefined {
  if (!item) return undefined;
  if (size === 'thumb') return item.thumbnailUrl || item.mediumUrl || item.url;
  if (size === 'medium') return item.mediumUrl || item.largeUrl || item.url;
  return item.largeUrl || item.url;
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}
