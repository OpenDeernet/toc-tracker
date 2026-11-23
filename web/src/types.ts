export type Stage = 'premise' | 'bottleneck' | 'intervention' | 'bet' | 'outcome';

export const STAGES: { key: Stage; num: number; label: string; question: string }[] = [
  { key: 'premise', num: 1, label: 'Premise', question: 'What happens by default?' },
  { key: 'bottleneck', num: 2, label: 'Bottleneck', question: 'What specific obstacle blocks a good outcome?' },
  { key: 'intervention', num: 3, label: 'Intervention', question: 'What mechanism shifts the trajectory?' },
  { key: 'bet', num: 4, label: 'Bet', question: 'What concrete work are you doing right now?' },
  { key: 'outcome', num: 5, label: 'Outcome', question: 'What does success look like?' },
];

export type ActorKind = 'individual' | 'organization';
export type AuthorshipStatus = 'self_authored' | 'community_draft' | 'claimed';
export type AuthorshipMode = 'self_authored' | 'community_draft';
export type NodeStance = 'active' | 'rejected' | 'deprioritized' | 'open_crux';
export type CredenceMode = 'qualitative' | 'numeric';
export type CredenceBand = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
export type BetPriority = 'primary' | 'secondary' | 'supporting';
export type EdgeRelation = 'leads_to' | 'mitigates' | 'depends_on' | 'conflicts_with';
export type CriterionStatus = 'watching' | 'partially_met' | 'triggered' | 'expired' | 'retired';

export const CREDENCE_BANDS: { key: CredenceBand; label: string; midpoint: number }[] = [
  { key: 'very_low', label: 'Very Low', midpoint: 10 },
  { key: 'low', label: 'Low', midpoint: 25 },
  { key: 'medium', label: 'Medium', midpoint: 50 },
  { key: 'high', label: 'High', midpoint: 75 },
  { key: 'very_high', label: 'Very High', midpoint: 90 },
];

export function bandLabel(band?: CredenceBand | null): string {
  return CREDENCE_BANDS.find((b) => b.key === band)?.label ?? 'Medium';
}

export function bandFromPercent(p: number): CredenceBand {
  if (p <= 15) return 'very_low';
  if (p <= 35) return 'low';
  if (p <= 64) return 'medium';
  if (p <= 84) return 'high';
  return 'very_high';
}

export function credencePill(c?: Credence | null): string {
  if (!c) return '';
  if (c.mode === 'numeric' && c.percent != null) return `${c.percent}%`;
  return bandLabel(c.band);
}

export interface ReferenceLink {
  title: string;
  url: string;
  note?: string | null;
}

export interface Actor {
  id: string;
  handle: string;
  display_name: string;
  kind: ActorKind;
  role_or_affiliation: string;
  one_line_stance?: string | null;
  contact_preference?: string | null;
  references?: ReferenceLink[];
  bio_url?: string | null;
  avatar_initials: string;
  authorship_status: AuthorshipStatus;
  owner_user_id?: string | null;
  verified_provider?: string | null;
  verified_handle?: string | null;
  arweave_pubkey?: string | null;
  primary_snapshot_id?: string | null;
  tags: string[];
  created_at: string;
}

export interface ActorCard extends Actor {
  summary?: string | null;
  version?: number | null;
  node_count: number;
  update_criteria_count: number;
  primary_bet_title?: string | null;
  crux_titles: string[];
}

export interface Concept {
  schema_version: number;
  id: string;
  stage: Stage;
  title: string;
  description: string;
  parent_concept_id?: string | null;
  root_concept_id: string;
  tags: string[];
  created_by_actor_id?: string | null;
  arweave_tx_id?: string | null;
  created_at: string;
  usage_count?: number;
}

export interface Credence {
  mode: CredenceMode;
  band: CredenceBand;
  percent?: number | null;
  percent_range?: [number, number] | null;
  numeric_rationale?: string | null;
}

export interface Citation {
  label: string;
  url: string;
  quote?: string | null;
}

export interface SnapshotNode {
  local_id: string;
  concept_id: string;
  stage: Stage;
  stance: NodeStance;
  is_load_bearing_crux: boolean;
  credence?: Credence | null;
  bet_priority?: BetPriority | null;
  note?: string | null;
  citations: Citation[];
}

export interface SnapshotEdge {
  id: string;
  source_local_id: string;
  target_local_id: string;
  relation?: EdgeRelation | null;
  note?: string | null;
}

