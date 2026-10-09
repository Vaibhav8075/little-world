import type { Collection } from '../types';
import { getDB } from './db';
import { addTombstone } from './storage/syncMeta';

export const INITIAL_COLLECTIONS: Collection[] = [
  {
    id: 'col-story',
    name: 'Our Story',
    description: 'Milestones, beginnings, and promises made.',
    icon: 'Heart',
    accentColor: '#D98A7A',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-trips',
    name: 'Trips & Getaways',
    description: 'Beaches, misty mountains, and unplanned detours.',
    icon: 'Compass',
    accentColor: '#4A90E2',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-cozy',
    name: 'Cozy & Everyday',
    description: 'Rainy afternoons, slow coffee, and quiet laughter.',
    icon: 'Coffee',
    accentColor: '#D49A4C',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-food',
    name: 'Food & Dinners',
    description: 'Little hidden cafes, midnight snacks, and burned pasta.',
    icon: 'Utensils',
    accentColor: '#E67E22',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-photo',
    name: '35mm Film & Portraits',
    description: 'Grainy film rolls and stolen candid moments.',
    icon: 'Camera',
    accentColor: '#8E44AD',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-college',
    name: 'College & Nostalgia',
    description: 'Campus walks, library glances, and early years.',
    icon: 'GraduationCap',
    accentColor: '#27AE60',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-music',
    name: 'Music & Concerts',
    description: 'Live shows, songs on repeat, and acoustic chords.',
    icon: 'Music',
    accentColor: '#E91E63',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'col-adventures',
    name: 'Adventures & Hikes',
    description: 'Reaching summits, getting lost, and catching sunsets.',
    icon: 'Mountain',
    accentColor: '#16A085',
    isSystem: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
];

export class CollectionService {
  static async initializeCollections(): Promise<Collection[]> {
    const db = await getDB();
    const existing = await db.getAll('collections');
    if (existing.length === 0) {
      const tx = db.transaction('collections', 'readwrite');
      for (const col of INITIAL_COLLECTIONS) {
        await tx.store.put(col);
      }
      await tx.done;
      return INITIAL_COLLECTIONS;
    }
    return existing;
  }

  static async getAll(): Promise<Collection[]> {
    const db = await getDB();
    return db.getAll('collections');
  }

  static async getById(id: string): Promise<Collection | undefined> {
    const db = await getDB();
    return db.get('collections', id);
  }

  static async create(collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
    const db = await getDB();
    const now = new Date().toISOString();
    const newCol: Collection = {
      ...collection,
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    await db.put('collections', newCol);
    return newCol;
  }

  static async update(id: string, updates: Partial<Collection>): Promise<Collection | null> {
    const db = await getDB();
    const existing = await db.get('collections', id);
    if (!existing) return null;

    const updated: Collection = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await db.put('collections', updated);
    return updated;
  }

  static async delete(id: string): Promise<boolean> {
    const db = await getDB();
    const existing = await db.get('collections', id);
    if (!existing) return false;
    // Memories stay; they just leave the album.
    const tx = db.transaction(['collections', 'memories'], 'readwrite');
    const memStore = tx.objectStore('memories');
    for (const mem of await memStore.getAll()) {
      if (mem.collectionId === id) {
        await memStore.put({ ...mem, collectionId: undefined, momentId: undefined, updatedAt: new Date().toISOString() });
      }
    }
    await tx.objectStore('collections').delete(id);
    await tx.done;
    await addTombstone('collections', id);
    return true;
  }
}
