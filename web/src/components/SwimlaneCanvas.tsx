import { useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  STAGES,
  credencePill,
  type Concept,
  type DiffResult,
  type SnapshotEdge,
  type SnapshotNode,
  type Stage,
  type UpdateCriterion,
} from '../types';
import { TocNodeCard, type CompareNodeData, type SingleNodeData } from './NodeCard';

const nodeTypes = { tocNode: TocNodeCard };

const COL_WIDTH = 312;
const SINGLE_ROW_HEIGHT = 176;
const COMPARE_ROW_HEIGHT = 212;
const TOP_OFFSET = 78;
const LEFT_OFFSET = 28;

function AutoFitOnResize({ containerRef, nodeCount }: { containerRef: React.RefObject<HTMLDivElement | null>; nodeCount: number }) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId = 0;
    const triggerFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        fitView({ padding: 0.14, duration: 180 });
      });
    };
    triggerFit();
    const ro = new ResizeObserver(triggerFit);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [containerRef, fitView, nodeCount]);

  return null;
}

interface SingleCanvasProps {
  mode: 'single';
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  updateCriteria: UpdateCriterion[];
  concepts: Record<string, Concept>;
  selectedLocalId?: string | null;
  onSelectNode?: (localId: string) => void;
  heightClass?: string;
}

interface CompareCanvasProps {
  mode: 'compare';
  diff: DiffResult;
  actorAShort: string;
  actorBShort: string;
  actorAFull?: string;
  actorBFull?: string;
  spotlightClusterId?: string | null;
  selectedClusterId?: string | null;
  onSelectCluster?: (clusterId: string) => void;
  heightClass?: string;
}

type SwimlaneCanvasProps = SingleCanvasProps | CompareCanvasProps;

