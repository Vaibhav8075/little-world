import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMemory } from '../../context/MemoryContext';
import { MediaService } from '../../services/mediaService';
import type { MemoryMood, MemoryVisibility, MediaItem, LocationInfo } from '../../types';
import { ImagePlus, X, Play, Lock, Users, Heart, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { imageSrc } from '../../lib/format';

const MOODS: MemoryMood[] = ['happy', 'romantic', 'cozy', 'adventure', 'peaceful', 'funny', 'nostalgic', 'milestone'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const UploadModal: React.FC = () => {
  const { isUploadModalOpen, closeUploadModal, editingMemory, uploadPreset, createMemory, updateMemory, collections, showToast } =
    useMemory();
  const { currentUser, partnerUser } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [story, setStory] = useState('');
  const [date, setDate] = useState(today);
  const [collectionId, setCollectionId] = useState('');
  const [mood, setMood] = useState<MemoryMood | undefined>(undefined);
  const [visibility, setVisibility] = useState<MemoryVisibility>('shared');
  const [isFavorite, setIsFavorite] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [tagsInput, setTagsInput] = useState('');

  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [rawBlobsMap, setRawBlobsMap] = useState<Map<string, Blob>>(new Map());
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Reset the form each time the dialog opens (not when collections reload in the background).
  useEffect(() => {
    if (!isUploadModalOpen) return;
    const m = editingMemory;
    setTitle(m?.title || '');
    setStory(m?.story || '');
    setDate(m?.date || today());
    setCollectionId(m ? m.collectionId || '' : uploadPreset?.collectionId || '');
    setMood(m?.mood);
    setVisibility(m?.visibility || 'shared');
    setIsFavorite(m?.isFavorite || false);
    setLocationName(m?.location?.name || '');
    setCoords(
      m?.location && typeof m.location.lat === 'number' && typeof m.location.lng === 'number'
        ? { lat: m.location.lat, lng: m.location.lng }
        : null
    );
    setTagsInput(m?.tags.join(', ') || '');
    setMediaList(m?.media || []);
    setRawBlobsMap(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUploadModalOpen, editingMemory]);

  const handleFiles = async (files: FileList | File[]) => {
    setIsProcessingMedia(true);
    const tempMemoryId = editingMemory?.id || `temp-${Date.now()}`;
    const newItems: MediaItem[] = [];
    const newBlobs = new Map(rawBlobsMap);
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const item = await MediaService.processAndStoreMedia(file, tempMemoryId, mediaList.length + i);
        newItems.push(item);
        newBlobs.set(item.id, file);

        if (item.metadata?.takenAt && !editingMemory && mediaList.length === 0 && i === 0) {
          setDate(item.metadata.takenAt.split('T')[0]);
        }
        if (item.metadata?.gpsLat && item.metadata?.gpsLng && !coords) {
          setCoords({ lat: item.metadata.gpsLat, lng: item.metadata.gpsLng });
          if (!locationName && item.metadata.locationName) setLocationName(item.metadata.locationName);
        }
      } catch (err) {
        console.error('Error processing file:', err);
        failed++;
      }
    }

    if (failed > 0) showToast(`${failed} file${failed === 1 ? '' : 's'} couldn’t be added`, 'error');
    setRawBlobsMap(newBlobs);
    setMediaList((prev) => [...prev, ...newItems]);
    setIsProcessingMedia(false);
  };

  const removeMedia = (id: string) => {
    setMediaList((prev) => prev.filter((m) => m.id !== id).map((m, order) => ({ ...m, order })));
    setRawBlobsMap((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    let location: LocationInfo | undefined;
    if (locationName.trim()) {
      location = {
        name: locationName.trim(),
        city: locationName.split(',')[0]?.trim(),
        ...(coords || {}),
      };
    } else if (coords) {
      location = { name: `${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)}`, ...coords };
    }

    const data = {
      title: title.trim(),
      story: story.trim(),
      date,
      collectionId: collectionId || undefined,
      mood,
      visibility,
      isFavorite,
      location,
      tags,
      media: mediaList,
    };

    try {
      if (editingMemory) {
        await updateMemory(editingMemory.id, data);
      } else {
        await createMemory({ ...data, authorId: currentUser?.id || 'user-1' }, rawBlobsMap);
      }
      closeUploadModal();
    } catch (err) {
      console.error('Failed to save memory:', err);
      showToast('Couldn’t save. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isUploadModalOpen}
      onClose={closeUploadModal}
      title={editingMemory ? 'Edit memory' : 'New memory'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={closeUploadModal} className="btn btn-ghost">
            Cancel
          </button>
          <button
            type="submit"
            form="memory-form"
            disabled={isSubmitting || isProcessingMedia || !title.trim()}
            className="btn btn-primary min-w-28"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : editingMemory ? 'Save changes' : 'Save'}
          </button>
        </>
      }
    >
      <form id="memory-form" onSubmit={handleSubmit} className="space-y-5">
        {/* Photos */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-xl transition-colors ${isDragOver ? 'bg-accent-soft ring-2 ring-accent' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
              e.target.value = '';
            }}
            className="hidden"
          />

          {mediaList.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink transition-colors"
            >
              {isProcessingMedia ? (
                <Loader2 className="size-6 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="size-7" strokeWidth={1.5} />
                  <span className="font-medium">Add photos or videos</span>
                  <span className="text-[13px] text-ink-3">or drop them here</span>
                </>
              )}
            </button>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {mediaList.map((item, idx) => (
                <div key={item.id} className="relative group aspect-square rounded-lg overflow-hidden bg-sunken">
                  {item.type === 'video' && !item.thumbnailUrl ? (
                    <div className="size-full flex items-center justify-center text-ink-2">
                      <Play className="size-6" />
                    </div>
                  ) : (
                    <img src={imageSrc(item, 'thumb')} alt="" className="size-full object-cover" />
                  )}
                  {idx === 0 && (
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white text-[11px]">
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(item.id)}
                    className="absolute top-1.5 right-1.5 size-7 inline-flex items-center justify-center rounded-full bg-black/60 text-white sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    aria-label="Remove"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingMedia}
                className="aspect-square rounded-lg border-2 border-dashed border-line-strong flex items-center justify-center text-ink-3 hover:text-ink hover:border-ink-3 transition-colors"
                aria-label="Add more"
              >
                {isProcessingMedia ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-6" strokeWidth={1.5} />}
              </button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="m-title" className="label">
            Title
          </label>
          <input
            id="m-title"
            type="text"
            required
            placeholder="Sunset at Vagator"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
          />
        </div>

        <div>
          <label htmlFor="m-story" className="label">
            What happened
          </label>
          <textarea
            id="m-story"
            rows={5}
            placeholder="Write it the way you’d tell it…"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            className="field font-serif text-[17px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="m-date" className="label">
              Date
            </label>
            <input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" required />
          </div>
          <div>
            <label htmlFor="m-album" className="label">
              Album
            </label>
            <select id="m-album" value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="field">
              <option value="">None</option>
              {collections.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="m-place" className="label">
              Place
            </label>
            <input
              id="m-place"
              type="text"
              placeholder="Vagator, Goa"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="field"
            />
            {coords && (
              <p className="mt-1.5 text-[12px] text-ink-3 flex items-center justify-between gap-2">
                <span>Pinned from photo location</span>
                <button type="button" onClick={() => setCoords(null)} className="underline hover:text-ink">
                  Remove pin
                </button>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="m-tags" className="label">
              Tags
            </label>
            <input
              id="m-tags"
              type="text"
              placeholder="beach, roadtrip"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="field"
            />
          </div>
        </div>

        <div>
          <span className="label">Mood</span>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mood === m}
                onClick={() => setMood(mood === m ? undefined : m)}
                className="chip capitalize"
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle
            checked={visibility === 'private'}
            onChange={(on) => setVisibility(on ? 'private' : 'shared')}
            icon={visibility === 'private' ? <Lock className="size-4" /> : <Users className="size-4" />}
            label={visibility === 'private' ? 'Only me' : `Shared with ${partnerUser?.name || 'partner'}`}
            hint="Private memories are hidden from your partner"
          />
          <Toggle
            checked={isFavorite}
            onChange={setIsFavorite}
            icon={<Heart className={`size-4 ${isFavorite ? 'fill-accent text-accent' : ''}`} />}
            label="Favourite"
            hint="Shows up in Favourites"
          />
        </div>
      </form>
    </Modal>
  );
};

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}> = ({ checked, onChange, icon, label, hint }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex items-center gap-3 p-3 rounded-xl border border-line hover:border-line-strong text-left transition-colors"
  >
    <span className="text-ink-2">{icon}</span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-medium truncate">{label}</span>
      <span className="block text-[12px] text-ink-3 truncate">{hint}</span>
    </span>
    <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-ink' : 'bg-line-strong'}`}>
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </span>
  </button>
);
