import { useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MarkerType,
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

const COL_WIDTH = 264;
const ROW_HEIGHT = 152;
const TOP_OFFSET = 58;
const LEFT_OFFSET = 28;

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
  spotlightClusterId?: string | null;
  onSelectCluster?: (clusterId: string) => void;
  heightClass?: string;
}

type SwimlaneCanvasProps = SingleCanvasProps | CompareCanvasProps;

export function SwimlaneCanvas(props: SwimlaneCanvasProps) {
  const heightClass = props.heightClass ?? 'h-[520px]';

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
      const totalH = maxRows * ROW_HEIGHT;

      const builtNodes: Node[] = [];
      for (const s of STAGES) {
        const col = byStage[s.key];
        const colH = col.length * ROW_HEIGHT;
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
            position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH, y: startY + idx * ROW_HEIGHT },
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

    // Compare mode
    const { diff, actorAShort, actorBShort, spotlightClusterId } = props;
    // Show active nodes + crux disagreements (even if rejected on one side!)
    const visibleNodes = diff.nodes.filter((dn) => {
      if (dn.category === 'direct_crux_disagreement') return true;
      const actA = dn.node_a && (dn.node_a.stance === 'active' || dn.node_a.stance === 'open_crux');
      const actB = dn.node_b && (dn.node_b.stance === 'active' || dn.node_b.stance === 'open_crux');
      return Boolean(actA || actB);
    });

    // Compute spotlight connected cluster set (upstream + downstream of spotlightClusterId)
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
    const totalH = maxRows * ROW_HEIGHT;

    const builtNodes: Node[] = [];
    for (const s of STAGES) {
      const col = byStage[s.key];
      const colH = col.length * ROW_HEIGHT;
      const startY = TOP_OFFSET + Math.max(0, (totalH - colH) / 2);
      col.forEach((dn, idx) => {
        const labelA = dn.node_a
          ? dn.node_a.credence
            ? credencePill(dn.node_a.credence)
            : dn.node_a.bet_priority === 'primary'
              ? 'Primary Bet'
              : dn.node_a.stance === 'rejected'
                ? 'Rejected'
                : 'Active'
          : undefined;
        const labelB = dn.node_b
          ? dn.node_b.credence
            ? credencePill(dn.node_b.credence)
            : dn.node_b.bet_priority === 'primary'
              ? 'Primary Bet'
              : dn.node_b.stance === 'rejected'
                ? 'Rejected'
                : 'Active'
          : undefined;
        const dimmed = Boolean(spotlightClusterId && !spotlightSet.has(dn.cluster_id));
        const data: CompareNodeData = {
          kind: 'compare',
          title: dn.canonical_title,
          category: dn.category,
          labelA,
          labelB,
          actorAShort,
          actorBShort,
          criteriaCount: dn.update_criteria_count,
          selected: spotlightClusterId === dn.cluster_id,
          dimmed,
        };
        builtNodes.push({
          id: dn.cluster_id,
          type: 'tocNode',
          position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH, y: startY + idx * ROW_HEIGHT },
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
          e.owner === 'actor_a' ? '#4F46E5' : e.owner === 'actor_b' ? '#0D9488' : '#71717A';
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
              ? 'CRUX GAP'
              : dn.category === 'shared_ground'
                ? 'Shared'
                : dn.node_a && !dn.node_b
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
      <div className={`relative hidden overflow-hidden rounded-2xl border border-[var(--border-hairline)] dot-grid-canvas md:block ${heightClass}`}>
        {/* 5-Stage Column Headers */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 grid grid-cols-5 border-b border-dashed border-[var(--border-hairline)] bg-[var(--bg-canvas)]/85 px-4 py-2.5 backdrop-blur-[2px]">
          {STAGES.map((s) => (
            <div key={s.key} className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              {s.num}. {s.label}
            </div>
          ))}
        </div>

        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
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
              <div className="text-xs italic text-[var(--ink-muted)]">No active nodes in this stage.</div>
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
                        ? 'border-amber-300 bg-amber-50/50'
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
