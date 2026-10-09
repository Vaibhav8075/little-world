import type { User, Memory, UserId, AppSettings } from '../types';
import { getDB } from './db';

const SESSION_KEY = 'our_little_world_session_user';
const DEFAULT_PIN = '1234';

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Names for a fresh install come from the environment so a deployment can be personalised without
// putting anyone's name in the source. Both can also be changed later in Settings.
export const DEFAULT_USERS: { partner1: User; partner2: User } = {
  partner1: {
    id: 'user-1',
    name: import.meta.env.VITE_PARTNER_1_NAME || 'Partner 1',
    avatar: '',
    accentColor: '#C5832B',
    pinHash: '',
  },
  partner2: {
    id: 'user-2',
    name: import.meta.env.VITE_PARTNER_2_NAME || 'Partner 2',
    avatar: '',
    accentColor: '#C46D5E',
    pinHash: '',
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  appTitle: 'Our Little World',
  appSubtitle: 'A quiet archive of our days, travels, and little memories.',
  partner1: DEFAULT_USERS.partner1,
  partner2: DEFAULT_USERS.partner2,
  theme: 'light',
  anniversaryDate: '2024-04-12',
  soundEffects: true,
  storageWarningThresholdMB: 200,
};

export class AuthService {
  private static currentUser: User | null = null;

  static async initializeUsers(): Promise<{ partner1: User; partner2: User; settings: AppSettings }> {
    const db = await getDB();
    const defaultHash = await hashPin(DEFAULT_PIN);

    let user1 = await db.get('users', 'user-1');
    let user2 = await db.get('users', 'user-2');
    let settings = (await db.get('settings', 'app_settings' as any)) as AppSettings | undefined;

    if (!user1) {
      user1 = { ...DEFAULT_USERS.partner1, pinHash: defaultHash };
      await db.put('users', user1);
    }
    if (!user2) {
      user2 = { ...DEFAULT_USERS.partner2, pinHash: defaultHash };
      await db.put('users', user2);
    }
    if (!settings) {
      settings = {
        ...(settings || DEFAULT_SETTINGS),
        partner1: user1,
        partner2: user2,
      };
      await db.put('settings', settings, 'app_settings' as any);
    }

    const savedUserId = localStorage.getItem(SESSION_KEY);
    if (savedUserId === 'user-1') {
      this.currentUser = user1;
    } else if (savedUserId === 'user-2') {
      this.currentUser = user2;
    } else {
      // New device: nobody is signed in until they pick themselves and enter their PIN.
      this.currentUser = null;
    }

    return { partner1: user1, partner2: user2, settings };
  }

  /** True while a profile still uses the PIN every new install starts with. */
  static async hasDefaultPin(user: User | null): Promise<boolean> {
    return Boolean(user && user.pinHash === (await hashPin(DEFAULT_PIN)));
  }

  static getCurrentUser(): User | null {
    return this.currentUser;
  }

  static async verifyAndLogin(userId: UserId, pin: string): Promise<{ success: boolean; user?: User; error?: string }> {
    const db = await getDB();
    const user = await db.get('users', userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const inputHash = await hashPin(pin);
    if (user.pinHash && user.pinHash !== inputHash) {
      return { success: false, error: 'Incorrect PIN' };
    }

    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, user.id);
    return { success: true, user };
  }

  static switchUser(user: User): void {
    this.currentUser = user;
    localStorage.setItem(SESSION_KEY, user.id);
  }

  static logout(): void {
    this.currentUser = null;
    localStorage.removeItem(SESSION_KEY);
  }

  static async updateUser(user: User, newPin?: string): Promise<User> {
    const db = await getDB();
    let updatedUser: User = { ...user, updatedAt: new Date().toISOString() };
    if (newPin && newPin.trim().length > 0) {
      updatedUser.pinHash = await hashPin(newPin.trim());
    }
    await db.put('users', updatedUser);

    if (this.currentUser && this.currentUser.id === updatedUser.id) {
      this.currentUser = updatedUser;
    }

    const settings = (await db.get('settings', 'app_settings' as any)) as AppSettings | undefined;
    if (settings) {
      if (updatedUser.id === 'user-1') settings.partner1 = updatedUser;
      if (updatedUser.id === 'user-2') settings.partner2 = updatedUser;
      await db.put('settings', settings, 'app_settings' as any);
    }

    return updatedUser;
  }

  static async getUsers(): Promise<User[]> {
    const db = await getDB();
    return db.getAll('users');
  }

  static canUserView(user: User | null, memory: Memory): boolean {
    if (!user) return false;
    if (memory.visibility === 'shared') return true;
    return memory.authorId === user.id;
  }

  static canUserEdit(user: User | null, memory: Memory): boolean {
    if (!user) return false;
    if (memory.visibility === 'shared') return true;
    return memory.authorId === user.id;
  }

  static canUserDelete(user: User | null, memory: Memory): boolean {
    if (!user) return false;
    if (memory.visibility === 'shared') return true;
    return memory.authorId === user.id;
  }
}
