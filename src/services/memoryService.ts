import type { Memory, MemoryFilter, User } from '../types';
import { AuthService } from './authService';
import { getDB } from './db';
import { addTombstone } from './storage/syncMeta';
import { DEMO_MEMORIES } from './demoData';
import { INITIAL_COLLECTIONS } from './collectionService';

export class MemoryService {
  static async initializeMemories(): Promise<Memory[]> {
    const db = await getDB();
    const existing = await db.getAll('memories');
    if (existing.length === 0) {
      const tx = db.transaction('memories', 'readwrite');
      for (const mem of DEMO_MEMORIES) {
        await tx.store.put(mem);
      }
      await tx.done;
      return DEMO_MEMORIES;
    }

    // One demo photo URL went dead upstream; repoint saved copies to its replacement.
    const DEAD = 'photo-1517840905240-472988babdf9';
    const stale = existing.filter((m) => m.media.some((i) => i.url.includes(DEAD)));
    if (stale.length > 0) {
      const swap = (u?: string) => u?.replace(DEAD, 'photo-1515694346937-94d85e41e6f0');
      const tx = db.transaction('memories', 'readwrite');
      for (const mem of stale) {
        mem.media = mem.media.map((i) => ({
          ...i,
          url: swap(i.url)!,
          thumbnailUrl: swap(i.thumbnailUrl),
          mediumUrl: swap(i.mediumUrl),
          largeUrl: swap(i.largeUrl),
        }));
        await tx.store.put(mem);
      }
      await tx.done;
    }
    return existing;
  }

  static async getAll(currentUser: User | null): Promise<Memory[]> {
    const db = await getDB();
    const all = await db.getAll('memories');
    const visible = all.filter((mem) => AuthService.canUserView(currentUser, mem));
    return Promise.all(visible.map((mem) => this.hydrateLocalUrls(mem)));
  }

  /**
   * Videos are stored with a `blob:` URL that dies when the page reloads. Recreate it from the
   * original file kept in IndexedDB (cached per media item so repeated loads don't leak URLs).
   */
  private static objectUrls = new Map<string, string>();

  private static async hydrateLocalUrls(mem: Memory): Promise<Memory> {
    if (!mem.media.some((m) => m.url.startsWith('blob:'))) return mem;
    const db = await getDB();
    const media = await Promise.all(
      mem.media.map(async (m) => {
        if (!m.url.startsWith('blob:')) return m;
        let url = this.objectUrls.get(m.id);
        if (!url) {
          const stored = await db.get('media_blobs', `${m.id}-orig`);
          if (!stored) return m;
          url = URL.createObjectURL(stored.blob);
          this.objectUrls.set(m.id, url);
        }
        return { ...m, url, largeUrl: url, thumbnailUrl: m.thumbnailUrl?.startsWith('blob:') ? url : m.thumbnailUrl, mediumUrl: m.mediumUrl?.startsWith('blob:') ? url : m.mediumUrl };
      })
    );
    return { ...mem, media };
  }

  static async getById(id: string, currentUser: User | null): Promise<Memory | null> {
    const db = await getDB();
    const memory = await db.get('memories', id);
    if (!memory) return null;

    if (!AuthService.canUserView(currentUser, memory)) {
      return null;
    }
    return memory;
  }

