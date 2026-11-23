import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, GitCompareArrows, Radar, Target } from 'lucide-react';
import { api } from '../api/client';
import {
  shortActorName,
  type FieldCruxSummary,
  type FieldIntelligence,
} from '../types';

type IntelTab = 'disagreements' | 'blindspots' | 'fault_lines';

const STAGE_FILTERS = [
  { key: '', label: 'All' },
  { key: 'premise', label: 'What happens by default' },
  { key: 'bottleneck', label: 'Bottlenecks' },
  { key: 'intervention', label: 'What works' },
];

export function CruxesDirectory() {
  const [tab, setTab] = useState<IntelTab>('disagreements');
  const [cruxes, setCruxes] = useState<FieldCruxSummary[]>([]);
  const [intel, setIntel] = useState<FieldIntelligence | null>(null);
  const [stageFilter, setStageFilter] = useState('');
  const [onlyDivided, setOnlyDivided] = useState(true);

  useEffect(() => {
    api.listCruxes().then(setCruxes).catch(() => {});
    api.fieldIntelligence().then(setIntel).catch(() => {});
  }, []);

  const visible = cruxes.filter((c) => {
    if (stageFilter && c.stage !== stageFilter) return false;
    if (onlyDivided && !(c.supporters.length > 0 && c.skeptics.length > 0)) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
            Field Disagreements & Blindspots
          </h1>
          {intel && (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Computed across {intel.total_actors} mapped Theories of Change and {intel.total_concepts} linked claims.
            </p>
          )}
        </div>

        <div className="inline-flex rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-xs font-semibold">
          {(
            [
              ['disagreements', 'Disagreements'],
              ['blindspots', 'Blindspots'],
              ['fault_lines', 'Fault Lines'],
            ] as [IntelTab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 transition ${
                tab === k
                  ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] shadow-xs'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: DISAGREEMENTS */}
      {tab === 'disagreements' && (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              {STAGE_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStageFilter(f.key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    stageFilter === f.key
                      ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-white'
                      : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-[var(--ink-secondary)]">
              <input
                type="checkbox"
                checked={onlyDivided}
                onChange={(e) => setOnlyDivided(e.target.checked)}
                className="accent-[var(--ink-primary)]"
              />
              Only show claims where people disagree ({visible.length})
            </label>
          </div>

          <div className="mt-4 space-y-4">
            {visible.map((c) => {
              const firstSup = c.supporters[0];
              const firstSkep = c.skeptics[0];
              return (
                <div
                  key={c.root_concept_id}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                        {c.stage === 'premise'
                          ? 'What happens by default'
                          : c.stage === 'bottleneck'
                            ? 'Bottleneck'
                            : 'What works'}
                      </span>
                      <Link
                        to={`/concept/${encodeURIComponent(c.root_concept_id)}`}
                        className="mt-0.5 block text-lg font-bold text-[var(--ink-primary)] hover:underline"
                      >
                        {c.title}
                      </Link>
                    </div>

                    {firstSup && firstSkep && (
                      <Link
                        to={`/compare?a=${encodeURIComponent(firstSup.handle)}&b=${encodeURIComponent(firstSkep.handle)}`}
                        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                      >
                        Compare {shortActorName(firstSup.display_name)} vs {shortActorName(firstSkep.display_name)} →
                      </Link>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3.5">
                      <div className="text-[11px] font-bold text-emerald-900">
                        Bullish / Betting ({c.supporters.length})
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.supporters.length > 0 ? (
                          c.supporters.map((s) => (
                            <Link
                              key={s.actor_id}
                              to={`/a/${s.handle}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-emerald-400"
                            >
                              <span>{s.display_name}</span>
                              <span className="font-mono-meta text-[10px] text-emerald-800">{s.credence_label}</span>
                            </Link>
                          ))
                        ) : (
                          <span className="text-xs italic text-[var(--ink-muted)]">None yet</span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3.5">
                      <div className="text-[11px] font-bold text-rose-900">
                        Skeptical / Rejected ({c.skeptics.length})
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.skeptics.length > 0 ? (
                          c.skeptics.map((s) => (
                            <Link
                              key={s.actor_id}
                              to={`/a/${s.handle}`}
                              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] hover:border-rose-400"
                            >
                              <span>{s.display_name}</span>
                              <span className="font-mono-meta text-[10px] text-rose-800">{s.credence_label}</span>
                            </Link>
                          ))
                        ) : (
                          <span className="text-xs italic text-[var(--ink-muted)]">Nobody skeptical yet</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visible.length === 0 && (
              <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center text-xs text-[var(--ink-muted)]">
                No disagreements in this category yet. Uncheck "Only show claims where people disagree" to see shared premises.
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: FIELD BLINDSPOTS (NEGLECTED BOTTLENECKS + UNFALSIFIABLE CLAIMS) */}
      {tab === 'blindspots' && intel && (
        <div className="mt-6 space-y-8">
          <section>
            <div className="flex items-center gap-2">
              <Radar className="h-4 w-4 text-amber-700" />
              <h2 className="text-base font-bold text-[var(--ink-primary)]">
                High-Consensus Bottlenecks with Thin Dedicated Coverage
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Obstacles multiple actors rate as serious, compared against how many treat them as their primary crux.
            </p>

            <div className="mt-4 space-y-3">
              {intel.neglected_bottlenecks.map((bn) => (
                <div
                  key={bn.root_concept_id}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        to={`/concept/${encodeURIComponent(bn.root_concept_id)}`}
                        className="text-base font-bold text-[var(--ink-primary)] hover:underline"
                      >
                        {bn.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-semibold text-amber-900">
                          {bn.believer_count} actors flag this bottleneck
                        </span>
                        <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 font-medium text-[var(--ink-secondary)]">
                          {bn.mitigator_count} {bn.mitigator_count === 1 ? 'treats' : 'treat'} it as #1 crux
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {bn.believers.map((b) => (
                      <Link
                        key={b.actor_id}
                        to={`/a/${b.handle}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:border-[var(--ink-primary)]"
                      >
                        <span>{b.display_name}</span>
                        <span className="font-mono-meta text-[10px] text-[var(--ink-muted)]">{b.credence_label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {intel.unfalsifiable_hotspots.length > 0 && (
            <section>
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-rose-700" />
                <h2 className="text-base font-bold text-[var(--ink-primary)]">
                  Widely Held Claims Missing Explicit Update Criteria
                </h2>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                High-traffic beliefs where most holders haven't stated a concrete IF/THEN trigger that would change their mind.
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {intel.unfalsifiable_hotspots.map((h) => (
                  <Link
                    key={h.root_concept_id}
                    to={`/concept/${encodeURIComponent(h.root_concept_id)}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--ink-primary)]"
                  >
                    <div>
                      <span className="font-mono-meta text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
                        {h.stage}
                      </span>
                      <div className="mt-0.5 text-sm font-bold text-[var(--ink-primary)]">{h.title}</div>
                      <div className="mt-1 text-xs text-[var(--ink-secondary)]">
                        {h.actors_with_criteria} of {h.actor_count} actors stated a pivot trigger
                      </div>
                    </div>
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 3: FAULT LINES & HIDDEN ALLIES */}
      {tab === 'fault_lines' && intel && (
        <div className="mt-6 space-y-8">
          <section>
            <div className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-rose-700" />
              <h2 className="text-base font-bold text-[var(--ink-primary)]">
                Sharpest Fault Lines (Same Diagnosis, Opposite Bet)
              </h2>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Pairs who agree on upstream premises or bottlenecks yet split directly on what works.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {intel.fault_lines.map((fl) => (
                <Link
                  key={`${fl.actor_a_handle}-${fl.actor_b_handle}`}
                  to={`/compare?a=${encodeURIComponent(fl.actor_a_handle)}&b=${encodeURIComponent(fl.actor_b_handle)}`}
                  className="group flex flex-col justify-between rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--ink-primary)]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--ink-primary)]">
                        {fl.actor_a_name} <span className="font-normal text-[var(--ink-muted)]">vs</span> {fl.actor_b_name}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink-primary)]" />
                    </div>
                    {fl.earliest_split_sentence && (
                      <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
                        {fl.earliest_split_sentence}
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 font-semibold text-[var(--ink-primary)]">
                      Agree on {fl.shared_ground_count}
                    </span>
                    <span className="rounded-full bg-[var(--semantic-disagree-bg)] px-2.5 py-0.5 font-semibold text-[var(--semantic-disagree-text)]">
                      Split on {fl.disagreement_count}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {intel.hidden_allies.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-[var(--ink-primary)]">
                Cross-Camp Overlap (Unexpected Allies)
              </h2>
              <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                People in different AI Safety camps who share multiple core premises with zero direct disagreements.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {intel.hidden_allies.map((ha) => (
                  <Link
                    key={`${ha.actor_a_handle}-${ha.actor_b_handle}`}
                    to={`/compare?a=${encodeURIComponent(ha.actor_a_handle)}&b=${encodeURIComponent(ha.actor_b_handle)}`}
                    className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 transition hover:border-[var(--ink-primary)]"
                  >
                    <div className="flex items-center justify-between gap-2 text-sm font-bold text-[var(--ink-primary)]">
                      <span>
                        {ha.actor_a_name} & {ha.actor_b_name}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-900">
                        {ha.shared_ground_count} shared
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                      <span>{ha.actor_a_tag}</span>
                      <span>·</span>
                      <span>{ha.actor_b_tag}</span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--ink-secondary)]">
                      Both hold: {ha.shared_titles.join(' · ')}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
