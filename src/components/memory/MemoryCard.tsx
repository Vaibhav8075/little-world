import React from 'react';
import type { Memory } from '../../types';
import { useMemory } from '../../context/MemoryContext';
import { Heart, Lock, Play } from 'lucide-react';
import { Photo } from '../common/Photo';
import { coverOf, formatDate, imageSrc, placeName } from '../../lib/format';

interface MemoryCardProps {
  memory: Memory;
  /** Larger type for featured placements. */
  large?: boolean;
  aspect?: string;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ memory, large, aspect = 'aspect-[4/5]' }) => {
  const { toggleFavorite, openViewer } = useMemory();
  const cover = coverOf(memory);
  const place = placeName(memory);
  const extra = memory.media.length - 1;

  return (
    <article className="group relative">
      <button
        type="button"
        onClick={() => openViewer(memory)}
        className="block w-full text-left rounded-xl focus-visible:outline-offset-4"
        aria-label={`Open “${memory.title}”`}
      >
        <Photo
          src={cover?.type === 'video' ? cover.thumbnailUrl : imageSrc(cover, large ? 'large' : 'medium')}
          alt={memory.title}
          className={`${aspect} rounded-xl`}
          imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />

        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {memory.visibility === 'private' && (
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-black/55 text-white text-[12px] backdrop-blur-sm">
              <Lock className="size-3" /> Private
            </span>
          )}
          {cover?.type === 'video' && (
            <span className="inline-flex items-center h-6 px-2 rounded-full bg-black/55 text-white backdrop-blur-sm">
              <Play className="size-3 fill-current" />
            </span>
          )}
          {extra > 0 && (
            <span className="inline-flex items-center h-6 px-2 rounded-full bg-black/55 text-white text-[12px] tabular-nums backdrop-blur-sm">
              +{extra}
            </span>
          )}
        </div>

        <div className={large ? 'mt-3' : 'mt-2.5'}>
          <h3 className={`font-serif leading-snug line-clamp-2 ${large ? 'text-2xl' : 'text-[17px] sm:text-lg'}`}>
            {memory.title}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3 truncate">
            {formatDate(memory.date, 'short')}
            {place && ` · ${place}`}
          </p>
        </div>
      </button>

      <button
        type="button"
        aria-label={memory.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
        aria-pressed={memory.isFavorite}
        onClick={() => toggleFavorite(memory.id)}
        className={`absolute top-2 right-2 size-9 inline-flex items-center justify-center rounded-full transition-all ${
          memory.isFavorite
            ? 'text-white'
            : 'text-white/90 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <Heart
          className={`size-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] ${memory.isFavorite ? 'fill-accent text-accent' : ''}`}
        />
      </button>
    </article>
  );
};
