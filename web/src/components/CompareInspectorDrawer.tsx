import { Link } from 'react-router-dom';
import { ArrowRight, ExternalLink, Target, X } from 'lucide-react';
import {
  credencePill,
  type Actor,
  type Concept,
  type DiffNode,
  type SnapshotNode,
  type ToCSnapshot,
  type UpdateCriterion,
} from '../types';

interface CompareInspectorDrawerProps {
  diffNode: DiffNode | null;
  actorA: Actor;
  actorB: Actor;
  snapshotA: ToCSnapshot;
  snapshotB: ToCSnapshot;
  concepts: Record<string, Concept>;
  onClose: () => void;
}

function ActorPositionBlock({
  actor,
  node,
  phrasingOverride,
  criteria,
  colorVar,
  bgVar,
  textVar,
}: {
  actor: Actor;
  node?: SnapshotNode | null;
  phrasingOverride?: string | null;
  criteria: UpdateCriterion[];
  colorVar: string;
  bgVar: string;
  textVar: string;
}) {
  return (
    <div
      className="rounded-xl border p-3.5"
      style={{ borderColor: node ? colorVar : 'var(--border-hairline)', backgroundColor: node ? 'var(--bg-surface)' : 'var(--bg-canvas)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link to={`/a/${actor.handle}`} className="flex items-center gap-2 text-xs font-bold hover:underline" style={{ color: textVar }}>
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorVar }} />
          {actor.display_name}
        </Link>

        {node ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {node.stance === 'rejected' && (
              <span className="whitespace-nowrap rounded-full bg-[var(--semantic-disagree-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-disagree-text)]">
                Not betting
              </span>
            )}
            {node.credence && (
              <span
                className="whitespace-nowrap rounded-full px-2 py-0.5 font-mono-meta text-[10px] font-bold"
                style={{ backgroundColor: bgVar, color: textVar }}
              >
                {credencePill(node.credence)}
              </span>
            )}
            {!node.credence && node.bet_priority && (
              <span
                className="whitespace-nowrap rounded-full px-2 py-0.5 font-mono-meta text-[10px] font-semibold"
                style={{ backgroundColor: bgVar, color: textVar }}
              >
                {node.bet_priority === 'primary' ? 'Primary Bet' : node.bet_priority}
              </span>
            )}
          </div>
        ) : (
          <span className="shrink-0 whitespace-nowrap text-[11px] italic text-[var(--ink-muted)]">Not in their map</span>
        )}
      </div>

      {phrasingOverride && (
        <p className="mt-2 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-[11px] text-[var(--ink-secondary)]">
          <span className="font-mono-meta text-[9px] uppercase text-[var(--ink-muted)]">Their phrasing: </span>
          "{phrasingOverride}"
        </p>
      )}

      {node?.credence?.numeric_rationale && (
        <div className="mt-2.5 rounded-lg bg-[var(--bg-subtle)] p-2.5 text-[11px] leading-relaxed text-[var(--ink-secondary)]">
          <strong className="text-[var(--ink-primary)]">Why {node.credence.percent}%: </strong>
          {node.credence.numeric_rationale}
        </div>
      )}

      {node?.note && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">{node.note}</p>
      )}

      {criteria.length > 0 && (
        <div className="mt-3 space-y-2">
          {criteria.map((uc) => (
            <div key={uc.id} className="rounded-lg border border-amber-300/80 bg-[var(--semantic-crux-bg)] p-2.5 text-[11px]">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-bold text-amber-900">
                  <Target className="h-3 w-3" />
                  What would change their mind
                </span>
                {uc.timeframe && (
                  <span className="font-mono-meta text-[10px] text-amber-800">{uc.timeframe}</span>
                )}
              </div>
              <p className="text-[var(--ink-primary)]">
                <strong>If:</strong> {uc.trigger}
              </p>
              <p className="mt-1 text-[var(--ink-primary)]">
                <strong>Then:</strong> {uc.pivot_action}
              </p>
            </div>
          ))}
        </div>
      )}

      {node && node.citations.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {node.citations.map((cit, i) => (
            <a
              key={i}
              href={cit.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              {cit.label}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function CompareInspectorDrawer({
  diffNode,
  actorA,
  actorB,
  snapshotA,
  snapshotB,
  concepts,
  onClose,
}: CompareInspectorDrawerProps) {
  if (!diffNode) return null;

  const rootConcept = concepts[diffNode.cluster_id];
  const criteriaA = diffNode.node_a
    ? snapshotA.update_criteria.filter((u) => u.target_local_id === diffNode.node_a?.local_id)
    : [];
  const criteriaB = diffNode.node_b
    ? snapshotB.update_criteria.filter((u) => u.target_local_id === diffNode.node_b?.local_id)
    : [];

  return (
    <aside className="flex max-h-[760px] flex-col overflow-y-auto rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-xs lg:sticky lg:top-20">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {diffNode.stage}
          {diffNode.category === 'direct_crux_disagreement'
            ? ' · Disagreement'
            : diffNode.category === 'shared_ground'
              ? ' · Both agree'
              : ''}
        </span>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
          aria-label="Close details"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <h3 className="mt-1 text-base font-bold leading-snug text-[var(--ink-primary)]">
        {diffNode.canonical_title}
      </h3>
      {rootConcept?.description && (
        <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">
          {rootConcept.description}
        </p>
      )}

      <div className="mt-4 space-y-3">
        <ActorPositionBlock
          actor={actorA}
          node={diffNode.node_a}
          phrasingOverride={
            diffNode.concept_a_title && diffNode.concept_a_title !== diffNode.canonical_title
              ? diffNode.concept_a_title
              : null
          }
          criteria={criteriaA}
          colorVar="var(--actor-a-border)"
          bgVar="var(--actor-a-bg)"
          textVar="var(--actor-a-text)"
        />
        <ActorPositionBlock
          actor={actorB}
          node={diffNode.node_b}
          phrasingOverride={
            diffNode.concept_b_title && diffNode.concept_b_title !== diffNode.canonical_title
              ? diffNode.concept_b_title
              : null
          }
          criteria={criteriaB}
          colorVar="var(--actor-b-border)"
          bgVar="var(--actor-b-bg)"
          textVar="var(--actor-b-text)"
        />
      </div>

      <div className="mt-auto pt-4">
        <Link
          to={`/concept/${encodeURIComponent(diffNode.cluster_id)}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3.5 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
        >
          See everyone's view on this
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </aside>
  );
}
