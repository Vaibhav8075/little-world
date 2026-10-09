import type { CloudSyncState, MediaItem, Memory } from '../../types';
import { GoogleDriveService, DriveAuthError, sanitizeManifest } from './GoogleDriveService';
import type { DriveManifest } from './GoogleDriveService';
import { getDB } from '../db';
import { MediaService } from '../mediaService';
import { planMerge, manifestFingerprint } from './merge';
import { getMeta, setMeta, getTombstones } from './syncMeta';

type SyncListener = (state: CloudSyncState) => void;

type Task =
  | { kind: 'upload'; memoryId: string; mediaId: string; retries: number }
  | { kind: 'download'; memoryId: string; mediaId: string; retries: number }
  | { kind: 'move'; memoryId: string; mediaId: string; retries: number }
  | { kind: 'trash'; fileId: string; retries: number };

const MAX_RETRIES = 3;
const AUTO_SYNC_MS = 60_000;
const TRASH_KEY = 'our_little_world_drive_trash';

const taskKey = (t: Task) => (t.kind === 'trash' ? `trash:${t.fileId}` : `${t.kind}:${t.mediaId}`);

/**
 * Two-way sync with Google Drive. Each run:
 *   1. pulls Shared/Metadata/our-little-world.json (if it changed) and merges it into IndexedDB,
 *   2. uploads new local photos, downloads photos added on the other device, fixes misplaced files,
 *      trashes files of deleted memories,
 *   3. writes the manifest back if this device has anything the other one doesn't.
 * Work is derived from IndexedDB every run, so nothing is lost if the tab closes mid-sync.
 */
export class SyncEngine {
  private static listeners = new Set<SyncListener>();
  private static dataListeners = new Set<() => void>();
  private static queue: Task[] = [];
  private static running: Promise<void> | null = null;
  private static again = false;
  private static initialized = false;
  private static autoTimer: number | null = null;
  /** Downloads that failed repeatedly this session (e.g. a HEIC photo this browser can't decode). */
  private static skipDownloads = new Set<string>();
  private static state: CloudSyncState = { status: 'idle', pendingUploads: 0, progress: 0 };

