import React, { useState, useEffect, useCallback } from 'react';
import type { Memory } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useMemory } from '../../context/MemoryContext';
import { MemoryService } from '../../services/memoryService';
import { X, ChevronLeft, ChevronRight, Heart, MapPin, Lock, Pencil, Trash2, Camera, BookImage } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { Photo } from '../common/Photo';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { authorOf, coverOf, formatDate, imageSrc, placeName } from '../../lib/format';

export const MemoryViewer: React.FC = () => {
  const { activeMemoryForViewer: memory } = useMemory();
  if (!memory) return null;
  // Keyed so per-memory state (current photo, related list) resets when the memory changes.
  return <ViewerContent key={memory.id} memory={memory} />;
};

const ViewerContent: React.FC<{ memory: Memory }> = ({ memory }) => {
  const {
    closeViewer,
    toggleFavorite,
    openEditModal,
    openViewer,
    deleteMemory,
    collections,
    isUploadModalOpen,
  } = useMemory();
  const { currentUser, partner1, partner2 } = useAuth();

  const [mediaIndex, setMediaIndex] = useState(0);
  const [related, setRelated] = useState<Memory[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    MemoryService.getRelatedMemories(memory, currentUser, 4).then((r) => !cancelled && setRelated(r));
    return () => {
      cancelled = true;
    };
  }, [memory, currentUser]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const count = memory.media.length;
  const current = memory.media[mediaIndex] || memory.media[0];
  const next = useCallback(() => count > 1 && setMediaIndex((i) => (i + 1) % count), [count]);
  const prev = useCallback(() => count > 1 && setMediaIndex((i) => (i - 1 + count) % count), [count]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't react while a form or another dialog is on top of the viewer.
      const target = e.target as HTMLElement;
      if (isUploadModalOpen || confirmDelete || target.closest('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('[data-modal-open]')) return;
      if (e.key === 'Escape') closeViewer();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeViewer, next, prev, isUploadModalOpen, confirmDelete]);

  const author = authorOf(memory, partner1, partner2);
  const isAuthor = currentUser?.id === memory.authorId;
  const album = collections.find((c) => c.id === memory.collectionId);
  const place = placeName(memory);
  const meta = current?.metadata;
  const cameraLine = [meta?.camera, meta?.lens].filter(Boolean).join(' · ');
  const exposureLine = [meta?.focalLength, meta?.aperture, meta?.exposureTime, meta?.iso && `ISO ${meta.iso}`]
    .filter(Boolean)
    .join('  ');

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-paper animate-fade" role="dialog" aria-modal="true" aria-label={memory.title}>
      {/* Photo stage */}
      <div className="relative shrink-0 h-[56dvh] lg:h-auto lg:flex-1 bg-[#0c0b0a] flex flex-col">
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between p-3 sm:p-4">
          <button
            onClick={closeViewer}
            className="size-10 inline-flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
          {count > 1 && (
            <span className="h-8 px-3 inline-flex items-center rounded-full bg-black/40 text-white/90 text-[13px] tabular-nums backdrop-blur-sm">
              {mediaIndex + 1} / {count}
            </span>
          )}
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center p-2 sm:p-8">
          {!current ? (
            <p className="text-white/50 text-sm">No photos</p>
          ) : current.type === 'video' ? (
            <video key={current.id} src={current.url} controls playsInline className="max-h-full max-w-full rounded-md" />
          ) : (
            <img
              key={current.id}
              src={imageSrc(current, 'large')}
              alt={current.caption || memory.title}
              className="max-h-full max-w-full object-contain rounded-md animate-fade"
            />
          )}

          {count > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm"
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                onClick={next}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 size-11 inline-flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm"
                aria-label="Next photo"
              >
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
        </div>

        {count > 1 && (
          <div className="hidden sm:flex justify-center gap-2 pb-4 px-4 overflow-x-auto no-scrollbar">
            {memory.media.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setMediaIndex(idx)}
                className={`size-14 shrink-0 rounded-md overflow-hidden transition-opacity ${
                  idx === mediaIndex ? 'ring-2 ring-white opacity-100' : 'opacity-50 hover:opacity-80'
                }`}
                aria-label={`Show item ${idx + 1}`}
              >
                <Photo src={imageSrc(item, 'thumb')} alt="" className="size-full" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Story panel */}
      <aside className="flex-1 lg:flex-none lg:w-[420px] min-h-0 overflow-y-auto bg-surface lg:border-l border-line">
        <div className="p-5 sm:p-7 space-y-6">
          <div className="flex items-center gap-3">
            <Avatar user={author} size={36} />
            <div className="min-w-0 flex-1 text-sm leading-tight">
              <p className="font-medium">{author?.name || 'Unknown'}</p>
              <p className="text-ink-3">{formatDate(memory.date, 'long')}</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => toggleFavorite(memory.id)}
                className={`icon-btn ${memory.isFavorite ? 'text-accent hover:text-accent' : ''}`}
                aria-label={memory.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                aria-pressed={memory.isFavorite}
              >
                <Heart className={`size-5 ${memory.isFavorite ? 'fill-current' : ''}`} />
              </button>
              {isAuthor && (
                <>
                  <button onClick={() => openEditModal(memory)} className="icon-btn" aria-label="Edit">
                    <Pencil className="size-[18px]" />
                  </button>
                  <button onClick={() => setConfirmDelete(true)} className="icon-btn hover:text-accent" aria-label="Delete">
                    <Trash2 className="size-[18px]" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <h2 className="font-serif text-3xl leading-tight tracking-[-0.01em]">{memory.title}</h2>
            {memory.visibility === 'private' && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-2">
                <Lock className="size-3.5" /> Only visible to {author?.name || 'the author'}
              </p>
            )}
          </div>

          {memory.story && (
            <p className="font-serif text-[18px] leading-[1.65] text-ink whitespace-pre-line">{memory.story}</p>
          )}

          {current?.caption && <p className="text-sm text-ink-2">{current.caption}</p>}

          <dl className="space-y-3 text-sm border-t border-line pt-5">
            {place && (
              <Detail icon={<MapPin className="size-4" />} label="Place">
                {memory.location?.name}
              </Detail>
            )}
            {album && (
              <Detail icon={<BookImage className="size-4" />} label="Album">
                {album.name}
              </Detail>
            )}
            {cameraLine && (
              <Detail icon={<Camera className="size-4" />} label="Camera">
                {cameraLine}
                {exposureLine && <span className="block text-ink-3 tabular-nums">{exposureLine}</span>}
              </Detail>
            )}
          </dl>

          {(memory.tags.length > 0 || memory.mood) && (
            <div className="flex flex-wrap gap-1.5">
              {memory.mood && <span className="chip capitalize pointer-events-none">{memory.mood}</span>}
              {memory.tags.map((t) => (
                <span key={t} className="chip pointer-events-none">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {related.length > 0 && (
            <div className="border-t border-line pt-5">
              <h3 className="text-sm font-medium text-ink-2 mb-3">More like this</h3>
              <div className="grid grid-cols-2 gap-3">
                {related.map((rel) => (
                  <button key={rel.id} onClick={() => openViewer(rel)} className="text-left group">
                    <Photo src={imageSrc(coverOf(rel), 'thumb')} alt={rel.title} className="aspect-[4/3] rounded-lg" />
                    <p className="mt-1.5 text-[13px] leading-snug line-clamp-2 group-hover:underline">{rel.title}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete this memory?"
        message={`“${memory.title}” and its photos will be removed for both of you. This can’t be undone.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          setConfirmDelete(false);
          await deleteMemory(memory.id);
          closeViewer();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
};

const Detail: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex gap-3">
    <dt className="text-ink-3 mt-0.5" aria-label={label}>
      {icon}
    </dt>
    <dd className="min-w-0">{children}</dd>
  </div>
);