export interface UpdateCriterion {
  id: string;
  target_local_id?: string | null;
  trigger: string;
  timeframe?: string | null;
  pivot_action: string;
  status: CriterionStatus;
  evidence_urls: string[];
}

export interface Omission {
  concept_id: string;
  reason: string;
}

export interface ToCSnapshot {
  schema_version: number;
  id: string;
  actor_id: string;
  version: number;
  previous_snapshot_id?: string | null;
  authorship_mode: AuthorshipMode;
  summary: string;
  essay_markdown?: string | null;
  changelog_note?: string | null;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  update_criteria: UpdateCriterion[];
  omissions?: Omission[];
  published_at: string;
  arweave_tx_id?: string | null;
}

export interface ActorDetailResponse {
  actor: Actor;
  primary_snapshot?: ToCSnapshot | null;
  snapshots: ToCSnapshot[];
  concepts: Record<string, Concept>;
  concept_usage_counts: Record<string, number>;
}

export type DiffCategory =
  | 'shared_ground'
  | 'direct_crux_disagreement'
  | 'unique_to_a'
  | 'unique_to_b'
  | 'unaddressed_load_bearing';

export interface DiffNode {
  cluster_id: string;
  canonical_title: string;
  stage: Stage;
  category: DiffCategory;
  crux_score: number;
  credence_delta?: number | null;
  node_a?: SnapshotNode | null;
  node_b?: SnapshotNode | null;
  concept_a_title?: string | null;
  concept_b_title?: string | null;
  update_criteria_count: number;
}

export interface DiffEdge {
  id: string;
  source_cluster_id: string;
  target_cluster_id: string;
  owner: 'shared' | 'actor_a' | 'actor_b';
  relation?: EdgeRelation | null;
  note?: string | null;
}

export interface EarliestSplit {
  stage: Stage;
  cluster_id: string;
  title: string;
  actor_a_position: string;
  actor_b_position: string;
  sentence: string;
}

export interface DiffSummary {
  shared_ground_count: number;
  crux_disagreement_count: number;
  unaddressed_count: number;
  premise_bottleneck_overlap_pct: number;
  headline: string;
  earliest_split?: EarliestSplit | null;
}

export interface DiffResult {
  actor_a_id: string;
  actor_b_id: string;
  snapshot_a_id: string;
  snapshot_b_id: string;
  summary: DiffSummary;
  nodes: DiffNode[];
  edges: DiffEdge[];
  top_cruxes: DiffNode[];
}

export interface CompareResponse {
  actor_a: Actor;
  actor_b: Actor;
  snapshot_a: ToCSnapshot;
  snapshot_b: ToCSnapshot;
  diff: DiffResult;
  concepts: Record<string, Concept>;
}

export interface ActorStanceChip {
  actor_id: string;
  handle: string;
  display_name: string;
  avatar_initials: string;
  credence_label: string;
  score: number;
  is_rejected: boolean;
}

export interface FieldCruxSummary {
  root_concept_id: string;
  title: string;
  stage: Stage;
  actor_count: number;
  active_count: number;
  rejected_count: number;
  mean_score: number;
  spread: number;
  contested_score: number;
  distribution: [number, number, number, number, number];
  tags: string[];
  supporters: ActorStanceChip[];
  skeptics: ActorStanceChip[];
}

export function shortActorName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return 'Actor';
  if (trimmed.toLowerCase().startsWith('compute governance')) return 'Compute Gov';
  const first = trimmed.split(/\s+/)[0];
  return first.length >= 2 ? first : trimmed.slice(0, 12);
}

const ACTOR_PALETTES = [
  { bg: '#F3E8FF', text: '#5B21B6', border: '#C4B5FD', accent: '#7C3AED' }, // Violet
  { bg: '#ECFDF5', text: '#065F46', border: '#6EE7B7', accent: '#059669' }, // Emerald
  { bg: '#EFF6FF', text: '#1E40AF', border: '#93C5FD', accent: '#2563EB' }, // Blue
  { bg: '#FFF7ED', text: '#9A3412', border: '#FDBA74', accent: '#EA580C' }, // Warm Terracotta
  { bg: '#FDF2F8', text: '#9D174D', border: '#F9A8D4', accent: '#DB2777' }, // Rose
  { bg: '#FEFCE8', text: '#854D0E', border: '#FDE047', accent: '#CA8A04' }, // Ochre
];

