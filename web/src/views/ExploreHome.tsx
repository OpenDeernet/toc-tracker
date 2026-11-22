import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, GitCompare, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import {
  actorPalette,
  shortActorName,
  type ActorCard,
  type CompareResponse,
  type FieldCruxSummary,
} from '../types';
import { SwimlaneCanvas } from '../components/SwimlaneCanvas';
import { CompareInspectorDrawer } from '../components/CompareInspectorDrawer';

export function ExploreHome() {
  const navigate = useNavigate();
  const [actors, setActors] = useState<ActorCard[]>([]);
  const [cruxes, setCruxes] = useState<FieldCruxSummary[]>([]);
  const [featuredDiff, setFeaturedDiff] = useState<CompareResponse | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
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

  const selectedDiffNode =
    featuredDiff?.diff.nodes.find((n) => n.cluster_id === selectedClusterId) ?? null;

  // Show only debates where people actually land on opposite sides first
  const realDisagreements = cruxes.filter((c) => c.supporters.length > 0 && c.skeptics.length > 0);
  const displayDisagreements = realDisagreements.length > 0 ? realDisagreements : cruxes;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      {/* Clean Editorial Hero */}
      <section className="flex flex-col justify-between gap-6 border-b border-[var(--border-hairline)] pb-8 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <h1 className="font-editorial text-3xl font-semibold tracking-tight text-[var(--ink-primary)] sm:text-[42px] sm:leading-[1.12]">
            See why AI Safety researchers do what they do — and where they disagree.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-secondary)] sm:text-[15px]">
            Compare Theories of Change side-by-side: what people think happens by default, what they're betting on, and what evidence would change their mind.
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

      {/* Above-the-Fold Interactive Comparison (2-color system + clickable inspector) */}
      {featuredDiff && (
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[var(--ink-muted)]">Example comparison:</span>
              <Link
                to={`/a/${featuredDiff.actor_a.handle}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--actor-a-border)]/40 bg-[var(--actor-a-bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--actor-a-text)] hover:opacity-90"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--actor-a-border)]" />
                {featuredDiff.actor_a.display_name}
              </Link>
              <span className="text-xs text-[var(--ink-muted)]">vs</span>
              <Link
                to={`/a/${featuredDiff.actor_b.handle}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--actor-b-border)]/40 bg-[var(--actor-b-bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--actor-b-text)] hover:opacity-90"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--actor-b-border)]" />
                {featuredDiff.actor_b.display_name}
              </Link>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--ink-secondary)]">
                {featuredDiff.diff.summary.headline}
              </span>
              <Link
                to="/compare?a=alice-chen&b=redwood-research"
                className="font-semibold text-[var(--ink-primary)] hover:underline"
              >
                Full comparison →
              </Link>
            </div>
          </div>

          <div className={`grid gap-4 ${selectedDiffNode ? 'lg:grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
            <SwimlaneCanvas
              mode="compare"
              diff={featuredDiff.diff}
              actorAShort={shortActorName(featuredDiff.actor_a.display_name)}
              actorBShort={shortActorName(featuredDiff.actor_b.display_name)}
              actorAFull={featuredDiff.actor_a.display_name}
              actorBFull={featuredDiff.actor_b.display_name}
              selectedClusterId={selectedClusterId}
              onSelectCluster={(cid) => setSelectedClusterId((prev) => (prev === cid ? null : cid))}
              heightClass="h-[480px]"
            />
            {selectedDiffNode && (
              <CompareInspectorDrawer
                diffNode={selectedDiffNode}
                actorA={featuredDiff.actor_a}
                actorB={featuredDiff.actor_b}
                snapshotA={featuredDiff.snapshot_a}
                snapshotB={featuredDiff.snapshot_b}
                concepts={featuredDiff.concepts}
                onClose={() => setSelectedClusterId(null)}
              />
            )}
          </div>
        </section>
      )}

      {/* People & Organizations (Elevated with distinct personal color accents) */}
      <section className="mt-12">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">
              People & Organizations
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Click any profile to read their reasoning & update criteria, or pick any two to compare side-by-side.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--ink-muted)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people or agendas…"
                className="w-52 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] py-1.5 pl-8 pr-3 text-xs focus:border-[var(--ink-primary)] focus:outline-none"
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
              <option value="">All Status</option>
              <option value="self_authored">Verified Author</option>
              <option value="community_draft">Community Draft</option>
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
              const pal = actorPalette(actor.handle);

              return (
                <div
                  key={actor.id}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-[var(--bg-surface)] p-5 transition ${
                    picked
                      ? 'border-[var(--actor-a-border)] ring-2 ring-purple-500/20'
                      : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)] hover:shadow-xs'
                  }`}
                >
                  {/* Subtle top identity color bar */}
                  <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: pal.accent }} />

                  <div>
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <Link to={`/a/${actor.handle}`} className="flex items-center gap-3">
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-mono-meta text-sm font-bold"
                          style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.border }}
                        >
                          {actor.avatar_initials}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-[15px] font-bold tracking-tight text-[var(--ink-primary)] group-hover:underline">
                              {actor.display_name}
                            </h3>
                            {isVerified && (
                              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Verified author" />
                            )}
                          </div>
                          <p className="text-xs text-[var(--ink-secondary)]">{actor.role_or_affiliation}</p>
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

                    {actor.summary && (
                      <p className="mt-3.5 text-[13px] leading-relaxed text-[var(--ink-primary)]/90">
                        {actor.summary}
                      </p>
                    )}

                    {actor.primary_bet_title && (
                      <div className="mt-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-xs">
                        <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                          Current Bet ·{' '}
                        </span>
                        <span className="font-semibold text-[var(--ink-primary)]">
                          {actor.primary_bet_title}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-muted)]">
                    <span>
                      {isVerified ? 'Self-authored' : 'Community draft'} · {actor.update_criteria_count} update{' '}
                      {actor.update_criteria_count === 1 ? 'criterion' : 'criteria'}
                    </span>
                    <Link to={`/a/${actor.handle}`} className="font-semibold text-[var(--ink-primary)] hover:underline">
                      Read map →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Where People Disagree Most (Plain-English, real people on each side) */}
      <section className="mt-14 pb-16">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--ink-primary)]">
              Where People Disagree Most
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Claims where mapped people and organizations take opposite sides.
            </p>
          </div>
          <Link to="/cruxes" className="text-xs font-semibold text-[var(--ink-primary)] hover:underline">
            All disagreements →
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {displayDisagreements.slice(0, 3).map((item) => {
            const firstSup = item.supporters[0];
            const firstSkep = item.skeptics[0];
            return (
              <div
                key={item.root_concept_id}
                className="flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
              >
                <div>
                  <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                    {item.stage}
                  </span>
                  <Link
                    to={`/concept/${encodeURIComponent(item.root_concept_id)}`}
                    className="mt-1 block text-[15px] font-bold leading-snug text-[var(--ink-primary)] hover:underline"
                  >
                    {item.title}
                  </Link>

                  <div className="mt-4 space-y-2.5">
                    <div>
                      <div className="text-[11px] font-semibold text-emerald-800">Thinks likely / Betting on it</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.supporters.length > 0 ? (
                          item.supporters.map((s) => (
                            <Link
                              key={s.actor_id}
                              to={`/a/${s.handle}`}
                              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-900 hover:bg-emerald-100"
                            >
                              <span>{shortActorName(s.display_name)}</span>
                              <span className="font-mono-meta text-[10px] opacity-75">· {s.credence_label}</span>
                            </Link>
                          ))
                        ) : (
                          <span className="text-[11px] italic text-[var(--ink-muted)]">None yet</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-semibold text-rose-800">Skeptical / Not betting on it</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {item.skeptics.length > 0 ? (
                          item.skeptics.map((s) => (
                            <Link
                              key={s.actor_id}
                              to={`/a/${s.handle}`}
                              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-900 hover:bg-rose-100"
                            >
                              <span>{shortActorName(s.display_name)}</span>
                              <span className="font-mono-meta text-[10px] opacity-75">· {s.credence_label}</span>
                            </Link>
                          ))
                        ) : (
                          <span className="text-[11px] italic text-[var(--ink-muted)]">None yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {firstSup && firstSkep && (
                  <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                    <Link
                      to={`/compare?a=${encodeURIComponent(firstSup.handle)}&b=${encodeURIComponent(firstSkep.handle)}`}
                      className="text-xs font-semibold text-[var(--ink-primary)] hover:underline"
                    >
                      Compare {shortActorName(firstSup.display_name)} vs {shortActorName(firstSkep.display_name)} →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
            <span className="text-zinc-300">Pick 1 more to compare</span>
          )}
          <button onClick={() => setComparePick([])} className="text-zinc-400 hover:text-white">
            Clear
          </button>
        </div>
      )}
    </main>
  );
}
