import React, { useMemo, useState } from 'react';
import { useMemory } from '../../context/MemoryContext';
import { MemoryGrid } from '../memory/MemoryGrid';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { formatDate, plural } from '../../lib/format';

interface CollectionDetailProps {
  collectionId: string;
}

export const CollectionDetail: React.FC<CollectionDetailProps> = ({ collectionId }) => {
  const { collections, memories, setActiveCollectionId, openUploadModal, deleteCollection } = useMemory();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const collection = collections.find((c) => c.id === collectionId);
  const items = useMemo(
    () => memories.filter((m) => m.collectionId === collectionId).sort((a, b) => b.date.localeCompare(a.date)),
    [memories, collectionId]
  );

  const back = (
    <button
      onClick={() => setActiveCollectionId(null)}
      className="inline-flex items-center gap-1.5 -ml-1 mb-4 text-sm text-ink-2 hover:text-ink"
    >
      <ArrowLeft className="size-4" />
      Albums
    </button>
  );

  if (!collection) {
    return (
      <div>
        {back}
        <p className="text-ink-2">This album doesn’t exist anymore.</p>
      </div>
    );
  }

  const range =
    items.length > 0
      ? (() => {
          const first = formatDate(items[items.length - 1].date, 'short');
          const last = formatDate(items[0].date, 'short');
          return first === last ? first : `${first} – ${last}`;
        })()
      : null;

  return (
    <div>
      {back}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-8">
        <div className="min-w-0 max-w-2xl">
          <h1 className="font-serif text-[2rem] sm:text-[2.5rem] leading-[1.1] tracking-[-0.01em]">{collection.name}</h1>
          {collection.description && <p className="mt-2 text-lg text-ink-2">{collection.description}</p>}
          <p className="mt-2 text-sm text-ink-3">
            {plural(items.length, 'memory', 'memories')}
            {range && ` · ${range}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setConfirmDelete(true)} className="icon-btn hover:text-accent" aria-label="Delete album">
            <Trash2 className="size-[18px]" />
          </button>
          <button onClick={() => openUploadModal({ collectionId })} className="btn btn-primary btn-sm">
            <Plus className="size-4" />
            Add memory
          </button>
        </div>
      </header>

      <MemoryGrid
        memories={items}
        emptyTitle="This album is empty"
        emptyDescription="Add a memory here, or pick this album when you edit one."
        emptyAction={{ actionLabel: 'Add memory', onAction: () => openUploadModal({ collectionId }) }}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        title={`Delete “${collection.name}”?`}
        message={
          items.length > 0
            ? `The ${plural(items.length, 'memory', 'memories')} inside won’t be deleted. They just won’t be in an album.`
            : 'This album is empty.'
        }
        confirmLabel="Delete album"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await deleteCollection(collectionId);
        }}
      />
    </div>
  );
};
