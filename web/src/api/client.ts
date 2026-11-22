import type {
  Actor,
  ActorCard,
  ActorDetailResponse,
  Archetype,
  CompareResponse,
  Concept,
  ConceptSpectrum,
  CriterionStatus,
  EpistemicCheckItem,
  ExtractedDraft,
  FieldCruxSummary,
  LiveMatchResponse,
  OwnedActorLink,
  PublicUser,
  SimilarConceptMatch,
  SnapshotEdge,
  SnapshotNode,
  Stage,
  StudioSuggestion,
  ToCSnapshot,
  UpdateCriterion,
} from '../types';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.errors && Array.isArray(parsed.errors)) msg = parsed.errors.join(' · ');
      else if (parsed.error) msg = parsed.error;
    } catch {
      // keep raw text
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  listActors(params?: { kind?: string; status?: string; tag?: string; q?: string }) {
    const qs = new URLSearchParams();
    if (params?.kind) qs.set('kind', params.kind);
    if (params?.status) qs.set('status', params.status);
    if (params?.tag) qs.set('tag', params.tag);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<ActorCard[]>(`/api/v1/actors${suffix}`);
  },

  getActor(handle: string) {
    return apiFetch<ActorDetailResponse>(`/api/v1/actors/${encodeURIComponent(handle)}`);
  },

  compare(a: string, b: string) {
    return apiFetch<CompareResponse>(
      `/api/v1/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
    );
  },

  listConcepts(params?: { stage?: Stage; q?: string }) {
    const qs = new URLSearchParams();
    if (params?.stage) qs.set('stage', params.stage);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<Concept[]>(`/api/v1/concepts${suffix}`);
  },

  createConcept(body: {
    stage: Stage;
    title: string;
    description?: string;
    parent_concept_id?: string | null;
    tags?: string[];
  }) {
    return apiFetch<Concept>('/api/v1/concepts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getConceptSpectrum(rootId: string) {
    return apiFetch<ConceptSpectrum>(`/api/v1/concepts/${encodeURIComponent(rootId)}`);
  },

  listCruxes() {
    return apiFetch<FieldCruxSummary[]>('/api/v1/cruxes');
  },

  listArchetypes() {
    return apiFetch<Archetype[]>('/api/v1/archetypes');
  },

  createActor(body: {
    handle: string;
    display_name: string;
    kind: 'individual' | 'organization';
    role_or_affiliation?: string;
    bio_url?: string;
    authorship_status?: 'self_authored' | 'community_draft';
    tags?: string[];
  }) {
    return apiFetch<Actor>('/api/v1/actors', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  claimActor(handle: string, verified_handle?: string) {
    return apiFetch<Actor>(`/api/v1/actors/${encodeURIComponent(handle)}/claim`, {
      method: 'POST',
      body: JSON.stringify({ verified_handle }),
    });
  },

  publishSnapshot(body: {
    actor_handle: string;
    authorship_mode?: 'self_authored' | 'community_draft';
    summary: string;
    changelog_note?: string;
    nodes: SnapshotNode[];
    edges: SnapshotEdge[];
    update_criteria: UpdateCriterion[];
  }) {
    return apiFetch<ToCSnapshot>('/api/v1/snapshots', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  studioSuggest(stage: Stage, prior_concept_ids: string[]) {
    return apiFetch<StudioSuggestion[]>('/api/v1/studio/suggest', {
      method: 'POST',
      body: JSON.stringify({ stage, prior_concept_ids }),
    });
  },

  studioExtract(body: { text?: string; url?: string }) {
    return apiFetch<ExtractedDraft>('/api/v1/studio/extract', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  studioLiveMatch(nodes: SnapshotNode[], edges: SnapshotEdge[]) {
    return apiFetch<LiveMatchResponse>('/api/v1/studio/live-match', {
      method: 'POST',
      body: JSON.stringify({ nodes, edges }),
    });
  },

  studioCheck(nodes: SnapshotNode[], edges: SnapshotEdge[], update_criteria: UpdateCriterion[]) {
    return apiFetch<EpistemicCheckItem[]>('/api/v1/studio/check', {
      method: 'POST',
      body: JSON.stringify({ nodes, edges, update_criteria }),
    });
  },

  studioSimilar(stage: Stage, title: string) {
    return apiFetch<SimilarConceptMatch[]>('/api/v1/studio/similar', {
      method: 'POST',
      body: JSON.stringify({ stage, title }),
    });
  },

  updateCriterionStatus(handle: string, criterionId: string, status: CriterionStatus, note?: string) {
    return apiFetch<ToCSnapshot>(
      `/api/v1/actors/${encodeURIComponent(handle)}/criteria/${encodeURIComponent(criterionId)}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ status, note }),
      }
    );
  },

  getMe() {
    return apiFetch<{
      authenticated: boolean;
      user?: PublicUser | null;
      owned_actors: OwnedActorLink[];
    }>('/api/v1/me');
  },

  authProviders() {
    return apiFetch<{
      x_oauth_enabled: boolean;
      github_oauth_enabled: boolean;
      dev_email_login_enabled: boolean;
    }>('/api/v1/auth/providers');
  },

  devLogin(body: { email: string; display_name?: string; x_handle?: string }) {
    return apiFetch<{ authenticated: boolean; user: PublicUser }>('/api/v1/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  logout() {
    return apiFetch<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' });
  },

  exportKey() {
    return apiFetch<{ key_type: string; public_key_b64: string; secret_key_b64: string; note: string }>(
      '/api/v1/me/export-key'
    );
  },
};
