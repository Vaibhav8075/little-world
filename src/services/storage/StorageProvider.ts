import type { MediaItem, Memory, Collection, User, AppSettings } from '../../types';

export interface UploadProgressCallback {
  (bytesUploaded: number, totalBytes: number, percentage: number): void;
}

export interface DriveFolderInfo {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface DriveStorageInfo {
  limitBytes: number;
  usageBytes: number;
  usageInDriveBytes: number;
  userEmail?: string;
  displayName?: string;
}

export interface StorageProvider {
  name: 'local' | 'google-drive';
  isAvailable(): Promise<boolean>;
  uploadMedia(
    file: File | Blob,
    mediaItem: MediaItem,
    onProgress?: UploadProgressCallback
  ): Promise<{ fileId: string; webViewLink?: string }>;
  downloadMedia(fileId: string): Promise<Blob>;
  deleteMedia(fileId: string): Promise<boolean>;
  syncManifest(
    manifest: {
      users: User[];
      settings: AppSettings;
      collections: Collection[];
      memories: Memory[];
      exportedAt: string;
      version: number;
    }
  ): Promise<{ success: boolean; remoteManifest?: any }>;
}
