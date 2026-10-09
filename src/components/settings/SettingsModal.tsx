import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMemory } from '../../context/MemoryContext';
import { useTheme } from '../../context/ThemeContext';
import { StorageService } from '../../services/storageService';
import { GoogleDriveService } from '../../services/storage/GoogleDriveService';
import type { DriveStorageInfo } from '../../services/storage/StorageProvider';
import { Download, Upload, Loader2, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Avatar } from '../common/Avatar';

type Section = 'general' | 'backup';

export const SettingsModal: React.FC = () => {
  const { settings, partner1, partner2, updateUserProfile, updateSettings } = useAuth();
  const {
    isSettingsModalOpen,
    closeSettingsModal,
    storageStats,
    reloadAll,
    resetToDemoData,
    showToast,
    syncState,
    connectGoogleDrive,
    connectGoogleDriveWithToken,
    reconnectGoogleDrive,
    disconnectGoogleDrive,
    syncNow,
  } = useMemory();
  const { theme, setTheme } = useTheme();

  const [section, setSection] = useState<Section>('general');
  const [isDriveConnecting, setIsDriveConnecting] = useState(false);
  const [confirm, setConfirm] = useState<'disconnect' | 'reset' | null>(null);
  const [driveQuota, setDriveQuota] = useState<DriveStorageInfo | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useToken, setUseToken] = useState(false);
  const [customToken, setCustomToken] = useState('');
  const [customClientId, setCustomClientId] = useState('');

  const [p1Name, setP1Name] = useState('');
  const [p1Pin, setP1Pin] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p2Pin, setP2Pin] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const [appSubtitle, setAppSubtitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Load current values every time the dialog opens.
  useEffect(() => {
    if (!isSettingsModalOpen) return;
    setP1Name(partner1?.name || '');
    setP2Name(partner2?.name || '');
    setP1Pin('');
    setP2Pin('');
    setAppTitle(settings.appTitle || 'Our Little World');
    setAppSubtitle(settings.appSubtitle || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettingsModalOpen]);

  useEffect(() => {
    if (isSettingsModalOpen && GoogleDriveService.isConnected()) {
      StorageService.getGoogleDriveStorageInfo().then(setDriveQuota);
    }
  }, [isSettingsModalOpen, syncState.status]);

  const isDriveConnected = GoogleDriveService.isConnected();
  const driveConfig = GoogleDriveService.getConfig();
  const rootUrl = GoogleDriveService.getRootFolderUrl();
  const rootName = driveConfig?.rootFolderName || 'Our Little World';

  const handleConnectDrive = async () => {
    setIsDriveConnecting(true);
    try {
      if (useToken && customToken.trim()) {
        await connectGoogleDriveWithToken(customToken.trim());
      } else {
        await connectGoogleDrive(customClientId.trim() || undefined);
      }
      setDriveQuota(await StorageService.getGoogleDriveStorageInfo());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Couldn’t connect to Google Drive', 'error');
    } finally {
      setIsDriveConnecting(false);
    }
  };

  const pinValid = (p: string) => p === '' || /^\d{4,6}$/.test(p);

  const handleSaveProfiles = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!p1Name.trim() || !p2Name.trim()) {
      showToast('Names can’t be empty', 'error');
      return;
    }
    if (!pinValid(p1Pin) || !pinValid(p2Pin)) {
      showToast('PINs must be 4–6 digits', 'error');
      return;
    }
    setIsSaving(true);
    try {
      // Only touch profiles that changed: a newer save wins on other devices, so rewriting an unchanged
      // profile could undo a PIN the other person just set on their phone.
      if (partner1 && (p1Name.trim() !== partner1.name || p1Pin))
        await updateUserProfile({ ...partner1, name: p1Name.trim() }, p1Pin || undefined);
      if (partner2 && (p2Name.trim() !== partner2.name || p2Pin))
        await updateUserProfile({ ...partner2, name: p2Name.trim() }, p2Pin || undefined);
      await updateSettings({ appTitle: appTitle.trim() || 'Our Little World', appSubtitle: appSubtitle.trim() });
      showToast('Settings saved', 'success');
      closeSettingsModal();
    } catch {
      showToast('Couldn’t save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      await StorageService.exportBackupJSON();
      showToast('Backup downloaded', 'success');
    } catch {
      showToast('Backup failed', 'error');
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const res = await StorageService.importBackupJSON(file);
      if (res.success) {
        await reloadAll();
        showToast(`Restored ${res.count} memories`, 'success');
        closeSettingsModal();
      } else {
        showToast(res.error || 'Restore failed', 'error');
      }
    } catch {
      showToast('That file couldn’t be restored', 'error');
    }
  };

  const usedPct = driveQuota && driveQuota.limitBytes > 0 ? (driveQuota.usageBytes / driveQuota.limitBytes) * 100 : 0;

  return (
    <>
      <Modal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} title="Settings" size="lg">
        <div className="flex gap-1 p-0.5 rounded-full bg-sunken w-fit mb-6" role="tablist">
          {(
            [
              ['general', 'General'],
              ['backup', 'Backup & sync'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={section === value}
              onClick={() => setSection(value)}
              className={`h-8 px-4 rounded-full text-sm transition-colors ${
                section === value ? 'bg-surface text-ink shadow-sm font-medium' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {section === 'general' && (
          <form onSubmit={handleSaveProfiles} className="space-y-8">
            <Group title="Journal">
              <div className="space-y-4">
                <div>
                  <label htmlFor="s-title" className="label">
                    Name
                  </label>
                  <input id="s-title" value={appTitle} onChange={(e) => setAppTitle(e.target.value)} className="field" />
                </div>
                <div>
                  <label htmlFor="s-sub" className="label">
                    Tagline <span className="text-ink-3 font-normal">(shown on Home)</span>
                  </label>
                  <input id="s-sub" value={appSubtitle} onChange={(e) => setAppSubtitle(e.target.value)} className="field" />
                </div>
              </div>
            </Group>

            <Group title="The two of you">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { user: partner1, name: p1Name, setName: setP1Name, pin: p1Pin, setPin: setP1Pin },
                  { user: partner2, name: p2Name, setName: setP2Name, pin: p2Pin, setPin: setP2Pin },
                ].map(({ user, name, setName, pin, setPin }, i) => (
                  <div key={i} className="p-4 rounded-xl border border-line space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar user={user ? { ...user, name: name || user.name } : null} size={28} />
                      <span className="text-sm font-medium">{name || `Person ${i + 1}`}</span>
                    </div>
                    <input
                      aria-label="Name"
                      placeholder="Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="field"
                    />
                    <input
                      aria-label="New PIN"
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      placeholder="New PIN (leave blank to keep)"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="field"
                    />
                  </div>
                ))}
              </div>
            </Group>

            <Group title="Appearance">
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <button key={t} type="button" className="chip capitalize" aria-pressed={theme === t} onClick={() => setTheme(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </Group>

            <div className="flex justify-end">
              <button type="submit" disabled={isSaving} className="btn btn-primary min-w-28">
                {isSaving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
              </button>
            </div>
          </form>
        )}

        {section === 'backup' && (
          <div className="space-y-8">
            <Group
              title="Google Drive"
              aside={
                isDriveConnected ? (
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                    <span className="size-2 rounded-full bg-emerald-500" /> Connected
                  </span>
                ) : (
                  <span className="text-[13px] text-ink-3">Not connected</span>
                )
              }
            >
              {isDriveConnected ? (
                <div className="space-y-4">
                  <p className="text-sm text-ink-2">
                    Originals are copied to <span className="text-ink">{driveConfig?.userEmail || 'your Google account'}</span>{' '}
                    as they’re added:
                  </p>
                  <ul className="text-sm rounded-xl border border-line divide-y divide-line">
                    {[
                      ['Shared memories', `${rootName} / Shared / Photos, Videos`],
                      [`${partner1?.name}’s private`, `${rootName} / ${driveConfig?.partner1FolderName || partner1?.name} / Photos, Videos`],
                      [`${partner2?.name}’s private`, `${rootName} / ${driveConfig?.partner2FolderName || partner2?.name} / Photos, Videos`],
                      ['Stories & albums', `${rootName} / Shared / Metadata / our-little-world.json`],
                    ].map(([what, where]) => (
                      <li key={what} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4 px-3.5 py-2.5">
                        <span className="text-ink-2 shrink-0">{what}</span>
                        <span className="sm:text-right break-words">{where}</span>
                      </li>
                    ))}
                  </ul>

                  {syncState.needsReauth ? (
                    <div className="p-3.5 rounded-xl bg-accent-soft text-sm flex flex-wrap items-center justify-between gap-3">
                      <span>Google sign-in expired. {syncState.pendingUploads > 0 && `${syncState.pendingUploads} waiting to upload.`}</span>
                      <button type="button" onClick={reconnectGoogleDrive} className="btn btn-primary btn-sm">
                        Reconnect
                      </button>
                    </div>
                  ) : syncState.status === 'syncing' && syncState.pendingUploads > 0 ? (
                    <p className="text-sm text-ink-2">
                      Uploading{syncState.currentFileName ? ` “${syncState.currentFileName}”` : ''}… {syncState.progress || 0}%
                      {syncState.pendingUploads > 1 && ` · ${syncState.pendingUploads - 1} more after this`}
                    </p>
                  ) : syncState.status === 'syncing' && syncState.pendingDownloads ? (
                    <p className="text-sm text-ink-2">Getting {syncState.pendingDownloads} new photos from Drive…</p>
                  ) : syncState.lastSyncTime ? (
                    <p className="text-sm text-ink-3">
                      Checks for new memories every minute while open · last synced{' '}
                      {new Date(syncState.lastSyncTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  ) : null}

                  {driveQuota && driveQuota.limitBytes > 0 && (
                    <Meter
                      label="Drive storage"
                      value={`${StorageService.formatBytes(driveQuota.usageBytes)} of ${StorageService.formatBytes(
                        driveQuota.limitBytes
                      )}`}
                      pct={usedPct}
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={syncNow}
                      disabled={syncState.status === 'syncing'}
                      className="btn btn-primary btn-sm"
                    >
                      <RefreshCw className={`size-3.5 ${syncState.status === 'syncing' ? 'animate-spin' : ''}`} />
                      {syncState.status === 'syncing' ? 'Syncing…' : 'Sync now'}
                    </button>
                    {rootUrl && (
                      <a href={rootUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                        Open in Drive <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    <button type="button" onClick={() => setConfirm('disconnect')} className="btn btn-danger btn-sm ml-auto">
                      Disconnect
                    </button>
                  </div>
                  {syncState.status === 'error' && !syncState.needsReauth && syncState.errorMessage && (
                    <p className="text-sm text-accent">{syncState.errorMessage}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-ink-2">
                    Everything is saved in this browser. Connect one Google account and every photo and video is copied
                    into a “{rootName}” folder in Drive, with a folder for each of you and one for shared memories.
                  </p>
                  <button type="button" disabled={isDriveConnecting} onClick={handleConnectDrive} className="btn btn-primary">
                    {isDriveConnecting && <Loader2 className="size-4 animate-spin" />}
                    Connect Google Drive
                  </button>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((v) => !v)}
                      className="inline-flex items-center gap-1 text-[13px] text-ink-2 hover:text-ink"
                    >
                      Advanced
                      <ChevronDown className={`size-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 space-y-3 p-4 rounded-xl bg-sunken">
                        <div className="flex gap-2">
                          <button type="button" className="chip" aria-pressed={!useToken} onClick={() => setUseToken(false)}>
                            OAuth client ID
                          </button>
                          <button type="button" className="chip" aria-pressed={useToken} onClick={() => setUseToken(true)}>
                            Access token
                          </button>
                        </div>
                        {useToken ? (
                          <input
                            type="password"
                            aria-label="Access token"
                            placeholder="ya29.…  (needs drive.file scope)"
                            value={customToken}
                            onChange={(e) => setCustomToken(e.target.value)}
                            className="field font-mono text-sm"
                          />
                        ) : (
                          <input
                            aria-label="OAuth client ID"
                            placeholder="Optional if set in .env"
                            value={customClientId}
                            onChange={(e) => setCustomClientId(e.target.value)}
                            className="field font-mono text-sm"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Group>

            {storageStats && (
              <Group title="This device">
                <Meter
                  label={`${storageStats.memoryCount} memories · ${storageStats.photoCount} photos · ${storageStats.videoCount} videos`}
                  value={StorageService.formatBytes(storageStats.usedBytes)}
                  pct={storageStats.usagePercentage}
                />
              </Group>
            )}

            <Group title="Backup file">
              <p className="text-sm text-ink-2 mb-3">Download everything as a single file, or restore from one.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleExportBackup} className="btn btn-outline btn-sm">
                  <Download className="size-3.5" /> Download backup
                </button>
                <label className="btn btn-outline btn-sm cursor-pointer">
                  <Upload className="size-3.5" /> Restore
                  <input type="file" accept=".json,application/json" onChange={handleImportBackup} className="hidden" />
                </label>
              </div>
            </Group>

            <Group title="Reset">
              <button type="button" onClick={() => setConfirm('reset')} className="btn btn-danger btn-sm -ml-3">
                Replace everything with demo memories
              </button>
            </Group>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={confirm === 'disconnect'}
        title="Disconnect Google Drive?"
        message="Nothing in Drive will be deleted, and your memories stay on this device. New memories just won’t be backed up."
        confirmLabel="Disconnect"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await disconnectGoogleDrive();
          setDriveQuota(null);
        }}
      />
      <ConfirmDialog
        isOpen={confirm === 'reset'}
        title="Replace with demo memories?"
        message="All memories on this device will be replaced by the demo set. Download a backup first if you want to keep them."
        confirmLabel="Replace"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await resetToDemoData();
          closeSettingsModal();
        }}
      />
    </>
  );
};

const Group: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section>
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-medium">{title}</h3>
      {aside}
    </div>
    {children}
  </section>
);

const Meter: React.FC<{ label: string; value: string; pct: number }> = ({ label, value, pct }) => (
  <div>
    <div className="flex justify-between gap-4 text-sm mb-2">
      <span className="text-ink-2">{label}</span>
      <span className="tabular-nums shrink-0">{value}</span>
    </div>
    <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
      <div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(1, Math.min(100, pct))}%` }} />
    </div>
  </div>
);
