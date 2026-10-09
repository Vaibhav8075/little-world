import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMemory } from '../../context/MemoryContext';
import type { AppNavTab } from '../../context/MemoryContext';
import { MemoryCard } from '../memory/MemoryCard';
import { AlbumCard } from '../collections/AlbumCard';
import { EmptyState } from '../common/EmptyState';
import { Photo } from '../common/Photo';
import { ArrowRight } from 'lucide-react';
import { coverOf, formatDate, imageSrc, parseLocalDate, plural } from '../../lib/format';

function greeting(d: Date) {
  const h = d.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const HomeHero: React.FC = () => {
  const { settings, currentUser } = useAuth();
  const { memories, collections, onThisDayMemories, setActiveTab, setActiveCollectionId, openViewer } = useMemory();

  const now = new Date();
  const recent = useMemo(() => [...memories].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5), [memories]);

  const stats = useMemo(() => {
    const places = new Set(memories.map((m) => m.location?.city || m.location?.name).filter(Boolean));
    const first = memories.reduce<string | null>((min, m) => (!min || m.date < min ? m.date : min), null);
    return { places: places.size, since: first ? parseLocalDate(first).getFullYear() : null };
  }, [memories]);

  const flashback = onThisDayMemories[0];
  const yearsAgo = flashback ? now.getFullYear() - parseLocalDate(flashback.date).getFullYear() : 0;

  const albums = useMemo(
    () =>
      collections
        .map((c) => ({ c, items: memories.filter((m) => m.collectionId === c.id) }))
        .filter((a) => a.items.length > 0)
        .sort((a, b) => b.items.length - a.items.length),
    [collections, memories]
  );

  const goto = (tab: AppNavTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-14 sm:space-y-20">
      <section>
        <p className="text-sm text-ink-3">
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="mt-1 font-serif text-[2.5rem] sm:text-6xl leading-[1.05] tracking-[-0.02em]">
          {greeting(now)}
          {currentUser ? `, ${currentUser.name}` : ''}.
        </h1>
        {settings.appSubtitle && <p className="mt-3 max-w-xl text-lg text-ink-2">{settings.appSubtitle}</p>}
        {memories.length > 0 && (
          <p className="mt-4 text-sm text-ink-3">
            {plural(memories.length, 'memory', 'memories')}
            {stats.places > 0 && ` · ${plural(stats.places, 'place')}`}
            {stats.since && ` · since ${stats.since}`}
          </p>
        )}
      </section>

      {flashback && (
        <section>
          <button
            type="button"
            onClick={() => openViewer(flashback)}
            className="group w-full grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] overflow-hidden card text-left hover:shadow-card transition-shadow"
          >
            <Photo
              src={imageSrc(coverOf(flashback), 'large')}
              alt={flashback.title}
              className="aspect-[4/3] sm:aspect-auto sm:min-h-[320px]"
              imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
              eager
            />
            <div className="p-6 sm:p-10 flex flex-col">
              <p className="text-sm font-medium text-accent">
                On this day · {yearsAgo === 1 ? 'a year ago' : `${yearsAgo} years ago`}
              </p>
              <h2 className="mt-3 font-serif text-3xl sm:text-4xl leading-tight tracking-[-0.01em]">{flashback.title}</h2>
              {flashback.story && (
                <p className="mt-4 font-serif text-lg leading-relaxed text-ink-2 line-clamp-4">{flashback.story}</p>
              )}
              <p className="mt-auto pt-6 text-sm text-ink-3">{formatDate(flashback.date, 'long')}</p>
            </div>
          </button>
          {onThisDayMemories.length > 1 && (
            <button
              onClick={() => goto('on-this-day')}
              className="mt-3 inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
            >
              {onThisDayMemories.length - 1} more from this day <ArrowRight className="size-3.5" />
            </button>
          )}
        </section>
      )}

      <section>
        <SectionHead
          title="Recent"
          action={memories.length > recent.length ? 'All memories' : undefined}
          onAction={() => goto('memories')}
        />
        {recent.length === 0 ? (
          <EmptyState title="Your first memory" description="Add a photo and a few lines about the day. It only takes a minute." />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8">
            {recent.map((m, i) => (
              <div key={m.id} className={i === 0 ? 'col-span-2 lg:row-span-2' : ''}>
                <MemoryCard memory={m} large={i === 0} />
              </div>
            ))}
          </div>
        )}
      </section>

      {albums.length > 0 && (
        <section>
          <SectionHead title="Albums" action="All albums" onAction={() => goto('collections')} />
          <div className="flex gap-5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 pb-2 snap-x scroll-px-4 sm:scroll-px-0">
            {albums.slice(0, 8).map(({ c, items }) => (
              <AlbumCard
                key={c.id}
                collection={c}
                memories={items}
                className="w-56 sm:w-64 shrink-0 snap-start"
                onOpen={() => {
                  setActiveCollectionId(c.id);
                  goto('collections');
                }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const SectionHead: React.FC<{ title: string; action?: string; onAction?: () => void }> = ({ title, action, onAction }) => (
  <div className="flex items-baseline justify-between mb-5">
    <h2 className="font-serif text-[1.75rem] sm:text-3xl tracking-[-0.01em]">{title}</h2>
    {action && (
      <button onClick={onAction} className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        {action} <ArrowRight className="size-3.5" />
      </button>
    )}
  </div>
);
