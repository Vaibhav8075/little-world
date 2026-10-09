import React from 'react';
import { useMemory } from '../../context/MemoryContext';
import type { AppNavTab } from '../../context/MemoryContext';
import { Home, Images, Plus, BookImage, Map } from 'lucide-react';

const ITEMS: { tab: AppNavTab; label: string; Icon: typeof Home }[] = [
  { tab: 'home', label: 'Home', Icon: Home },
  { tab: 'memories', label: 'Memories', Icon: Images },
  { tab: 'collections', label: 'Albums', Icon: BookImage },
  { tab: 'map', label: 'Map', Icon: Map },
];

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, setActiveCollectionId, openUploadModal } = useMemory();

  const handleNav = (tab: AppNavTab) => {
    setActiveCollectionId(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0 });
  };

  const renderItem = ({ tab, label, Icon }: (typeof ITEMS)[number]) => {
    const isActive = activeTab === tab || (tab === 'memories' && activeTab === 'timeline');
    return (
      <button
        key={tab}
        onClick={() => handleNav(tab)}
        aria-current={isActive ? 'page' : undefined}
        className={`flex-1 flex flex-col items-center gap-1 py-2 text-[11px] transition-colors ${
          isActive ? 'text-ink font-medium' : 'text-ink-3'
        }`}
      >
        <Icon className="size-[22px]" strokeWidth={isActive ? 2.1 : 1.7} />
        {label}
      </button>
    );
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper/90 backdrop-blur-lg border-t border-line pb-safe"
      aria-label="Main"
    >
      <div className="flex items-center px-2">
        {ITEMS.slice(0, 2).map(renderItem)}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => openUploadModal()}
            className="size-12 -mt-1 rounded-full bg-ink text-on-ink inline-flex items-center justify-center shadow-card active:scale-95 transition-transform"
            aria-label="New memory"
          >
            <Plus className="size-6" />
          </button>
        </div>
        {ITEMS.slice(2).map(renderItem)}
      </div>
    </nav>
  );
};
