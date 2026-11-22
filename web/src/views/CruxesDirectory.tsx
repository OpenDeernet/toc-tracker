import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { shortActorName, type FieldCruxSummary } from '../types';

const STAGE_FILTERS = [
  { key: '', label: 'All' },
  { key: 'premise', label: 'What happens by default' },
  { key: 'bottleneck', label: 'Bottlenecks' },
  { key: 'intervention', label: 'What works' },
];

export function CruxesDirectory() {
  const [cruxes, setCruxes] = useState<FieldCruxSummary[]>([]);
  const [stageFilter, setStageFilter] = useState('');
  const [onlyDivided, setOnlyDivided] = useState(true);

  useEffect(() => {
    api.listCruxes().then(setCruxes).catch(() => {});
  }, []);

  const visible = cruxes.filter((c) => {
    if (stageFilter && c.stage !== stageFilter) return false;
    if (onlyDivided && !(c.supporters.length > 0 && c.skeptics.length > 0)) return false;
    return true;
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-hairline)] pb-6 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
            Key Disagreements
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            See who is on each side of the biggest open questions in AI Safety.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="text-[var(--ink-muted)]">
          Showing {visible.length} {onlyDivided ? 'active disagreements' : 'shared claims'}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-[var(--ink-secondary)]">
          <input
            type="checkbox"
            checked={onlyDivided}
            onChange={(e) => setOnlyDivided(e.target.checked)}
            className="accent-[var(--ink-primary)]"
          />
          Only show claims where people disagree
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
                    Thinks likely / Betting on it ({c.supporters.length})
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
                      <span className="text-xs italic text-[var(--ink-muted)]">Nobody on this side yet</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 p-3.5">
                  <div className="text-[11px] font-bold text-rose-900">
                    Skeptical / Not betting on it ({c.skeptics.length})
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
    </main>
  );
}
