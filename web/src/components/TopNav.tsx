import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { KeyRound, LogOut, Map, Plus, User } from 'lucide-react';
import type { OwnedActorLink, PublicUser } from '../types';
import { api } from '../api/client';

interface TopNavProps {
  user: PublicUser | null;
  ownedActors: OwnedActorLink[];
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function TopNav({ user, ownedActors, onOpenAuth, onLogout }: TopNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const navItems = [
    { to: '/', label: 'Explore', active: pathname === '/' },
    { to: '/compare', label: 'Compare', active: pathname.startsWith('/compare') },
    { to: '/cruxes', label: 'Disagreements', active: pathname.startsWith('/cruxes') || pathname.startsWith('/concept') },
    { to: '/data', label: 'Open Data', active: pathname.startsWith('/data') },
  ];

  async function handleExportKey() {
    try {
      const k = await api.exportKey();
      setExportedKey(JSON.stringify(k, null, 2));
    } catch (e) {
      alert(String(e));
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-2 text-[17px] font-bold tracking-tight text-[var(--ink-primary)]">
              <span>toctracker.com</span>
              <span className="rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
                beta
              </span>
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`relative px-3 py-4 text-sm font-medium transition-colors ${
                    item.active
                      ? 'text-[var(--ink-primary)] after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:bg-[var(--ink-primary)]'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="https://github.com/satori-co/toc-tracker"
              target="_blank"
              rel="noreferrer"
              title="View source & open data on GitHub"
              aria-label="GitHub repository"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] transition hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
            {user ? (
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  <User className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                  <span className="max-w-[120px] truncate">{user.display_name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1.5 w-64 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-2 shadow-lg">
                    <div className="border-b border-[var(--border-hairline)] px-2.5 py-2">
                      <div className="text-xs font-semibold text-[var(--ink-primary)]">{user.display_name}</div>
                      <div className="truncate font-mono-meta text-[10px] text-[var(--ink-muted)]">
                        {user.x_handle ?? user.github_handle ?? `pub: ${user.arweave_pubkey.slice(0, 14)}…`}
                      </div>
                    </div>

                    <div className="border-b border-[var(--border-hairline)] py-1">
                      <Link
                        to="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        <User className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                        <span>{ownedActors.length > 0 ? 'Edit My Profile' : 'Create My Profile'}</span>
                      </Link>
                      {ownedActors.map((a) => (
                        <Link
                          key={a.handle}
                          to={`/a/${a.handle}`}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                        >
                          <Map className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                          <span className="truncate">{a.display_name}</span>
                        </Link>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        handleExportKey();
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Export Signing Key
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-rose-700 hover:bg-rose-50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
              >
                Sign in
              </button>
            )}

            <Link
              to="/studio"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--ink-primary)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Map
            </Link>
          </div>
        </div>
      </header>

      {exportedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-xl">
            <h3 className="text-base font-semibold">Ed25519 Signing Key</h3>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Your Ed25519 key for signing open-data snapshots. Back it up.
            </p>
            <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 font-mono-meta text-[11px] text-[var(--ink-primary)]">
              {exportedKey}
            </pre>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(exportedKey);
                }}
                className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-subtle)]"
              >
                Copy JSON
              </button>
              <button
                onClick={() => setExportedKey(null)}
                className="rounded-lg bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-medium text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