export function SwimlaneCanvas(props: SwimlaneCanvasProps) {
  const heightClass = props.heightClass ?? 'h-[520px]';
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { rfNodes, rfEdges, mobileByStage } = useMemo(() => {
    if (props.mode === 'single') {
      const activeNodes = props.nodes.filter((n) => n.stance === 'active' || n.stance === 'open_crux');
      const byStage: Record<Stage, SnapshotNode[]> = {
        premise: [],
        bottleneck: [],
        intervention: [],
        bet: [],
        outcome: [],
      };
      for (const n of activeNodes) {
        byStage[n.stage]?.push(n);
      }

      const maxRows = Math.max(1, ...STAGES.map((s) => byStage[s.key].length));
      const totalH = maxRows * SINGLE_ROW_HEIGHT;

      const builtNodes: Node[] = [];
      for (const s of STAGES) {
        const col = byStage[s.key];
        const colH = col.length * SINGLE_ROW_HEIGHT;
        const startY = TOP_OFFSET + Math.max(0, (totalH - colH) / 2);
        col.forEach((n, idx) => {
          const concept = props.concepts[n.concept_id];
          const criteriaCount = props.updateCriteria.filter((u) => u.target_local_id === n.local_id).length;
          const data: SingleNodeData = {
            kind: 'single',
            title: concept?.title ?? n.concept_id,
            credenceLabel: credencePill(n.credence),
            isNumeric: n.credence?.mode === 'numeric',
            betPriorityLabel:
              n.bet_priority === 'primary'
                ? 'Primary Bet'
                : n.bet_priority === 'secondary'
                  ? 'Secondary Bet'
                  : n.bet_priority === 'supporting'
                    ? 'Supporting'
                    : undefined,
            isCrux: n.is_load_bearing_crux,
            isFork: Boolean(concept?.parent_concept_id),
            criteriaCount,
            citationsCount: n.citations.length,
            selected: props.selectedLocalId === n.local_id,
          };
          builtNodes.push({
            id: n.local_id,
            type: 'tocNode',
            position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH, y: startY + idx * SINGLE_ROW_HEIGHT },
            data,
            draggable: false,
          });
        });
      }

      const activeSet = new Set(activeNodes.map((n) => n.local_id));
      const builtEdges: Edge[] = props.edges
        .filter((e) => activeSet.has(e.source_local_id) && activeSet.has(e.target_local_id))
        .map((e) => ({
          id: e.id,
          source: e.source_local_id,
          target: e.target_local_id,
          type: 'default',
          label: e.relation ? e.relation.replace('_', ' ') : undefined,
          labelStyle: { fontSize: 10, fill: '#71717A', fontFamily: 'var(--font-mono)' },
          labelBgStyle: { fill: '#FAF9F6', fillOpacity: 0.9 },
          style: { stroke: e.relation === 'conflicts_with' ? '#E11D48' : '#A1A1AA', strokeWidth: 1.6 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color: e.relation === 'conflicts_with' ? '#E11D48' : '#A1A1AA',
          },
        }));

      return {
        rfNodes: builtNodes,
        rfEdges: builtEdges,
        mobileByStage: STAGES.map((s) => ({
          stage: s,
          items: byStage[s.key].map((n) => ({
            id: n.local_id,
            title: props.concepts[n.concept_id]?.title ?? n.concept_id,
            badge: credencePill(n.credence) || (n.bet_priority === 'primary' ? 'Primary Bet' : ''),
            isCrux: n.is_load_bearing_crux,
          })),
        })),
      };
    }

    // Compare mode — strictly 2 identity colors: Purple (Actor A) & Green (Actor B)
    const { diff, actorAShort, actorBShort, spotlightClusterId, selectedClusterId } = props;
    const visibleNodes = diff.nodes.filter((dn) => {
      if (dn.category === 'direct_crux_disagreement') return true;
      const actA = dn.node_a && (dn.node_a.stance === 'active' || dn.node_a.stance === 'open_crux');
      const actB = dn.node_b && (dn.node_b.stance === 'active' || dn.node_b.stance === 'open_crux');
      return Boolean(actA || actB);
    });

    const spotlightSet = new Set<string>();
    if (spotlightClusterId) {
      spotlightSet.add(spotlightClusterId);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of diff.edges) {
          if (spotlightSet.has(e.source_cluster_id) && !spotlightSet.has(e.target_cluster_id)) {
            spotlightSet.add(e.target_cluster_id);
            changed = true;
          }
          if (spotlightSet.has(e.target_cluster_id) && !spotlightSet.has(e.source_cluster_id)) {
            spotlightSet.add(e.source_cluster_id);
            changed = true;
          }
        }
      }
    }

    const byStage: Record<Stage, typeof visibleNodes> = {
      premise: [],
      bottleneck: [],
      intervention: [],
      bet: [],
      outcome: [],
    };
    for (const dn of visibleNodes) {
      byStage[dn.stage]?.push(dn);
    }

    const maxRows = Math.max(1, ...STAGES.map((s) => byStage[s.key].length));
    const totalH = maxRows * COMPARE_ROW_HEIGHT;

    const builtNodes: Node[] = [];
    for (const s of STAGES) {
      const col = byStage[s.key];
      const colH = col.length * COMPARE_ROW_HEIGHT;
      const startY = TOP_OFFSET + Math.max(0, (totalH - colH) / 2);
      col.forEach((dn, idx) => {
        const labelA = dn.node_a
          ? dn.node_a.credence
            ? credencePill(dn.node_a.credence)
            : dn.node_a.bet_priority === 'primary'
              ? 'Bet'
              : dn.node_a.stance === 'rejected'
                ? 'Skeptical'
                : ''
          : undefined;
        const labelB = dn.node_b
          ? dn.node_b.credence
            ? credencePill(dn.node_b.credence)
            : dn.node_b.bet_priority === 'primary'
              ? 'Bet'
              : dn.node_b.stance === 'rejected'
                ? 'Skeptical'
                : ''
          : undefined;
        const dimmed = Boolean(spotlightClusterId && !spotlightSet.has(dn.cluster_id));
        const data: CompareNodeData = {
          kind: 'compare',
          title: dn.canonical_title,
          category: dn.category,
          hasA: Boolean(dn.node_a),
          hasB: Boolean(dn.node_b),
          labelA,
          labelB,
          rejectedA: dn.node_a?.stance === 'rejected' || dn.node_a?.stance === 'deprioritized',
          rejectedB: dn.node_b?.stance === 'rejected' || dn.node_b?.stance === 'deprioritized',
          actorAShort,
          actorBShort,
          criteriaCount: dn.update_criteria_count,
          selected: (selectedClusterId ?? spotlightClusterId) === dn.cluster_id,
          dimmed,
        };
        builtNodes.push({
          id: dn.cluster_id,
          type: 'tocNode',
          position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH, y: startY + idx * COMPARE_ROW_HEIGHT },
          data,
          draggable: false,
        });
      });
    }

    const visibleIds = new Set(visibleNodes.map((n) => n.cluster_id));
    const builtEdges: Edge[] = diff.edges
      .filter((e) => visibleIds.has(e.source_cluster_id) && visibleIds.has(e.target_cluster_id))
      .map((e) => {
        const color =
          e.owner === 'actor_a' ? '#7C3AED' : e.owner === 'actor_b' ? '#059669' : '#94A3B8';
        const dimmed = Boolean(
          spotlightClusterId &&
            (!spotlightSet.has(e.source_cluster_id) || !spotlightSet.has(e.target_cluster_id))
        );
        return {
          id: e.id,
          source: e.source_cluster_id,
          target: e.target_cluster_id,
          type: 'default',
          style: {
            stroke: color,
            strokeWidth: dimmed ? 1.2 : 1.9,
            opacity: dimmed ? 0.18 : 0.9,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color,
          },
        };
      });

    return {
      rfNodes: builtNodes,
      rfEdges: builtEdges,
      mobileByStage: STAGES.map((s) => ({
        stage: s,
        items: byStage[s.key].map((dn) => ({
          id: dn.cluster_id,
          title: dn.canonical_title,
          badge:
            dn.category === 'direct_crux_disagreement'
              ? 'Disagree'
              : dn.node_a && dn.node_b
                ? 'Both'
                : dn.node_a
                  ? actorAShort
                  : actorBShort,
          isCrux: dn.category === 'direct_crux_disagreement',
        })),
      })),
    };
  }, [props]);

  return (
    <>
      {/* Desktop / Tablet 5-Column Swimlane Flowchart */}
      <div
        ref={containerRef}
        className={`relative hidden overflow-hidden rounded-2xl border border-[var(--border-hairline)] dot-grid-canvas md:block ${heightClass}`}
      >
        {/* Top Bar inside Canvas: Column Headers + Clear 2-Color Legend in Compare Mode */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 border-b border-dashed border-[var(--border-hairline)] bg-[var(--bg-canvas)]/90 backdrop-blur-[2px]">
          {props.mode === 'compare' && (
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)]/60 px-4 py-1.5 text-[11px]">
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--actor-a-text)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-a-border)]" />
                  {props.actorAFull ?? props.actorAShort}
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--actor-b-text)]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--actor-b-border)]" />
                  {props.actorBFull ?? props.actorBShort}
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-secondary)]">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background:
                        'linear-gradient(135deg, var(--actor-a-border) 50%, var(--actor-b-border) 50%)',
                    }}
                  />
                  Shared (dual border)
                </span>
              </div>
              <span className="text-[var(--ink-muted)]">Click any card to read reasoning & update criteria</span>
            </div>
          )}
          <div className="grid grid-cols-5 px-4 py-2">
            {STAGES.map((s) => (
              <div key={s.key} className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                {s.num}. {s.label}
              </div>
            ))}
          </div>
        </div>

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.18 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={true}
          minZoom={0.45}
          maxZoom={1.4}
          onNodeClick={(_, node) => {
            if (props.mode === 'single' && props.onSelectNode) {
              props.onSelectNode(node.id);
            } else if (props.mode === 'compare' && props.onSelectCluster) {
              props.onSelectCluster(node.id);
            }
          }}
        >
          <AutoFitOnResize containerRef={containerRef} nodeCount={rfNodes.length} />
          <Controls showInteractive={false} className="!border-[var(--border-hairline)] !bg-[var(--bg-surface)] !shadow-xs" />
        </ReactFlow>
      </div>

      {/* Mobile Device-Proof Vertical 5-Stage Stack */}
      <div className="space-y-3 md:hidden">
        {mobileByStage.map(({ stage, items }) => (
          <div
            key={stage.key}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5"
          >
            <div className="mb-2 font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              {stage.num}. {stage.label}
            </div>
            {items.length === 0 ? (
              <div className="text-xs italic text-[var(--ink-muted)]">None</div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (props.mode === 'single' && props.onSelectNode) props.onSelectNode(item.id);
                      else if (props.mode === 'compare' && props.onSelectCluster) props.onSelectCluster(item.id);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                      item.isCrux
                        ? 'border-rose-300 bg-rose-50/40'
                        : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)]'
                    }`}
                  >
                    <span className="font-semibold text-[var(--ink-primary)]">{item.title}</span>
                    {item.badge && (
                      <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2 py-0.5 font-mono-meta text-[10px] text-[var(--ink-secondary)]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
