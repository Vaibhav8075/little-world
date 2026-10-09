import React from 'react';
import { Plus } from 'lucide-react';
import { useMemory } from '../../context/MemoryContext';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  hideAction?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nothing here yet',
  description = 'Add a photo and a few lines about the day.',
  actionLabel = 'New memory',
  onAction,
  hideAction,
}) => {
  const { openUploadModal } = useMemory();

  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-2xl border border-dashed border-line-strong">
      <h3 className="font-serif text-2xl">{title}</h3>
      <p className="mt-2 max-w-sm text-ink-2">{description}</p>
      {!hideAction && (
        <button type="button" onClick={onAction || (() => openUploadModal())} className="btn btn-primary mt-6">
          <Plus className="size-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
};
