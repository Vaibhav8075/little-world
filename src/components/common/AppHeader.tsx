import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMemory } from '../../context/MemoryContext';
import type { AppNavTab } from '../../context/MemoryContext';
import { useTheme } from '../../context/ThemeContext';
import { Plus, Search, Check, Lock, Settings, Sun, Moon, Monitor } from 'lucide-react';
import { Avatar } from './Avatar';

const NAV_ITEMS: { tab: AppNavTab; label: string }[] = [
  { tab: 'home', label: 'Home' },
  { tab: 'memories', label: 'Memories' },
  { tab: 'collections', label: 'Albums' },
  { tab: 'map', label: 'Map' },
  { tab: 'on-this-day', label: 'On this day' },
];

export const AppHeader: React.FC = () => {
  const { settings, currentUser, partner1, partner2, openPinModalForSwitch } = useAuth();
  const {
    activeTab,
    setActiveTab,
    setActiveCollectionId,
    openUploadModal,
    openSettingsModal,
    onThisDayMemories,
    requestSearchFocus,
  } = useMemory();

  const handleNav = (tab: AppNavTab) => {
    setActiveCollectionId(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <header className="sticky top-0 z-40 bg-paper/85 backdrop-blur-lg border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center gap-6">
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-serif text-xl sm:text-[22px] tracking-[-0.01em] whitespace-nowrap"
        >
          {settings.appTitle || 'Our Little World'}
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.tab || (item.tab === 'memories' && activeTab === 'timeline');
            const badge = item.tab === 'on-this-day' ? onThisDayMemories.length : 0;
            return (
              <button
                key={item.tab}
                onClick={() => handleNav(item.tab)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative h-9 px-3 rounded-full text-sm whitespace-nowrap transition-colors ${
                  isActive ? 'bg-sunken text-ink font-medium' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {item.label}
                {badge > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-white text-[11px] font-medium tabular-nums">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={requestSearchFocus} className="icon-btn" aria-label="Search memories">
            <Search className="size-[18px]" />
          </button>

          <button type="button" onClick={() => openUploadModal()} className="btn btn-primary btn-sm hidden md:inline-flex">
            <Plus className="size-4" />
            New memory
          </button>

          <UserMenu
            onSwitch={(id) => openPinModalForSwitch(id)}
            onSettings={openSettingsModal}
            currentUserId={currentUser?.id}
            people={[partner1, partner2]}
          />
        </div>
      </div>
    </header>
  );
};

interface UserMenuProps {
  currentUserId?: string;
  people: (ReturnType<typeof useAuth>['partner1'])[];
  onSwitch: (id: string) => void;
  onSettings: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ currentUserId, people, onSwitch, onSettings }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const { syncState } = useMemory();
  const current = people.find((p) => p?.id === currentUserId) || null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const syncLabel = syncState.needsReauth
    ? 'Drive sign-in expired · Reconnect'
    : syncState.status === 'syncing'
      ? syncState.pendingUploads > 0
        ? `Uploading ${syncState.pendingUploads} · ${syncState.progress || 0}%`
        : syncState.pendingDownloads
        ? `Getting ${syncState.pendingDownloads} new from Drive`
        : 'Syncing…'
      : syncState.status === 'error'
      ? 'Sync error'
      : syncState.status === 'connected'
      ? syncState.pendingUploads > 0
        ? `${syncState.pendingUploads} waiting to upload`
        : 'In sync with Google Drive'
      : 'Saved on this device only';

  const syncDot =
    syncState.status === 'error'
      ? 'bg-accent'
      : syncState.status === 'connected' || syncState.status === 'syncing'
      ? 'bg-emerald-500'
      : 'bg-ink-3';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-0.5 hover:ring-2 hover:ring-line transition-shadow"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <Avatar user={current} size={32} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 card shadow-pop p-1.5 z-50 animate-enter text-sm">
          <p className="px-3 pt-2 pb-1 text-[13px] text-ink-3">Signed in as</p>
          {people.map(
            (p) =>
              p && (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (p.id !== currentUserId) onSwitch(p.id);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sunken text-left"
                >
                  <Avatar user={p} size={28} />
                  <span className={`flex-1 ${p.id === currentUserId ? 'font-medium' : 'text-ink-2'}`}>{p.name}</span>
                  {p.id === currentUserId ? (
                    <Check className="size-4" />
                  ) : (
                    <Lock className="size-3.5 text-ink-3" aria-label="PIN required" />
                  )}
                </button>
              )
          )}

          <div className="my-1.5 border-t border-line" />

          <div className="px-3 py-2 flex items-center justify-between">
            <span className="text-ink-2">Theme</span>
            <div className="flex rounded-full bg-sunken p-0.5" role="radiogroup" aria-label="Theme">
              {(
                [
                  ['light', Sun],
                  ['dark', Moon],
                  ['system', Monitor],
                ] as const
              ).map(([value, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  aria-label={value}
                  onClick={() => setTheme(value)}
                  className={`size-7 inline-flex items-center justify-center rounded-full transition-colors ${
                    theme === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sunken text-left text-ink-2"
          >
            <span className={`size-2 rounded-full ${syncDot}`} />
            <span className="flex-1 truncate">{syncLabel}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onSettings();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sunken text-left"
          >
            <Settings className="size-4 text-ink-2" />
            Settings
          </button>
        </div>
      )}
    </div>
  );
};
