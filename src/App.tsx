import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { MemoryProvider, useMemory } from './context/MemoryContext';
import { ThemeProvider } from './context/ThemeContext';
import { AppHeader } from './components/common/AppHeader';
import { MobileNav } from './components/common/MobileNav';
import { ToastContainer } from './components/common/Toast';
import { PinAuthModal } from './components/auth/PinAuthModal';
import { HomeHero } from './components/home/HomeHero';
import { MemoriesView } from './components/memory/MemoriesView';
import { MemoryViewer } from './components/memory/MemoryViewer';
import { UploadModal } from './components/memory/UploadModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { CollectionsView } from './components/collections/CollectionsView';
import { CollectionDetail } from './components/collections/CollectionDetail';
import { MemoryMapView } from './components/map/MemoryMapView';
import { OnThisDayView } from './components/onthisday/OnThisDayView';
import { WhoIsHere } from './components/auth/WhoIsHere';
import { useAuth } from './context/AuthContext';

const MainAppContent: React.FC = () => {
  const { activeTab, activeCollectionId, isLoading } = useMemory();
  const { currentUser, isLoading: isAuthLoading } = useAuth();

  if (isLoading || isAuthLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="size-6 rounded-full border-2 border-line-strong border-t-ink animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <WhoIsHere />
        <PinAuthModal />
      </>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <AppHeader />

      <main key={activeTab} className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-28 md:pb-16 animate-enter">
        {activeTab === 'home' && <HomeHero />}
        {(activeTab === 'memories' || activeTab === 'timeline' || activeTab === 'favorites') && <MemoriesView />}
        {activeTab === 'collections' &&
          (activeCollectionId ? <CollectionDetail collectionId={activeCollectionId} /> : <CollectionsView />)}
        {activeTab === 'map' && <MemoryMapView />}
        {activeTab === 'on-this-day' && <OnThisDayView />}
      </main>

      <MemoryViewer />
      <UploadModal />
      <PinAuthModal />
      <SettingsModal />
      <ToastContainer />
      <MobileNav />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MemoryProvider>
          <MainAppContent />
        </MemoryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
