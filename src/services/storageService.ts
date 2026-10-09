import type { StorageStats, Memory, Collection } from '../types';
import { getDB } from './db';
import { GoogleDriveService } from './storage/GoogleDriveService';

export class StorageService {
  static async getStorageStats(
    memories: Memory[],
    collections: Collection[]
  ): Promise<StorageStats> {
    let usedBytes = 0;
    let totalQuotaBytes = 500 * 1024 * 1024;

    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.usage !== undefined) usedBytes = estimate.usage;
        if (estimate.quota !== undefined) totalQuotaBytes = estimate.quota;
      } catch (err) {
        console.warn('Storage estimate failed:', err);
      }
    }

    let photoCount = 0;
    let videoCount = 0;

    memories.forEach((mem) => {
      mem.media.forEach((item) => {
        if (item.type === 'video') videoCount++;
        else photoCount++;
      });
    });

    const usagePercentage = totalQuotaBytes > 0 ? (usedBytes / totalQuotaBytes) * 100 : 0;

    return {
      usedBytes,
      totalQuotaBytes,
      usagePercentage,
      memoryCount: memories.length,
      photoCount,
      videoCount,
      collectionCount: collections.length,
    };
  }

  static async getGoogleDriveStorageInfo() {
    return GoogleDriveService.fetchStorageQuota();
  }

  static async exportBackupJSON(): Promise<void> {
    const db = await getDB();
    const memories = await db.getAll('memories');
    const collections = await db.getAll('collections');
    const users = await db.getAll('users');
    const settings = await db.get('settings', 'app_settings' as any);

    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      app: 'Our Little World',
      data: {
        users,
        // Never write the Google access token into a file.
        settings: settings?.googleDrive
          ? { ...settings, googleDrive: { ...settings.googleDrive, accessToken: undefined, expiresAt: undefined } }
          : settings,
        collections,
        memories,
      },
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `our-little-world-backup-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static async importBackupJSON(file: File): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.data || !Array.isArray(parsed.data.memories)) {
        return { success: false, error: 'Invalid backup file format.' };
      }

      const db = await getDB();
      const tx = db.transaction(['memories', 'collections', 'users', 'settings'], 'readwrite');

      if (Array.isArray(parsed.data.collections)) {
        for (const col of parsed.data.collections) {
          if (col.id && col.name) {
            await tx.objectStore('collections').put(col);
          }
        }
      }

      if (Array.isArray(parsed.data.users)) {
        for (const u of parsed.data.users) {
          if (u.id && u.name) {
            await tx.objectStore('users').put(u);
          }
        }
      }

      if (parsed.data.settings) {
        // Keep this device's Drive connection rather than the one in the file.
        const current = await tx.objectStore('settings').get('app_settings');
        await tx.objectStore('settings').put(
          { ...parsed.data.settings, googleDrive: current?.googleDrive ?? parsed.data.settings.googleDrive },
          'app_settings'
        );
      }

      let memoryCount = 0;
      for (const mem of parsed.data.memories) {
        if (mem.id && mem.title && Array.isArray(mem.media)) {
          await tx.objectStore('memories').put(mem);
          memoryCount++;
        }
      }

      await tx.done;
      return { success: true, count: memoryCount };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to parse backup JSON' };
    }
  }

  static formatBytes(bytes: number, decimals: number = 1): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}