  static init() {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;
    window.addEventListener('online', () => this.syncAll());
    window.addEventListener('offline', () => this.updateState({ status: 'offline' }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.autoTimer !== null) this.syncAll();
    });
  }

  /** Poll for the other device's changes while the app is open. */
  static startAutoSync() {
    if (this.autoTimer !== null) return;
    this.autoTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') this.syncAll();
    }, AUTO_SYNC_MS);
  }

  static stopAutoSync() {
    if (this.autoTimer !== null) window.clearInterval(this.autoTimer);
    this.autoTimer = null;
  }

  static subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Fires after sync changes IndexedDB (new memories from the other device, Drive IDs, profiles…). */
  static onDataChanged(listener: () => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  static getState(): CloudSyncState {
    return this.state;
  }

  private static updateState(partial: Partial<CloudSyncState>) {
    this.state = {
      ...this.state,
      ...partial,
      pendingUploads: this.queue.filter((t) => t.kind === 'upload').length,
      pendingDownloads: this.queue.filter((t) => t.kind === 'download').length,
    };
    this.listeners.forEach((l) => l(this.state));
  }

  static setConnected(connected: boolean) {
    if (!connected) {
      this.stopAutoSync();
      this.queue = [];
      this.updateState({ status: 'idle', needsReauth: false, errorMessage: undefined, progress: 0 });
    } else {
      this.updateState({ status: 'connected', needsReauth: false, errorMessage: undefined });
      this.startAutoSync();
    }
  }

  /** Remember Drive files to trash (persisted, so a later session can finish the job). */
  static queueTrash(fileIds: string[]) {
    if (fileIds.length === 0) return;
    const pending = new Set<string>(readTrash());
    fileIds.forEach((id) => pending.add(id));
    writeTrash([...pending]);
  }

  /** Run a sync now (or right after the one in progress). Safe to call often. */
  static syncAll(): Promise<void> {
    if (!GoogleDriveService.isConnected()) return Promise.resolve();
    if (GoogleDriveService.isTokenExpired()) {
      this.pauseForAuth();
      return Promise.resolve();
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.syncAll();
      }
    });
    return this.running;
  }

  private static pauseForAuth(message?: string) {
    this.updateState({
      status: 'error',
      needsReauth: true,
      errorMessage: message || 'Google sign-in expired. Reconnect to keep syncing.',
      currentFileName: undefined,
    });
  }

  private static async run() {
    if (!navigator.onLine) {
      this.updateState({ status: 'offline' });
      return;
    }

    let changed = false;
    let lastError: string | undefined;
    let busy = false;
    const setBusy = () => {
      if (!busy) this.updateState({ status: 'syncing', progress: 0, errorMessage: undefined, needsReauth: false });
      busy = true;
    };

    try {
      // 1. Pull
      const remoteMeta = await GoogleDriveService.findManifest();
      if (remoteMeta && remoteMeta.modifiedTime !== (await getMeta<string>('manifestModified'))) {
        setBusy();
        const remote = await GoogleDriveService.readManifest(remoteMeta.id);
        changed = (await this.applyRemote(remote)) || changed;
        await setMeta('manifestModified', remoteMeta.modifiedTime);
        await setMeta('manifestFingerprint', manifestFingerprint(remote));
      }

      // 2. Files
      await this.scan();
      if (this.queue.length > 0) setBusy();
      while (this.queue.length > 0) {
        const task = this.queue[0];
        try {
          changed = (await this.runTask(task)) || changed;
          this.queue.shift();
        } catch (err) {
          if (err instanceof DriveAuthError) throw err;
          task.retries++;
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(`Drive sync (${taskKey(task)}) failed:`, err);
          this.queue.shift();
          if (task.retries <= MAX_RETRIES) {
            this.queue.push(task);
            await new Promise((r) => setTimeout(r, 1000 * task.retries));
          } else if (task.kind === 'download') {
            this.skipDownloads.add(task.mediaId);
          }
        }
        this.updateState({});
      }

      // 3. Push, but only if the other device is missing something — and never over a newer remote.
      const local = await this.localManifest();
      const fingerprint = manifestFingerprint(sanitizeManifest(local));
      if (fingerprint !== (await getMeta<string>('manifestFingerprint'))) {
        const latest = await GoogleDriveService.findManifest();
        if (latest && remoteMeta && latest.modifiedTime !== remoteMeta.modifiedTime) {
          this.again = true; // the other device just wrote; merge that first
        } else {
          setBusy();
          const modified = await GoogleDriveService.syncManifest(local, latest?.id);
          await setMeta('manifestModified', modified);
          await setMeta('manifestFingerprint', fingerprint);
        }
      }
    } catch (err) {
      if (err instanceof DriveAuthError) {
        this.pauseForAuth(err.message);
        return;
      }
      lastError = err instanceof Error ? err.message : String(err);
      console.warn('Drive sync failed:', err);
    } finally {
      if (changed) this.dataListeners.forEach((l) => l());
    }

    this.updateState({
      status: lastError ? 'error' : 'connected',
      errorMessage: lastError ? `Some items didn’t sync: ${lastError}` : undefined,
      needsReauth: false,
      currentFileName: undefined,
      progress: 100,
      lastSyncTime: new Date().toISOString(),
    });
  }

  private static async localManifest(): Promise<DriveManifest> {
    const db = await getDB();
    const [users, settings, collections, memories, tombstones] = await Promise.all([
      db.getAll('users'),
      db.get('settings', 'app_settings'),
      db.getAll('collections'),
      db.getAll('memories'),
      getTombstones(),
    ]);
    return {
      users,
      settings: settings!,
      collections,
      memories,
      tombstones,
      exportedAt: new Date().toISOString(),
      version: 3,
    };
  }

  /** Merge the other device's manifest into IndexedDB. Returns true if anything changed. */
  private static async applyRemote(remote: DriveManifest): Promise<boolean> {
    const db = await getDB();
    const [memories, collections, users, tombstones] = await Promise.all([
      db.getAll('memories'),
      db.getAll('collections'),
      db.getAll('users'),
      getTombstones(),
    ]);
    const plan = planMerge(
      { memories, collections, users, tombstones },
      {
        memories: remote.memories || [],
        collections: remote.collections || [],
        users: remote.users || [],
        tombstones: remote.tombstones,
      }
    );

    const tx = db.transaction(['memories', 'collections', 'users', 'media_blobs'], 'readwrite');
    for (const m of plan.putMemories) await tx.objectStore('memories').put(m);
    for (const id of plan.removeMemories) await tx.objectStore('memories').delete(id);
    for (const c of plan.putCollections) await tx.objectStore('collections').put(c);
    for (const id of plan.removeCollections) await tx.objectStore('collections').delete(id);
    for (const u of plan.putUsers) await tx.objectStore('users').put(u);
    for (const id of plan.orphanedMediaIds) {
      for (const suffix of ['thumb', 'medium', 'orig']) await tx.objectStore('media_blobs').delete(`${id}-${suffix}`);
    }
    await tx.done;
    await setMeta('tombstones', plan.tombstones);

    return (
      plan.putMemories.length +
        plan.removeMemories.length +
        plan.putCollections.length +
        plan.removeCollections.length +
        plan.putUsers.length >
      0
    );
  }

  private static enqueue(task: Task) {
    const key = taskKey(task);
    if (!this.queue.some((t) => taskKey(t) === key)) this.queue.push(task);
  }

  private static async scan() {
    const db = await getDB();
    const memories = await db.getAll('memories');

    for (const mem of memories) {
      for (const item of mem.media) {
        if (!item.driveFileId) {
          // Only media created on this device has its original stored here (demo images are just URLs).
          if (await db.getKey('media_blobs', `${item.id}-orig`)) {
            this.enqueue({ kind: 'upload', memoryId: mem.id, mediaId: item.id, retries: 0 });
          }
          continue;
        }
        if (!item.url && !this.skipDownloads.has(item.id)) {
          // Added on the other device: fetch it so this device can show it.
          this.enqueue({ kind: 'download', memoryId: mem.id, mediaId: item.id, retries: 0 });
        }
        const target = GoogleDriveService.getTargetFolder(mem, item.type).folderId;
        // Only the author's device moves files, so two devices never fight over a file.
        if (target && item.driveFolderId !== target && (await db.getKey('media_blobs', `${item.id}-orig`))) {
          this.enqueue({ kind: 'move', memoryId: mem.id, mediaId: item.id, retries: 0 });
        }
      }
    }
    for (const fileId of readTrash()) this.enqueue({ kind: 'trash', fileId, retries: 0 });
    // Uploads first so the other phone sees new photos sooner; downloads after.
    this.queue.sort((a, b) => Number(a.kind === 'download') - Number(b.kind === 'download'));
    this.updateState({});
  }

  /** Returns true if it changed local records. */
  private static async runTask(task: Task): Promise<boolean> {
    if (task.kind === 'trash') {
      await GoogleDriveService.trashFile(task.fileId);
      writeTrash(readTrash().filter((id) => id !== task.fileId));
      return false;
    }

    const db = await getDB();
    const memory = await db.get('memories', task.memoryId);
    const item = memory?.media.find((m) => m.id === task.mediaId);
    if (!memory || !item) return false; // deleted meanwhile

    if (task.kind === 'download') {
      if (item.url || !item.driveFileId) return false;
      this.updateState({ currentFileName: memory.title, progress: 0 });
      const blob = await GoogleDriveService.downloadFile(item.driveFileId);
      const urls = await MediaService.storeDownloaded(blob, item);
      await this.patchMedia(task.memoryId, task.mediaId, urls, false);
      return true;
    }

    if (task.kind === 'move') {
      const target = GoogleDriveService.getTargetFolder(memory, item.type);
      if (!item.driveFileId || !target.folderId || item.driveFolderId === target.folderId) return false;
      this.updateState({ currentFileName: memory.title });
      await GoogleDriveService.moveFile(item.driveFileId, target.folderId);
      await this.patchMedia(task.memoryId, task.mediaId, { driveFolderId: target.folderId, driveFolderName: target.folderPath }, false);
      return true;
    }

    if (item.driveFileId) return false; // uploaded meanwhile
    const stored = await db.get('media_blobs', `${item.id}-orig`);
    if (!stored) return false;

    this.updateState({ currentFileName: memory.title, progress: 0 });
    const res = await GoogleDriveService.uploadMedia(
      stored.blob,
      item,
      { authorId: memory.authorId, visibility: memory.visibility, title: memory.title, date: memory.date },
      (_done, _total, pct) => this.updateState({ progress: pct })
    );
    await this.patchMedia(
      task.memoryId,
      task.mediaId,
      {
        driveFileId: res.fileId,
        driveFolderId: res.folderId,
        driveFolderName: res.folderName,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
      },
      true
    );
    return true;
  }

  /** Re-read the record before writing so concurrent edits aren't overwritten. */
  private static async patchMedia(memoryId: string, mediaId: string, patch: Partial<MediaItem>, updateStatus: boolean) {
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    const memory = await tx.store.get(memoryId);
    if (memory) {
      const media = memory.media.map((m) => (m.id === mediaId ? { ...m, ...patch } : m));
      const updated: Memory = { ...memory, media };
      if (updateStatus) updated.syncStatus = media.every((m) => m.driveFileId) ? 'synced' : 'pending';
      await tx.store.put(updated);
    }
    await tx.done;
  }
}

function readTrash(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TRASH_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeTrash(ids: string[]) {
  try {
    localStorage.setItem(TRASH_KEY, JSON.stringify(ids));
  } catch {
    // storage full or blocked; trash will just not be retried
  }
}