  static async create(
    memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Memory> {
    const db = await getDB();
    const now = new Date().toISOString();
    const newMemory: Memory = {
      ...memory,
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };

    await db.put('memories', newMemory);
    return newMemory;
  }

  static async update(
    id: string,
    updates: Partial<Memory>,
    currentUser: User | null
  ): Promise<Memory | null> {
    const db = await getDB();
    const existing = await db.get('memories', id);
    if (!existing) return null;

    if (!AuthService.canUserEdit(currentUser, existing)) {
      throw new Error('Unauthorized to edit this memory');
    }

    // The caller's copy of `media` may predate a background Drive upload; keep the Drive fields
    // from the stored record so an edit doesn't trigger a duplicate upload.
    const media = updates.media
      ? updates.media.map((m) => {
          const stored = existing.media.find((s) => s.id === m.id);
          if (!stored?.driveFileId || m.driveFileId) return m;
          return {
            ...m,
            driveFileId: stored.driveFileId,
            driveFolderId: stored.driveFolderId,
            driveFolderName: stored.driveFolderName,
            syncStatus: stored.syncStatus,
            lastSyncedAt: stored.lastSyncedAt,
          };
        })
      : existing.media;

    const updated: Memory = {
      ...existing,
      ...updates,
      media,
      updatedAt: new Date().toISOString(),
    };

    await db.put('memories', updated);
    return updated;
  }

  static async delete(id: string, currentUser: User | null): Promise<boolean> {
    const db = await getDB();
    const existing = await db.get('memories', id);
    if (!existing) return false;

    if (!AuthService.canUserDelete(currentUser, existing)) {
      throw new Error('Unauthorized to delete this memory');
    }

    for (const item of existing.media) {
      try {
        await db.delete('media_blobs', `${item.id}-thumb`);
        await db.delete('media_blobs', `${item.id}-medium`);
        await db.delete('media_blobs', `${item.id}-orig`);
      } catch (err) {
        console.warn('Could not remove blob:', err);
      }
    }

    await db.delete('memories', id);
    await addTombstone('memories', id);
    return true;
  }

  static async toggleFavorite(id: string, currentUser: User | null): Promise<Memory | null> {
    const db = await getDB();
    const existing = await db.get('memories', id);
    if (!existing) return null;

    if (!AuthService.canUserView(currentUser, existing)) {
      return null;
    }

    const updated: Memory = {
      ...existing,
      isFavorite: !existing.isFavorite,
      updatedAt: new Date().toISOString(),
    };

    await db.put('memories', updated);
    return updated;
  }

  static async getOnThisDay(targetDate: Date = new Date(), currentUser: User | null): Promise<Memory[]> {
    const memories = await this.getAll(currentUser);
    const targetMonth = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    const targetDay = targetDate.getDate().toString().padStart(2, '0');
    const currentYear = targetDate.getFullYear();

    return memories.filter((mem) => {
      const parts = mem.date.split('-');
      if (parts.length >= 3) {
        const memYear = parseInt(parts[0], 10);
        const memMonth = parts[1];
        const memDay = parts[2];
        return memMonth === targetMonth && memDay === targetDay && memYear < currentYear;
      }
      return false;
    });
  }

  static async queryMemories(filter: MemoryFilter, currentUser: User | null): Promise<Memory[]> {
    let list = await this.getAll(currentUser);

    if (filter.query && filter.query.trim().length > 0) {
      const q = filter.query.toLowerCase().trim();
      list = list.filter((m) => {
        const inTitle = m.title.toLowerCase().includes(q);
        const inStory = m.story.toLowerCase().includes(q);
        const inTags = m.tags.some((t) => t.toLowerCase().includes(q));
        const inLoc = m.location?.name.toLowerCase().includes(q) || m.location?.city?.toLowerCase().includes(q);
        return inTitle || inStory || inTags || inLoc;
      });
    }

    if (filter.mediaType && filter.mediaType !== 'all') {
      if (filter.mediaType === 'photos') {
        list = list.filter((m) => m.media.some((item) => item.type === 'photo'));
      } else if (filter.mediaType === 'videos') {
        list = list.filter((m) => m.media.some((item) => item.type === 'video'));
      }
    }

    if (filter.collectionId) {
      list = list.filter((m) => m.collectionId === filter.collectionId);
    }

    if (filter.authorId && filter.authorId !== 'all') {
      list = list.filter((m) => m.authorId === filter.authorId);
    }

    if (filter.visibility && filter.visibility !== 'all') {
      list = list.filter((m) => m.visibility === filter.visibility);
    }

    if (filter.isFavorite !== undefined && filter.isFavorite) {
      list = list.filter((m) => m.isFavorite);
    }

    if (filter.mood && filter.mood !== 'all') {
      list = list.filter((m) => m.mood === filter.mood);
    }

    if (filter.tag) {
      list = list.filter((m) => m.tags.includes(filter.tag!));
    }

    if (filter.year) {
      list = list.filter((m) => m.date.startsWith(`${filter.year}`));
    }

    if (filter.month && filter.year) {
      const monthStr = filter.month.toString().padStart(2, '0');
      list = list.filter((m) => m.date.startsWith(`${filter.year}-${monthStr}`));
    }

    const sortBy = filter.sortBy || 'date-desc';
    list.sort((a, b) => {
      if (sortBy === 'date-desc') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'date-asc') {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === 'created-desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'title-asc') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return list;
  }

  static async getRelatedMemories(
    currentMemory: Memory,
    currentUser: User | null,
    limit: number = 4
  ): Promise<Memory[]> {
    const all = await this.getAll(currentUser);

    const scored = all
      .filter((m) => m.id !== currentMemory.id)
      .map((m) => {
        let score = 0;
        if (m.collectionId && m.collectionId === currentMemory.collectionId) {
          score += 3;
        }
        const sharedTags = m.tags.filter((t) => currentMemory.tags.includes(t));
        score += sharedTags.length * 2;
        if (
          m.location &&
          currentMemory.location &&
          m.location.city &&
          m.location.city === currentMemory.location.city
        ) {
          score += 3;
        }
        const diffDays = Math.abs(
          (new Date(m.date).getTime() - new Date(currentMemory.date).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (diffDays <= 30) {
          score += 1;
        }

        return { memory: m, score };
      });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.memory);
  }

  static async resetToDemo(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(['memories', 'collections', 'media_blobs'], 'readwrite');
    await tx.objectStore('memories').clear();
    await tx.objectStore('collections').clear();
    await tx.objectStore('media_blobs').clear();

    for (const mem of DEMO_MEMORIES) {
      await tx.objectStore('memories').put(mem);
    }
    for (const col of INITIAL_COLLECTIONS) {
      await tx.objectStore('collections').put(col);
    }

    await tx.done;
  }
}
