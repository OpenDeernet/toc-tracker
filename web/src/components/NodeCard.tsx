import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitFork, Link2, Target, Zap } from 'lucide-react';
import type { DiffCategory } from '../types';

export interface SingleNodeData {
  kind: 'single';
  title: string;
  credenceLabel?: string;
  isNumeric?: boolean;
  betPriorityLabel?: string;
  isCrux: boolean;
  isFork: boolean;
  criteriaCount: number;
  citationsCount: number;
  selected?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export interface CompareNodeData {
  kind: 'compare';
  title: string;
  category: DiffCategory;
  labelA?: string;
  labelB?: string;
  actorAShort: string;
  actorBShort: string;
  criteriaCount: number;
  selected?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export type TocNodeData = SingleNodeData | CompareNodeData;

export function TocNodeCard({ data }: NodeProps) {
  const d = data as TocNodeData;

  if (d.kind === 'compare') {
    const isShared = d.category === 'shared_ground';
    const isCruxGap = d.category === 'direct_crux_disagreement';
    const isUnaddressed = d.category === 'unaddressed_load_bearing';
    const isOnlyA = d.category === 'unique_to_a' || (isUnaddressed && !!d.labelA && !d.labelB);
    const isOnlyB = d.category === 'unique_to_b' || (isUnaddressed && !!d.labelB && !d.labelA);

    let borderClass = 'border-[var(--border-hairline)]';
    let stripeColor = 'bg-transparent';
    if (isCruxGap) {
      borderClass = 'border-[var(--semantic-disagree-border)] ring-4 ring-rose-500/10';
    } else if (isShared) {
      borderClass = 'border-[var(--border-hairline)]';
      stripeColor = 'bg-[var(--semantic-agree-border)]';
    } else if (isOnlyA) {
      borderClass = 'border-[var(--border-hairline)]';
      stripeColor = 'bg-[var(--actor-a-border)]';
    } else if (isOnlyB) {
      borderClass = 'border-[var(--border-hairline)]';
      stripeColor = 'bg-[var(--actor-b-border)]';
    }

    return (
      <div
        className={`relative w-[228px] overflow-hidden rounded-[var(--radius-card)] border bg-[var(--bg-surface)] px-3.5 py-3 shadow-xs transition ${borderClass} ${
          d.selected ? 'ring-2 ring-[var(--ink-primary)]' : ''
        } ${d.dimmed ? 'opacity-25' : 'opacity-100'}`}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />

        {stripeColor !== 'bg-transparent' && (
          <div className={`absolute inset-y-2 left-1.5 w-[3px] rounded-full ${stripeColor}`} />
        )}

        <div className={stripeColor !== 'bg-transparent' ? 'pl-2' : ''}>
          {isCruxGap && (
            <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold tracking-wide text-[var(--semantic-crux-text)]">
              <Zap className="h-2.5 w-2.5" />
              CRUX GAP
            </div>
          )}
          {isUnaddressed && (
            <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold tracking-wide text-[var(--semantic-crux-text)]">
              UNADDRESSED CRUX
            </div>
          )}

          <div className="text-[13px] font-semibold leading-snug text-[var(--ink-primary)]">
            {d.title}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {isShared && d.labelA && d.labelB ? (
              <span className="rounded-full bg-[var(--semantic-agree-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-agree-text)]">
                A: {d.labelA} · B: {d.labelB}
              </span>
            ) : (
              <>
                {d.labelA && (
                  <span className="rounded-full bg-[var(--actor-a-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--actor-a-text)]">
                    {d.actorAShort}: {d.labelA}
                  </span>
                )}
                {d.labelB && (
                  <span className="rounded-full bg-[var(--actor-b-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--actor-b-text)]">
                    {d.actorBShort}: {d.labelB}
                  </span>
                )}
                {!d.labelA && d.labelB && isUnaddressed && (
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                    {d.actorAShort}: Unaddressed
                  </span>
                )}
                {d.labelA && !d.labelB && isUnaddressed && (
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] text-[var(--ink-muted)]">
                    {d.actorBShort}: Unaddressed
                  </span>
                )}
              </>
            )}
          </div>

          {d.criteriaCount > 0 && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-[var(--ink-muted)]">
              <Target className="h-3 w-3 text-amber-600" />
              <span>{d.criteriaCount} update {d.criteriaCount === 1 ? 'criterion' : 'criteria'}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Single actor card
  const borderStyle = d.selected
    ? 'border-[var(--semantic-crux-border)] ring-4 ring-amber-500/15'
    : d.isCrux
      ? 'border-amber-400/80'
      : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]';

  return (
    <div
      className={`w-[220px] rounded-[var(--radius-card)] border bg-[var(--bg-surface)] px-3.5 py-3 shadow-xs transition ${borderStyle} ${
        d.dimmed ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />

      {d.selected && (
        <div className="mb-1 font-mono-meta text-[9px] font-semibold uppercase tracking-wider text-amber-700">
          Selected
        </div>
      )}

      <div className="text-[13px] font-semibold leading-snug text-[var(--ink-primary)]">
        {d.title}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {d.isCrux && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
            <Zap className="h-2.5 w-2.5" />
            CRUX
          </span>
        )}
        {d.credenceLabel && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono-meta text-[10px] font-semibold ${
              d.isNumeric
                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                : 'bg-[var(--bg-subtle)] text-[var(--ink-secondary)]'
            }`}
          >
            {d.credenceLabel}
          </span>
        )}
        {d.betPriorityLabel && (
          <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--ink-secondary)]">
            {d.betPriorityLabel}
          </span>
        )}
      </div>

      {(d.criteriaCount > 0 || d.citationsCount > 0 || d.isFork) && (
        <div className="mt-2 flex items-center gap-2.5 text-[10px] text-[var(--ink-muted)]">
          {d.criteriaCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3 text-amber-600" />
              {d.criteriaCount} {d.criteriaCount === 1 ? 'criterion' : 'criteria'}
            </span>
          )}
          {d.citationsCount > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Link2 className="h-3 w-3" />
              {d.citationsCount}
            </span>
          )}
          {d.isFork && (
            <span className="inline-flex items-center gap-0.5" title="Forked wording from canonical concept">
              <GitFork className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
