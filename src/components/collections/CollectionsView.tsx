import React, { useState } from 'react';
import { useMemory } from '../../context/MemoryContext';
import { Plus, Loader2 } from 'lucide-react';
import { PageHeader } from '../common/PageHeader';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { AlbumCard } from './AlbumCard';
import { plural } from '../../lib/format';

export const CollectionsView: React.FC = () => {
  const { collections, memories, setActiveCollectionId, createCollection } = useMemory();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreate = () => {
    setName('');
    setDescription('');
    setIsCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsSubmitting(true);
    try {
      const col = await createCollection({
        name: name.trim(),
        description: description.trim(),
        icon: 'FolderHeart',
        accentColor: '#b4442b',
      });
      setIsCreateOpen(false);
      setActiveCollectionId(col.id);
    } catch (err) {
      console.error('Failed to create collection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Albums with memories first, then empty ones.
  const albums = collections
    .map((c) => ({ c, items: memories.filter((m) => m.collectionId === c.id) }))
    .sort((a, b) => Number(b.items.length > 0) - Number(a.items.length > 0));

  return (
    <div>
      <PageHeader
        title="Albums"
        description={plural(collections.length, 'album')}
        actions={
          <button onClick={openCreate} className="btn btn-outline btn-sm">
            <Plus className="size-4" />
            New album
          </button>
        }
      />

      {albums.length === 0 ? (
        <EmptyState
          title="No albums yet"
          description="Group memories by trip, season, or anything that belongs together."
          actionLabel="New album"
          onAction={openCreate}
        />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
          {albums.map(({ c, items }) => (
            <AlbumCard key={c.id} collection={c} memories={items} onOpen={() => setActiveCollectionId(c.id)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="New album"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setIsCreateOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button type="submit" form="album-form" disabled={isSubmitting || !name.trim()} className="btn btn-primary min-w-24">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : 'Create'}
            </button>
          </>
        }
      >
        <form id="album-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="a-name" className="label">
              Name
            </label>
            <input
              id="a-name"
              required
              autoFocus
              placeholder="Italy, summer ’25"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="a-desc" className="label">
              Description <span className="text-ink-3 font-normal">(optional)</span>
            </label>
            <textarea
              id="a-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
};
