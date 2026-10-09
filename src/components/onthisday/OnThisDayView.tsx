import React from 'react';
import { useMemory } from '../../context/MemoryContext';
import { MemoryGrid } from '../memory/MemoryGrid';
import { PageHeader } from '../common/PageHeader';
import { EmptyState } from '../common/EmptyState';
import { parseLocalDate } from '../../lib/format';
import type { Memory } from '../../types';

function groupByYear(memories: Memory[]): [number, Memory[]][] {
  const byYear = new Map<number, Memory[]>();
  for (const m of memories) {
    const y = parseLocalDate(m.date).getFullYear();
    byYear.set(y, [...(byYear.get(y) || []), m]);
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]);
}

export const OnThisDayView: React.FC = () => {
  const { onThisDayMemories } = useMemory();

  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

  const groups = groupByYear(onThisDayMemories);

  return (
    <div>
      <PageHeader title="On this day" description={`${todayLabel}, in years past`} />

      {groups.length === 0 ? (
        <EmptyState
          title="Nothing from today, yet"
          description={`Memories from ${todayLabel} in earlier years will show up here.`}
          hideAction
        />
      ) : (
        <div className="space-y-12">
          {groups.map(([year, items]) => {
            const ago = today.getFullYear() - year;
            return (
              <section key={year}>
                <h2 className="mb-5 flex items-baseline gap-3">
                  <span className="font-serif text-3xl">{ago === 1 ? 'A year ago' : `${ago} years ago`}</span>
                  <span className="text-sm text-ink-3">{year}</span>
                </h2>
                <MemoryGrid memories={items} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
