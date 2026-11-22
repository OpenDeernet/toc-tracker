import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { api } from '../api/client';
import type { PublicUser } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: PublicUser) => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.devLogin({
        email,
        display_name: displayName || undefined,
        x_handle: xHandle || undefined,
      });
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">Sign in to toc.open</h2>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Publish your living Theory of Change or claim a community-mapped profile.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href="/auth/x/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <span>𝕏</span> Continue with X
          </a>
          <a
            href="/auth/github/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            GitHub
          </a>
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--border-hairline)]" />
          <span className="font-mono-meta text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
            or instant email sign-in
          </span>
          <div className="h-px flex-1 bg-[var(--border-hairline)]" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="researcher@example.org"
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--ink-primary)] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">X Handle (optional)</label>
              <input
                type="text"
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                placeholder="@handle"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-xs font-medium text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--ink-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Continue'}
          </button>
        </form>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 text-[11px] text-[var(--ink-secondary)]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <span>
            <strong>Zero-crypto open ownership:</strong> We silently provision an exportable Ed25519 signing keypair and archive your snapshots to Arweave so you own your data permanently.
          </span>
        </div>
      </div>
    </div>
  );
}
