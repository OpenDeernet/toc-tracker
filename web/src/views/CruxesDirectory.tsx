import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { api } from '../api/client';
import type { FieldCruxSummary } from '../types';

export function CruxesDirectory() {
  const [cruxes, setCruxes] = useState<FieldCruxSummary[]>([]);
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    api.listCruxes().then(setCruxes).catch(() => {});
  }, []);

  const visible = stageFilter ? cruxes.filter((c) => c.stage === stageFilter) : cruxes;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border-hairline)] pb-6">
        <div>
          <h1 className="font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
            Field Cruxes & Contested Premises
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-secondary)]">
            Ranked by credence spread and stance divergence across all published Theories of Change.
          </p>
        </div>
        <div className="flex gap-1.5">
          {['', 'premise', 'bottleneck', 'intervention'].map((st) => (
            <button
              key={st}
              onClick={() => setStageFilter(st)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                stageFilter === st
                  ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-white'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {st || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {visible.map((c) => {
          const maxB = Math.max(1, ...c.distribution);
          return (
            <Link
              key={c.root_concept_id}
              to={`/concept/${encodeURIComponent(c.root_concept_id)}`}
              className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 transition hover:border-[var(--border-strong)] sm:flex-row sm:items-center"
            >
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <span className="font-mono-meta text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
                    {c.stage}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
                    <Zap className="h-2.5 w-2.5" />
                    {c.spread}pt spread
                  </span>
                </div>
                <h2 className="mt-1 text-base font-bold text-[var(--ink-primary)]">{c.title}</h2>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  {c.actor_count} actors weighed in · {c.active_count} active · {c.rejected_count} rejected
                </p>
              </div>

              <div className="w-full sm:w-48">
                <div className="flex h-8 items-end gap-1.5">
                  {c.distribution.map((cnt, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-sm ${
                        i <= 1 ? 'bg-rose-400' : i === 2 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ height: `${Math.max(4, Math.round((cnt / maxB) * 30))}px`, opacity: cnt === 0 ? 0.15 : 1 }}
                    />
                  ))}
                </div>
                <div className="mt-1 flex justify-between font-mono-meta text-[9px] text-[var(--ink-muted)]">
                  <span>V.Low</span>
                  <span>Med</span>
                  <span>V.High</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
