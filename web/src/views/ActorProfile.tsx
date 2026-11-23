import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Download,
  ExternalLink,
  GitCompare,
  GitFork,
  Pencil,
  ShieldCheck,
  Target,
  UserCheck,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import {
  STAGES,
  credencePill,
  type ActorDetailResponse,
  type CriterionStatus,
  type PublicUser,
  type ToCSnapshot,
} from '../types';
import { SwimlaneCanvas } from '../components/SwimlaneCanvas';
import { InspectorDrawer } from '../components/InspectorDrawer';

type ProfileTab = 'flowchart' | 'brief' | 'criteria' | 'changelog';

interface ActorProfileProps {
  user: PublicUser | null;
  onOpenAuth: () => void;
}

export function ActorProfile({ user, onOpenAuth }: ActorProfileProps) {
  const { handle = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ActorDetailResponse | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [tab, setTab] = useState<ProfileTab>('flowchart');
  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [updatingCriterionId, setUpdatingCriterionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadActor() {
    setError(null);
    api
      .getActor(handle)
      .then((res) => {
        setData(res);
        const snap = res.primary_snapshot ?? res.snapshots[0] ?? null;
        setActiveVersion(snap?.version ?? null);
        const firstCrux = snap?.nodes.find((n) => n.is_load_bearing_crux && n.stance === 'active');
        setSelectedLocalId(firstCrux?.local_id ?? null);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadActor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle]);

  async function handleStatusChange(criterionId: string, status: CriterionStatus) {
    setUpdatingCriterionId(criterionId);
    try {
      await api.updateCriterionStatus(handle, criterionId, status);
      loadActor();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setUpdatingCriterionId(null);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <Link to="/" className="mt-4 inline-block text-xs font-semibold underline">
          ← Back to Explore
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[1440px] px-4 py-16 text-center text-xs text-[var(--ink-muted)]">
        Loading Theory of Change…
      </main>
    );
  }

  const { actor, snapshots, concepts, concept_usage_counts } = data;
  const snapshot: ToCSnapshot | undefined =
    snapshots.find((s) => s.version === activeVersion) ?? data.primary_snapshot ?? snapshots[0];

  const selectedNode = snapshot?.nodes.find((n) => n.local_id === selectedLocalId) ?? null;
  const selectedConcept = selectedNode ? concepts[selectedNode.concept_id] : undefined;
  const selectedParent = selectedConcept?.parent_concept_id
    ? concepts[selectedConcept.parent_concept_id]
    : undefined;
  const selectedCriteria =
    snapshot?.update_criteria.filter((u) => u.target_local_id === selectedNode?.local_id) ?? [];

  const rejectedNodes =
    snapshot?.nodes.filter((n) => n.stance === 'rejected' || n.stance === 'deprioritized') ?? [];

  const isUnclaimed = actor.authorship_status === 'community_draft';
  const isOwner = Boolean(user && actor.owner_user_id === user.id);

  function handleClaimChoice(mode: 'augment' | 'wipe') {
    setClaimModalOpen(false);
    if (!user) {
      onOpenAuth();
      return;
    }
    navigate(`/studio?claim=${encodeURIComponent(actor.handle)}&mode=${mode}`);
  }

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      {/* Polite Claim Banner for Unclaimed Community Drafts */}
      {isUnclaimed && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-[var(--semantic-crux-bg)] px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-[var(--semantic-crux-text)]">
            <UserCheck className="h-4 w-4 shrink-0" />
            <span>
              <strong>Community draft.</strong> Are you <strong>{actor.display_name}</strong>? Claim to verify or edit.
            </span>
          </div>
          <button
            onClick={() => setClaimModalOpen(true)}
            className="rounded-lg bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
          >
            Claim
          </button>
        </div>
      )}

      {/* Actor Header */}
      <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-5 pt-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] font-mono-meta text-sm font-bold text-[var(--ink-primary)]">
              {actor.avatar_initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-[var(--ink-primary)]">
                  {actor.display_name}
                </h1>
                {!isUnclaimed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--semantic-agree-bg)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--semantic-agree-text)]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {actor.verified_provider === 'x'
                      ? `Verified via X${actor.verified_handle ? ` (${actor.verified_handle})` : ''}`
                      : 'Verified Author'}
                  </span>
                ) : (
                  <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-muted)]">
                    Community-Mapped
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">{actor.role_or_affiliation}</p>
              {snapshot?.summary && (
                <p className="mt-2 max-w-3xl text-sm text-[var(--ink-primary)]">{snapshot.summary}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOwner && (
              <Link
                to={`/studio?edit=${encodeURIComponent(actor.handle)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--ink-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit Map
              </Link>
            )}
            <Link
              to={`/compare?a=${encodeURIComponent(actor.handle)}&b=${actor.handle === 'dario-amodei' ? 'eliezer-yudkowsky' : 'dario-amodei'}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <GitCompare className="h-3.5 w-3.5" />
              Compare
            </Link>
            <Link
              to={`/studio?fork=${encodeURIComponent(actor.handle)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
            >
              <GitFork className="h-3.5 w-3.5" />
              Fork
            </Link>
            {snapshots.length > 0 && (
              <select
                value={activeVersion ?? snapshots[0].version}
                onChange={(e) => setActiveVersion(Number(e.target.value))}
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-meta text-xs font-semibold text-[var(--ink-primary)]"
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.version}>
                    v{s.version}
                  </option>
                ))}
              </select>
            )}
            {snapshot && (
              <a
                href={`/api/v1/actors/${encodeURIComponent(actor.handle)}/export?format=json`}
                target="_blank"
                rel="noreferrer"
                title={
                  snapshot.arweave_tx_id &&
                  !snapshot.arweave_tx_id.startsWith('seed_') &&
                  !snapshot.arweave_tx_id.startsWith('local_')
                    ? 'View open JSON record (archived on Arweave)'
                    : 'View open JSON record (toc-schema/v1)'
                }
                className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-meta text-[11px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                {snapshot.arweave_tx_id &&
                !snapshot.arweave_tx_id.startsWith('seed_') &&
                !snapshot.arweave_tx_id.startsWith('local_')
                  ? `ar://${snapshot.arweave_tx_id.slice(0, 6)}..${snapshot.arweave_tx_id.slice(-3)}`
                  : 'JSON'}
              </a>
            )}
            <a
              href={`/api/v1/actors/${encodeURIComponent(actor.handle)}/export?format=markdown`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
            >
              <Download className="h-3.5 w-3.5" />
              MD
            </a>
          </div>
        </div>

        {/* Multi-Lens Sub-Navigation Tabs */}
        <div className="mt-5 flex gap-5 overflow-x-auto border-t border-[var(--border-hairline)]">
          {(
            [
              ['flowchart', 'Flowchart'],
              ['brief', 'Brief'],
              ['criteria', `Update Criteria (${snapshot?.update_criteria.length ?? 0})`],
              ['changelog', `Changelog (${snapshots.length})`],
            ] as [ProfileTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`relative whitespace-nowrap py-3 text-xs font-semibold transition ${
                tab === key
                  ? 'text-[var(--ink-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[var(--ink-primary)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {!snapshot ? (
        <div className="mt-6 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-10 text-center text-sm text-[var(--ink-muted)]">
          No published snapshot yet.
        </div>
      ) : (
        <div className="mt-5">
          {/* LENS 1: FLOWCHART + SLIDE-OVER INSPECTOR */}
          {tab === 'flowchart' && (
            <div className={`grid gap-4 ${selectedNode ? 'lg:grid-cols-[1fr_340px]' : 'grid-cols-1'}`}>
              <div className="space-y-3">
                <SwimlaneCanvas
                  mode="single"
                  nodes={snapshot.nodes}
                  edges={snapshot.edges}
                  updateCriteria={snapshot.update_criteria}
                  concepts={concepts}
                  selectedLocalId={selectedLocalId}
                  onSelectNode={(lid) => setSelectedLocalId(lid)}
                  defaultHeight={620}
                />

                {/* Rejected Paths Rail */}
                {rejectedNodes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3">
                    <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                      Rejected paths ({rejectedNodes.length})
                    </span>
                    {rejectedNodes.map((rn) => {
                      const c = concepts[rn.concept_id];
                      const active = selectedLocalId === rn.local_id;
                      return (
                        <button
                          key={rn.local_id}
                          onClick={() => setSelectedLocalId(rn.local_id)}
                          className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs font-medium transition ${
                            active
                              ? 'border-rose-500 bg-rose-100 text-rose-900'
                              : 'border-rose-300 bg-[var(--semantic-disagree-bg)] text-[var(--semantic-disagree-text)] hover:border-rose-400'
                          }`}
                        >
                          <span>✕</span>
                          <span>{c?.title ?? rn.concept_id}</span>
                          {rn.credence && (
                            <span className="font-mono-meta text-[10px] opacity-80">
                              · {credencePill(rn.credence)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedNode && (
                <InspectorDrawer
                  node={selectedNode}
                  concept={selectedConcept}
                  parentConcept={selectedParent}
                  criteria={selectedCriteria}
                  usageCount={
                    concept_usage_counts[selectedConcept?.root_concept_id ?? selectedNode.concept_id] ?? 1
                  }
                  onClose={() => setSelectedLocalId(null)}
                />
              )}
            </div>
          )}

          {/* LENS 2: EDITORIAL BRIEF / OUTLINE (Non-Flowchart Lens) */}
          {tab === 'brief' && (
            <div className="mx-auto max-w-4xl space-y-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-8">
              {STAGES.map((stage) => {
                const items = snapshot.nodes.filter(
                  (n) => n.stage === stage.key && (n.stance === 'active' || n.stance === 'open_crux')
                );
                if (items.length === 0) return null;
                return (
                  <div key={stage.key} className="border-b border-[var(--border-hairline)] pb-5 last:border-0 last:pb-0">
                    <div className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      {stage.num}. {stage.label} — <span className="normal-case font-normal">{stage.question}</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {items.map((n) => {
                        const c = concepts[n.concept_id];
                        return (
                          <div key={n.local_id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Link
                                to={`/concept/${encodeURIComponent(c?.root_concept_id ?? n.concept_id)}`}
                                className="text-sm font-bold text-[var(--ink-primary)] hover:underline"
                              >
                                {c?.title ?? n.concept_id}
                              </Link>
                              <div className="flex items-center gap-1.5">
                                {n.is_load_bearing_crux && (
                                  <span className="rounded-full bg-[var(--semantic-crux-bg)] px-2 py-0.5 font-mono-meta text-[10px] font-semibold text-[var(--semantic-crux-text)]">
                                    CRUX
                                  </span>
                                )}
                                {n.credence && (
                                  <span className="rounded-full bg-[var(--bg-surface)] px-2.5 py-0.5 font-mono-meta text-[11px] font-semibold">
                                    {credencePill(n.credence)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {n.credence?.numeric_rationale && (
                              <p className="mt-2 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--ink-secondary)]">
                                <strong>Rationale:</strong> {n.credence.numeric_rationale}
                              </p>
                            )}
                            {n.note && <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">{n.note}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {rejectedNodes.length > 0 && (
                <div className="border-t border-[var(--border-hairline)] pt-5">
                  <div className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-rose-700">
                    Explicitly Rejected / Deprioritized Paths
                  </div>
                  <div className="mt-3 space-y-2">
                    {rejectedNodes.map((n) => (
                      <div key={n.local_id} className="rounded-xl border border-dashed border-rose-300 bg-[var(--semantic-disagree-bg)] p-3.5 text-xs">
                        <div className="font-semibold text-[var(--semantic-disagree-text)]">
                          ✕ {concepts[n.concept_id]?.title ?? n.concept_id}{' '}
                          {n.credence ? `(${credencePill(n.credence)})` : ''}
                        </div>
                        {n.note && <p className="mt-1 text-[var(--ink-secondary)]">{n.note}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LENS 3: UPDATE CRITERIA WATCHLIST */}
          {tab === 'criteria' && (
            <div className="space-y-3">
              {snapshot.update_criteria.map((uc) => {
                const targetNode = snapshot.nodes.find((n) => n.local_id === uc.target_local_id);
                const targetTitle = targetNode
                  ? concepts[targetNode.concept_id]?.title ?? targetNode.concept_id
                  : 'Overall Theory of Change';
                return (
                  <div
                    key={uc.id}
                    className="rounded-2xl border border-amber-300/80 bg-[var(--bg-surface)] p-5 shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-amber-700" />
                        <span className="font-mono-meta text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                          Tests: {targetTitle}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {uc.timeframe && (
                          <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 font-mono-meta text-[11px] text-[var(--ink-secondary)]">
                            {uc.timeframe}
                          </span>
                        )}
                        {isOwner ? (
                          <div className="inline-flex rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-0.5 text-[10px] font-semibold">
                            {(
                              [
                                ['watching', 'Watching'],
                                ['partially_met', 'Partial'],
                                ['triggered', 'Triggered'],
                                ['retired', 'Retired'],
                              ] as [CriterionStatus, string][]
                            ).map(([st, lbl]) => (
                              <button
                                key={st}
                                disabled={updatingCriterionId === uc.id}
                                onClick={() => handleStatusChange(uc.id, st)}
                                className={`rounded-md px-2 py-0.5 transition ${
                                  uc.status === st
                                    ? 'bg-[var(--ink-primary)] text-white'
                                    : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="rounded-full bg-[var(--semantic-crux-bg)] px-2.5 py-0.5 font-mono-meta text-[11px] font-semibold text-[var(--semantic-crux-text)]">
                            {uc.status.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-[var(--bg-canvas)] p-3.5 text-xs">
                        <div className="font-mono-meta text-[10px] font-bold uppercase text-[var(--ink-muted)]">
                          IF (Observable Trigger)
                        </div>
                        <p className="mt-1 text-sm font-medium text-[var(--ink-primary)]">{uc.trigger}</p>
                      </div>
                      <div className="rounded-xl bg-[var(--semantic-crux-bg)] p-3.5 text-xs">
                        <div className="font-mono-meta text-[10px] font-bold uppercase text-amber-800">
                          THEN (Planned Pivot)
                        </div>
                        <p className="mt-1 text-sm font-medium text-[var(--ink-primary)]">{uc.pivot_action}</p>
                      </div>
                    </div>
                    {uc.evidence_urls.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {uc.evidence_urls.map((u, i) => (
                          <a
                            key={i}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--border-hairline)] px-2.5 py-0.5 text-xs text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {u}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* LENS 4: EPISTEMIC CHANGELOG */}
          {tab === 'changelog' && (
            <div className="mx-auto max-w-3xl space-y-4">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-[var(--ink-primary)] px-2.5 py-0.5 font-mono-meta text-xs font-bold text-white">
                        v{s.version}
                      </span>
                      <span className="text-xs text-[var(--ink-muted)]">
                        {new Date(s.published_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.arweave_tx_id &&
                        !s.arweave_tx_id.startsWith('seed_') &&
                        !s.arweave_tx_id.startsWith('local_') && (
                        <span className="font-mono-meta text-[11px] text-[var(--ink-muted)]">
                          ar://{s.arweave_tx_id.slice(0, 10)}…
                        </span>
                      )}
                      <button
                        onClick={() => {
                          setActiveVersion(s.version);
                          setTab('flowchart');
                        }}
                        className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--bg-subtle)]"
                      >
                        Inspect v{s.version}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2.5 text-sm font-medium text-[var(--ink-primary)]">
                    {s.changelog_note || s.summary}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                    {s.nodes.length} nodes · {s.update_criteria.length} update criteria
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Claim Choice Modal: Augment Existing Draft vs Wipe & Start Fresh */}
      {claimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-[var(--ink-primary)]">
                Claim {actor.display_name}
              </h3>
              <button onClick={() => setClaimModalOpen(false)} className="rounded p-1 hover:bg-[var(--bg-subtle)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-secondary)]">
              How would you like to take ownership of this Theory of Change?
            </p>
            <div className="mt-4 space-y-2.5">
              <button
                onClick={() => handleClaimChoice('augment')}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-canvas)] p-4 text-left transition hover:border-[var(--ink-primary)]"
              >
                <div className="text-sm font-bold text-[var(--ink-primary)]">
                  Edit draft
                </div>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  Adjust credences and wording directly.
                </p>
              </button>
              <button
                onClick={() => handleClaimChoice('wipe')}
                className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 text-left transition hover:border-[var(--ink-primary)]"
              >
                <div className="text-sm font-bold text-[var(--ink-primary)]">
                  Start blank
                </div>
                <p className="mt-1 text-xs text-[var(--ink-secondary)]">
                  Discard draft and start from scratch.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
