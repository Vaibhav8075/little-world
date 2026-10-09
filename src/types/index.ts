export type UserId = 'user-1' | 'user-2' | string;

export interface User {
  id: UserId;
  name: string;
  avatar: string; // URL, data URL, or emoji avatar
  accentColor: string;
  pinHash: string; // SHA-256 hash of PIN
  bio?: string;
  role?: string;
  /** Set when the profile (name, PIN…) changes, so the newer copy wins when devices sync. */
  updatedAt?: string;
}

export type MemoryVisibility = 'shared' | 'private';

export type MemoryMood =
  | 'happy'
  | 'romantic'
  | 'nostalgic'
  | 'adventure'
  | 'peaceful'
  | 'funny'
  | 'milestone'
  | 'cozy';

export interface LocationInfo {
  name: string;
  // Only present when real coordinates are known (e.g. from photo GPS data).
  lat?: number;
  lng?: number;
  city?: string;
  country?: string;
}

export interface ExifMetadata {
  camera?: string;
  lens?: string;
  iso?: number;
  aperture?: string;
  focalLength?: string;
  exposureTime?: string;
  takenAt?: string;
  gpsLat?: number;
  gpsLng?: number;
  orientation?: number;
  locationName?: string;
}

export interface MediaItem {
  id: string;
  memoryId: string;
  type: 'photo' | 'video';
  url: string; // Object URL or Base64 / data URL
  blobKey?: string; // IndexedDB media storage key
  thumbnailUrl?: string; // Small size ~320px
  mediumUrl?: string; // Medium size ~840px
  largeUrl?: string; // Large size ~1600px
  caption?: string;
  order: number;
  width?: number;
  height?: number;
  duration?: number; // Video duration in seconds
  mimeType: string;
  sizeBytes?: number;
  metadata?: ExifMetadata;
  // Google Drive Cloud Storage Fields
  driveFileId?: string;
  driveFolderId?: string; // ID of the target folder (a partner's own folder, or Shared)
  driveFolderName?: string; // e.g. '<Partner>/Photos', 'Shared/Videos'
  syncStatus?: 'synced' | 'pending' | 'uploading' | 'error';
  lastSyncedAt?: string;
  checksum?: string;
}

export interface Moment {
  id: string;
  collectionId: string;
  title: string;
  description?: string;
  date?: string;
  order: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  coverMediaUrl?: string;
  icon: string;
  accentColor: string;
  isSystem?: boolean;
  moments?: Moment[];
  createdAt: string;
  updatedAt: string;
}

export interface Memory {
  id: string;
  title: string;
  story: string; // The rich memory narrative
  date: string; // YYYY-MM-DD
  takenAt?: string; // ISO string with time if available
  authorId: UserId;
  visibility: MemoryVisibility;
  collectionId?: string;
  momentId?: string;
  tags: string[];
  mood?: MemoryMood;
  isFavorite: boolean;
  coverMediaId?: string;
  location?: LocationInfo;
  media: MediaItem[];
  createdAt: string;
  updatedAt: string;
  version?: number;
  deviceId?: string;
  syncStatus?: 'synced' | 'pending' | 'uploading' | 'error';
}

export interface DriveFolderStructure {
  photosId: string;
  videosId: string;
  memoriesId?: string;
}

export interface GoogleDriveConfig {
  isConnected: boolean;
  userEmail?: string;
  userName?: string;
  userAvatar?: string;
  accessToken?: string;
  expiresAt?: number;
  clientId?: string;
  autoSync?: boolean;
  // Exact 1-Account 3-Folder Hierarchy
  rootFolderId?: string;
  rootFolderName?: string;
  partner1FolderId?: string;
  partner1FolderName?: string;
  partner1Structure?: DriveFolderStructure;
  partner2FolderId?: string;
  partner2FolderName?: string;
  partner2Structure?: DriveFolderStructure;
  sharedFolderId?: string;
  sharedFolderName?: string;
  sharedStructure?: DriveFolderStructure & { metadataId: string };
  lastSyncTime?: string;
}

export interface CloudSyncState {
  status: 'idle' | 'syncing' | 'offline' | 'error' | 'connected';
  pendingUploads: number;
  /** Photos added on the other device that this one is fetching. */
  pendingDownloads?: number;
  progress: number; // 0 to 100
  currentFileName?: string;
  lastSyncTime?: string;
  errorMessage?: string;
  /** Google token expired/revoked; the user must reconnect (needs a click for the popup). */
  needsReauth?: boolean;
  driveStorageQuota?: {
    usedBytes: number;
    totalBytes: number;
    usagePercent: number;
  };
}

export interface AppSettings {
  appTitle: string;
  appSubtitle: string;
  partner1: User;
  partner2: User;
  theme: 'light' | 'dark' | 'system';
  anniversaryDate?: string;
  soundEffects: boolean;
  storageWarningThresholdMB: number;
  googleDrive?: GoogleDriveConfig;
}

export type MemoryOwnershipFilter = 'all' | 'mine' | 'partner' | 'shared';

export interface MemoryFilter {
  query?: string;
  mediaType?: 'all' | 'photos' | 'videos';
  collectionId?: string;
  authorId?: 'all' | UserId;
  ownership?: MemoryOwnershipFilter; // 'mine' (My Memories), 'partner' (Her/His Memories), 'shared' (Our Memories)
  visibility?: 'all' | MemoryVisibility;
  isFavorite?: boolean;
  mood?: 'all' | MemoryMood;
  tag?: string;
  year?: number;
  month?: number;
  location?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: 'date-desc' | 'date-asc' | 'created-desc' | 'title-asc';
}

export interface StorageStats {
  usedBytes: number;
  totalQuotaBytes: number;
  usagePercentage: number;
  memoryCount: number;
  photoCount: number;
  videoCount: number;
  collectionCount: number;
}