export function actorPalette(handle: string) {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    hash = (hash * 31 + handle.charCodeAt(i)) >>> 0;
  }
  return ACTOR_PALETTES[hash % ACTOR_PALETTES.length];
}

export interface ConceptActorPosition {
  actor_id: string;
  handle: string;
  display_name: string;
  avatar_initials: string;
  authorship_status: AuthorshipStatus;
  concept_id: string;
  concept_title: string;
  is_fork: boolean;
  stance: NodeStance;
  is_load_bearing_crux: boolean;
  credence?: Credence | null;
  note?: string | null;
  update_criteria: UpdateCriterion[];
}

export interface ConceptSpectrum {
  root_concept: Concept;
  forks: Concept[];
  positions: ConceptActorPosition[];
  distribution: [number, number, number, number, number];
}

export interface Archetype {
  id: string;
  name: string;
  tagline: string;
  tags: string[];
  summary: string;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  update_criteria: UpdateCriterion[];
}

export interface StudioSuggestion {
  concept: Concept;
  usage_count: number;
  is_canonical: boolean;
  match_reason: string;
}

export interface SourceDocumentInput {
  url?: string;
  title?: string;
  text?: string;
}

export interface ProposedConcept {
  temp_id: string;
  stage: Stage;
  title: string;
  description: string;
  parent_concept_id?: string | null;
}

export interface ExtractedDraft {
  actor_name_hint?: string | null;
  actor_role_hint?: string | null;
  summary: string;
  nodes: SnapshotNode[];
  edges: SnapshotEdge[];
  update_criteria: UpdateCriterion[];
  proposed_concepts: ProposedConcept[];
  used_llm: boolean;
  provider: string;
  model: string;
  docs_processed: number;
  note: string;
}

export interface AiStatusInfo {
  llm_enabled: boolean;
  provider: string;
  model: string;
}

export interface PublicUser {
  id: string;
  display_name: string;
  email?: string | null;
  x_handle?: string | null;
  github_handle?: string | null;
  arweave_pubkey: string;
}

export interface LiveMatchResponse {
  closest_actor_handle?: string | null;
  closest_actor_name?: string | null;
  overlap_pct: number;
  sharpest_divergence_actor?: string | null;
  sharpest_divergence_crux?: string | null;
}

export interface OwnedActorLink {
  handle: string;
  display_name: string;
}

export interface EpistemicCheckItem {
  code: string;
  severity: 'warning' | 'insight' | 'tip';
  title: string;
  detail: string;
  target_local_id?: string | null;
  suggested_concept_id?: string | null;
}

export interface SimilarConceptMatch {
  concept: Concept;
  similarity: number;
}

export interface NeglectedBottleneck {
  root_concept_id: string;
  title: string;
  believer_count: number;
  mitigator_count: number;
  mean_score: number;
  gap_score: number;
  believers: ActorStanceChip[];
  mitigators: ActorStanceChip[];
}

export interface FaultLinePair {
  actor_a_handle: string;
  actor_a_name: string;
  actor_b_handle: string;
  actor_b_name: string;
  shared_ground_count: number;
  disagreement_count: number;
  shared_premise_title?: string | null;
  top_disagreement_title: string;
  earliest_split_sentence?: string | null;
}

export interface HiddenAllyPair {
  actor_a_handle: string;
  actor_a_name: string;
  actor_a_tag: string;
  actor_b_handle: string;
  actor_b_name: string;
  actor_b_tag: string;
  shared_ground_count: number;
  shared_titles: string[];
}

export interface UnfalsifiableHotspot {
  root_concept_id: string;
  title: string;
  stage: Stage;
  actor_count: number;
  actors_with_criteria: number;
}

export interface FieldIntelligence {
  total_actors: number;
  total_concepts: number;
  neglected_bottlenecks: NeglectedBottleneck[];
  fault_lines: FaultLinePair[];
  hidden_allies: HiddenAllyPair[];
  unfalsifiable_hotspots: UnfalsifiableHotspot[];
}

export interface HiddenAssumption {
  title: string;
  why_it_matters: string;
}

export interface SteelmanObjection {
  from_perspective: string;
  argument: string;
  rival_handle?: string | null;
}

export interface SuggestedCriterion {
  trigger: string;
  timeframe?: string | null;
  pivot_action: string;
}

export interface StressTestResult {
  used_llm: boolean;
  provider: string;
  model: string;
  hidden_assumptions: HiddenAssumption[];
  steelman_objection?: SteelmanObjection | null;
  suggested_criterion?: SuggestedCriterion | null;
}
