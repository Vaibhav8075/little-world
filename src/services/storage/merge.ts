import type { Collection, MediaItem, Memory, User } from '../../types';
import type { Tombstones } from './syncMeta';

/** What both sides of a sync look like. `remote` comes from Shared/Metadata/our-little-world.json. */
export interface SyncState {
  memories: Memory[];
  collections: Collection[];
  users: User[];
  tombstones: Tombstones;
}

export interface MergePlan {
  putMemories: Memory[];
  removeMemories: string[];
  putCollections: Collection[];
  removeCollections: string[];
  putUsers: User[];
  /** Media that disappeared from local memories; their stored copies can be deleted. */
  orphanedMediaIds: string[];
  tombstones: Tombstones;
}

const URL_FIELDS = ['url', 'thumbnailUrl', 'mediumUrl', 'largeUrl'] as const;
const DRIVE_FIELDS = ['driveFileId', 'driveFolderId', 'driveFolderName', 'syncStatus', 'lastSyncedAt'] as const;

const newer = (a?: string, b?: string) => (a || '') > (b || '');

function unionTombstones(a: Tombstones, b: Partial<Tombstones> | undefined): Tombstones {
  const out: Tombstones = { memories: { ...a.memories }, collections: { ...a.collections } };
  for (const kind of ['memories', 'collections'] as const) {
    for (const [id, at] of Object.entries(b?.[kind] || {})) {
      if (newer(at, out[kind][id])) out[kind][id] = at;
    }
  }
  return out;
}

/**
 * The manifest strips inline image data, so a remote media item may arrive without URLs. Keep whatever
 * this device can already display, and take Drive file info from whichever side has it.
 */
function mergeMedia(winner: MediaItem[], other: MediaItem[], local: MediaItem[]): MediaItem[] {
  return winner.map((item) => {
    const o = other.find((m) => m.id === item.id);
    const l = local.find((m) => m.id === item.id);
    const merged: MediaItem = { ...item };
    if (!merged.driveFileId && o?.driveFileId) {
      for (const f of DRIVE_FIELDS) (merged as unknown as Record<string, unknown>)[f] = o[f];
    }
    if (l) {
      for (const f of URL_FIELDS) {
        if (l[f]) (merged as unknown as Record<string, unknown>)[f] = l[f];
      }
    }
    if (!merged.url) merged.url = '';
    return merged;
  });
}

/** JSON with sorted keys and no undefined values, so equal data always compares equal across devices. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : v
  );
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Last-writer-wins merge by `updatedAt`, with deletion records so deletes propagate instead of reviving. */
export function planMerge(local: SyncState, remote: Partial<SyncState> | null): MergePlan {
  const tombstones = unionTombstones(local.tombstones, remote?.tombstones);
  const plan: MergePlan = {
    putMemories: [],
    removeMemories: [],
    putCollections: [],
    removeCollections: [],
    putUsers: [],
    orphanedMediaIds: [],
    tombstones,
  };

  // ---- memories ----
  const localMem = new Map(local.memories.map((m) => [m.id, m]));
  const remoteMem = new Map((remote?.memories || []).map((m) => [m.id, m]));
  for (const id of new Set([...localMem.keys(), ...remoteMem.keys()])) {
    const L = localMem.get(id);
    const R = remoteMem.get(id);
    const deletedAt = tombstones.memories[id];
    const lastEdit = [L?.updatedAt, R?.updatedAt].reduce((a, b) => (newer(b, a) ? b : a), '');

    if (deletedAt && !newer(lastEdit, deletedAt)) {
      if (L) {
        plan.removeMemories.push(id);
        plan.orphanedMediaIds.push(...L.media.map((m) => m.id));
      }
      continue;
    }
    if (deletedAt) delete tombstones.memories[id]; // edited after the delete: keep it

    if (!R) continue; // only here; it'll be pushed
    if (!L) {
      plan.putMemories.push({ ...R, media: mergeMedia(R.media, [], []) });
      continue;
    }
    const winner = newer(R.updatedAt, L.updatedAt) ? R : L;
    const other = winner === R ? L : R;
    const merged: Memory = { ...winner, media: mergeMedia(winner.media, other.media, L.media) };
    if (!same(merged, L)) {
      plan.putMemories.push(merged);
      const kept = new Set(merged.media.map((m) => m.id));
      plan.orphanedMediaIds.push(...L.media.filter((m) => !kept.has(m.id)).map((m) => m.id));
    }
  }

  // ---- collections ----
  const localCol = new Map(local.collections.map((c) => [c.id, c]));
  const remoteCol = new Map((remote?.collections || []).map((c) => [c.id, c]));
  for (const id of new Set([...localCol.keys(), ...remoteCol.keys()])) {
    const L = localCol.get(id);
    const R = remoteCol.get(id);
    const deletedAt = tombstones.collections[id];
    const lastEdit = newer(R?.updatedAt, L?.updatedAt) ? R?.updatedAt : L?.updatedAt;

    if (deletedAt && !newer(lastEdit, deletedAt)) {
      if (L) plan.removeCollections.push(id);
      continue;
    }
    if (deletedAt) delete tombstones.collections[id];
    if (R && (!L || (newer(R.updatedAt, L.updatedAt) && !same(R, L)))) plan.putCollections.push(R);
  }

  // ---- profiles (names, PINs) ----
  for (const R of remote?.users || []) {
    const L = local.users.find((u) => u.id === R.id);
    if (newer(R.updatedAt, L?.updatedAt)) plan.putUsers.push({ ...(L || {}), ...R });
  }

  return plan;
}

/** Stable, comparable form of a manifest (ignores the export timestamp and ordering). */
export function manifestFingerprint(m: Partial<SyncState> | null): string {
  if (!m) return '';
  const byId = <T extends { id: string }>(xs: T[] = []) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return canonical({
    memories: byId(m.memories),
    collections: byId(m.collections),
    users: byId(m.users),
    tombstones: m.tombstones || { memories: {}, collections: {} },
  });
}
