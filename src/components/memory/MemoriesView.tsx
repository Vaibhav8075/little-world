import React, { useEffect, useMemo, useRef } from 'react';
import { Search, X, Heart, LayoutGrid, Rows3 } from 'lucide-react';
import { useMemory } from '../../context/MemoryContext';
import { useAuth } from '../../context/AuthContext';
import type { Memory, MemoryFilter } from '../../types';
import { PageHeader } from '../common/PageHeader';
import { MemoryGrid } from './MemoryGrid';
import { EmptyState } from '../common/EmptyState';
import { parseLocalDate, plural } from '../../lib/format';

export const MemoriesView: React.FC = () => {
  const { memories, filters, setFilters, resetFilters, collections, activeTab, setActiveTab, searchFocusKey } =
    useMemory();
  const { currentUser, partnerUser } = useAuth();
  const searchRef = useRef<HTMLInputElement>(null);
  const view = activeTab === 'timeline' ? 'timeline' : 'grid';

  useEffect(() => {
    if (searchFocusKey > 0) searchRef.current?.focus();
  }, [searchFocusKey]);

  const filtered = useMemo(
    () => applyFilters(memories, filters, currentUser?.id),
    [memories, filters, currentUser?.id]
  );

  const set = (patch: Partial<MemoryFilter>) => setFilters((prev) => ({ ...prev, ...patch }));

  const isFiltered =
    Boolean(filters.query) ||
    filters.mediaType !== 'all' ||
    (filters.ownership && filters.ownership !== 'all') ||
    Boolean(filters.collectionId) ||
    Boolean(filters.isFavorite);

  const ownership = filters.ownership || 'all';
  const owners: { value: NonNullable<MemoryFilter['ownership']>; label: string }[] = [
    { value: 'all', label: 'Everyone' },
    { value: 'mine', label: 'Mine' },
    { value: 'partner', label: partnerUser ? `${partnerUser.name}’s` : 'Partner’s' },
    { value: 'shared', label: 'Shared' },
  ];

  return (
    <div>
      <PageHeader
        title="Memories"
        description={
          isFiltered ? `${plural(filtered.length, 'memory', 'memories')} match` : plural(memories.length, 'memory', 'memories')
        }
        actions={
          <div className="flex rounded-full bg-sunken p-0.5" role="radiogroup" aria-label="Layout">
            {(
              [
                ['grid', 'Grid', LayoutGrid],
                ['timeline', 'Timeline', Rows3],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={view === value}
                onClick={() => setActiveTab(value === 'grid' ? 'memories' : 'timeline')}
                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-full text-[13px] transition-colors ${
                  view === value ? 'bg-surface text-ink shadow-sm font-medium' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="space-y-3 mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="size-4 text-ink-3 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search memories"
              value={filters.query || ''}
              onChange={(e) => set({ query: e.target.value })}
              className="field pl-10 pr-9 rounded-full"
              aria-label="Search memories"
            />
            {filters.query && (
              <button
                onClick={() => set({ query: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-ink-3 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <select
            value={filters.sortBy || 'date-desc'}
            onChange={(e) => set({ sortBy: e.target.value as MemoryFilter['sortBy'] })}
            className="field w-28 sm:w-40 shrink-0 rounded-full text-sm"
            aria-label="Sort"
          >
            <option value="date-desc">Newest</option>
            <option value="date-asc">Oldest</option>
            <option value="created-desc">Recently added</option>
            <option value="title-asc">A–Z</option>
          </select>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {owners.map((o) => (
            <button key={o.value} type="button" className="chip" aria-pressed={ownership === o.value} onClick={() => set({ ownership: o.value })}>
              {o.label}
            </button>
          ))}
          <span className="w-px h-5 bg-line shrink-0 mx-1" />
          <button
            type="button"
            className="chip"
            aria-pressed={Boolean(filters.isFavorite)}
            onClick={() => set({ isFavorite: !filters.isFavorite })}
          >
            <Heart className={`size-3.5 ${filters.isFavorite ? 'fill-current' : ''}`} />
            Favourites
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={filters.mediaType === 'videos'}
            onClick={() => set({ mediaType: filters.mediaType === 'videos' ? 'all' : 'videos' })}
          >
            Videos
          </button>
          <select
            value={filters.collectionId || ''}
            onChange={(e) => set({ collectionId: e.target.value || undefined })}
            className={`chip appearance-none pr-3 bg-transparent outline-none ${
              filters.collectionId ? 'bg-ink! text-on-ink! border-ink!' : ''
            }`}
            aria-label="Album"
          >
            <option value="">Any album</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name}
              </option>
            ))}
          </select>
          {isFiltered && (
            <button type="button" onClick={resetFilters} className="btn btn-ghost btn-sm shrink-0">
              Clear all
            </button>
          )}
        </div>
      </div>

      {view === 'grid' ? (
        <MemoryGrid
          memories={filtered}
          emptyTitle={memories.length === 0 ? 'No memories yet' : 'Nothing matches'}
          emptyDescription={
            memories.length === 0
              ? 'Add a photo and a few lines about the day.'
              : 'Try a different search, or clear the filters.'
          }
          emptyAction={memories.length === 0 ? undefined : { actionLabel: 'Clear filters', onAction: resetFilters }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          description="Try a different search, or clear the filters."
          actionLabel="Clear filters"
          onAction={resetFilters}
        />
      ) : (
        <Timeline memories={filtered} ascending={filters.sortBy === 'date-asc'} />
      )}
    </div>
  );
};

const Timeline: React.FC<{ memories: Memory[]; ascending: boolean }> = ({ memories, ascending }) => {
  const groups = useMemo(() => {
    const sorted = [...memories].sort((a, b) =>
      ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)
    );
    const years: { year: string; months: { key: string; label: string; items: Memory[] }[] }[] = [];
    for (const mem of sorted) {
      const d = parseLocalDate(mem.date);
      const year = String(d.getFullYear());
      const key = `${year}-${d.getMonth()}`;
      let y = years.find((g) => g.year === year);
      if (!y) years.push((y = { year, months: [] }));
      let m = y.months.find((g) => g.key === key);
      if (!m) y.months.push((m = { key, label: d.toLocaleString('en-GB', { month: 'long' }), items: [] }));
      m.items.push(mem);
    }
    return years;
  }, [memories, ascending]);

  return (
    <div className="space-y-14">
      {groups.map((y) => (
        <section key={y.year}>
          <h2 className="sticky top-14 sm:top-16 z-10 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-paper/90 backdrop-blur-lg font-serif text-4xl sm:text-5xl tracking-tight">
            {y.year}
          </h2>
          <div className="mt-4 space-y-10">
            {y.months.map((m) => (
              <div key={m.key}>
                <h3 className="mb-4 text-sm font-medium text-ink-2">
                  {m.label} <span className="text-ink-3 font-normal">· {m.items.length}</span>
                </h3>
                <MemoryGrid memories={m.items} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

function applyFilters(memories: Memory[], filters: MemoryFilter, currentUserId?: string): Memory[] {
  let list = [...memories];
  const q = filters.query?.toLowerCase().trim();

  if (q) {
    const needle = q.replace(/^#/, '');
    list = list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.story.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(needle)) ||
        m.location?.name.toLowerCase().includes(q) ||
        m.location?.city?.toLowerCase().includes(q)
    );
  }
  if (filters.mediaType === 'photos') list = list.filter((m) => m.media.some((i) => i.type === 'photo'));
  if (filters.mediaType === 'videos') list = list.filter((m) => m.media.some((i) => i.type === 'video'));
  if (filters.ownership === 'mine') list = list.filter((m) => m.authorId === currentUserId);
  if (filters.ownership === 'partner') list = list.filter((m) => m.authorId !== currentUserId);
  if (filters.ownership === 'shared') list = list.filter((m) => m.visibility === 'shared');
  if (filters.collectionId) list = list.filter((m) => m.collectionId === filters.collectionId);
  if (filters.isFavorite) list = list.filter((m) => m.isFavorite);

  const sortBy = filters.sortBy || 'date-desc';
  list.sort((a, b) => {
    if (sortBy === 'date-asc') return a.date.localeCompare(b.date);
    if (sortBy === 'created-desc') return b.createdAt.localeCompare(a.createdAt);
    if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
    return b.date.localeCompare(a.date);
  });
  return list;
}
