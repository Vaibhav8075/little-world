import type { GoogleDriveConfig, MediaItem, Memory, Collection, User, AppSettings } from '../../types';
import type { UploadProgressCallback, DriveStorageInfo } from './StorageProvider';
import type { Tombstones } from './syncMeta';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
            error_callback?: (err: any) => void;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          revoke?: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

/**
 * Optional pre-existing root folder (VITE_DRIVE_ROOT_FOLDER_ID). With the `drive.file` scope the app can
 * only write into folders it created itself, so this is used only if it turns out to be writable;
 * otherwise the app creates its own "Our Little World" folder in My Drive.
 */
const PRESET_ROOT_FOLDER_ID: string = import.meta.env.VITE_DRIVE_ROOT_FOLDER_ID || '';
export const ROOT_FOLDER_NAME = 'Our Little World';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MANIFEST_NAME = 'our-little-world.json';

const DEFAULT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/** Thrown when Google rejects the token (expired or revoked). Sync pauses until the user reconnects. */
export class DriveAuthError extends Error {
  constructor(message = 'Google sign-in expired. Reconnect Google Drive to keep backing up.') {
    super(message);
    this.name = 'DriveAuthError';
  }
}

export interface MemoryUploadContext {
  authorId: string;
  visibility: 'shared' | 'private';
  title?: string;
  date?: string;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp',
};

