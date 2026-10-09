import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Memory, Collection, User, AppSettings } from '../types';

export interface StoredMediaBlob {
  id: string; // e.g. "media-1-thumb", "media-1-medium", "media-1-orig"
  mediaId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface LittleWorldDB extends DBSchema {
  memories: {
    key: string;
    value: Memory;
    indexes: {
      'by-date': string;
      'by-author': string;
      'by-collection': string;
      'by-visibility': string;
      'by-favorite': number;
    };
  };
  media_blobs: {
    key: string;
    value: StoredMediaBlob;
    indexes: {
      'by-media-id': string;
    };
  };
  collections: {
    key: string;
    value: Collection;
  };
  users: {
    key: string;
    value: User;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  /** Bookkeeping for Drive sync: deletion records, last-seen manifest version. */
  sync_meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'our_little_world_db';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<LittleWorldDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<LittleWorldDB>> {
  if (!dbPromise) {
    dbPromise = openDB<LittleWorldDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Memories Store
        if (!db.objectStoreNames.contains('memories')) {
          const memoryStore = db.createObjectStore('memories', { keyPath: 'id' });
          memoryStore.createIndex('by-date', 'date');
          memoryStore.createIndex('by-author', 'authorId');
          memoryStore.createIndex('by-collection', 'collectionId');
          memoryStore.createIndex('by-visibility', 'visibility');
          memoryStore.createIndex('by-favorite', 'isFavorite');
        }

        // Media Blobs Store
        if (!db.objectStoreNames.contains('media_blobs')) {
          const mediaStore = db.createObjectStore('media_blobs', { keyPath: 'id' });
          mediaStore.createIndex('by-media-id', 'mediaId');
        }

        // Collections Store
        if (!db.objectStoreNames.contains('collections')) {
          db.createObjectStore('collections', { keyPath: 'id' });
        }

        // Users Store
        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings');
        }

        // v2: sync bookkeeping
        if (!db.objectStoreNames.contains('sync_meta')) {
          db.createObjectStore('sync_meta');
        }
      },
    });
  }
  return dbPromise;
}
