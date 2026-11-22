import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { KeyRound, LogOut, Plus, User } from 'lucide-react';
import type { PublicUser } from '../types';
import { api } from '../api/client';

interface TopNavProps {
  user: PublicUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function TopNav({ user, onOpenAuth, onLogout }: TopNavProps) {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportedKey, setExportedKey] = useState<string | null>(null);

  const navItems = [
    { to: '/', label: 'Explore', active: pathname === '/' },
    { to: '/compare', label: 'Compare', active: pathname.startsWith('/compare') },
    { to: '/cruxes', label: 'Cruxes', active: pathname.startsWith('/cruxes') || pathname.startsWith('/concept') },
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
              <span>toc.open</span>
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
            {user ? (
              <div className="relative">
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
                        pub: {user.arweave_pubkey.slice(0, 18)}…
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        handleExportKey();
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Export Open-Data Keypair
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
              Map Your ToC
            </Link>
          </div>
        </div>
      </header>

      {exportedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-lg rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-xl">
            <h3 className="text-base font-semibold">Your Open-Data Signing Keypair</h3>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              toc.open provisions an Ed25519 identity automatically so you own your Arweave records without touching crypto wallets. Store this backup safely.
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