/** Escape a value for use inside a single-quoted Drive query string. */
const q = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export class GoogleDriveService {
  private static config: GoogleDriveConfig | null = null;
  private static gsiLoadPromise: Promise<void> | null = null;

  // ---------- configuration ----------

  static init(config?: GoogleDriveConfig) {
    if (config) this.config = { ...config };
  }

  static getConfig(): GoogleDriveConfig | null {
    return this.config;
  }

  static isConnected(): boolean {
    return Boolean(this.config?.isConnected && this.config?.accessToken);
  }

  static isTokenExpired(): boolean {
    const exp = this.config?.expiresAt;
    return Boolean(exp && Date.now() > exp - 60_000);
  }

  static getRootFolderUrl(): string | undefined {
    const id = this.config?.rootFolderId;
    return id ? `https://drive.google.com/drive/folders/${id}` : undefined;
  }

  /** Human-readable destination for a memory's media, e.g. "Our Little World / Shared / Photos". */
  static describeTarget(memory: { authorId: string; visibility: 'shared' | 'private' }, type: 'photo' | 'video') {
    return `${this.config?.rootFolderName || ROOT_FOLDER_NAME} / ${this.getTargetFolder(memory, type).folderPath.replace('/', ' / ')}`;
  }

  // ---------- auth ----------

  static async loadGsiLibrary(): Promise<void> {
    if (window.google?.accounts?.oauth2) return;
    if (this.gsiLoadPromise) return this.gsiLoadPromise;

    this.gsiLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.gsiLoadPromise = null;
        reject(new Error('Couldn’t load Google sign-in. Check your connection.'));
      };
      document.head.appendChild(script);
    });
    return this.gsiLoadPromise;
  }

  /** Opens the Google popup and resolves with a fresh access token. Must be called from a user click. */
  private static async requestToken(clientId: string, prompt: '' | 'consent'): Promise<{ token: string; expiresAt: number }> {
    await this.loadGsiLibrary();
    return new Promise((resolve, reject) => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) return reject(new Error('Google sign-in is not available.'));
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (res: any) => {
          if (res.error) return reject(new Error(res.error_description || res.error));
          const expiresIn = Number(res.expires_in) || 3600;
          resolve({ token: res.access_token, expiresAt: Date.now() + expiresIn * 1000 });
        },
        error_callback: (err: any) =>
          reject(new Error(err?.type === 'popup_closed' ? 'Google sign-in was closed.' : err?.message || 'Google sign-in failed.')),
      });
      client.requestAccessToken({ prompt });
    });
  }

  /** Connect via Google sign-in (OAuth client ID from the form or VITE_GOOGLE_CLIENT_ID). */
  static async connect(partner1Name: string, partner2Name: string, customClientId?: string): Promise<GoogleDriveConfig> {
    const clientId = customClientId || this.config?.clientId || DEFAULT_CLIENT_ID;
    if (!clientId) {
      throw new Error('Add a Google OAuth client ID (VITE_GOOGLE_CLIENT_ID in .env.local) to connect Google Drive.');
    }
    const { token, expiresAt } = await this.requestToken(clientId, 'consent');
    return this.finishConnect(token, expiresAt, partner1Name, partner2Name, clientId);
  }

  /** Connect with a pasted OAuth access token (expires after ~1 hour). */
  static async connectWithToken(accessToken: string, partner1Name: string, partner2Name: string): Promise<GoogleDriveConfig> {
    const token = accessToken.trim();
    if (!token) throw new Error('Paste a Google OAuth access token.');
    return this.finishConnect(token, Date.now() + 3600 * 1000, partner1Name, partner2Name, this.config?.clientId);
  }

  /** Get a new token after expiry without re-creating anything. Must be called from a user click. */
  static async reauthorize(partner1Name: string, partner2Name: string): Promise<GoogleDriveConfig> {
    const clientId = this.config?.clientId || DEFAULT_CLIENT_ID;
    if (!clientId) throw new Error('This connection used a pasted token. Paste a new one in Settings to reconnect.');
    const { token, expiresAt } = await this.requestToken(clientId, '');
    return this.finishConnect(token, expiresAt, partner1Name, partner2Name, clientId);
  }

  private static async finishConnect(
    token: string,
    expiresAt: number,
    p1: string,
    p2: string,
    clientId?: string
  ): Promise<GoogleDriveConfig> {
    const about = await this.api<{ user?: { emailAddress?: string; displayName?: string; photoLink?: string } }>(
      `${DRIVE_API_URL}/about?fields=user`,
      {},
      token
    );
    const hierarchy = await this.setupHierarchy(token, p1, p2);

    this.config = {
      ...this.config,
      isConnected: true,
      userEmail: about.user?.emailAddress,
      userName: about.user?.displayName,
      userAvatar: about.user?.photoLink,
      accessToken: token,
      expiresAt,
      clientId,
      autoSync: true,
      ...hierarchy,
    };
    return this.config;
  }

  /** Forget the token (and revoke it with Google). Folder IDs are kept so a reconnect reuses them. */
  static disconnect(): GoogleDriveConfig {
    const token = this.config?.accessToken;
    if (token) {
      try {
        window.google?.accounts?.oauth2?.revoke?.(token);
      } catch {
        // best effort
      }
    }
    this.config = {
      ...this.config,
      isConnected: false,
      accessToken: undefined,
      expiresAt: undefined,
      userEmail: undefined,
      userName: undefined,
      userAvatar: undefined,
    };
    return this.config;
  }

  // ---------- low-level HTTP ----------

  private static async api<T = any>(url: string, init: RequestInit = {}, token?: string): Promise<T> {
    const res = await this.raw(url, init, token);
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  private static async raw(url: string, init: RequestInit = {}, token?: string): Promise<Response> {
    const accessToken = token || this.config?.accessToken;
    if (!accessToken) throw new DriveAuthError('Google Drive is not connected.');
    if (!token && this.isTokenExpired()) throw new DriveAuthError();

    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 401) throw new DriveAuthError();
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const body = await res.json();
        message = body?.error?.message || message;
      } catch {
        // non-JSON body
      }
      throw new Error(`Google Drive: ${message}`);
    }
    return res;
  }

  // ---------- folders ----------

  /** Find a folder by name *inside a specific parent*, creating it if missing. */
  static async findOrCreateFolder(name: string, parentId: string, token?: string): Promise<string> {
    const query = `mimeType = '${FOLDER_MIME}' and name = '${q(name)}' and '${q(parentId)}' in parents and trashed = false`;
    const found = await this.api<{ files: { id: string }[] }>(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)&orderBy=createdTime&pageSize=1&spaces=drive`,
      {},
      token
    );
    if (found.files?.length) return found.files[0].id;

    const created = await this.api<{ id: string }>(
      `${DRIVE_API_URL}/files?fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
      },
      token
    );
    return created.id;
  }

  private static async isWritableFolder(id: string, token: string): Promise<boolean> {
    try {
      const f = await this.api<{ trashed?: boolean; mimeType?: string; capabilities?: { canAddChildren?: boolean } }>(
        `${DRIVE_API_URL}/files/${encodeURIComponent(id)}?fields=trashed,mimeType,capabilities(canAddChildren)`,
        {},
        token
      );
      return !f.trashed && f.mimeType === FOLDER_MIME && f.capabilities?.canAddChildren !== false;
    } catch (err) {
      if (err instanceof DriveAuthError) throw err;
      return false;
    }
  }

  private static async resolveRoot(token: string): Promise<string> {
    const saved = this.config?.rootFolderId;
    if (saved && (await this.isWritableFolder(saved, token))) return saved;
    if (PRESET_ROOT_FOLDER_ID && (await this.isWritableFolder(PRESET_ROOT_FOLDER_ID, token))) return PRESET_ROOT_FOLDER_ID;
    return this.findOrCreateFolder(ROOT_FOLDER_NAME, 'root', token);
  }

  /**
   * Our Little World/
   * ├── <Partner 1>/  Photos, Videos   (private memories by partner 1)
   * ├── <Partner 2>/  Photos, Videos   (private memories by partner 2)
   * └── Shared/       Photos, Videos, Metadata
   */
  private static async setupHierarchy(token: string, p1Name: string, p2Name: string) {
    const rootId = await this.resolveRoot(token);

    const branch = async (name: string, third: 'Memories' | 'Metadata') => {
      const id = await this.findOrCreateFolder(name, rootId, token);
      const [photosId, videosId, thirdId] = await Promise.all([
        this.findOrCreateFolder('Photos', id, token),
        this.findOrCreateFolder('Videos', id, token),
        third === 'Metadata' ? this.findOrCreateFolder('Metadata', id, token) : Promise.resolve(undefined),
      ]);
      return { id, photosId, videosId, thirdId };
    };

    const p1 = await branch(p1Name, 'Memories');
    const p2 = await branch(p2Name, 'Memories');
    const shared = await branch('Shared', 'Metadata');

    return {
      rootFolderId: rootId,
      rootFolderName: ROOT_FOLDER_NAME,
      partner1FolderId: p1.id,
      partner1FolderName: p1Name,
      partner1Structure: { photosId: p1.photosId, videosId: p1.videosId },
      partner2FolderId: p2.id,
      partner2FolderName: p2Name,
      partner2Structure: { photosId: p2.photosId, videosId: p2.videosId },
      sharedFolderId: shared.id,
      sharedFolderName: 'Shared',
      sharedStructure: { photosId: shared.photosId, videosId: shared.videosId, metadataId: shared.thirdId! },
    };
  }

  /** Shared memories go to Shared/; private ones to the author's own folder. */
  static getTargetFolder(
    memory: { authorId: string; visibility: 'shared' | 'private' },
    mediaType: 'photo' | 'video'
  ): { folderId: string | undefined; folderPath: string } {
    const cfg = this.config;
    const sub = mediaType === 'video' ? 'Videos' : 'Photos';
    const pick = (s?: { photosId: string; videosId: string }) => (mediaType === 'video' ? s?.videosId : s?.photosId);

    if (memory.visibility === 'shared') {
      return { folderId: pick(cfg?.sharedStructure), folderPath: `Shared/${sub}` };
    }
    if (memory.authorId === 'user-1') {
      return { folderId: pick(cfg?.partner1Structure), folderPath: `${cfg?.partner1FolderName || 'Partner 1'}/${sub}` };
    }
    return { folderId: pick(cfg?.partner2Structure), folderPath: `${cfg?.partner2FolderName || 'Partner 2'}/${sub}` };
  }

  // ---------- files ----------

  static fileNameFor(mediaItem: MediaItem, ctx: MemoryUploadContext, originalName?: string): string {
    const fromName = originalName?.includes('.') ? originalName.split('.').pop()!.toLowerCase() : undefined;
    const ext = MIME_EXT[mediaItem.mimeType] || fromName || (mediaItem.type === 'video' ? 'mp4' : 'jpg');
    const title = (ctx.title || 'Memory').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const n = mediaItem.order > 0 ? ` (${mediaItem.order + 1})` : '';
    return `${ctx.date ? `${ctx.date} ` : ''}${title}${n}.${ext}`;
  }

  /** Look for a file this app already uploaded for this media item (makes retries idempotent). */
  private static async findUploaded(mediaId: string): Promise<{ id: string; parents?: string[] } | null> {
    const query = `appProperties has { key='mediaId' and value='${q(mediaId)}' } and trashed = false`;
    const res = await this.api<{ files: { id: string; parents?: string[] }[] }>(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,parents)&pageSize=1&spaces=drive`
    );
    return res.files?.[0] || null;
  }

  static async uploadMedia(
    file: Blob,
    mediaItem: MediaItem,
    ctx: MemoryUploadContext,
    onProgress?: UploadProgressCallback
  ): Promise<{ fileId: string; folderId: string; folderName: string }> {
    const { folderId, folderPath } = this.getTargetFolder(ctx, mediaItem.type);
    if (!folderId) throw new Error('Drive folders are not set up. Reconnect Google Drive.');

    const existing = await this.findUploaded(mediaItem.id);
    if (existing) {
      if (!existing.parents?.includes(folderId)) await this.moveFile(existing.id, folderId, existing.parents);
      onProgress?.(file.size, file.size, 100);
      return { fileId: existing.id, folderId, folderName: folderPath };
    }

    const metadata = {
      name: this.fileNameFor(mediaItem, ctx, file instanceof File ? file.name : undefined),
      mimeType: mediaItem.mimeType || file.type || 'application/octet-stream',
      parents: [folderId],
      appProperties: { mediaId: mediaItem.id, memoryId: mediaItem.memoryId },
      ...(ctx.date ? { createdTime: new Date(`${ctx.date}T12:00:00`).toISOString() } : {}),
    };

    const fileId =
      file.size > 5 * 1024 * 1024 || mediaItem.type === 'video'
        ? await this.uploadResumable(file, metadata, onProgress)
        : await this.uploadMultipart(file, metadata, onProgress);

    return { fileId, folderId, folderName: folderPath };
  }

  private static async uploadMultipart(file: Blob, metadata: object, onProgress?: UploadProgressCallback): Promise<string> {
    const boundary = `lw-${Math.random().toString(36).slice(2)}`;
    const mime = (metadata as { mimeType: string }).mimeType;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    onProgress?.(0, file.size, 5);
    const res = await this.api<{ id: string }>(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    onProgress?.(file.size, file.size, 100);
    return res.id;
  }

  private static async uploadResumable(file: Blob, metadata: object, onProgress?: UploadProgressCallback): Promise<string> {
    const mime = (metadata as { mimeType: string }).mimeType;
    const init = await this.raw(`${DRIVE_UPLOAD_URL}/files?uploadType=resumable&fields=id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify(metadata),
    });
    const sessionUrl = init.headers.get('Location');
    if (!sessionUrl) throw new Error('Google Drive did not start the upload.');

    const chunkSize = 8 * 256 * 1024; // must be a multiple of 256 KiB
    const total = file.size;
    let start = 0;

    while (start < total || total === 0) {
      const end = Math.min(start + chunkSize, total);
      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers: { 'Content-Range': total === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${total}` },
        body: file.slice(start, end),
      });

      if (res.status === 308) {
        // Drive tells us how much it actually received.
        const range = res.headers.get('Range');
        start = range ? Number(range.split('-')[1]) + 1 : end;
        onProgress?.(start, total, Math.round((start / total) * 100));
      } else if (res.ok) {
        onProgress?.(total, total, 100);
        return (await res.json()).id;
      } else if (res.status === 401) {
        throw new DriveAuthError();
      } else {
        throw new Error(`Google Drive upload failed (${res.status}).`);
      }
    }
    throw new Error('Google Drive upload did not finish.');
  }

  static async moveFile(fileId: string, newParentId: string, oldParents?: string[]): Promise<void> {
    let parents = oldParents;
    if (!parents) {
      const f = await this.api<{ parents?: string[] }>(`${DRIVE_API_URL}/files/${fileId}?fields=parents`);
      parents = f.parents || [];
    }
    const remove = parents.filter((p) => p !== newParentId).join(',');
    await this.api(
      `${DRIVE_API_URL}/files/${fileId}?addParents=${newParentId}${remove ? `&removeParents=${remove}` : ''}&fields=id`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }
    );
  }

  /** Moves a file to Drive's trash (recoverable for 30 days). */
  static async trashFile(fileId: string): Promise<void> {
    try {
      await this.api(`${DRIVE_API_URL}/files/${fileId}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    } catch (err) {
      // Already gone is fine.
      if (err instanceof Error && /404|not found/i.test(err.message)) return;
      throw err;
    }
  }

  // ---------- quota & manifest ----------

  static async fetchStorageQuota(): Promise<DriveStorageInfo> {
    const fallback: DriveStorageInfo = {
      limitBytes: 0,
      usageBytes: 0,
      usageInDriveBytes: 0,
      userEmail: this.config?.userEmail,
      displayName: this.config?.userName,
    };
    if (!this.isConnected() || this.isTokenExpired()) return fallback;
    try {
      const data = await this.api<{ storageQuota?: Record<string, string>; user?: { emailAddress?: string; displayName?: string } }>(
        `${DRIVE_API_URL}/about?fields=storageQuota,user`
      );
      const quota = data.storageQuota || {};
      return {
        limitBytes: quota.limit ? parseInt(quota.limit, 10) : 0,
        usageBytes: quota.usage ? parseInt(quota.usage, 10) : 0,
        usageInDriveBytes: quota.usageInDrive ? parseInt(quota.usageInDrive, 10) : 0,
        userEmail: data.user?.emailAddress,
        displayName: data.user?.displayName,
      };
    } catch (err) {
      console.warn('Could not fetch Drive quota:', err);
      return fallback;
    }
  }

  private static manifestQuery() {
    const folderId = this.config?.sharedStructure?.metadataId;
    if (!folderId) throw new Error('Drive folders are not set up. Reconnect Google Drive.');
    return { folderId, query: `name = '${MANIFEST_NAME}' and '${q(folderId)}' in parents and trashed = false` };
  }

  /** Locate the shared manifest; `modifiedTime` lets callers skip downloading it when unchanged. */
  static async findManifest(): Promise<{ id: string; modifiedTime: string } | null> {
    const { query } = this.manifestQuery();
    const found = await this.api<{ files: { id: string; modifiedTime: string }[] }>(
      `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`
    );
    return found.files?.[0] || null;
  }

  static async readManifest(fileId: string): Promise<DriveManifest> {
    return this.api<DriveManifest>(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`);
  }

  static async downloadFile(fileId: string): Promise<Blob> {
    const res = await this.raw(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`);
    return res.blob();
  }

  /** Writes Shared/Metadata/our-little-world.json and returns its new modifiedTime. */
  static async syncManifest(manifest: DriveManifest, existingId?: string): Promise<string> {
    const { folderId } = this.manifestQuery();
    const body = new Blob([JSON.stringify(sanitizeManifest(manifest), null, 2)], { type: 'application/json' });
    const id = existingId || (await this.findManifest())?.id;

    if (id) {
      const res = await this.api<{ modifiedTime: string }>(
        `${DRIVE_UPLOAD_URL}/files/${id}?uploadType=media&fields=id,modifiedTime`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
      );
      return res.modifiedTime;
    }
    await this.uploadMultipart(body, { name: MANIFEST_NAME, mimeType: 'application/json', parents: [folderId] });
    return (await this.findManifest())?.modifiedTime || '';
  }
}

