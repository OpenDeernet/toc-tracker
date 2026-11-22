import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import type { OwnedActorLink, PublicUser } from './types';
import { TopNav } from './components/TopNav';
import { AuthModal } from './components/AuthModal';
import { ExploreHome } from './views/ExploreHome';
import { ActorProfile } from './views/ActorProfile';
import { CompareDiff } from './views/CompareDiff';
import { ConceptExplorer } from './views/ConceptExplorer';
import { CruxesDirectory } from './views/CruxesDirectory';
import { Studio } from './views/Studio';

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [ownedActors, setOwnedActors] = useState<OwnedActorLink[]>([]);
  const [authOpen, setAuthOpen] = useState(false);

  const refreshMe = useCallback(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user ?? null);
        setOwnedActors(res.owned_actors ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  async function handleLogout() {
    await api.logout().catch(() => {});
    setUser(null);
    setOwnedActors([]);
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ink-primary)]">
        <TopNav
          user={user}
          ownedActors={ownedActors}
          onOpenAuth={() => setAuthOpen(true)}
          onLogout={handleLogout}
        />
        <Routes>
          <Route path="/" element={<ExploreHome />} />
          <Route
            path="/a/:handle"
            element={<ActorProfile user={user} onOpenAuth={() => setAuthOpen(true)} />}
          />
          <Route path="/compare" element={<CompareDiff />} />
          <Route path="/cruxes" element={<CruxesDirectory />} />
          <Route path="/concept/:rootId" element={<ConceptExplorer />} />
          <Route
            path="/studio"
            element={
              <Studio
                user={user}
                onOpenAuth={() => setAuthOpen(true)}
                onPublished={refreshMe}
              />
            }
          />
        </Routes>
        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          onSuccess={(u) => {
            setUser(u);
            refreshMe();
          }}
        />
      </div>
    </BrowserRouter>
  );
}
