import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, GitFork, Target, Zap } from 'lucide-react';
import { api } from '../api/client';
import {
  CREDENCE_BANDS,
  credencePill,
  type ConceptSpectrum,
} from '../types';

export function ConceptExplorer() {
  const { rootId = '' } = useParams();
  const [data, setData] = useState<ConceptSpectrum | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api
      .getConceptSpectrum(rootId)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [rootId]);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-rose-700">{error}</p>
        <Link to="/cruxes" className="mt-4 inline-block text-xs font-semibold underline">
          ← Back to Cruxes
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-center text-xs text-[var(--ink-muted)]">
        Loading concept spectrum…
      </main>
    );
  }

  const allCriteria = data.positions.flatMap((p) =>
    p.update_criteria.map((uc) => ({ actorName: p.display_name, handle: p.handle, uc }))
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        to="/cruxes"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Field Cruxes
      </Link>

      <header className="mt-4 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
        <div className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {data.root_concept.stage} · Canonical Root Concept
        </div>
        <h1 className="mt-1.5 font-editorial text-3xl font-semibold text-[var(--ink-primary)]">
          {data.root_concept.title}
        </h1>
        {data.root_concept.description && (
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-secondary)]">
            {data.root_concept.description}
          </p>
        )}
      </header>

      {/* 5-Band Credence Spectrum */}
      <section className="mt-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
        <h2 className="text-sm font-bold text-[var(--ink-primary)]">
          Credence Spectrum Across Actors ({data.positions.length})
        </h2>
        <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
          Includes direct references and forked phrasing variations mapped to this root concept.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {CREDENCE_BANDS.map((band) => {
            const inBand = data.positions.filter((p) => (p.credence?.band ?? 'medium') === band.key);
            return (
              <div
                key={band.key}
                className="flex min-h-[160px] flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3"
              >
                <div className="mb-2 flex items-center justify-between border-b border-[var(--border-hairline)] pb-1.5">
                  <span className="font-mono-meta text-[10px] font-bold uppercase text-[var(--ink-secondary)]">
                    {band.label}
                  </span>
                  <span className="font-mono-meta text-[10px] text-[var(--ink-muted)]">{inBand.length}</span>
                </div>
                <div className="space-y-2">
                  {inBand.map((pos) => (
                    <Link
                      key={pos.actor_id}
                      to={`/a/${pos.handle}`}
                      className={`block rounded-lg border bg-[var(--bg-surface)] p-2 text-xs transition hover:border-[var(--ink-primary)] ${
                        pos.stance === 'rejected'
                          ? 'border-dashed border-rose-300'
                          : 'border-[var(--border-hairline)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-[var(--ink-primary)]">{pos.display_name}</span>
                        {pos.is_load_bearing_crux && <Zap className="h-3 w-3 shrink-0 text-amber-600" />}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                        <span>{credencePill(pos.credence)}</span>
                        {pos.stance === 'rejected' && <span className="text-rose-700">· Rejected</span>}
                        {pos.is_fork && <span title={pos.concept_title}>· Forked</span>}
                      </div>
                      {pos.note && (
                        <p className="mt-1 line-clamp-2 text-[11px] text-[var(--ink-secondary)]">
                          {pos.note}
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Phrasing Forks */}
      {data.forks.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
          <div className="flex items-center gap-2">
            <GitFork className="h-4 w-4 text-[var(--ink-muted)]" />
            <h2 className="text-sm font-bold text-[var(--ink-primary)]">
              Nuanced Phrasing Forks ({data.forks.length})
            </h2>
          </div>
          <div className="mt-3 space-y-2">
            {data.forks.map((f) => (
              <div key={f.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3.5">
                <div className="text-xs font-bold text-[var(--ink-primary)]">{f.title}</div>
                {f.description && <p className="mt-1 text-xs text-[var(--ink-secondary)]">{f.description}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Community Update Criteria Watching This Crux */}
      <section className="mt-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-700" />
          <h2 className="text-sm font-bold text-[var(--ink-primary)]">
            Community Update Criteria Watching This Crux ({allCriteria.length})
          </h2>
        </div>
        {allCriteria.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--ink-muted)]">
            No actors have attached an update criterion directly to this concept yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {allCriteria.map(({ actorName, handle, uc }) => (
              <div key={`${handle}_${uc.id}`} className="rounded-xl border border-amber-200 bg-[var(--semantic-crux-bg)] p-4 text-xs">
                <div className="flex items-center justify-between">
                  <Link to={`/a/${handle}`} className="font-bold text-[var(--ink-primary)] hover:underline">
                    {actorName}
                  </Link>
                  <span className="font-mono-meta text-[10px] text-amber-900">{uc.timeframe ?? uc.status}</span>
                </div>
                <p className="mt-1.5">
                  <strong>IF:</strong> {uc.trigger}
                </p>
                <p className="mt-1">
                  <strong>THEN:</strong> {uc.pivot_action}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