export interface DriveManifest {
  users: User[];
  settings: AppSettings;
  collections: Collection[];
  memories: Memory[];
  tombstones?: Tombstones;
  exportedAt: string;
  version: number;
}

/**
 * Strip things that must never leave the device or that bloat the file: the OAuth token and inline image
 * data (the photos themselves live in Drive). Profile PIN hashes are kept so a PIN set on one phone applies
 * on every device; the file sits in the couple's own Drive.
 */
export function sanitizeManifest<T extends { users: User[]; settings: AppSettings; memories: Memory[] }>(manifest: T): T {
  const isInline = (u?: string) => Boolean(u && (u.startsWith('data:') || u.startsWith('blob:')));
  const { googleDrive, ...settings } = manifest.settings;
  return {
    ...manifest,
    settings: {
      ...settings,
      partner1: { ...settings.partner1, pinHash: '' },
      partner2: { ...settings.partner2, pinHash: '' },
      googleDrive: googleDrive ? { ...googleDrive, accessToken: undefined, expiresAt: undefined } : undefined,
    },
    memories: manifest.memories.map((m) => ({
      ...m,
      media: m.media.map((item) => ({
        ...item,
        url: isInline(item.url) ? '' : item.url,
        thumbnailUrl: isInline(item.thumbnailUrl) ? undefined : item.thumbnailUrl,
        mediumUrl: isInline(item.mediumUrl) ? undefined : item.mediumUrl,
        largeUrl: isInline(item.largeUrl) ? undefined : item.largeUrl,
      })),
    })),
  };
}
