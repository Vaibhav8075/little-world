import { getDB } from '../db';

export interface Tombstones {
  /** id → ISO time it was deleted */
  memories: Record<string, string>;
  collections: Record<string, string>;
}

export const emptyTombstones = (): Tombstones => ({ memories: {}, collections: {} });

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get('sync_meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('sync_meta', value, key);
}

export async function getTombstones(): Promise<Tombstones> {
  return { ...emptyTombstones(), ...((await getMeta<Tombstones>('tombstones')) || {}) };
}

/** Remember a deletion so other devices delete it too instead of syncing it back. */
export async function addTombstone(kind: keyof Tombstones, id: string): Promise<void> {
  const t = await getTombstones();
  t[kind] = { ...t[kind], [id]: new Date().toISOString() };
  await setMeta('tombstones', t);
}
