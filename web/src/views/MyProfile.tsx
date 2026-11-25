import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { OwnedActorLink, PublicUser, ReferenceLink } from '../types';
import { SimpleMarkdown } from '../components/SimpleMarkdown';

interface MyProfileProps {
  user: PublicUser | null;
  ownedActors: OwnedActorLink[];
  onOpenAuth: () => void;
  onSaved: () => void;
}

export function MyProfile({ user, ownedActors, onOpenAuth, onSaved }: MyProfileProps) {
  const existingHandle = ownedActors[0]?.handle ?? null;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewEssay, setPreviewEssay] = useState(false);

  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [kind, setKind] = useState<'individual' | 'organization'>('individual');
  const [role, setRole] = useState('');
  const [stance, setStance] = useState('');
  const [contact, setContact] = useState('');
  const [bioUrl, setBioUrl] = useState('');
  const [essay, setEssay] = useState('');
  const [refs, setRefs] = useState<ReferenceLink[]>([]);
  const [activeHandle, setActiveHandle] = useState<string | null>(existingHandle);

  useEffect(() => {
    if (!user) return;
    if (existingHandle) {
      setLoading(true);
      setActiveHandle(existingHandle);
      api
        .getActor(existingHandle)
        .then((res) => {
          setHandle(res.actor.handle);
          setDisplayName(res.actor.display_name);
          setKind(res.actor.kind);
          setRole(res.actor.role_or_affiliation);
          setStance(res.actor.one_line_stance ?? '');
          setContact(res.actor.contact_preference ?? '');
          setBioUrl(res.actor.bio_url ?? '');
          setEssay(res.primary_snapshot?.essay_markdown ?? res.actor.essay_markdown ?? '');
          setRefs(res.actor.references ?? []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setDisplayName(user.display_name);
      const suggested = (user.x_handle ?? user.github_handle ?? user.display_name)
        .replace(/^@/, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-|-$/g, '');
      setHandle(suggested);
      if (user.x_handle) {
        setContact(`DM on X (${user.x_handle})`);
      }
    }
  }, [user, existingHandle]);

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8">
          <h1 className="font-editorial text-2xl font-semibold text-[var(--ink-primary)]">
            Create your Theory of Change Profile
          </h1>
          <p className="mt-2 text-sm text-[var(--ink-secondary)]">
            Sign in with X to add your affiliation, stance, reading links, written position, and flowchart.
          </p>
          <button
            type="button"
            onClick={onOpenAuth}
            className="mt-5 rounded-xl bg-[var(--ink-primary)] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Sign in to continue
          </button>
        </div>
      </main>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    setSaving(true);
    try {
      const cleanRefs = refs.filter((r) => r.url.trim().length > 0);
      if (activeHandle) {
        await api.updateProfile(activeHandle, {
          display_name: displayName,
          role_or_affiliation: role,
          one_line_stance: stance,
          contact_preference: contact,
          bio_url: bioUrl,
          essay_markdown: essay,
          references: cleanRefs,
        });
        if (essay.trim()) {
          await api.updateEssay(activeHandle, essay).catch(() => {});
        }
        onSaved();
        setSavedNotice('Profile saved.');
      } else {
        const cleanHandle = handle
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, '-')
          .replace(/^-|-$/g, '');
        if (cleanHandle.length < 2) {
          throw new Error('Handle must be at least 2 characters.');
        }
        const created = await api.createActor({
          handle: cleanHandle,
          display_name: displayName.trim() || cleanHandle,
          kind,
          role_or_affiliation: role.trim(),
          one_line_stance: stance.trim() || undefined,
          contact_preference: contact.trim() || undefined,
          bio_url: bioUrl.trim() || undefined,
          essay_markdown: essay.trim() || undefined,
          references: cleanRefs,
          authorship_status: 'self_authored',
        });
        setActiveHandle(created.handle);
        onSaved();
        setSavedNotice('Profile created. You can view it live or build a flowchart next.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-hairline)] pb-5">
        <div>
          <h1 className="font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
            {activeHandle ? 'Edit Your Profile' : 'Create Your Profile'}
          </h1>
          <p className="mt-1 text-xs text-[var(--ink-secondary)]">
            Add your stance, reading links, and a written position. You can build a flowchart in Studio anytime.
          </p>
        </div>
        {activeHandle && (
          <div className="flex items-center gap-2">
            <Link
              to={`/a/${encodeURIComponent(activeHandle)}`}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              View Public Page
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              to={`/studio?edit=${encodeURIComponent(activeHandle)}`}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Edit Flowchart
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-[var(--ink-muted)]">Loading profile…</div>
      ) : (
        <form onSubmit={handleSave} className="mt-6 space-y-6">
          {/* Core Identity & Stance */}
          <section className="space-y-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                  Profile URL Handle
                </label>
                <div className="flex items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 font-mono-meta text-xs">
                  <span className="text-[var(--ink-muted)]">toctracker.com/a/</span>
                  <input
                    type="text"
                    required
                    disabled={Boolean(activeHandle)}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="w-full bg-transparent font-semibold text-[var(--ink-primary)] focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                  Affiliated Organization / Role
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Alignment Researcher, Independent"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                />
              </div>
              {!activeHandle && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">Type</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as 'individual' | 'organization')}
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                  >
                    <option value="individual">Individual</option>
                    <option value="organization">Organization</option>
                  </select>
                </div>
              )}
              {activeHandle && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                    Website / Blog URL
                  </label>
                  <input
                    type="url"
                    value={bioUrl}
                    onChange={(e) => setBioUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                One-Line Stance
              </label>
              <input
                type="text"
                value={stance}
                onChange={(e) => setStance(e.target.value)}
                placeholder="Your core AI safety bet in one sentence..."
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                  Contact Preferences
                </label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. DMs open on X for crux debates"
                  className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                />
              </div>
              {!activeHandle && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--ink-secondary)]">
                    Website / Blog URL
                  </label>
                  <input
                    type="url"
                    value={bioUrl}
                    onChange={(e) => setBioUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Written Position in Markdown */}
          <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[var(--ink-primary)]">
                  Written Position (Markdown)
                </h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  Write out your reasoning, caveats, or anything that doesn&apos;t fit in a flowchart.
                </p>
              </div>
              <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setPreviewEssay(false)}
                  className={`rounded-md px-2.5 py-1 ${!previewEssay ? 'bg-white text-[var(--ink-primary)] shadow-2xs' : 'text-[var(--ink-muted)]'}`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewEssay(true)}
                  className={`rounded-md px-2.5 py-1 ${previewEssay ? 'bg-white text-[var(--ink-primary)] shadow-2xs' : 'text-[var(--ink-muted)]'}`}
                >
                  Preview
                </button>
              </div>
            </div>

            {previewEssay ? (
              <div className="mt-3 min-h-[180px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
                {essay.trim() ? (
                  <SimpleMarkdown content={essay} />
                ) : (
                  <p className="text-xs italic text-[var(--ink-muted)]">Nothing written yet.</p>
                )}
              </div>
            ) : (
              <textarea
                rows={9}
                value={essay}
                onChange={(e) => setEssay(e.target.value)}
                placeholder="## Why I'm betting on this&#10;&#10;Write your full position in Markdown (## headings, **bold**, *italic*, - bullets, > blockquotes, and [links](https://...))..."
                className="mt-3 w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5 font-mono-meta text-xs leading-relaxed text-[var(--ink-primary)] focus:border-[var(--ink-primary)] focus:outline-none"
              />
            )}
          </section>

          {/* Influences & Key Reading */}
          <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-primary)]">
                  <BookOpen className="h-4 w-4 text-[var(--ink-muted)]" />
                  Influences & Key Reading
                </h2>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  Posts, papers, interviews, or books you stand by.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRefs((prev) => [...prev, { title: '', url: '', note: '' }])}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Add link
              </button>
            </div>

            <div className="mt-3 space-y-2.5">
              {refs.map((ref, idx) => (
                <div
                  key={idx}
                  className="space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ref.title}
                      onChange={(e) =>
                        setRefs((prev) => prev.map((r, i) => (i === idx ? { ...r, title: e.target.value } : r)))
                      }
                      placeholder="Title (e.g. AI Control paper, Machines of Loving Grace)"
                      className="flex-1 rounded-lg border border-[var(--border-hairline)] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setRefs((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded p-1 text-[var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="url"
                    value={ref.url}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((r, i) => (i === idx ? { ...r, url: e.target.value } : r)))
                    }
                    placeholder="https://..."
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-white px-2.5 py-1.5 font-mono-meta text-[11px]"
                  />
                  <input
                    type="text"
                    value={ref.note ?? ''}
                    onChange={(e) =>
                      setRefs((prev) => prev.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r)))
                    }
                    placeholder="Short note (optional)"
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-white px-2.5 py-1.5 text-xs"
                  />
                </div>
              ))}
              {refs.length === 0 && (
                <p className="rounded-xl border border-dashed border-[var(--border-hairline)] p-4 text-center text-xs text-[var(--ink-muted)]">
                  No links yet. Click <strong>+ Add link</strong> to add papers, posts, or talks.
                </p>
              )}
            </div>
          </section>

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
          {savedNotice && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-900">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-700" />
                {savedNotice}
              </span>
              {activeHandle && (
                <Link
                  to={`/a/${encodeURIComponent(activeHandle)}`}
                  className="font-semibold underline"
                >
                  Open /a/{activeHandle} →
                </Link>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--ink-primary)] px-5 py-2.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Saving…' : activeHandle ? 'Save Profile' : 'Create Profile'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
