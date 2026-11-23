import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import { GripHorizontal, Maximize2, Minimize2, Plus, Trash2, X } from 'lucide-react';
import {
  STAGES,
  credencePill,
  type Concept,
  type DiffResult,
  type EdgeRelation,
  type SnapshotEdge,
  type SnapshotNode,
  type Stage,
  type UpdateCriterion,
} from '../types';
import {
  LaneColumnNode,
  TocNodeCard,
  type CompareNodeData,
  type LaneColumnData,
  type PlaceholderNodeData,
  type SingleNodeData,
} from './NodeCard';

const nodeTypes = {
  tocNode: TocNodeCard,
  laneColumn: LaneColumnNode,
};

const COL_WIDTH = 312;
const LANE_WIDTH = 256;
const SINGLE_ROW_HEIGHT = 176;
const COMPARE_ROW_HEIGHT = 208;
const LANE_TOP = 16;
const CARD_TOP_OFFSET = 76;
const LEFT_OFFSET = 28;

const EDGE_RELATIONS: { key: EdgeRelation | null; label: string }[] = [
  { key: 'leads_to', label: 'leads to' },
  { key: 'mitigates', label: 'mitigates' },
  { key: 'depends_on', label: 'depends on' },
  { key: 'conflicts_with', label: 'conflicts with' },
  { key: null, label: 'no label' },
];

function AutoFitOnResize({
  containerRef,
  fitKey,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  fitKey: string;
}) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let rafId = 0;
    const triggerFit = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        fitView({ padding: 0.08, maxZoom: 1.05, duration: 160 });
      });
    };
    triggerFit();
    const ro = new ResizeObserver(triggerFit);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [containerRef, fitView, fitKey]);

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
  editable?: boolean;
  activeStage?: Stage;
  onAddInStage?: (stage: Stage) => void;
  onConnectNodes?: (sourceLocalId: string, targetLocalId: string) => void;
  selectedEdgeId?: string | null;
  onSelectEdge?: (edgeId: string | null) => void;
  onUpdateEdgeRelation?: (edgeId: string, relation: EdgeRelation | null) => void;
  onDeleteEdge?: (edgeId: string) => void;
  defaultHeight?: number;
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
  defaultHeight?: number;
}

type SwimlaneCanvasProps = SingleCanvasProps | CompareCanvasProps;

