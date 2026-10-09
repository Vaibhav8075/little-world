import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Memory, Collection, MemoryFilter, StorageStats, CloudSyncState, GoogleDriveConfig } from '../types';
import { MemoryService } from '../services/memoryService';
import { CollectionService } from '../services/collectionService';
import { StorageService } from '../services/storageService';
import { MediaService } from '../services/mediaService';
import { GoogleDriveService } from '../services/storage/GoogleDriveService';
import { SyncEngine } from '../services/storage/SyncEngine';
import { useAuth } from './AuthContext';

export interface ToastItem {
  id: string;
  type: 'success' | 'info' | 'error';
  message: string;
}

export type AppNavTab =
  | 'home'
  | 'memories'
  | 'timeline'
  | 'collections'
  | 'map'
  | 'favorites'
  | 'on-this-day';

interface MemoryContextType {
  memories: Memory[];
  collections: Collection[];
  activeTab: AppNavTab;
  setActiveTab: (tab: AppNavTab) => void;
  activeCollectionId: string | null;
  setActiveCollectionId: (id: string | null) => void;
  activeMemoryForViewer: Memory | null;
  openViewer: (memory: Memory) => void;
  closeViewer: () => void;
  isUploadModalOpen: boolean;
  uploadPreset: UploadPreset | null;
  openUploadModal: (preset?: UploadPreset) => void;
  closeUploadModal: () => void;
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  editingMemory: Memory | null;
  openEditModal: (memory: Memory) => void;
  searchFocusKey: number;
  requestSearchFocus: () => void;
  filters: MemoryFilter;
  setFilters: React.Dispatch<React.SetStateAction<MemoryFilter>>;
  resetFilters: () => void;
  storageStats: StorageStats | null;
  onThisDayMemories: Memory[];
  isLoading: boolean;
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  dismissToast: (id: string) => void;
  createMemory: (
    data: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>,
    rawBlobs?: Map<string, Blob>
  ) => Promise<Memory>;
  updateMemory: (id: string, updates: Partial<Memory>) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<void>;
  createCollection: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Collection>;
  updateCollection: (id: string, updates: Partial<Collection>) => Promise<Collection | null>;
  deleteCollection: (id: string) => Promise<boolean>;
  reloadAll: () => Promise<void>;
  resetToDemoData: () => Promise<void>;
  // Single Google Account Storage & Sync
  syncState: CloudSyncState;
  connectGoogleDrive: (clientId?: string) => Promise<GoogleDriveConfig>;
  connectGoogleDriveWithToken: (token: string) => Promise<GoogleDriveConfig>;
  reconnectGoogleDrive: () => Promise<void>;
  disconnectGoogleDrive: () => Promise<void>;
  syncNow: () => Promise<void>;
}

