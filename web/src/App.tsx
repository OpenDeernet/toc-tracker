import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import type { OwnedActorLink, PublicUser } from './types';
import { TopNav } from './components/TopNav';
import { AuthModal } from './components/AuthModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ExploreHome } from './views/ExploreHome';
import { ActorProfile } from './views/ActorProfile';
import { CompareDiff } from './views/CompareDiff';
import { ConceptExplorer } from './views/ConceptExplorer';
import { CruxesDirectory } from './views/CruxesDirectory';
import { MyProfile } from './views/MyProfile';
import { OpenDataDocs } from './views/OpenDataDocs';
import { Studio } from './views/Studio';

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ownedActors, setOwnedActors] = useState<OwnedActorLink[]>([]);
  const [authOpen, setAuthOpen] = useState(false);

  const refreshMe = useCallback(() => {
    api
      .getMe()
      .then((res) => {
        setUser(res.user ?? null);
        setIsAdmin(Boolean(res.is_admin));
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
    setIsAdmin(false);
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
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<ExploreHome />} />
            <Route
              path="/a/:handle"
              element={<ActorProfile user={user} isAdmin={isAdmin} onOpenAuth={() => setAuthOpen(true)} />}
            />
            <Route
              path="/profile"
              element={
                <MyProfile
                  user={user}
                  ownedActors={ownedActors}
                  onOpenAuth={() => setAuthOpen(true)}
                  onSaved={refreshMe}
                />
              }
            />
            <Route path="/compare" element={<CompareDiff />} />
            <Route path="/cruxes" element={<CruxesDirectory />} />
            <Route path="/concept/:rootId" element={<ConceptExplorer />} />
            <Route path="/data" element={<OpenDataDocs />} />
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
        </ErrorBoundary>
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
