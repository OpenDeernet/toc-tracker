import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Check, ExternalLink, Share2, Zap } from 'lucide-react';
import { api } from '../api/client';
import {
  credencePill,
  type ActorCard,
  type CompareResponse,
} from '../types';
import { SwimlaneCanvas } from '../components/SwimlaneCanvas';

type CompareLens = 'flowchart' | 'matrix' | 'split';

export function CompareDiff() {
  const [searchParams, setSearchParams] = useSearchParams();
  const handleA = searchParams.get('a') || 'alice-chen';
  const handleB = searchParams.get('b') || 'redwood-research';

  const [actors, setActors] = useState<ActorCard[]>([]);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [lens, setLens] = useState<CompareLens>('flowchart');
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listActors().then(setActors).catch(() => {});
  }, []);

  useEffect(() => {
    setError(null);
    setSpotlightId(null);
    api
      .compare(handleA, handleB)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [handleA, handleB]);

  function updateHandles(nextA: string, nextB: string) {
    setSearchParams({ a: nextA, b: nextB });
  }

  function handleShare() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Top Comparison Selector & View Switcher */}
      <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[var(--actor-a-border)]/40 bg-[var(--actor-a-bg)]/50 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-a-border)]" />
              <select
                value={handleA}
                onChange={(e) => updateHandles(e.target.value, handleB)}
                className="bg-transparent text-xs font-bold text-[var(--ink-primary)] focus:outline-none"
              >
                {actors.map((a) => (
                  <option key={a.id} value={a.handle}>
                    {a.display_name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => updateHandles(handleB, handleA)}
              title="Swap actors"
              className="rounded-lg border border-[var(--border-hairline)] p-1.5 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-2 rounded-full border border-[var(--actor-b-border)]/40 bg-[var(--actor-b-bg)]/60 px-3 py-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-b-border)]" />
              <select
                value={handleB}
                onChange={(e) => updateHandles(handleA, e.target.value)}
                className="bg-transparent text-xs font-bold text-[var(--ink-primary)] focus:outline-none"
              >
                {actors.map((a) => (
                  <option key={a.id} value={a.handle}>
                    {a.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5">
              {(
                [
                  ['flowchart', 'Flowchart'],
                  ['matrix', 'Matrix'],
                  ['split', 'Split'],
                ] as [CompareLens, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setLens(k)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    lens === k
                      ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] shadow-xs'
                      : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Share2 className="h-3.5 w-3.5" />}
              {copied ? 'Link Copied' : 'Share Diff'}
            </button>

            <a
              href={`/og/compare?a=${encodeURIComponent(handleA)}&b=${encodeURIComponent(handleB)}`}
              target="_blank"
              rel="noreferrer"
              title="Open shareable PNG OpenGraph card"
              className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-hairline)] px-2.5 py-1.5 font-mono-meta text-[11px] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              OG PNG
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* 3-Second Takeaway Crux Strip */}
        {data && (
          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
            <span className="rounded-full bg-[var(--semantic-agree-bg)] px-3 py-1 font-mono-meta text-[11px] font-semibold text-[var(--semantic-agree-text)]">
              {data.diff.summary.shared_ground_count} Shared Ground
            </span>
            <span className="rounded-full bg-[var(--semantic-disagree-bg)] px-3 py-1 font-mono-meta text-[11px] font-semibold text-[var(--semantic-disagree-text)]">
              {data.diff.summary.crux_disagreement_count} Sharpest Cruxes
            </span>
            <span className="rounded-full bg-[var(--semantic-crux-bg)] px-3 py-1 font-mono-meta text-[11px] font-semibold text-[var(--semantic-crux-text)]">
              {data.diff.summary.unaddressed_count} Unaddressed
            </span>
            <span className="ml-auto text-xs font-medium text-[var(--ink-secondary)]">
              {data.diff.summary.headline}
            </span>
          </div>
        )}
      </section>

      {error && (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-4 space-y-4">
          {/* Interactive Top Crux Spotlight Pills */}
          {data.diff.top_cruxes.length > 0 && lens === 'flowchart' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Spotlight Crux Path:
              </span>
              {data.diff.top_cruxes.map((crux) => {
                const active = spotlightId === crux.cluster_id;
                return (
                  <button
                    key={crux.cluster_id}
                    onClick={() => setSpotlightId((prev) => (prev === crux.cluster_id ? null : crux.cluster_id))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-rose-200 bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:border-rose-400'
                    }`}
                  >
                    <Zap className="h-3 w-3" />
                    {crux.canonical_title}
                  </button>
                );
              })}
              {spotlightId && (
                <button
                  onClick={() => setSpotlightId(null)}
                  className="text-xs font-medium text-[var(--ink-muted)] underline"
                >
                  Clear spotlight
                </button>
              )}
            </div>
          )}

          {/* LENS 1: UNIFIED 5-COLUMN OVERLAY FLOWCHART */}
          {lens === 'flowchart' && (
            <SwimlaneCanvas
              mode="compare"
              diff={data.diff}
              actorAShort="A"
              actorBShort="B"
              spotlightClusterId={spotlightId}
              onSelectCluster={(cid) => setSpotlightId((prev) => (prev === cid ? null : cid))}
              heightClass="h-[540px]"
            />
          )}

          {/* LENS 2: MATRIX / TABLE COMPARISON (Non-Flowchart Lens) */}
          {lens === 'matrix' && (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] font-mono-meta text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3">Concept / Crux</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-[var(--actor-a-text)]">{data.actor_a.display_name}</th>
                    <th className="px-4 py-3 text-[var(--actor-b-text)]">{data.actor_b.display_name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {data.diff.nodes.map((dn) => (
                    <tr key={dn.cluster_id} className="hover:bg-[var(--bg-canvas)]">
                      <td className="px-4 py-3 font-mono-meta text-[10px] uppercase text-[var(--ink-muted)]">
                        {dn.stage}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/concept/${encodeURIComponent(dn.cluster_id)}`}
                          className="font-semibold text-[var(--ink-primary)] hover:underline"
                        >
                          {dn.canonical_title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {dn.category === 'direct_crux_disagreement' && (
                          <span className="rounded-full bg-[var(--semantic-disagree-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-disagree-text)]">
                            Crux Gap
                          </span>
                        )}
                        {dn.category === 'shared_ground' && (
                          <span className="rounded-full bg-[var(--semantic-agree-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-agree-text)]">
                            Shared
                          </span>
                        )}
                        {dn.category === 'unaddressed_load_bearing' && (
                          <span className="rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
                            Unaddressed
                          </span>
                        )}
                        {(dn.category === 'unique_to_a' || dn.category === 'unique_to_b') && (
                          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                            Unique Path
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dn.node_a ? (
                          <div>
                            <span className="font-mono-meta font-semibold">
                              {dn.node_a.credence
                                ? credencePill(dn.node_a.credence)
                                : dn.node_a.bet_priority ?? dn.node_a.stance}
                            </span>
                            {dn.node_a.stance === 'rejected' && (
                              <span className="ml-1.5 text-[10px] text-rose-700">(Rejected)</span>
                            )}
                            {dn.node_a.note && (
                              <p className="mt-0.5 max-w-xs text-[11px] text-[var(--ink-secondary)]">
                                {dn.node_a.note}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--ink-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {dn.node_b ? (
                          <div>
                            <span className="font-mono-meta font-semibold">
                              {dn.node_b.credence
                                ? credencePill(dn.node_b.credence)
                                : dn.node_b.bet_priority ?? dn.node_b.stance}
                            </span>
                            {dn.node_b.stance === 'rejected' && (
                              <span className="ml-1.5 text-[10px] text-rose-700">(Rejected)</span>
                            )}
                            {dn.node_b.note && (
                              <p className="mt-0.5 max-w-xs text-[11px] text-[var(--ink-secondary)]">
                                {dn.node_b.note}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--ink-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LENS 3: SPLIT INDIVIDUAL FLOWCHARTS */}
          {lens === 'split' && (
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--actor-a-text)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-a-border)]" />
                  <Link to={`/a/${data.actor_a.handle}`} className="hover:underline">
                    {data.actor_a.display_name}
                  </Link>
                </div>
                <SwimlaneCanvas
                  mode="single"
                  nodes={data.snapshot_a.nodes}
                  edges={data.snapshot_a.edges}
                  updateCriteria={data.snapshot_a.update_criteria}
                  concepts={data.concepts}
                  heightClass="h-[360px]"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--actor-b-text)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-b-border)]" />
                  <Link to={`/a/${data.actor_b.handle}`} className="hover:underline">
                    {data.actor_b.display_name}
                  </Link>
                </div>
                <SwimlaneCanvas
                  mode="single"
                  nodes={data.snapshot_b.nodes}
                  edges={data.snapshot_b.edges}
                  updateCriteria={data.snapshot_b.update_criteria}
                  concepts={data.concepts}
                  heightClass="h-[360px]"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