export interface UploadPreset {
  collectionId?: string;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export const MemoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, settings, partner1, partner2, updateGoogleDriveConfig } = useAuth();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeTab, setActiveTab] = useState<AppNavTab>('home');
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [activeMemoryForViewer, setActiveMemoryForViewer] = useState<Memory | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadPreset, setUploadPreset] = useState<UploadPreset | null>(null);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [onThisDayMemories, setOnThisDayMemories] = useState<Memory[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [syncState, setSyncState] = useState<CloudSyncState>(SyncEngine.getState());

  const [filters, setFilters] = useState<MemoryFilter>({
    query: '',
    mediaType: 'all',
    authorId: 'all',
    ownership: 'all',
    visibility: 'all',
    mood: 'all',
    sortBy: 'date-desc',
  });

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    SyncEngine.init();
    const unsubscribe = SyncEngine.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  // Only the very first load shows the full-screen loader; later reloads update in place.
  const loadData = useCallback(async () => {
    try {
      await CollectionService.initializeCollections();
      await MemoryService.initializeMemories();

      const [cols, mems, otd] = await Promise.all([
        CollectionService.getAll(),
        MemoryService.getAll(currentUser),
        MemoryService.getOnThisDay(new Date(), currentUser),
      ]);

      setCollections(cols);
      setMemories(mems);
      setOnThisDayMemories(otd);

      const stats = await StorageService.getStorageStats(mems, cols);
      setStorageStats(stats);
    } catch (err) {
      console.error('Failed to load memory data:', err);
      showToast('Failed to load memory data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When sync records Drive file IDs, refresh our copy so later edits start from current data.
  useEffect(() => SyncEngine.onDataChanged(() => loadData()), [loadData]);

  // Resume any unfinished Drive work once the saved connection is known (e.g. after a reload).
  const driveConnected = Boolean(settings.googleDrive?.isConnected && settings.googleDrive?.accessToken);
  useEffect(() => {
    if (!driveConnected || isLoading) return;
    SyncEngine.setConnected(true);
    SyncEngine.syncAll();
  }, [driveConnected, isLoading]);

  const resetFilters = useCallback(() => {
    setFilters({
      query: '',
      mediaType: 'all',
      authorId: 'all',
      ownership: 'all',
      visibility: 'all',
      mood: 'all',
      sortBy: 'date-desc',
    });
  }, []);

  const openViewer = useCallback((memory: Memory) => {
    setActiveMemoryForViewer(memory);
  }, []);

  const closeViewer = useCallback(() => {
    setActiveMemoryForViewer(null);
  }, []);

  const openUploadModal = useCallback((preset?: UploadPreset) => {
    setEditingMemory(null);
    setUploadPreset(preset || null);
    setIsUploadModalOpen(true);
  }, []);

  const requestSearchFocus = useCallback(() => {
    setActiveCollectionId(null);
    setActiveTab('memories');
    setSearchFocusKey((k) => k + 1);
  }, []);

  const closeUploadModal = useCallback(() => {
    setIsUploadModalOpen(false);
    setEditingMemory(null);
    setUploadPreset(null);
  }, []);

  const openEditModal = useCallback((memory: Memory) => {
    setEditingMemory(memory);
    setIsUploadModalOpen(true);
  }, []);

  const openSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  const closeSettingsModal = useCallback(() => {
    setIsSettingsModalOpen(false);
  }, []);

  const createMemory = async (
    data: Omit<Memory, 'id' | 'createdAt' | 'updatedAt'>,
    rawBlobs?: Map<string, Blob>
  ): Promise<Memory> => {
    // Originals are already stored in IndexedDB by MediaService; the sync engine uploads from there.
    void rawBlobs;
    const newMem = await MemoryService.create(data);
    await loadData();
    showToast(GoogleDriveService.isConnected() ? 'Memory saved · backing up to Drive' : 'Memory saved', 'success');
    SyncEngine.syncAll();
    return newMem;
  };

  const updateMemory = async (id: string, updates: Partial<Memory>): Promise<Memory | null> => {
    const before = await MemoryService.getById(id, currentUser);
    const updated = await MemoryService.update(id, updates, currentUser);
    await loadData();
    if (activeMemoryForViewer && activeMemoryForViewer.id === id) {
      setActiveMemoryForViewer(updated);
    }
    showToast('Changes saved', 'success');

    // Photos removed during the edit: drop their local copies and trash them in Drive.
    if (before && updated) {
      const kept = new Set(updated.media.map((m) => m.id));
      const removed = before.media.filter((m) => !kept.has(m.id));
      await MediaService.deleteStoredMedia(removed.map((m) => m.id));
      SyncEngine.queueTrash(removed.map((m) => m.driveFileId).filter((x): x is string => Boolean(x)));
    }
    // Uploads new photos and moves files if the memory switched between shared and private.
    SyncEngine.syncAll();

    return updated;
  };

  const deleteMemory = async (id: string): Promise<boolean> => {
    const before = await MemoryService.getById(id, currentUser);
    const res = await MemoryService.delete(id, currentUser);
    if (res) {
      await loadData();
      if (activeMemoryForViewer && activeMemoryForViewer.id === id) {
        setActiveMemoryForViewer(null);
      }
      showToast('Memory deleted', 'info');

      // Drive copies go to Drive's trash (recoverable for 30 days), then the manifest is refreshed.
      SyncEngine.queueTrash((before?.media || []).map((m) => m.driveFileId).filter((x): x is string => Boolean(x)));
      SyncEngine.syncAll();
    }
    return res;
  };

  const toggleFavorite = async (id: string) => {
    const updated = await MemoryService.toggleFavorite(id, currentUser);
    if (updated) {
      // Keep this device's display URLs (the stored record may hold an expired video blob URL).
      setMemories((prev) => prev.map((m) => (m.id === id ? { ...m, isFavorite: updated.isFavorite, updatedAt: updated.updatedAt } : m)));
      if (activeMemoryForViewer && activeMemoryForViewer.id === id) {
        setActiveMemoryForViewer({ ...activeMemoryForViewer, isFavorite: updated.isFavorite, updatedAt: updated.updatedAt });
      }
      SyncEngine.syncAll();
    }
  };

  const createCollection = async (
    data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Collection> => {
    const newCol = await CollectionService.create(data);
    await loadData();
    showToast(`Album "${newCol.name}" created`, 'success');
    SyncEngine.syncAll();
    return newCol;
  };

  const updateCollection = async (id: string, updates: Partial<Collection>): Promise<Collection | null> => {
    const updated = await CollectionService.update(id, updates);
    await loadData();
    showToast('Album updated', 'success');
    SyncEngine.syncAll();
    return updated;
  };

  const deleteCollection = async (id: string): Promise<boolean> => {
    const res = await CollectionService.delete(id);
    if (res) {
      await loadData();
      if (activeCollectionId === id) {
        setActiveCollectionId(null);
      }
      showToast('Album deleted', 'info');
      SyncEngine.syncAll();
    }
    return res;
  };

  const resetToDemoData = async () => {
    await MemoryService.resetToDemo();
    await loadData();
    showToast('Demo memories restored', 'info');
  };

  // Connect the single Google Storage Account
  const names = (): [string, string] => [partner1?.name || 'Partner 1', partner2?.name || 'Partner 2'];

  const afterConnect = async (config: GoogleDriveConfig, message: string) => {
    await updateGoogleDriveConfig(config);
    SyncEngine.setConnected(true);
    showToast(message, 'success');
    SyncEngine.syncAll();
    return config;
  };

  const connectGoogleDrive = async (clientId?: string): Promise<GoogleDriveConfig> =>
    afterConnect(await GoogleDriveService.connect(...names(), clientId), 'Google Drive connected');

  const connectGoogleDriveWithToken = async (token: string): Promise<GoogleDriveConfig> =>
    afterConnect(await GoogleDriveService.connectWithToken(token, ...names()), 'Google Drive connected');

  const reconnectGoogleDrive = async (): Promise<void> => {
    try {
      await afterConnect(await GoogleDriveService.reauthorize(...names()), 'Reconnected. Resuming backup.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t reconnect', 'error');
    }
  };

  const disconnectGoogleDrive = async (): Promise<void> => {
    const disconnected = GoogleDriveService.disconnect();
    await updateGoogleDriveConfig(disconnected);
    SyncEngine.setConnected(false);
    showToast('Google Drive disconnected. Your memories are still on this device.', 'info');
  };

  const syncNow = async (): Promise<void> => {
    if (!GoogleDriveService.isConnected()) {
      showToast('Google Drive is not connected', 'info');
      return;
    }
    await SyncEngine.syncAll();
    const state = SyncEngine.getState();
    if (state.needsReauth) showToast('Google sign-in expired. Reconnect to continue.', 'error');
    else if (state.status === 'error') showToast(state.errorMessage || 'Some items didn’t sync', 'error');
    else showToast('Everything is backed up to Google Drive', 'success');
  };

  return (
    <MemoryContext.Provider
      value={{
        memories,
        collections,
        activeTab,
        setActiveTab,
        activeCollectionId,
        setActiveCollectionId,
        activeMemoryForViewer,
        openViewer,
        closeViewer,
        isUploadModalOpen,
        uploadPreset,
        openUploadModal,
        closeUploadModal,
        isSettingsModalOpen,
        openSettingsModal,
        closeSettingsModal,
        editingMemory,
        openEditModal,
        searchFocusKey,
        requestSearchFocus,
        filters,
        setFilters,
        resetFilters,
        storageStats,
        onThisDayMemories,
        isLoading,
        toasts,
        showToast,
        dismissToast,
        createMemory,
        updateMemory,
        deleteMemory,
        toggleFavorite,
        createCollection,
        updateCollection,
        deleteCollection,
        reloadAll: loadData,
        resetToDemoData,
        syncState,
        connectGoogleDrive,
        connectGoogleDriveWithToken,
        reconnectGoogleDrive,
        disconnectGoogleDrive,
        syncNow,
      }}
    >
      {children}
    </MemoryContext.Provider>
  );
};

export const useMemory = () => {
  const context = useContext(MemoryContext);
  if (!context) {
    throw new Error('useMemory must be used within a MemoryProvider');
  }
  return context;
};
