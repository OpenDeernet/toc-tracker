import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, GitCompare, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { api } from '../api/client';
import type { ActorCard, CompareResponse, FieldCruxSummary } from '../types';
import { SwimlaneCanvas } from '../components/SwimlaneCanvas';

export function ExploreHome() {
  const navigate = useNavigate();
  const [actors, setActors] = useState<ActorCard[]>([]);
  const [cruxes, setCruxes] = useState<FieldCruxSummary[]>([]);
  const [featuredDiff, setFeaturedDiff] = useState<CompareResponse | null>(null);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [comparePick, setComparePick] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.listActors(),
      api.listCruxes(),
      api.compare('alice-chen', 'redwood-research').catch(() => null),
    ])
      .then(([a, c, diff]) => {
        setActors(a);
        setCruxes(c);
        setFeaturedDiff(diff);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredActors = actors.filter((a) => {
    if (kindFilter && a.kind !== kindFilter) return false;
    if (statusFilter && a.authorship_status !== statusFilter) return false;
    if (query.trim()) {
      const ql = query.toLowerCase();
      const hay = `${a.display_name} ${a.role_or_affiliation} ${a.summary ?? ''} ${a.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });

  function toggleCompare(handle: string) {
    setComparePick((prev) => {
      if (prev.includes(handle)) return prev.filter((h) => h !== handle);
      if (prev.length >= 2) return [prev[1], handle];
      return [...prev, handle];
    });
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      {/* Compact Editorial Hero */}
      <section className="flex flex-col justify-between gap-6 border-b border-[var(--border-hairline)] pb-8 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1 font-mono-meta text-[11px] font-medium text-[var(--ink-secondary)]">
            <Sparkles className="h-3 w-3 text-amber-600" />
            Open-source · Permanent open data (Arweave) · Free public API
          </div>
          <h1 className="mt-4 font-editorial text-3xl font-semibold tracking-tight text-[var(--ink-primary)] sm:text-[42px] sm:leading-[1.12]">
            See why AI Safety researchers do what they do — and exactly where they disagree.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)] sm:text-[15px]">
            A legible, comparable map of Theories of Change across the field: premises, bottlenecks, interventions, concrete bets, and explicit <strong>IF → THEN update criteria</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--ink-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Map Your Theory of Change
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/compare?a=alice-chen&b=redwood-research"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-primary)] transition hover:bg-[var(--bg-subtle)]"
          >
            <GitCompare className="h-4 w-4" />
            Compare Two ToCs
          </Link>
        </div>
      </section>

      {/* Above-the-Fold Interactive Featured Diff */}
      {featuredDiff && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Featured Crux Diff
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-[var(--actor-a-border)]" />
                {featuredDiff.actor_a.display_name}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">vs</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-xs font-semibold">
                <span className="h-2 w-2 rounded-full bg-[var(--actor-b-border)]" />
                {featuredDiff.actor_b.display_name}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--semantic-agree-bg)] px-2.5 py-1 font-mono-meta text-[11px] font-semibold text-[var(--semantic-agree-text)]">
                {featuredDiff.diff.summary.shared_ground_count} Shared Ground
              </span>
              {featuredDiff.diff.top_cruxes.slice(0, 1).map((c) => (
                <button
                  key={c.cluster_id}
                  onClick={() => setSpotlightId((prev) => (prev === c.cluster_id ? null : c.cluster_id))}
                  className={`rounded-full px-2.5 py-1 font-mono-meta text-[11px] font-semibold transition ${
                    spotlightId === c.cluster_id
                      ? 'bg-[var(--semantic-disagree-border)] text-white'
                      : 'bg-[var(--semantic-disagree-bg)] text-[var(--semantic-disagree-text)] hover:opacity-90'
                  }`}
                >
                  Spotlight Crux: {c.canonical_title}
                </button>
              ))}
              <Link
                to="/compare?a=alice-chen&b=redwood-research"
                className="text-xs font-semibold text-[var(--ink-primary)] hover:underline"
              >
                Open full diff →
              </Link>
            </div>
          </div>

          <SwimlaneCanvas
            mode="compare"
            diff={featuredDiff.diff}
            actorAShort="A"
            actorBShort="B"
            spotlightClusterId={spotlightId}
            onSelectCluster={(cid) => setSpotlightId((prev) => (prev === cid ? null : cid))}
            heightClass="h-[460px]"
          />
        </section>
      )}

      {/* Most Contested Field Cruxes */}
      <section className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">
              Most Contested Field Cruxes
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Aggregated live across all Theories of Change via fork lineage and canonical roots.
            </p>
          </div>
          <Link to="/cruxes" className="text-xs font-semibold text-[var(--ink-primary)] hover:underline">
            View all cruxes →
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cruxes.slice(0, 6).map((crux) => {
            const maxBucket = Math.max(1, ...crux.distribution);
            return (
              <Link
                key={crux.root_concept_id}
                to={`/concept/${encodeURIComponent(crux.root_concept_id)}`}
                className="group flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--border-strong)]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {crux.stage}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
                      <Zap className="h-2.5 w-2.5" />
                      {crux.spread}pt spread
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-bold leading-snug text-[var(--ink-primary)] group-hover:underline">
                    {crux.title}
                  </h3>
                </div>

                {/* Mini 5-band credence histogram */}
                <div className="mt-4">
                  <div className="flex h-7 items-end gap-1">
                    {crux.distribution.map((count, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center">
                        <div
                          className={`w-full rounded-t-sm ${
                            i <= 1 ? 'bg-rose-400/80' : i === 2 ? 'bg-amber-400/80' : 'bg-emerald-500/80'
                          }`}
                          style={{ height: `${Math.max(4, Math.round((count / maxBucket) * 26))}px`, opacity: count === 0 ? 0.15 : 1 }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex justify-between font-mono-meta text-[9px] text-[var(--ink-muted)]">
                    <span>V.Low</span>
                    <span>Med</span>
                    <span>V.High</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-[var(--border-hairline)] pt-2 text-[11px] text-[var(--ink-secondary)]">
                    <span>{crux.active_count} depend on this</span>
                    <span>{crux.rejected_count} reject</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Actors Directory */}
      <section className="mt-12 pb-16">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">
              Mapped People & Organizations
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Select any two cards to compare side-by-side, or click an unclaimed draft to claim and refine it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--ink-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name, agenda, tag…"
                className="w-56 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs focus:border-[var(--ink-primary)] focus:outline-none"
              />
            </div>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-secondary)]"
            >
              <option value="">All Types</option>
              <option value="individual">Individuals</option>
              <option value="organization">Organizations</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--ink-secondary)]"
            >
              <option value="">All Authorship</option>
              <option value="self_authored">Verified Self-Authored</option>
              <option value="claimed">Claimed</option>
              <option value="community_draft">Community-Mapped (Unclaimed)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--ink-muted)]">
            Loading Theories of Change…
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredActors.map((actor) => {
              const picked = comparePick.includes(actor.handle);
              const isVerified = actor.authorship_status !== 'community_draft';
              return (
                <div
                  key={actor.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-[var(--bg-surface)] p-5 transition ${
                    picked
                      ? 'border-[var(--actor-a-border)] ring-2 ring-indigo-500/15'
                      : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/a/${actor.handle}`} className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] font-mono-meta text-xs font-bold text-[var(--ink-primary)]">
                          {actor.avatar_initials}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-[var(--ink-primary)] hover:underline">
                              {actor.display_name}
                            </h3>
                          </div>
                          <p className="text-[11px] text-[var(--ink-secondary)]">{actor.role_or_affiliation}</p>
                        </div>
                      </Link>

                      <button
                        type="button"
                        onClick={() => toggleCompare(actor.handle)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                          picked
                            ? 'border-[var(--actor-a-border)] bg-[var(--actor-a-bg)] text-[var(--actor-a-text)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        {picked ? <Check className="h-3 w-3" /> : '+'} Compare
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {isVerified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--semantic-agree-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--semantic-agree-text)]">
                          <ShieldCheck className="h-3 w-3" />
                          {actor.verified_provider === 'x' ? 'Verified via X' : 'Verified Author'}
                        </span>
                      ) : (
                        <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)]">
                          Community-Mapped · Unclaimed
                        </span>
                      )}
                      {actor.version && (
                        <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                          v{actor.version}
                        </span>
                      )}
                    </div>

                    {actor.summary && (
                      <p className="mt-3 text-xs leading-relaxed text-[var(--ink-secondary)]">
                        {actor.summary}
                      </p>
                    )}

                    {actor.primary_bet_title && (
                      <div className="mt-3 rounded-lg bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[11px]">
                        <span className="font-mono-meta text-[10px] uppercase text-[var(--ink-muted)]">Bet: </span>
                        <span className="font-medium text-[var(--ink-primary)]">{actor.primary_bet_title}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-muted)]">
                    <span>
                      {actor.node_count} nodes · {actor.update_criteria_count} update{' '}
                      {actor.update_criteria_count === 1 ? 'criterion' : 'criteria'}
                    </span>
                    <Link to={`/a/${actor.handle}`} className="font-semibold text-[var(--ink-primary)] hover:underline">
                      Explore →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Floating Compare Tray */}
      {comparePick.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--ink-primary)] bg-[var(--ink-primary)] px-4 py-2.5 text-xs text-white shadow-xl">
          <span>
            Selected ({comparePick.length}/2):{' '}
            <strong className="font-mono-meta">{comparePick.join(' vs ')}</strong>
          </span>
          {comparePick.length === 2 ? (
            <button
              onClick={() => navigate(`/compare?a=${encodeURIComponent(comparePick[0])}&b=${encodeURIComponent(comparePick[1])}`)}
              className="rounded-lg bg-white px-3 py-1 font-semibold text-[var(--ink-primary)] hover:opacity-90"
            >
              Compare Now →
            </button>
          ) : (
            <span className="text-zinc-300">Pick 1 more to diff</span>
          )}
          <button onClick={() => setComparePick([])} className="text-zinc-400 hover:text-white">
            Clear
          </button>
        </div>
      )}
    </main>
  );
}
