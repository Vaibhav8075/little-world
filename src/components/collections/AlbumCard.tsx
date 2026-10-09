import React from 'react';
import type { Collection, Memory } from '../../types';
import { Photo } from '../common/Photo';
import { coverOf, imageSrc, plural } from '../../lib/format';

interface AlbumCardProps {
  collection: Collection;
  memories: Memory[];
  onOpen: () => void;
  className?: string;
}

/** Album cover with up to two photos peeking behind it, like a small stack of prints. */
export const AlbumCard: React.FC<AlbumCardProps> = ({ collection, memories, onOpen, className = '' }) => {
  const withPhotos = memories.filter((m) => m.media.length > 0);
  const cover = collection.coverMediaUrl || imageSrc(coverOf(withPhotos[0]), 'medium');
  const behind = withPhotos.slice(1, 3).map((m) => imageSrc(coverOf(m), 'thumb'));

  return (
    <button type="button" onClick={onOpen} className={`group text-left ${className}`}>
      <div className="relative pt-2.5">
        {behind[1] && (
          <div className="absolute inset-x-6 top-0 h-full rounded-xl overflow-hidden opacity-50 bg-sunken" aria-hidden>
            <img src={behind[1]} alt="" className="size-full object-cover" />
          </div>
        )}
        {behind[0] && (
          <div className="absolute inset-x-3 top-1.5 h-full rounded-xl overflow-hidden opacity-75 bg-sunken" aria-hidden>
            <img src={behind[0]} alt="" className="size-full object-cover" />
          </div>
        )}
        <Photo
          src={cover}
          alt={collection.name}
          className="relative aspect-[4/3] rounded-xl shadow-card"
          imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      </div>
      <h3 className="mt-3 font-serif text-lg leading-snug group-hover:underline underline-offset-4 decoration-1">
        {collection.name}
      </h3>
      <p className="text-[13px] text-ink-3">{plural(memories.length, 'memory', 'memories')}</p>
    </button>
  );
};
