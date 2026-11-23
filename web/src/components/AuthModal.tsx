import { useEffect, useState } from 'react';
import { CheckCircle2, Mail, ShieldCheck, X } from 'lucide-react';
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
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [providers, setProviders] = useState({
    x_oauth_enabled: false,
    github_oauth_enabled: false,
    magic_link_enabled: false,
    dev_email_login_enabled: true,
  });

  useEffect(() => {
    if (open) {
      setError(null);
      setMagicSent(null);
      api.authProviders().then(setProviders).catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  const currentPath = window.location.pathname + window.location.search;
  const nextUrl = encodeURIComponent(currentPath);
  const hasOAuth = providers.x_oauth_enabled || providers.github_oauth_enabled;
  const showEmailForm = providers.magic_link_enabled || providers.dev_email_login_enabled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (providers.magic_link_enabled) {
        const res = await api.requestMagicLink({
          email,
          display_name: displayName || undefined,
          x_handle: xHandle || undefined,
          next: currentPath,
        });
        setMagicSent(res.message);
      } else {
        const res = await api.devLogin({
          email,
          display_name: displayName || undefined,
          x_handle: xHandle || undefined,
        });
        onSuccess(res.user);
        onClose();
      }
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
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">Sign in</h2>
            <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
              Publish your map or claim a draft.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasOAuth && (
          <>
            <div className={`mt-4 grid gap-2 ${providers.x_oauth_enabled && providers.github_oauth_enabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {providers.x_oauth_enabled && (
                <a
                  href={`/auth/x/start?next=${nextUrl}`}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  <span>𝕏</span> Continue with X
                </a>
              )}
              {providers.github_oauth_enabled && (
                <a
                  href={`/auth/github/start?next=${nextUrl}`}
                  className="flex items-center justify-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  Continue with GitHub
                </a>
              )}
            </div>

            {showEmailForm && (
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[var(--border-hairline)]" />
                <span className="font-mono-meta text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                  or email
                </span>
                <div className="h-px flex-1 bg-[var(--border-hairline)]" />
              </div>
            )}
          </>
        )}

        {magicSent ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Magic link sent
            </div>
            <p className="mt-1 leading-relaxed text-emerald-900">{magicSent}</p>
          </div>
        ) : showEmailForm ? (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.org"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm focus:border-[var(--ink-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--ink-secondary)]">X handle (optional)</label>
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
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {providers.magic_link_enabled && <Mail className="h-4 w-4" />}
              {loading
                ? 'Sending…'
                : providers.magic_link_enabled
                  ? 'Email magic sign-in link'
                  : 'Continue'}
            </button>
          </form>
        ) : (
          !hasOAuth && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              No sign-in provider configured yet. Set X OAuth, GitHub OAuth, or Resend API keys on the server.
            </p>
          )
        )}

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2.5 text-[11px] text-[var(--ink-secondary)]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
          <span>Ed25519-signed & Arweave-archived. Export your key anytime.</span>
        </div>
      </div>
    </div>
  );
}
