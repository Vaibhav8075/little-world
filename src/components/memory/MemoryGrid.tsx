import React from 'react';
import type { Memory } from '../../types';
import { MemoryCard } from './MemoryCard';
import { EmptyState } from '../common/EmptyState';

interface MemoryGridProps {
  memories: Memory[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ComponentProps<typeof EmptyState>;
}

export const MemoryGrid: React.FC<MemoryGridProps> = ({ memories, emptyTitle, emptyDescription, emptyAction }) => {
  if (memories.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} {...emptyAction} />;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8">
      {memories.map((memory) => (
        <MemoryCard key={memory.id} memory={memory} />
      ))}
    </div>
  );
};
