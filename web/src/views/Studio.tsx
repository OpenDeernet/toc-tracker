import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  GitFork,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from 'lucide-react';
import { api } from '../api/client';
import {
  STAGES,
  type ActorCard,
  type Archetype,
  type Concept,
  type Credence,
  type EdgeRelation,
  type LiveMatchResponse,
  type PublicUser,
  type SnapshotEdge,
  type SnapshotNode,
  type Stage,
  type StudioSuggestion,
  type UpdateCriterion,
} from '../types';
import { CredencePicker } from '../components/CredencePicker';
import { SwimlaneCanvas } from '../components/SwimlaneCanvas';

interface StudioProps {
  user: PublicUser | null;
  onOpenAuth: () => void;
}

const DEFAULT_CREDENCE: Credence = {
  mode: 'qualitative',
  band: 'high',
  percent: null,
  percent_range: null,
  numeric_rationale: null,
};

export function Studio({ user, onOpenAuth }: StudioProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const forkHandle = searchParams.get('fork');
  const claimHandle = searchParams.get('claim');
  const claimMode = searchParams.get('mode'); // 'augment' | 'wipe'

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [stageIdx, setStageIdx] = useState(0);
  const currentStage = STAGES[stageIdx];

  // Authoring mode
  const [authoringMode, setAuthoringMode] = useState<'self' | 'community'>(
    claimHandle ? 'self' : 'self'
  );

  // Reference catalogs
  const [archetypes, setArchetypes] = useState<Archetype[]>([]);
  const [actors, setActors] = useState<ActorCard[]>([]);
  const [conceptsMap, setConceptsMap] = useState<Record<string, Concept>>({});
  const [suggestions, setSuggestions] = useState<StudioSuggestion[]>([]);

  // Working ToC draft
  const [summary, setSummary] = useState('');
  const [nodes, setNodes] = useState<SnapshotNode[]>([]);
  const [edges, setEdges] = useState<SnapshotEdge[]>([]);
  const [criteria, setCriteria] = useState<UpdateCriterion[]>([
    {
      id: 'uc_1',
      target_local_id: null,
      trigger: '',
      timeframe: 'by Q4 2027',
      pivot_action: '',
      status: 'watching',
      evidence_urls: [],
    },
  ]);

  // Step 1 AI Paste Link / Text panel
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiUrl, setAiUrl] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  // Step 2 active editor inputs
  const [selectedCredence, setSelectedCredence] = useState<Credence>(DEFAULT_CREDENCE);
  const [edgeRelation, setEdgeRelation] = useState<EdgeRelation>('leads_to');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [forkParentId, setForkParentId] = useState<string | null>(null);
  const [citationUrl, setCitationUrl] = useState('');

  // Step 5 publish fields
  const [actorHandle, setActorHandle] = useState(claimHandle ?? '');
  const [actorName, setActorName] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [actorKind, setActorKind] = useState<'individual' | 'organization'>('individual');
  const [changelogNote, setChangelogNote] = useState('');
  const [liveMatch, setLiveMatch] = useState<LiveMatchResponse | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Load initial catalogs + handle ?fork or ?claim
  useEffect(() => {
    Promise.all([api.listArchetypes(), api.listActors(), api.listConcepts()]).then(
      ([archs, acts, cpts]) => {
        setArchetypes(archs);
        setActors(acts);
        const cmap: Record<string, Concept> = {};
        for (const c of cpts) cmap[c.id] = c;
        setConceptsMap(cmap);
      }
    );
  }, []);

  useEffect(() => {
    const loadHandle = forkHandle || (claimHandle && claimMode !== 'wipe' ? claimHandle : null);
    if (claimHandle) {
      api.getActor(claimHandle).then((res) => {
        setActorHandle(res.actor.handle);
        setActorName(res.actor.display_name);
        setActorRole(res.actor.role_or_affiliation);
        setActorKind(res.actor.kind);
        if (claimMode !== 'wipe' && res.primary_snapshot) {
          setSummary(res.primary_snapshot.summary);
          setNodes(res.primary_snapshot.nodes);
          setEdges(res.primary_snapshot.edges);
          setCriteria(res.primary_snapshot.update_criteria);
          setStep(2);
        }
      });
    } else if (loadHandle) {
      api.getActor(loadHandle).then((res) => {
        if (res.primary_snapshot) {
          setSummary(res.primary_snapshot.summary);
          setNodes(res.primary_snapshot.nodes);
          setEdges(res.primary_snapshot.edges);
          setCriteria(res.primary_snapshot.update_criteria);
          setStep(2);
        }
      });
    }
  }, [forkHandle, claimHandle, claimMode]);

  // Fetch A/B/C contextual suggestions whenever stage or prior nodes change
  const priorConceptIds = useMemo(() => nodes.map((n) => n.concept_id), [nodes]);
  useEffect(() => {
    api
      .studioSuggest(currentStage.key, priorConceptIds)
      .then(setSuggestions)
      .catch(() => {});
  }, [currentStage.key, priorConceptIds]);

  // Live overlap match preview as user builds their graph
  useEffect(() => {
    if (nodes.length === 0) {
      setLiveMatch(null);
      return;
    }
    const timer = setTimeout(() => {
      api.studioLiveMatch(nodes, edges).then(setLiveMatch).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
  }, [nodes, edges]);

  function loadArchetype(arch: Archetype) {
    setSummary(arch.summary);
    setNodes(arch.nodes);
    setEdges(arch.edges);
    setCriteria(arch.update_criteria.length > 0 ? arch.update_criteria : criteria);
    setStep(2);
  }

  async function handleAiExtract(e: React.FormEvent) {
    e.preventDefault();
    setAiLoading(true);
    setAiNotice(null);
    try {
      const draft = await api.studioExtract({ text: aiText, url: aiUrl });
      setSummary(draft.summary);
      setNodes(draft.nodes);
      setEdges(draft.edges);
      if (draft.update_criteria.length > 0) setCriteria(draft.update_criteria);
      setAiNotice(draft.note);
      setShowAiPanel(false);
      setStep(2);
    } catch (err) {
      setAiNotice(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setAiLoading(false);
    }
  }

  function addNodeForConcept(concept: Concept, stage: Stage) {
    // Validate numeric rationale if numeric mode selected on Premise/Bottleneck/Intervention
    const needsCredence = stage === 'premise' || stage === 'bottleneck' || stage === 'intervention';
    if (
      needsCredence &&
      selectedCredence.mode === 'numeric' &&
      (selectedCredence.numeric_rationale ?? '').trim().length < 10
    ) {
      alert('Exact numeric % requires a brief justification (at least 10 characters).');
      return;
    }

    const localId = `n_${stage}_${Date.now().toString(36)}`;
    const newNode: SnapshotNode = {
      local_id: localId,
      concept_id: concept.id,
      stage,
      stance: 'active',
      is_load_bearing_crux: stage === 'intervention' && !nodes.some((n) => n.is_load_bearing_crux),
      credence: needsCredence ? { ...selectedCredence } : null,
      bet_priority: stage === 'bet' ? 'primary' : null,
      note: null,
      citations: citationUrl.trim()
        ? [{ label: 'Source', url: citationUrl.trim(), quote: null }]
        : [],
    };

    // Auto-wire from active nodes in the previous stage
    const prevStageIdx = STAGES.findIndex((s) => s.key === stage) - 1;
    const newEdges: SnapshotEdge[] = [];
    if (prevStageIdx >= 0) {
      const prevStageKey = STAGES[prevStageIdx].key;
      const prevNodes = nodes.filter(
        (n) => n.stage === prevStageKey && (n.stance === 'active' || n.stance === 'open_crux')
      );
      for (const pn of prevNodes) {
        newEdges.push({
          id: `e_${pn.local_id}_${localId}`,
          source_local_id: pn.local_id,
          target_local_id: localId,
          relation: edgeRelation,
          note: null,
        });
      }
    }

    setNodes((prev) => [...prev, newNode]);
    if (newEdges.length > 0) setEdges((prev) => [...prev, ...newEdges]);
    setCitationUrl('');
  }

  async function handleCreateCustomConcept(e: React.FormEvent) {
    e.preventDefault();
    if (!customTitle.trim()) return;
    try {
      const created = await api.createConcept({
        stage: currentStage.key,
        title: customTitle.trim(),
        description: customDesc.trim(),
        parent_concept_id: forkParentId,
      });
      setConceptsMap((prev) => ({ ...prev, [created.id]: created }));
      addNodeForConcept(created, currentStage.key);
      setCustomTitle('');
      setCustomDesc('');
      setForkParentId(null);
      setShowCustomForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create concept');
    }
  }

  function removeNode(localId: string) {
    setNodes((prev) => prev.filter((n) => n.local_id !== localId));
    setEdges((prev) => prev.filter((e) => e.source_local_id !== localId && e.target_local_id !== localId));
  }

  function toggleCrux(localId: string) {
    setNodes((prev) =>
      prev.map((n) => (n.local_id === localId ? { ...n, is_load_bearing_crux: !n.is_load_bearing_crux } : n))
    );
  }

  function toggleRejectedConcept(concept: Concept) {
    const existing = nodes.find((n) => n.concept_id === concept.id && n.stance === 'rejected');
    if (existing) {
      removeNode(existing.local_id);
      return;
    }
    const newNode: SnapshotNode = {
      local_id: `n_rej_${Date.now().toString(36)}`,
      concept_id: concept.id,
      stage: concept.stage,
      stance: 'rejected',
      is_load_bearing_crux: false,
      credence: { mode: 'qualitative', band: 'low', percent: null, percent_range: null, numeric_rationale: null },
      bet_priority: null,
      note: 'Explicitly deprioritized / rejected compared to primary path.',
      citations: [],
    };
    setNodes((prev) => [...prev, newNode]);
  }

  const validCriteriaCount = criteria.filter(
    (u) => u.trigger.trim().length > 0 && u.pivot_action.trim().length > 0
  ).length;

  async function handlePublish() {
    setPublishError(null);
    if (validCriteriaCount < 1) {
      setPublishError('At least one complete Update Criterion (IF + THEN) is required to publish.');
      return;
    }
    if (authoringMode === 'self' && !user) {
      onOpenAuth();
      return;
    }
    const cleanHandle = (actorHandle || actorName)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    if (cleanHandle.length < 2) {
      setPublishError('Please provide a valid handle or display name.');
      return;
    }

    setPublishing(true);
    try {
      if (claimHandle) {
        await api.claimActor(claimHandle, user?.x_handle ?? undefined);
      } else {
        // Create actor if it doesn't exist yet
        const exists = actors.some((a) => a.handle.toLowerCase() === cleanHandle);
        if (!exists) {
          await api.createActor({
            handle: cleanHandle,
            display_name: actorName.trim() || cleanHandle,
            kind: actorKind,
            role_or_affiliation: actorRole.trim() || 'AI Safety Researcher',
            authorship_status: authoringMode === 'self' ? 'self_authored' : 'community_draft',
          });
        }
      }

      const finalSummary =
        summary.trim() ||
        `Theory of Change focusing on ${
          conceptsMap[nodes.find((n) => n.stage === 'bet')?.concept_id ?? '']?.title ?? 'AI Safety'
        }.`;

      await api.publishSnapshot({
        actor_handle: claimHandle ?? cleanHandle,
        authorship_mode: authoringMode === 'self' ? 'self_authored' : 'community_draft',
        summary: finalSummary,
        changelog_note: changelogNote.trim() || undefined,
        nodes,
        edges,
        update_criteria: criteria.filter((u) => u.trigger.trim() && u.pivot_action.trim()),
      });

      navigate(`/a/${encodeURIComponent(claimHandle ?? cleanHandle)}`);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  const stageActiveNodes = nodes.filter(
    (n) => n.stage === currentStage.key && (n.stance === 'active' || n.stance === 'open_crux')
  );
  const siblingInterventions = Object.values(conceptsMap).filter(
    (c) =>
      c.stage === 'intervention' &&
      !c.parent_concept_id &&
      !nodes.some((n) => n.concept_id === c.id && n.stance === 'active')
  );

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
      {/* Studio Stepper Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              [1, '1. Start'],
              [2, '2. Chain'],
              [3, '3. Crux'],
              [4, '4. Update Criterion*'],
              [5, '5. Publish'],
            ] as [1 | 2 | 3 | 4 | 5, string][]
          ).map(([num, label]) => (
            <button
              key={num}
              onClick={() => setStep(num)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                step === num
                  ? 'bg-[var(--ink-primary)] text-white'
                  : step > num
                    ? 'bg-[var(--semantic-agree-bg)] text-[var(--semantic-agree-text)]'
                    : 'text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {step > num ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {!claimHandle && (
            <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setAuthoringMode('self')}
                className={`rounded-md px-2.5 py-1 ${
                  authoringMode === 'self' ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
                }`}
              >
                My ToC
              </button>
              <button
                onClick={() => setAuthoringMode('community')}
                className={`rounded-md px-2.5 py-1 ${
                  authoringMode === 'community' ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
                }`}
              >
                Map Public Figure/Org
              </button>
            </div>
          )}
          <button
            onClick={() => setShowAiPanel((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            Paste Link (AI Draft)
          </button>
        </div>
      </div>

      {/* Optional AI Paste Link / Text Drawer */}
      {showAiPanel && (
        <form
          onSubmit={handleAiExtract}
          className="mb-4 rounded-2xl border border-amber-300 bg-[var(--semantic-crux-bg)] p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--ink-primary)]">
              Draft from a LessWrong post, org About page, or paragraph
            </h3>
            <button type="button" onClick={() => setShowAiPanel(false)} className="text-xs underline">
              Close
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              type="url"
              value={aiUrl}
              onChange={(e) => setAiUrl(e.target.value)}
              placeholder="Optional URL (e.g. https://lesswrong.com/posts/...)"
              className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-xs"
            />
            <input
              type="text"
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Or paste 2–4 sentences explaining your Theory of Change…"
              className="rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-xs"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-[var(--ink-secondary)]">
              Maps directly onto existing canonical concepts so your graph stays immediately comparable.
            </span>
            <button
              type="submit"
              disabled={aiLoading}
              className="rounded-lg bg-[var(--ink-primary)] px-4 py-1.5 text-xs font-semibold text-white"
            >
              {aiLoading ? 'Drafting…' : 'Generate Draft →'}
            </button>
          </div>
        </form>
      )}

      {aiNotice && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-xs text-[var(--ink-secondary)]">
          {aiNotice}
        </div>
      )}

      {/* STEP 1: ZERO-BLANK-CANVAS START RAMP */}
      {step === 1 && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
            <h1 className="font-editorial text-2xl font-semibold text-[var(--ink-primary)]">
              Start from a lens, not a blank canvas.
            </h1>
            <p className="mt-1 text-xs text-[var(--ink-secondary)]">
              Pick the closest AI Safety archetype or fork an existing public Theory of Change — then edit where you disagree.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {archetypes.map((arch) => (
                <button
                  key={arch.id}
                  onClick={() => loadArchetype(arch)}
                  className="group rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4 text-left transition hover:border-[var(--ink-primary)] hover:bg-[var(--bg-surface)]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--ink-primary)]">{arch.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--ink-primary)]" />
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ink-secondary)]">{arch.tagline}</p>
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[var(--ink-secondary)]">Or fork an existing actor:</span>
                {actors.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/studio?fork=${encodeURIComponent(a.handle)}`)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--bg-subtle)]"
                  >
                    <GitFork className="h-3 w-3" />
                    {a.display_name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep(2)}
                className="text-xs font-semibold text-[var(--ink-secondary)] underline hover:text-[var(--ink-primary)]"
              >
                Build step-by-step from scratch →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* STEPS 2–5: SPLIT WORKSPACE (LEFT GUIDED PANEL + RIGHT LIVE CANVAS) */}
      {step >= 2 && (
        <div className="grid gap-4 lg:grid-cols-[440px_1fr]">
          {/* Left Guided Panel */}
          <section className="flex flex-col rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            {step === 2 && (
              <div className="flex flex-1 flex-col">
                {/* Stage Sub-Tabs */}
                <div className="mb-4 grid grid-cols-5 gap-1 rounded-xl bg-[var(--bg-subtle)] p-1">
                  {STAGES.map((s, i) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        setStageIdx(i);
                        setShowCustomForm(false);
                      }}
                      className={`rounded-lg py-1 text-[10px] font-bold transition ${
                        stageIdx === i
                          ? 'bg-[var(--bg-surface)] text-[var(--ink-primary)] shadow-xs'
                          : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                      }`}
                    >
                      {s.num}. {s.label}
                    </button>
                  ))}
                </div>

                <div className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  Stage {currentStage.num} of 5 · {currentStage.label}
                </div>
                <h2 className="mt-1 text-lg font-bold text-[var(--ink-primary)]">{currentStage.question}</h2>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  Pick a canonical community concept below (instant comparability) or fork/write your own:
                </p>

                {/* Already added in this stage */}
                {stageActiveNodes.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {stageActiveNodes.map((n) => (
                      <div
                        key={n.local_id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-[var(--semantic-agree-bg)] px-3 py-1.5 text-xs"
                      >
                        <span className="font-semibold text-[var(--semantic-agree-text)]">
                          ✓ {conceptsMap[n.concept_id]?.title ?? n.concept_id}
                        </span>
                        <button
                          onClick={() => removeNode(n.local_id)}
                          className="text-rose-700 hover:opacity-75"
                          title="Remove node"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Coding-agent inspired A / B / C / D choices */}
                <div className="mt-3.5 space-y-2">
                  {suggestions.slice(0, 3).map((sug, idx) => {
                    const keycap = ['A', 'B', 'C'][idx];
                    return (
                      <div
                        key={sug.concept.id}
                        className="flex items-start gap-2.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-3 transition hover:border-[var(--actor-a-border)] hover:bg-[var(--actor-a-bg)]/30"
                      >
                        <button
                          type="button"
                          onClick={() => addNodeForConcept(sug.concept, currentStage.key)}
                          className="flex flex-1 items-start gap-2.5 text-left"
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] font-mono-meta text-xs font-bold text-[var(--ink-primary)]">
                            {keycap}
                          </span>
                          <div>
                            <div className="text-xs font-bold text-[var(--ink-primary)]">
                              {sug.concept.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
                              {sug.match_reason}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          title="Fork wording (keeps lineage to canonical root)"
                          onClick={() => {
                            setForkParentId(sug.concept.id);
                            setCustomTitle(sug.concept.title);
                            setCustomDesc(sug.concept.description);
                            setShowCustomForm(true);
                          }}
                          className="rounded-md p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--ink-primary)]"
                        >
                          <GitFork className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  {/* Option D: Custom / Fork */}
                  <button
                    type="button"
                    onClick={() => {
                      setForkParentId(null);
                      setShowCustomForm((o) => !o);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--border-strong)] p-3 text-left text-xs font-semibold text-[var(--ink-secondary)] hover:border-[var(--ink-primary)] hover:text-[var(--ink-primary)]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] font-mono-meta text-xs">
                      D
                    </span>
                    Other — Fork wording or write a custom node
                  </button>
                </div>

                {showCustomForm && (
                  <form
                    onSubmit={handleCreateCustomConcept}
                    className="mt-3 space-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3"
                  >
                    {forkParentId && (
                      <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--actor-a-text)]">
                        <GitFork className="h-3 w-3" />
                        Forking from "{conceptsMap[forkParentId]?.title}" (preserves graph comparability!)
                      </div>
                    )}
                    <input
                      type="text"
                      required
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="Concise claim or bet title (max 140 chars)"
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={customDesc}
                      onChange={(e) => setCustomDesc(e.target.value)}
                      placeholder="Optional clarification of what counts as true/false"
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-white px-2.5 py-1.5 text-xs"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add to {currentStage.label}
                    </button>
                  </form>
                )}

                {/* Credence & Edge Type Controls */}
                {(currentStage.key === 'premise' ||
                  currentStage.key === 'bottleneck' ||
                  currentStage.key === 'intervention') && (
                  <div className="mt-4 border-t border-[var(--border-hairline)] pt-3.5">
                    <CredencePicker value={selectedCredence} onChange={setSelectedCredence} />
                  </div>
                )}

                {stageIdx > 0 && (
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-[var(--ink-secondary)]">Incoming arrow type (optional):</span>
                    <select
                      value={edgeRelation}
                      onChange={(e) => setEdgeRelation(e.target.value as EdgeRelation)}
                      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2 py-1 font-mono-meta text-[11px]"
                    >
                      <option value="leads_to">leads to</option>
                      <option value="mitigates">mitigates</option>
                      <option value="depends_on">depends on</option>
                      <option value="conflicts_with">conflicts with</option>
                    </select>
                  </div>
                )}

                {authoringMode === 'community' && (
                  <div className="mt-3">
                    <label className="mb-1 block text-[11px] font-semibold text-amber-800">
                      Source Citation URL (required for community drafts)
                    </label>
                    <input
                      type="url"
                      value={citationUrl}
                      onChange={(e) => setCitationUrl(e.target.value)}
                      placeholder="https://lesswrong.com/... or https://arxiv.org/..."
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-2.5 py-1.5 text-xs"
                    />
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
                  <button
                    onClick={() => (stageIdx > 0 ? setStageIdx(stageIdx - 1) : setStep(1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <button
                    onClick={() => (stageIdx < 4 ? setStageIdx(stageIdx + 1) : setStep(3))}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--ink-primary)] px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    {stageIdx < 4 ? `Next: ${STAGES[stageIdx + 1].label}` : 'Next: Crux & Non-Bets'}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: PIN CRUX & EXPLICITLY REJECTED PATHS */}
            {step === 3 && (
              <div className="flex flex-1 flex-col">
                <div className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  Step 3 · High-Signal Diffs
                </div>
                <h2 className="mt-1 text-lg font-bold text-[var(--ink-primary)]">
                  Pin your load-bearing crux
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  Click the 1–2 nodes where a belief shift would collapse or redirect your Bet:
                </p>

                <div className="mt-3 space-y-1.5">
                  {nodes
                    .filter((n) => n.stance === 'active' || n.stance === 'open_crux')
                    .map((n) => (
                      <button
                        key={n.local_id}
                        onClick={() => toggleCrux(n.local_id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-xs transition ${
                          n.is_load_bearing_crux
                            ? 'border-amber-400 bg-[var(--semantic-crux-bg)] font-bold text-[var(--ink-primary)]'
                            : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-secondary)]'
                        }`}
                      >
                        <span>{conceptsMap[n.concept_id]?.title ?? n.concept_id}</span>
                        <Zap
                          className={`h-3.5 w-3.5 ${
                            n.is_load_bearing_crux ? 'text-amber-600' : 'text-zinc-300'
                          }`}
                        />
                      </button>
                    ))}
                </div>

                <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
                  <h3 className="text-xs font-bold text-[var(--ink-primary)]">
                    Why NOT these alternative paths? (Optional 1-click)
                  </h3>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-secondary)]">
                    Marking paths you actively reject unlocks sharp disagreements in Compare mode.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {siblingInterventions.slice(0, 5).map((c) => {
                      const isRej = nodes.some((n) => n.concept_id === c.id && n.stance === 'rejected');
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleRejectedConcept(c)}
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                            isRej
                              ? 'border-rose-400 bg-[var(--semantic-disagree-bg)] text-[var(--semantic-disagree-text)]'
                              : 'border-[var(--border-hairline)] bg-[var(--bg-canvas)] text-[var(--ink-secondary)] hover:border-rose-300'
                          }`}
                        >
                          {isRej ? '✕ ' : '+ Reject: '}
                          {c.title}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
                  <button
                    onClick={() => setStep(2)}
                    className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={() => setStep(4)}
                    className="rounded-lg bg-[var(--ink-primary)] px-4 py-1.5 text-xs font-semibold text-white"
                  >
                    Next: Update Criterion →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: REQUIRED UPDATE CRITERION */}
            {step === 4 && (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-1.5 font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                  <Target className="h-3.5 w-3.5" />
                  Step 4 · Required to Publish
                </div>
                <h2 className="mt-1 text-lg font-bold text-[var(--ink-primary)]">
                  What would change your mind?
                </h2>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  Every published Theory of Change on toc.open commits to at least one observable pivot trigger.
                </p>

                <div className="mt-4 space-y-3 overflow-y-auto">
                  {criteria.map((uc, idx) => (
                    <div
                      key={uc.id}
                      className="space-y-2.5 rounded-xl border border-amber-300 bg-[var(--semantic-crux-bg)] p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-meta text-[10px] font-bold uppercase text-amber-900">
                          Criterion #{idx + 1}
                        </span>
                        {criteria.length > 1 && (
                          <button
                            onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-[11px] text-rose-700"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <select
                        value={uc.target_local_id ?? ''}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, target_local_id: e.target.value || null } : item
                            )
                          )
                        }
                        className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="">Target: Overall Theory of Change</option>
                        {nodes.map((n) => (
                          <option key={n.local_id} value={n.local_id}>
                            Tests: {conceptsMap[n.concept_id]?.title ?? n.concept_id}
                          </option>
                        ))}
                      </select>

                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--ink-primary)]">
                          IF (observable signal)
                        </label>
                        <textarea
                          rows={2}
                          value={uc.trigger}
                          onChange={(e) =>
                            setCriteria((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, trigger: e.target.value } : item))
                            )
                          }
                          placeholder="e.g. White-box probes fail to beat black-box monitors on 3 model-organism suites"
                          className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-bold text-[var(--ink-primary)]">
                          THEN (how my belief or Bet shifts)
                        </label>
                        <textarea
                          rows={2}
                          value={uc.pivot_action}
                          onChange={(e) =>
                            setCriteria((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, pivot_action: e.target.value } : item
                              )
                            )
                          }
                          placeholder="e.g. Drop credence below 20% and pivot to AI Control"
                          className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>

                      <input
                        type="text"
                        value={uc.timeframe ?? ''}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, timeframe: e.target.value } : item))
                          )
                        }
                        placeholder="Optional timeframe (e.g. by Q4 2027)"
                        className="w-full rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      setCriteria((prev) => [
                        ...prev,
                        {
                          id: `uc_${Date.now().toString(36)}`,
                          target_local_id: null,
                          trigger: '',
                          timeframe: '',
                          pivot_action: '',
                          status: 'watching',
                          evidence_urls: [],
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another update criterion
                  </button>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
                  <button
                    onClick={() => setStep(3)}
                    className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold"
                  >
                    ← Back
                  </button>
                  <button
                    disabled={validCriteriaCount < 1}
                    onClick={() => setStep(5)}
                    className="rounded-lg bg-[var(--ink-primary)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Preview & Publish →
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: FIELD COMPARISON PAYOFF & PUBLISH */}
            {step === 5 && (
              <div className="flex flex-1 flex-col">
                <div className="font-mono-meta text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Step 5 · Ready to Publish
                </div>
                <h2 className="mt-1 text-lg font-bold text-[var(--ink-primary)]">
                  {claimHandle ? `Publish Claimed Profile (@${claimHandle})` : 'Publish to the Open Graph'}
                </h2>

                {liveMatch?.closest_actor_name && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-[var(--semantic-agree-bg)] p-3 text-xs text-[var(--semantic-agree-text)]">
                    <strong>Field Match Preview:</strong> Closest premise overlap with{' '}
                    <strong>{liveMatch.closest_actor_name}</strong> ({liveMatch.overlap_pct}%)
                    {liveMatch.sharpest_divergence_crux && (
                      <>
                        {' '}
                        · sharpest divergence vs <strong>{liveMatch.sharpest_divergence_actor}</strong> on{' '}
                        <em>"{liveMatch.sharpest_divergence_crux}"</em>.
                      </>
                    )}
                  </div>
                )}

                <div className="mt-4 space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                      1-Line TL;DR Summary
                    </label>
                    <textarea
                      rows={2}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="Why I do what I do in one crisp sentence."
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                    />
                  </div>

                  {!claimHandle && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={actorName}
                            onChange={(e) => setActorName(e.target.value)}
                            placeholder={user?.display_name ?? 'Your Name or Org'}
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                            Handle
                          </label>
                          <input
                            type="text"
                            value={actorHandle}
                            onChange={(e) => setActorHandle(e.target.value)}
                            placeholder="your-handle"
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 font-mono-meta text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                            Role / Affiliation
                          </label>
                          <input
                            type="text"
                            value={actorRole}
                            onChange={(e) => setActorRole(e.target.value)}
                            placeholder="Alignment Researcher"
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                            Type
                          </label>
                          <select
                            value={actorKind}
                            onChange={(e) => setActorKind(e.target.value as 'individual' | 'organization')}
                            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                          >
                            <option value="individual">Individual</option>
                            <option value="organization">Organization</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]">
                      Changelog Note (optional)
                    </label>
                    <input
                      type="text"
                      value={changelogNote}
                      onChange={(e) => setChangelogNote(e.target.value)}
                      placeholder="Initial Theory of Change snapshot"
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>

                {publishError && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    {publishError}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between border-t border-[var(--border-hairline)] pt-4">
                  <button
                    onClick={() => setStep(4)}
                    className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-semibold"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--ink-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {publishing
                      ? 'Publishing…'
                      : authoringMode === 'self' && !user
                        ? 'Sign in & Publish'
                        : 'Publish Open Snapshot'}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Panel: Live Assembling 5-Column Flowchart */}
          <div className="relative">
            <SwimlaneCanvas
              mode="single"
              nodes={nodes}
              edges={edges}
              updateCriteria={criteria}
              concepts={conceptsMap}
              heightClass="h-[640px]"
            />

            {liveMatch?.closest_actor_name && (
              <div className="pointer-events-none absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 px-3.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>
                  Live Match · <strong>{liveMatch.overlap_pct}%</strong> premise overlap with{' '}
                  <strong>{liveMatch.closest_actor_name}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