export function SwimlaneCanvas(props: SwimlaneCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { rfNodes, rfEdges, mobileByStage, maxRows } = useMemo(() => {
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

      const maxRowsVal = Math.max(1, ...STAGES.map((s) => byStage[s.key].length));
      const totalH = maxRowsVal * SINGLE_ROW_HEIGHT;
      const laneHeight = Math.max(360, totalH + 92);

      const builtNodes: Node[] = [];

      // 1. World-space swimlane column frames (pan & zoom in lockstep with cards!)
      for (const s of STAGES) {
        const laneData: LaneColumnData = {
          num: s.num,
          label: s.label,
          width: LANE_WIDTH,
          height: laneHeight,
          active: props.activeStage === s.key,
          editable: Boolean(props.editable),
          onAdd: props.onAddInStage ? () => props.onAddInStage?.(s.key) : undefined,
        };
        builtNodes.push({
          id: `__lane_${s.key}`,
          type: 'laneColumn',
          position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH - 18, y: LANE_TOP },
          data: laneData,
          draggable: false,
          selectable: false,
          focusable: false,
          connectable: false,
          zIndex: -10,
        });
      }

      // 2. Cards (or clickable placeholders in editable mode)
      for (const s of STAGES) {
        const col = byStage[s.key];
        if (col.length === 0 && props.editable) {
          const phData: PlaceholderNodeData = {
            kind: 'placeholder',
            stageLabel: s.label,
          };
          builtNodes.push({
            id: `__placeholder_${s.key}`,
            type: 'tocNode',
            position: {
              x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH,
              y: CARD_TOP_OFFSET + Math.max(0, (totalH - SINGLE_ROW_HEIGHT) / 2),
            },
            data: phData,
            draggable: false,
            connectable: false,
            zIndex: 1,
          });
          continue;
        }
        const colH = col.length * SINGLE_ROW_HEIGHT;
        const startY = CARD_TOP_OFFSET + Math.max(0, (totalH - colH) / 2);
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
            editable: Boolean(props.editable),
          };
          builtNodes.push({
            id: n.local_id,
            type: 'tocNode',
            position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH, y: startY + idx * SINGLE_ROW_HEIGHT },
            data,
            draggable: false,
            zIndex: 2,
          });
        });
      }

      const activeSet = new Set(activeNodes.map((n) => n.local_id));
      const builtEdges: Edge[] = props.edges
        .filter((e) => activeSet.has(e.source_local_id) && activeSet.has(e.target_local_id))
        .map((e) => {
          const isSelected = props.selectedEdgeId === e.id;
          const strokeColor = isSelected
            ? '#18181B'
            : e.relation === 'conflicts_with'
              ? '#E11D48'
              : '#A1A1AA';
          return {
            id: e.id,
            source: e.source_local_id,
            target: e.target_local_id,
            type: 'default',
            label: e.relation ? e.relation.replace('_', ' ') : undefined,
            labelStyle: {
              fontSize: 10,
              fill: isSelected ? '#18181B' : '#71717A',
              fontFamily: 'var(--font-mono)',
              fontWeight: isSelected ? 700 : 500,
            },
            labelBgStyle: { fill: '#FAF9F6', fillOpacity: 0.92 },
            style: {
              stroke: strokeColor,
              strokeWidth: isSelected ? 2.6 : 1.7,
              cursor: props.editable ? 'pointer' : 'default',
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: strokeColor,
            },
          };
        });

      return {
        rfNodes: builtNodes,
        rfEdges: builtEdges,
        maxRows: maxRowsVal,
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

    const maxRowsVal = Math.max(1, ...STAGES.map((s) => byStage[s.key].length));
    const totalH = maxRowsVal * COMPARE_ROW_HEIGHT;
    const laneHeight = Math.max(400, totalH + 92);

    const builtNodes: Node[] = [];

    // World-space swimlane frames locked to the cards at all pan/zoom levels
    for (const s of STAGES) {
      const laneData: LaneColumnData = {
        num: s.num,
        label: s.label,
        width: LANE_WIDTH + 8,
        height: laneHeight,
      };
      builtNodes.push({
        id: `__lane_${s.key}`,
        type: 'laneColumn',
        position: { x: LEFT_OFFSET + (s.num - 1) * COL_WIDTH - 18, y: LANE_TOP },
        data: laneData,
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: false,
        zIndex: -10,
      });
    }

    for (const s of STAGES) {
      const col = byStage[s.key];
      const colH = col.length * COMPARE_ROW_HEIGHT;
      const startY = CARD_TOP_OFFSET + Math.max(0, (totalH - colH) / 2);
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
          zIndex: 2,
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
      maxRows: maxRowsVal,
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

  // Smart generous initial height that scales up automatically for dense real-world charts
  const autoHeight = Math.min(760, Math.max(props.defaultHeight ?? 580, 320 + maxRows * 125));
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const effectiveHeight = customHeight ?? autoHeight;

  // Escape exits fullscreen expand mode
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  function startVerticalResize(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = containerRef.current?.getBoundingClientRect().height ?? effectiveHeight;

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(380, Math.min(1150, Math.round(startH + (ev.clientY - startY))));
      setCustomHeight(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const isEditable = props.mode === 'single' && Boolean(props.editable);
  const selectedEdge =
    props.mode === 'single' && props.selectedEdgeId
      ? props.edges.find((e) => e.id === props.selectedEdgeId) ?? null
      : null;

  function handleConnect(conn: Connection) {
    if (
      props.mode === 'single' &&
      props.onConnectNodes &&
      conn.source &&
      conn.target &&
      conn.source !== conn.target
    ) {
      props.onConnectNodes(conn.source, conn.target);
    }
  }

  const fitKey = `${rfNodes.length}_${rfEdges.length}_${expanded ? 'fs' : 'norm'}`;

  return (
    <>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Desktop / Tablet Resizable + Expandable 5-Column Swimlane Flowchart */}
      <div
        ref={containerRef}
        style={expanded ? undefined : { height: `${effectiveHeight}px` }}
        className={`${
          expanded ? 'fixed inset-4 z-50 shadow-2xl' : 'relative'
        } hidden flex-col overflow-hidden rounded-2xl border border-[var(--border-hairline)] dot-grid-canvas md:flex`}
      >
        {/* Minimal Top Utility Bar (Legend / Hint + Expand button) */}
        <div className="z-10 flex items-center justify-between border-b border-[var(--border-hairline)]/80 bg-[var(--bg-canvas)]/92 px-4 py-2 text-[11px] backdrop-blur-[2px]">
          {props.mode === 'compare' ? (
            <div className="flex flex-wrap items-center gap-4">
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
                Shared
              </span>
            </div>
          ) : isEditable ? (
            <span className="text-[var(--ink-muted)]">
              Click node or arrow to edit · Drag handles to connect · Click + in any column to add
            </span>
          ) : (
            <span className="text-[var(--ink-muted)]">
              Click any node for quotes, reasoning & update criteria · Scroll or pinch to zoom
            </span>
          )}

          <div className="flex items-center gap-2">
            {customHeight && !expanded && (
              <button
                type="button"
                onClick={() => setCustomHeight(null)}
                className="rounded-md px-2 py-0.5 text-[10px] font-medium text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
              >
                Reset height
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Exit fullscreen (Esc)' : 'Expand viewer'}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              {expanded ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  Close
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  Expand
                </>
              )}
            </button>
          </div>
        </div>

        {/* React Flow Interactive Viewport */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 1.05 }}
            nodesDraggable={false}
            nodesConnectable={isEditable}
            elementsSelectable={true}
            minZoom={0.3}
            maxZoom={1.5}
            onConnect={handleConnect}
            onNodeClick={(_, node) => {
              if (node.id.startsWith('__lane_')) return;
              if (props.mode === 'single') {
                if (node.id.startsWith('__placeholder_')) {
                  const st = node.id.replace('__placeholder_', '') as Stage;
                  props.onAddInStage?.(st);
                  return;
                }
                props.onSelectEdge?.(null);
                props.onSelectNode?.(node.id);
              } else if (props.mode === 'compare' && props.onSelectCluster) {
                props.onSelectCluster(node.id);
              }
            }}
            onEdgeClick={(_, edge) => {
              if (props.mode === 'single' && props.editable) {
                props.onSelectEdge?.(edge.id);
              }
            }}
            onPaneClick={() => {
              if (props.mode === 'single' && props.editable) {
                props.onSelectEdge?.(null);
              }
            }}
          >
            <AutoFitOnResize containerRef={containerRef} fitKey={fitKey} />
            <Controls
              showInteractive={false}
              className="!border-[var(--border-hairline)] !bg-[var(--bg-surface)] !shadow-xs"
            />
          </ReactFlow>

          {/* Floating Edge Editor Bar (only when an arrow is clicked in Studio) */}
          {isEditable && selectedEdge && (
            <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-[var(--ink-primary)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-lg">
              <span className="mr-1 font-mono-meta text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
                Arrow:
              </span>
              {EDGE_RELATIONS.map((rel) => {
                const active = (selectedEdge.relation ?? null) === rel.key;
                return (
                  <button
                    key={rel.label}
                    type="button"
                    onClick={() => props.onUpdateEdgeRelation?.(selectedEdge.id, rel.key)}
                    className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                      active
                        ? 'bg-[var(--ink-primary)] text-white'
                        : 'text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]'
                    }`}
                  >
                    {rel.label}
                  </button>
                );
              })}
              <div className="mx-1 h-4 w-px bg-[var(--border-hairline)]" />
              <button
                type="button"
                onClick={() => {
                  props.onDeleteEdge?.(selectedEdge.id);
                  props.onSelectEdge?.(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
              <button
                type="button"
                onClick={() => props.onSelectEdge?.(null)}
                className="rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Bottom Vertical Drag-to-Resize Handle */}
        {!expanded && (
          <div
            onPointerDown={startVerticalResize}
            title="Drag to resize viewer height"
            className="group z-10 flex h-4 cursor-ns-resize items-center justify-center border-t border-[var(--border-hairline)]/80 bg-[var(--bg-surface)]/80 transition hover:bg-[var(--bg-subtle)]"
          >
            <GripHorizontal className="h-3.5 w-3.5 text-[var(--ink-muted)]/60 group-hover:text-[var(--ink-primary)]" />
          </div>
        )}
      </div>

      {/* Mobile Device-Proof Vertical 5-Stage Stack */}
      <div className="space-y-3 md:hidden">
        {mobileByStage.map(({ stage, items }) => (
          <div
            key={stage.key}
            className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                {stage.num}. {stage.label}
              </span>
              {isEditable && props.onAddInStage && (
                <button
                  type="button"
                  onClick={() => props.onAddInStage?.(stage.key)}
                  className="inline-flex items-center gap-0.5 rounded-md border border-[var(--border-hairline)] px-2 py-0.5 text-[10px] font-semibold"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
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
