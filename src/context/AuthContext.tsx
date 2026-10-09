import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserId, AppSettings, GoogleDriveConfig } from '../types';
import { AuthService, DEFAULT_SETTINGS } from '../services/authService';
import { GoogleDriveService } from '../services/storage/GoogleDriveService';
import { getDB } from '../services/db';
import { SyncEngine } from '../services/storage/SyncEngine';

interface AuthContextType {
  currentUser: User | null;
  partner1: User | null;
  partner2: User | null;
  partnerUser: User | null;
  settings: AppSettings;
  isLoading: boolean;
  isPinModalOpen: boolean;
  pendingSwitchUserId: UserId | null;
  loginWithPin: (userId: UserId, pin: string) => Promise<{ success: boolean; error?: string }>;
  switchUserDirect: (userId: UserId) => void;
  openPinModalForSwitch: (userId: UserId) => void;
  closePinModal: () => void;
  logout: () => void;
  updateUserProfile: (updated: User, newPin?: string) => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  updateGoogleDriveConfig: (driveConfig: GoogleDriveConfig) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [partner1, setPartner1] = useState<User | null>(null);
  const [partner2, setPartner2] = useState<User | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pendingSwitchUserId, setPendingSwitchUserId] = useState<UserId | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const { partner1: p1, partner2: p2, settings: s } = await AuthService.initializeUsers();
        setPartner1(p1);
        setPartner2(p2);
        setSettingsState(s);
        setCurrentUser(AuthService.getCurrentUser());

        // Initialize Google Drive service with stored settings if available
        if (s.googleDrive) {
          GoogleDriveService.init(s.googleDrive);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // Profiles (names, PINs) can change on the other device; pick those up after a sync.
  useEffect(
    () =>
      SyncEngine.onDataChanged(async () => {
        const users = await AuthService.getUsers();
        const p1 = users.find((u) => u.id === 'user-1');
        const p2 = users.find((u) => u.id === 'user-2');
        if (p1) setPartner1(p1);
        if (p2) setPartner2(p2);
        setCurrentUser((cur) => (cur ? users.find((u) => u.id === cur.id) || cur : cur));
      }),
    []
  );

  const loginWithPin = async (userId: UserId, pin: string) => {
    const res = await AuthService.verifyAndLogin(userId, pin);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      setIsPinModalOpen(false);
      setPendingSwitchUserId(null);
      return { success: true };
    }
    return { success: false, error: res.error || 'Incorrect PIN' };
  };

  const switchUserDirect = (userId: UserId) => {
    const target = userId === 'user-1' ? partner1 : partner2;
    if (target) {
      AuthService.switchUser(target);
      setCurrentUser(target);
    }
  };

  const openPinModalForSwitch = (userId: UserId) => {
    setPendingSwitchUserId(userId);
    setIsPinModalOpen(true);
  };

  const closePinModal = () => {
    setIsPinModalOpen(false);
    setPendingSwitchUserId(null);
  };

  const logout = () => {
    AuthService.logout();
    setCurrentUser(null);
  };

  const updateUserProfile = async (updated: User, newPin?: string) => {
    const saved = await AuthService.updateUser(updated, newPin);
    if (saved.id === 'user-1') setPartner1(saved);
    if (saved.id === 'user-2') setPartner2(saved);
    if (currentUser?.id === saved.id) setCurrentUser(saved);
    SyncEngine.syncAll();
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const db = await getDB();
    const updated = { ...settings, ...newSettings };
    await db.put('settings', updated, 'app_settings' as any);
    setSettingsState(updated);
  };

  const updateGoogleDriveConfig = async (driveConfig: GoogleDriveConfig) => {
    GoogleDriveService.init(driveConfig);
    await updateSettings({ googleDrive: driveConfig });
  };

  const partnerUser = currentUser?.id === 'user-1' ? partner2 : partner1;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        partner1,
        partner2,
        partnerUser,
        settings,
        isLoading,
        isPinModalOpen,
        pendingSwitchUserId,
        loginWithPin,
        switchUserDirect,
        openPinModalForSwitch,
        closePinModal,
        logout,
        updateUserProfile,
        updateSettings,
        updateGoogleDriveConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
