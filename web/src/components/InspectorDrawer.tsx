import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, GitFork, Target, X } from 'lucide-react';
import {
  credencePill,
  type Concept,
  type SnapshotNode,
  type UpdateCriterion,
} from '../types';

interface InspectorDrawerProps {
  node: SnapshotNode | null;
  concept?: Concept;
  parentConcept?: Concept;
  criteria: UpdateCriterion[];
  usageCount: number;
  onClose: () => void;
}

export function InspectorDrawer({
  node,
  concept,
  parentConcept,
  criteria,
  usageCount,
  onClose,
}: InspectorDrawerProps) {
  if (!node) return null;

  const rootId = concept?.root_concept_id ?? node.concept_id;

  return (
    <aside className="flex max-h-[760px] flex-col overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-xs lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-2">
        <div className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {node.stage}
          {node.is_load_bearing_crux ? ' · LOAD-BEARING CRUX' : ''}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
          aria-label="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <h3 className="mt-1.5 text-lg font-bold leading-snug text-[var(--ink-primary)]">
        {concept?.title ?? node.concept_id}
      </h3>

      {concept?.description && (
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
          {concept.description}
        </p>
      )}

      {parentConcept && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[var(--bg-subtle)] px-2.5 py-1.5 text-[11px] text-[var(--ink-secondary)]">
          <GitFork className="h-3.5 w-3.5 shrink-0" />
          <span>
            Forked from <strong className="font-medium text-[var(--ink-primary)]">{parentConcept.title}</strong>
          </span>
        </div>
      )}

      {/* Credence + Required Numeric Justification */}
      {node.credence && (
        <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--bg-surface)] px-2.5 py-0.5 font-mono-meta text-xs font-bold text-[var(--ink-primary)]">
              {credencePill(node.credence)}
            </span>
            <span className="text-xs font-semibold text-[var(--ink-primary)]">
              {node.credence.mode === 'numeric' ? 'Numeric Justification' : 'Qualitative Credence'}
            </span>
          </div>
          {node.credence.numeric_rationale && (
            <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
              {node.credence.numeric_rationale}
            </p>
          )}
        </div>
      )}

      {/* Personal Note */}
      {node.note && (
        <div className="mt-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Notes
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">{node.note}</p>
        </div>
      )}

      {/* Attached Update Criteria */}
      {criteria.length > 0 && (
        <div className="mt-4 space-y-2.5">
          {criteria.map((uc) => (
            <div
              key={uc.id}
              className="rounded-xl border border-amber-300 bg-[var(--semantic-crux-bg)] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--ink-primary)]">
                  <Target className="h-3.5 w-3.5 text-amber-700" />
                  Update Criterion
                </span>
                <span className="rounded-full bg-amber-200/70 px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-amber-900">
                  {uc.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--ink-primary)]">
                <strong>IF:</strong> {uc.trigger}
                {uc.timeframe ? <span className="text-[var(--ink-secondary)]"> ({uc.timeframe})</span> : null}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-primary)]">
                <strong>THEN:</strong> {uc.pivot_action}
              </p>
              {uc.evidence_urls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uc.evidence_urls.map((u, idx) => (
                    <a
                      key={idx}
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-[var(--ink-primary)] hover:bg-white"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      {new URL(u).hostname.replace('www.', '')}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Citations */}
      {node.citations.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-semibold text-[var(--ink-secondary)]">Sources</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {node.citations.map((c, idx) => (
              <a
                key={idx}
                href={c.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-hover)]"
              >
                {c.label}
                <ExternalLink className="h-3 w-3 text-[var(--ink-muted)]" />
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pt-5">
        <Link
          to={`/concept/${encodeURIComponent(rootId)}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-semibold text-[var(--ink-primary)] transition hover:bg-[var(--bg-subtle)]"
        >
          See who disagrees ({usageCount} {usageCount === 1 ? 'actor' : 'actors'})
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
