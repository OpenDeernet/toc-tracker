import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitFork, Link2, Plus, Target, Zap } from 'lucide-react';
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
  editable?: boolean;
  [key: string]: unknown;
}

export interface CompareNodeData {
  kind: 'compare';
  title: string;
  category: DiffCategory;
  hasA: boolean;
  hasB: boolean;
  labelA?: string;
  labelB?: string;
  rejectedA?: boolean;
  rejectedB?: boolean;
  actorAShort: string;
  actorBShort: string;
  criteriaCount: number;
  selected?: boolean;
  dimmed?: boolean;
  [key: string]: unknown;
}

export interface PlaceholderNodeData {
  kind: 'placeholder';
  stageLabel: string;
  [key: string]: unknown;
}

export interface LaneColumnData {
  num: number;
  label: string;
  width: number;
  height: number;
  active?: boolean;
  editable?: boolean;
  onAdd?: () => void;
  [key: string]: unknown;
}

export type TocNodeData = SingleNodeData | CompareNodeData | PlaceholderNodeData;

export function LaneColumnNode({ data }: NodeProps) {
  const d = data as LaneColumnData;
  return (
    <div
      className={`pointer-events-none flex flex-col overflow-hidden rounded-2xl border border-dashed transition-colors ${
        d.active
          ? 'border-[var(--ink-primary)]/60 bg-[var(--bg-canvas)]/84'
          : 'border-[#B8B3A5] bg-[var(--bg-canvas)]/74'
      }`}
      style={{ width: d.width, height: d.height }}
    >
      <div
        className={`flex items-center justify-between border-b border-dashed px-3.5 py-2.5 ${
          d.active
            ? 'border-[var(--ink-primary)]/35 bg-[var(--bg-subtle)]/90'
            : 'border-[#C5C0B3] bg-[var(--bg-subtle)]/75'
        }`}
      >
        <span
          className={`font-mono-meta text-[11px] font-bold uppercase tracking-wider ${
            d.active ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-secondary)]'
          }`}
        >
          {d.num}. {d.label}
        </span>
        {d.editable && d.onAdd && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              d.onAdd?.();
            }}
            title={`Add a ${d.label} node`}
            className={`pointer-events-auto inline-flex h-5 w-5 items-center justify-center rounded-md border transition ${
              d.active
                ? 'border-[var(--ink-primary)] bg-[var(--ink-primary)] text-white'
                : 'border-[#B8B3A5] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function TocNodeCard({ data }: NodeProps) {
  const d = data as TocNodeData;

  if (d.kind === 'placeholder') {
    return (
      <div className="flex h-[108px] w-[220px] cursor-pointer flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)]/55 px-4 text-center transition hover:border-[var(--ink-primary)] hover:bg-[var(--bg-surface)]">
        <span className="text-base font-medium text-[var(--ink-muted)]">+</span>
        <span className="mt-0.5 text-xs font-semibold text-[var(--ink-secondary)]">
          Add {d.stageLabel}
        </span>
      </div>
    );
  }

  if (d.kind === 'compare') {
    const isDisagree = d.category === 'direct_crux_disagreement';
    const hasBoth = d.hasA && d.hasB;

    const innerCard = (
      <div
        className={`relative w-[228px] cursor-pointer rounded-[var(--radius-card)] bg-[var(--bg-surface)] px-3.5 py-3 transition ${
          hasBoth
            ? ''
            : d.hasA
              ? 'border-2 border-[var(--actor-a-border)]'
              : 'border-2 border-[var(--actor-b-border)]'
        } ${d.selected ? 'ring-4 ring-zinc-900/15' : 'shadow-xs hover:shadow-sm'}`}
      >
        <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />
        <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-[var(--border-strong)]" />

        {isDisagree && (
          <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--semantic-disagree-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-bold text-[var(--semantic-disagree-text)]">
            Disagree
          </div>
        )}

        <div className="text-[13px] font-semibold leading-snug text-[var(--ink-primary)]">
          {d.title}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {d.hasA && (
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-[var(--actor-a-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--actor-a-text)] ${
                d.rejectedA ? 'line-through opacity-80' : ''
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--actor-a-border)]" />
              {d.labelA ? `${d.actorAShort}: ${d.labelA}` : d.actorAShort}
            </span>
          )}
          {d.hasB && (
            <span
              className={`inline-flex items-center gap-1 rounded-full bg-[var(--actor-b-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--actor-b-text)] ${
                d.rejectedB ? 'line-through opacity-80' : ''
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--actor-b-border)]" />
              {d.labelB ? `${d.actorBShort}: ${d.labelB}` : d.actorBShort}
            </span>
          )}
        </div>

        {d.criteriaCount > 0 && (
          <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--ink-muted)]">
            <Target className="h-3 w-3 text-amber-600" />
            <span>
              {d.criteriaCount} update {d.criteriaCount === 1 ? 'criterion' : 'criteria'}
            </span>
          </div>
        )}
      </div>
    );

    return (
      <div className={`transition ${d.dimmed ? 'opacity-25' : 'opacity-100'}`}>
        {hasBoth ? <div className="dual-owner-border">{innerCard}</div> : innerCard}
      </div>
    );
  }

  // Single actor card
  const borderStyle = d.selected
    ? 'border-[var(--ink-primary)] ring-4 ring-zinc-900/10'
    : d.isCrux
      ? 'border-amber-400/90'
      : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]';

  const handleClass = d.editable
    ? '!h-3 !w-3 !border-2 !border-white !bg-[var(--ink-primary)] transition hover:!scale-125'
    : '!h-2 !w-2 !border-0 !bg-[var(--border-strong)]';

  return (
    <div
      className={`w-[220px] cursor-pointer rounded-[var(--radius-card)] border bg-[var(--bg-surface)] px-3.5 py-3 shadow-xs transition ${borderStyle} ${
        d.dimmed ? 'opacity-30' : 'opacity-100'
      }`}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />

      <div className="text-[13px] font-semibold leading-snug text-[var(--ink-primary)]">
        {d.title}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {d.isCrux && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
            <Zap className="h-2.5 w-2.5" />
            Key Crux
          </span>
        )}
        {d.credenceLabel && (
          <span
            className={`rounded-full px-2 py-0.5 font-mono-meta text-[10px] font-semibold ${
              d.isNumeric
                ? 'border border-amber-200 bg-amber-50 text-amber-900'
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
            <span className="inline-flex items-center gap-0.5" title="Custom phrasing forked from shared concept">
              <GitFork className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
