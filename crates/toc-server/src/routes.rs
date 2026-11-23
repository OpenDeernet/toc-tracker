use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use toc_core::*;
use toc_storage::StorageAdapter;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::ai;
use crate::auth;
use crate::og;
use crate::repo::Repository;

/// Lightweight sliding-window IP rate limiter protecting LLM & write endpoints.
#[derive(Default)]
pub struct RateLimiter {
    buckets: Mutex<HashMap<String, VecDeque<Instant>>>,
}

impl RateLimiter {
    pub fn check(&self, bucket_name: &str, headers: &HeaderMap, max_reqs: usize, window_secs: u64) -> bool {
        let ip = headers
            .get("cf-connecting-ip")
            .or_else(|| headers.get("fly-client-ip"))
            .or_else(|| headers.get("x-forwarded-for"))
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("local");

        let key = format!("{bucket_name}:{ip}");
        let now = Instant::now();
        let window = std::time::Duration::from_secs(window_secs);
        let mut map = self.buckets.lock().unwrap();
        let q = map.entry(key).or_default();
        while let Some(&front) = q.front() {
            if now.duration_since(front) > window {
                q.pop_front();
            } else {
                break;
            }
        }
        if q.len() >= max_reqs {
            return false;
        }
        q.push_back(now);
        true
    }
}

pub struct AppState {
    pub repo: Arc<dyn Repository>,
    pub storage: Arc<dyn StorageAdapter>,
    pub oauth_states: auth::OAuthStateStore,
    pub magic_links: auth::MagicLinkStore,
    pub rate_limiter: RateLimiter,
    pub web_dist_dir: PathBuf,
    pub public_base_url: String,
}

async fn security_headers_middleware(req: axum::extract::Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert(
        header::HeaderName::from_static("x-content-type-options"),
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::HeaderName::from_static("x-frame-options"),
        HeaderValue::from_static("SAMEORIGIN"),
    );
    headers.insert(
        header::HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    res
}

pub fn build_router(state: Arc<AppState>) -> Router {
    let dist_dir = state.web_dist_dir.clone();

    let api = Router::new()
        // Public Open Read API (free, CORS-open)
        .route("/health", get(health))
        .route("/actors", get(list_actors).post(create_actor))
        .route("/actors/{handle}", get(get_actor_detail))
        .route("/actors/{handle}/snapshots/{version}", get(get_actor_snapshot_version))
        .route("/actors/{handle}/export", get(export_actor))
        .route("/actors/{handle}/claim", post(claim_actor))
        .route("/actors/{handle}/profile", post(update_actor_profile))
        .route("/actors/{handle}/essay", post(update_actor_essay))
        .route("/actors/{handle}/criteria/{criterion_id}/status", post(update_criterion_status))
        .route("/compare", get(compare_actors))
        .route("/concepts", get(list_concepts).post(create_concept))
        .route("/concepts/{root_id}", get(get_concept_spectrum))
        .route("/cruxes", get(list_field_cruxes))
        .route("/intelligence/field", get(field_intelligence))
        .route("/archive/records", get(list_archive_records))
        .route("/archetypes", get(list_archetypes))
        .route("/snapshots", post(publish_snapshot))
        .route("/attestations", get(list_attestations).post(create_attestation))
        // Studio Assist, Silent Graph Linter & Socratic Stress-Test
        .route("/studio/ai-status", get(studio_ai_status))
        .route("/studio/suggest", post(studio_suggest))
        .route("/studio/extract", post(studio_extract))
        .route("/studio/live-match", post(studio_live_match))
        .route("/studio/check", post(studio_check))
        .route("/studio/stress-test", post(studio_stress_test))
        .route("/studio/similar", post(studio_similar))
        // Auth
        .route("/auth/providers", get(auth::auth_providers))
        .route("/auth/magic-link", post(auth::request_magic_link))
        .route("/auth/dev-login", post(auth::dev_email_login))
        .route("/auth/logout", post(auth::logout))
        .route("/me", get(auth::get_me))
        .route("/me/export-key", get(auth::export_signing_key));

    Router::new()
        .nest("/api/v1", api)
        .route("/auth/x/start", get(auth::x_oauth_start))
        .route("/auth/x/callback", get(auth::x_oauth_callback))
        .route("/auth/github/start", get(auth::github_oauth_start))
        .route("/auth/github/callback", get(auth::github_oauth_callback))
        .route("/auth/magic", get(auth::magic_link_callback))
        // Dynamic OG PNG cards
        .route("/og/home.png", get(og_home_png))
        .route("/og/actor/{handle}", get(og_actor_png))
        .route("/og/compare", get(og_compare_png))
        // SEO & Crawlers
        .route("/robots.txt", get(robots_txt))
        .route("/sitemap.xml", get(sitemap_xml))
        // Dynamic meta-injected HTML routes for social cards
        .route("/a/{handle}", get(spa_actor_html))
        .route("/compare", get(spa_compare_html))
        // Static assets + SPA fallback
        .nest_service("/assets", ServeDir::new(dist_dir.join("assets")))
        .fallback(get(spa_index_html))
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024))
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    match state.repo.list_actors().await {
        Ok(actors) => {
            let ai = ai::ai_status();
            (
                StatusCode::OK,
                Json(serde_json::json!({
                    "status": "ok",
                    "schema_version": CURRENT_SCHEMA_VERSION,
                    "storage_adapter": state.storage.adapter_name(),
                    "actors_count": actors.len(),
                    "ai_provider": ai.provider,
                    "ai_llm_enabled": ai.llm_enabled,
                    "dev_login_enabled": auth::dev_login_allowed(&state),
                    "magic_link_enabled": auth::magic_link_enabled(),
                    "key_encryption_enabled": auth::key_encryption_enabled(),
                })),
            )
        }
        Err(e) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "status": "degraded",
                "error": e.to_string(),
            })),
        ),
    }
}

#[derive(Deserialize)]
struct ListActorsQuery {
    kind: Option<String>,
    status: Option<String>,
    tag: Option<String>,
    q: Option<String>,
}

#[derive(Serialize)]
struct ActorCardResponse {
    #[serde(flatten)]
    actor: Actor,
    summary: Option<String>,
    version: Option<i32>,
    node_count: usize,
    update_criteria_count: usize,
    primary_bet_title: Option<String>,
    crux_titles: Vec<String>,
}

async fn list_actors(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListActorsQuery>,
) -> Result<Json<Vec<ActorCardResponse>>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary_snaps = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;

    let snap_map: HashMap<String, ToCSnapshot> = primary_snaps
        .into_iter()
        .map(|s| (s.id.clone(), s))
        .collect();
    let cmap: HashMap<String, String> = concepts
        .into_iter()
        .map(|c| (c.id, c.title))
        .collect();

    let query_lower = q.q.as_deref().map(|s| s.to_lowercase());

    let mut cards = Vec::new();
    for actor in actors {
        if let Some(k) = &q.kind {
            if !k.is_empty() && actor.kind.as_str() != k {
                continue;
            }
        }
        if let Some(st) = &q.status {
            if !st.is_empty() && actor.authorship_status.as_str() != st {
                continue;
            }
        }
        if let Some(tag) = &q.tag {
            if !tag.is_empty() && !actor.tags.iter().any(|t| t.eq_ignore_ascii_case(tag)) {
                continue;
            }
        }
        let snap = actor
            .primary_snapshot_id
            .as_ref()
            .and_then(|sid| snap_map.get(sid));

        if let Some(ql) = &query_lower {
            if !ql.is_empty() {
                let hay = format!(
                    "{} {} {} {}",
                    actor.display_name,
                    actor.role_or_affiliation,
                    actor.tags.join(" "),
                    snap.map(|s| s.summary.as_str()).unwrap_or("")
                )
                .to_lowercase();
                if !hay.contains(ql) {
                    continue;
                }
            }
        }

        let primary_bet_title = snap.and_then(|s| {
            s.nodes
                .iter()
                .find(|n| n.stage == Stage::Bet && matches!(n.stance, NodeStance::Active))
                .and_then(|n| cmap.get(&n.concept_id).cloned())
        });
        let crux_titles = snap
            .map(|s| {
                s.nodes
                    .iter()
                    .filter(|n| n.is_load_bearing_crux)
                    .filter_map(|n| cmap.get(&n.concept_id).cloned())
                    .collect()
            })
            .unwrap_or_default();

        cards.push(ActorCardResponse {
            summary: snap.map(|s| s.summary.clone()),
            version: snap.map(|s| s.version),
            node_count: snap.map(|s| s.nodes.len()).unwrap_or(0),
            update_criteria_count: snap.map(|s| s.update_criteria.len()).unwrap_or(0),
            primary_bet_title,
            crux_titles,
            actor,
        });
    }

    Ok(Json(cards))
}

#[derive(Serialize)]
struct ActorDetailResponse {
    actor: Actor,
    primary_snapshot: Option<ToCSnapshot>,
    snapshots: Vec<ToCSnapshot>,
    concepts: HashMap<String, Concept>,
    concept_usage_counts: HashMap<String, usize>,
}

async fn get_actor_detail(
    State(state): State<Arc<AppState>>,
    Path(handle): Path<String>,
) -> Result<Json<ActorDetailResponse>, (StatusCode, String)> {
    let handle_clean = handle.trim_start_matches('@');
    let actor = state
        .repo
        .get_actor_by_handle(handle_clean)
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;

    let snapshots = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?;
    let primary_snapshot = actor
        .primary_snapshot_id
        .as_ref()
        .and_then(|pid| snapshots.iter().find(|s| &s.id == pid).cloned())
        .or_else(|| snapshots.first().cloned());

    let all_concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let all_primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let mut usage: HashMap<String, usize> = HashMap::new();
    let cmap: HashMap<String, Concept> = all_concepts
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();
    for s in &all_primary {
        for n in &s.nodes {
            let root = cmap
                .get(&n.concept_id)
                .map(|c| c.root_concept_id.clone())
                .unwrap_or_else(|| n.concept_id.clone());
            *usage.entry(root).or_default() += 1;
        }
    }

    Ok(Json(ActorDetailResponse {
        actor,
        primary_snapshot,
        snapshots,
        concepts: cmap,
        concept_usage_counts: usage,
    }))
}

async fn get_actor_snapshot_version(
    State(state): State<Arc<AppState>>,
    Path((handle, version)): Path<(String, i32)>,
) -> Result<Json<ToCSnapshot>, (StatusCode, String)> {
    let actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;
    let snaps = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?;
    let snap = snaps
        .into_iter()
        .find(|s| s.version == version)
        .ok_or((StatusCode::NOT_FOUND, "Snapshot version not found".into()))?;
    Ok(Json(snap))
}

#[derive(Deserialize)]
struct ExportQuery {
    format: Option<String>,
}

async fn export_actor(
    State(state): State<Arc<AppState>>,
    Path(handle): Path<String>,
    Query(q): Query<ExportQuery>,
) -> Result<Response, (StatusCode, String)> {
    let actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;
    let snaps = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?;
    let snap = snaps
        .first()
        .ok_or((StatusCode::NOT_FOUND, "No snapshot found".into()))?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;

    if q.format.as_deref() == Some("markdown") {
        let md = export::snapshot_to_markdown(&actor, snap, &concepts);
        Ok((
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/markdown; charset=utf-8")],
            md,
        )
            .into_response())
    } else {
        Ok(Json(serde_json::json!({
            "schema_version": CURRENT_SCHEMA_VERSION,
            "actor": actor,
            "snapshot": snap,
        }))
        .into_response())
    }
}

#[derive(Deserialize)]
struct CompareQuery {
    a: String,
    b: String,
}

#[derive(Serialize)]
struct CompareApiResponse {
    actor_a: Actor,
    actor_b: Actor,
    snapshot_a: ToCSnapshot,
    snapshot_b: ToCSnapshot,
    diff: DiffResult,
    concepts: HashMap<String, Concept>,
}

async fn compare_actors(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CompareQuery>,
) -> Result<Json<CompareApiResponse>, (StatusCode, String)> {
    let actor_a = state
        .repo
        .get_actor_by_handle(q.a.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, format!("Actor `{}` not found", q.a)))?;
    let actor_b = state
        .repo
        .get_actor_by_handle(q.b.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, format!("Actor `{}` not found", q.b)))?;

    let snap_a = state
        .repo
        .list_snapshots_for_actor(&actor_a.id)
        .await
        .map_err(internal_err)?
        .into_iter()
        .next()
        .ok_or((StatusCode::NOT_FOUND, "Snapshot A not found".into()))?;
    let snap_b = state
        .repo
        .list_snapshots_for_actor(&actor_b.id)
        .await
        .map_err(internal_err)?
        .into_iter()
        .next()
        .ok_or((StatusCode::NOT_FOUND, "Snapshot B not found".into()))?;

    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;

    let diff = diff_snapshots(&snap_a, &snap_b, &concepts, &attestations);
    let concept_map = concepts.into_iter().map(|c| (c.id.clone(), c)).collect();

    Ok(Json(CompareApiResponse {
        actor_a,
        actor_b,
        snapshot_a: snap_a,
        snapshot_b: snap_b,
        diff,
        concepts: concept_map,
    }))
}

#[derive(Deserialize)]
struct ListConceptsQuery {
    stage: Option<String>,
    q: Option<String>,
}

#[derive(Serialize)]
struct ConceptWithUsage {
    #[serde(flatten)]
    concept: Concept,
    usage_count: usize,
}

async fn list_concepts(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListConceptsQuery>,
) -> Result<Json<Vec<ConceptWithUsage>>, (StatusCode, String)> {
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let mut usage: HashMap<String, usize> = HashMap::new();
    for s in &primary {
        for n in &s.nodes {
            *usage.entry(n.concept_id.clone()).or_default() += 1;
        }
    }

    let stage_filter = q.stage.as_deref().and_then(Stage::from_str_opt);
    let ql = q.q.as_deref().map(|s| s.to_lowercase());

    let mut out: Vec<ConceptWithUsage> = concepts
        .into_iter()
        .filter(|c| {
            if let Some(sf) = stage_filter {
                if c.stage != sf {
                    return false;
                }
            }
            if let Some(ref s) = ql {
                if !s.is_empty()
                    && !c.title.to_lowercase().contains(s)
                    && !c.description.to_lowercase().contains(s)
                {
                    return false;
                }
            }
            true
        })
        .map(|c| {
            let u = usage.get(&c.id).copied().unwrap_or(0);
            ConceptWithUsage {
                concept: c,
                usage_count: u,
            }
        })
        .collect();

    out.sort_by(|a, b| b.usage_count.cmp(&a.usage_count).then_with(|| a.concept.title.cmp(&b.concept.title)));
    Ok(Json(out))
}

#[derive(Deserialize)]
struct CreateConceptRequest {
    stage: Stage,
    title: String,
    description: Option<String>,
    parent_concept_id: Option<String>,
    tags: Option<Vec<String>>,
}

fn is_admin_user(user: &crate::repo::UserRecord) -> bool {
    let Ok(raw) = std::env::var("ADMIN_X_HANDLES") else {
        return false;
    };
    let Some(xh) = user.x_handle.as_deref() else {
        return false;
    };
    let user_norm = xh.trim().trim_start_matches('@').to_ascii_lowercase();
    raw.split(',')
        .map(|s| s.trim().trim_start_matches('@').to_ascii_lowercase())
        .any(|adm| !adm.is_empty() && adm == user_norm)
}

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

async fn create_concept(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateConceptRequest>,
) -> Result<(StatusCode, Json<Concept>), (StatusCode, String)> {
    if !state.rate_limiter.check("write_concept", &headers, 30, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Too many concept creations. Please slow down.".into()));
    }
    let title = req.title.trim();
    if title.is_empty() || title.chars().count() > 140 {
        return Err((StatusCode::BAD_REQUEST, "Concept title must be 1–140 characters".into()));
    }
    let desc: String = req.description.unwrap_or_default().chars().take(500).collect();
    let tags: Vec<String> = req
        .tags
        .unwrap_or_default()
        .into_iter()
        .take(8)
        .map(|t| t.trim().chars().take(32).collect())
        .filter(|t: &String| !t.is_empty())
        .collect();
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let id = format!("cpt_{}", uuid::Uuid::new_v4().simple());
    let root_concept_id = req
        .parent_concept_id
        .as_ref()
        .and_then(|pid| concepts.iter().find(|c| &c.id == pid))
        .map(|parent| parent.root_concept_id.clone())
        .unwrap_or_else(|| id.clone());

    let concept = Concept {
        schema_version: CURRENT_SCHEMA_VERSION,
        id,
        stage: req.stage,
        title: title.to_string(),
        description: desc,
        parent_concept_id: req.parent_concept_id,
        root_concept_id,
        tags,
        created_by_actor_id: None,
        arweave_tx_id: None,
        created_at: Utc::now(),
    };
    let created = state.repo.create_concept(concept).await.map_err(internal_err)?;
    Ok((StatusCode::CREATED, Json(created)))
}

async fn get_concept_spectrum(
    State(state): State<Arc<AppState>>,
    Path(root_id): Path<String>,
) -> Result<Json<ConceptSpectrum>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;

    let spec = compute_concept_spectrum(&root_id, &actors, &primary, &concepts, &attestations)
        .ok_or((StatusCode::NOT_FOUND, "Concept not found".into()))?;
    Ok(Json(spec))
}

async fn list_field_cruxes(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<FieldCruxSummary>>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;
    Ok(Json(compute_field_cruxes(&actors, &primary, &concepts, &attestations)))
}

async fn list_archetypes() -> Json<Vec<Archetype>> {
    Json(seed::build_seed_bundle().archetypes)
}

fn sanitize_references(raw: Vec<ReferenceLink>) -> Vec<ReferenceLink> {
    raw.into_iter()
        .take(20)
        .filter_map(|r| {
            let url = r.url.trim().to_string();
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return None;
            }
            let title: String = r.title.trim().chars().take(120).collect();
            let title = if title.is_empty() {
                url.split("//")
                    .nth(1)
                    .and_then(|s| s.split('/').next())
                    .unwrap_or("Link")
                    .trim_start_matches("www.")
                    .to_string()
            } else {
                title
            };
            let note = r
                .note
                .map(|n| n.trim().chars().take(240).collect::<String>())
                .filter(|n| !n.is_empty());
            Some(ReferenceLink { title, url, note })
        })
        .collect()
}

#[derive(Deserialize)]
struct CreateActorRequest {
    handle: String,
    display_name: String,
    kind: ActorKind,
    role_or_affiliation: Option<String>,
    one_line_stance: Option<String>,
    contact_preference: Option<String>,
    references: Option<Vec<ReferenceLink>>,
    bio_url: Option<String>,
    authorship_status: Option<AuthorshipStatus>,
    tags: Option<Vec<String>>,
}

async fn create_actor(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateActorRequest>,
) -> Result<(StatusCode, Json<Actor>), (StatusCode, String)> {
    if !state.rate_limiter.check("write_actor", &headers, 20, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit reached. Please try again shortly.".into()));
    }
    let user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Please sign in to create a Theory of Change profile.".into()))?;

    let handle: String = req
        .handle
        .trim()
        .trim_start_matches('@')
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .take(48)
        .collect();
    if handle.len() < 2 {
        return Err((StatusCode::BAD_REQUEST, "Handle must be at least 2 characters".into()));
    }
    if state
        .repo
        .get_actor_by_handle(&handle)
        .await
        .map_err(internal_err)?
        .is_some()
    {
        return Err((StatusCode::CONFLICT, format!("Handle `@{handle}` is already taken")));
    }

    let status = match req.authorship_status {
        Some(AuthorshipStatus::CommunityDraft) => {
            if !is_admin_user(&user) {
                return Err((
                    StatusCode::FORBIDDEN,
                    "Public figure drafts are curated by maintainers to prevent impersonation. Open a GitHub issue to request a profile, or publish your own Theory of Change.".into(),
                ));
            }
            AuthorshipStatus::CommunityDraft
        }
        _ => AuthorshipStatus::SelfAuthored,
    };

    let display_name: String = req.display_name.trim().chars().take(80).collect();
    if display_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Display name is required".into()));
    }
    let initials: String = display_name
        .split_whitespace()
        .filter_map(|w| w.chars().next())
        .take(2)
        .collect::<String>()
        .to_uppercase();

    let bio_url = req
        .bio_url
        .map(|s| s.trim().to_string())
        .filter(|s| s.starts_with("https://") || s.starts_with("http://"));

    let actor = Actor {
        id: format!("act_{}", uuid::Uuid::new_v4().simple()),
        handle,
        display_name,
        kind: req.kind,
        role_or_affiliation: req.role_or_affiliation.unwrap_or_default().trim().chars().take(160).collect(),
        one_line_stance: req
            .one_line_stance
            .map(|s| s.trim().chars().take(240).collect::<String>())
            .filter(|s| !s.is_empty()),
        contact_preference: req
            .contact_preference
            .map(|s| s.trim().chars().take(180).collect::<String>())
            .filter(|s| !s.is_empty()),
        references: sanitize_references(req.references.unwrap_or_default()),
        bio_url,
        avatar_initials: if initials.is_empty() { "AI".into() } else { initials },
        authorship_status: status,
        owner_user_id: if status == AuthorshipStatus::SelfAuthored {
            Some(user.id.clone())
        } else {
            None
        },
        verified_provider: if status == AuthorshipStatus::SelfAuthored {
            if user.x_handle.is_some() {
                Some("x".into())
            } else if user.github_handle.is_some() {
                Some("github".into())
            } else {
                Some("email".into())
            }
        } else {
            None
        },
        verified_handle: if status == AuthorshipStatus::SelfAuthored {
            user.x_handle.clone().or_else(|| user.github_handle.clone())
        } else {
            None
        },
        arweave_pubkey: if status == AuthorshipStatus::SelfAuthored {
            Some(user.arweave_pubkey.clone())
        } else {
            None
        },
        primary_snapshot_id: None,
        tags: req
            .tags
            .unwrap_or_default()
            .into_iter()
            .take(8)
            .map(|t| t.trim().chars().take(32).collect())
            .filter(|t: &String| !t.is_empty())
            .collect(),
        created_at: Utc::now(),
    };

    let created = state.repo.upsert_actor(actor).await.map_err(internal_err)?;
    Ok((StatusCode::CREATED, Json(created)))
}

#[derive(Deserialize)]
struct PublishSnapshotRequest {
    actor_handle: String,
    authorship_mode: Option<AuthorshipMode>,
    summary: String,
    essay_markdown: Option<String>,
    changelog_note: Option<String>,
    nodes: Vec<SnapshotNode>,
    edges: Vec<SnapshotEdge>,
    update_criteria: Vec<UpdateCriterion>,
    #[serde(default)]
    omissions: Vec<Omission>,
}

async fn publish_snapshot(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<PublishSnapshotRequest>,
) -> Result<(StatusCode, Json<ToCSnapshot>), (StatusCode, Json<serde_json::Value>)> {
    if !state.rate_limiter.check("write_snapshot", &headers, 30, 600) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({ "errors": ["Rate limit reached. Please wait a few minutes."] })),
        ));
    }
    let user = auth::current_user(&state, &headers).await.ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "errors": ["Please sign in before publishing a Theory of Change."] })),
        )
    })?;

    let actor = state
        .repo
        .get_actor_by_handle(req.actor_handle.trim_start_matches('@'))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "errors": [e.to_string()] }))))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, Json(serde_json::json!({ "errors": ["Actor not found"] }))))?;

    let existing_snaps = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "errors": [e.to_string()] }))))?;

    let is_owner = actor.owner_user_id.as_deref() == Some(user.id.as_str());
    let is_admin = is_admin_user(&user);
    if !is_admin {
        if actor.owner_user_id.is_some() && !is_owner {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "errors": ["Only the verified owner can edit this Theory of Change."] })),
            ));
        }
        if actor.owner_user_id.is_none() && !existing_snaps.is_empty() {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({ "errors": ["Existing community drafts are locked from direct overwrite. Claim the profile or fork it to publish your own map."] })),
            ));
        }
    }

    let prev = existing_snaps.first();
    let next_version = prev.map(|s| s.version + 1).unwrap_or(1);

    let mode = req.authorship_mode.unwrap_or_else(|| {
        if actor.authorship_status == AuthorshipStatus::CommunityDraft && !is_owner {
            AuthorshipMode::CommunityDraft
        } else {
            AuthorshipMode::SelfAuthored
        }
    });

    let mut snapshot = ToCSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: format!("snp_{}", uuid::Uuid::new_v4().simple()),
        actor_id: actor.id.clone(),
        version: next_version,
        previous_snapshot_id: prev.map(|s| s.id.clone()),
        authorship_mode: mode,
        summary: req.summary,
        essay_markdown: req
            .essay_markdown
            .map(|s| s.trim().chars().take(40_000).collect::<String>())
            .filter(|s| !s.is_empty())
            .or_else(|| prev.and_then(|p| p.essay_markdown.clone())),
        changelog_note: req.changelog_note,
        nodes: req.nodes,
        edges: req.edges,
        update_criteria: req.update_criteria,
        omissions: req.omissions,
        published_at: Utc::now(),
        arweave_tx_id: None,
    };

    if let Err(errs) = normalize_and_validate_snapshot(&mut snapshot) {
        let msgs: Vec<String> = errs.into_iter().map(|e| e.to_string()).collect();
        return Err((StatusCode::UNPROCESSABLE_ENTITY, Json(serde_json::json!({ "errors": msgs }))));
    }

    let saved = state
        .repo
        .publish_snapshot(snapshot)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "errors": [e.to_string()] }))))?;

    Ok((StatusCode::CREATED, Json(saved)))
}

#[derive(Deserialize)]
struct ClaimActorRequest {
    #[allow(dead_code)]
    verified_handle: Option<String>,
}

async fn claim_actor(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(handle): Path<String>,
    Json(_req): Json<ClaimActorRequest>,
) -> Result<Json<Actor>, (StatusCode, String)> {
    if !state.rate_limiter.check("write_claim", &headers, 10, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Too many claim attempts. Please wait a few minutes.".into()));
    }
    let user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Please sign in first to claim a profile.".into()))?;

    let mut actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;

    if actor.authorship_status != AuthorshipStatus::CommunityDraft && actor.owner_user_id.as_deref() != Some(&user.id) {
        return Err((StatusCode::CONFLICT, "This profile has already been claimed.".into()));
    }

    // In production (https://), prevent profile hijacking by requiring a verified handle match (or admin).
    let is_prod = state.public_base_url.starts_with("https://");
    if is_prod && !is_admin_user(&user) {
        let expected = actor
            .verified_handle
            .as_deref()
            .map(|h| h.trim().trim_start_matches('@').to_ascii_lowercase());
        let actual = user
            .x_handle
            .as_deref()
            .or(user.github_handle.as_deref())
            .map(|h| h.trim().trim_start_matches('@').to_ascii_lowercase());

        match (expected, actual) {
            (Some(exp), Some(act)) if exp == act => {}
            (Some(exp), _) => {
                return Err((
                    StatusCode::FORBIDDEN,
                    format!("To claim this profile automatically, sign in with X as @{exp}."),
                ));
            }
            (None, _) => {
                return Err((
                    StatusCode::FORBIDDEN,
                    "This profile doesn't have an automatic X handle linked yet — open a verification request on GitHub or DM the maintainer to claim it.".into(),
                ));
            }
        }
    }

    actor.authorship_status = AuthorshipStatus::Claimed;
    actor.owner_user_id = Some(user.id.clone());
    actor.arweave_pubkey = Some(user.arweave_pubkey.clone());
    actor.verified_provider = Some(if user.x_handle.is_some() {
        "x".into()
    } else if user.github_handle.is_some() {
        "github".into()
    } else {
        "email".into()
    });
    actor.verified_handle = user
        .x_handle
        .clone()
        .or_else(|| user.github_handle.clone())
        .or(actor.verified_handle);

    let updated = state.repo.upsert_actor(actor).await.map_err(internal_err)?;
    Ok(Json(updated))
}

#[derive(Deserialize)]
struct UpdateProfileRequest {
    display_name: Option<String>,
    role_or_affiliation: Option<String>,
    one_line_stance: Option<String>,
    contact_preference: Option<String>,
    references: Option<Vec<ReferenceLink>>,
    bio_url: Option<String>,
}

async fn update_actor_profile(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(handle): Path<String>,
    Json(req): Json<UpdateProfileRequest>,
) -> Result<Json<Actor>, (StatusCode, String)> {
    if !state.rate_limiter.check("write_profile", &headers, 25, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit reached.".into()));
    }
    let user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Please sign in to edit your profile.".into()))?;

    let mut actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;

    let is_owner = actor.owner_user_id.as_deref() == Some(user.id.as_str());
    if !is_owner && !is_admin_user(&user) {
        return Err((StatusCode::FORBIDDEN, "Only the verified owner can update this profile.".into()));
    }

    if let Some(dn) = req.display_name.map(|s| s.trim().chars().take(80).collect::<String>()).filter(|s| !s.is_empty()) {
        actor.display_name = dn;
    }
    if let Some(role) = req.role_or_affiliation {
        actor.role_or_affiliation = role.trim().chars().take(160).collect();
    }
    if let Some(stance) = req.one_line_stance {
        let s: String = stance.trim().chars().take(240).collect();
        actor.one_line_stance = if s.is_empty() { None } else { Some(s) };
    }
    if let Some(contact) = req.contact_preference {
        let s: String = contact.trim().chars().take(180).collect();
        actor.contact_preference = if s.is_empty() { None } else { Some(s) };
    }
    if let Some(refs) = req.references {
        actor.references = sanitize_references(refs);
    }
    if let Some(url) = req.bio_url {
        let u = url.trim().to_string();
        actor.bio_url = if u.starts_with("https://") || u.starts_with("http://") {
            Some(u)
        } else if u.is_empty() {
            None
        } else {
            return Err((StatusCode::BAD_REQUEST, "Website URL must start with https:// or http://".into()));
        };
    }

    let saved = state.repo.upsert_actor(actor).await.map_err(internal_err)?;
    Ok(Json(saved))
}

#[derive(Deserialize)]
struct UpdateEssayRequest {
    essay_markdown: String,
    changelog_note: Option<String>,
}

async fn update_actor_essay(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(handle): Path<String>,
    Json(req): Json<UpdateEssayRequest>,
) -> Result<Json<ToCSnapshot>, (StatusCode, String)> {
    if !state.rate_limiter.check("write_essay", &headers, 20, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit reached.".into()));
    }
    let user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Please sign in to edit your written position.".into()))?;

    let actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;

    let is_owner = actor.owner_user_id.as_deref() == Some(user.id.as_str());
    if !is_owner && !is_admin_user(&user) {
        return Err((StatusCode::FORBIDDEN, "Only the verified owner can edit this written position.".into()));
    }

    let snaps = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?;
    let latest = snaps
        .first()
        .ok_or((StatusCode::NOT_FOUND, "No snapshot found".into()))?;

    let trimmed: String = req.essay_markdown.trim().chars().take(40_000).collect();
    let mut next = latest.clone();
    next.id = format!("snp_{}", uuid::Uuid::new_v4().simple());
    next.version = latest.version + 1;
    next.previous_snapshot_id = Some(latest.id.clone());
    next.essay_markdown = if trimmed.is_empty() { None } else { Some(trimmed) };
    next.published_at = Utc::now();
    next.arweave_tx_id = None;
    next.changelog_note = Some(
        req.changelog_note
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Updated written Theory of Change essay".into()),
    );

    let saved = state.repo.publish_snapshot(next).await.map_err(internal_err)?;
    Ok(Json(saved))
}

async fn list_attestations(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<LinkAttestation>>, (StatusCode, String)> {
    Ok(Json(state.repo.list_attestations().await.map_err(internal_err)?))
}

#[derive(Deserialize)]
struct CreateAttestationRequest {
    source_concept_id: String,
    target_concept_id: String,
    relation: AttestationRelation,
    note: Option<String>,
}

async fn create_attestation(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<CreateAttestationRequest>,
) -> Result<(StatusCode, Json<LinkAttestation>), (StatusCode, String)> {
    if !state.rate_limiter.check("write_attestation", &headers, 30, 600) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "Rate limit reached.".into()));
    }
    let _user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Please sign in to create a concept link.".into()))?;

    let att = LinkAttestation {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: format!("att_{}", uuid::Uuid::new_v4().simple()),
        source_concept_id: req.source_concept_id,
        target_concept_id: req.target_concept_id,
        relation: req.relation,
        attester_actor_id: None,
        note: req.note.unwrap_or_default().chars().take(400).collect(),
        arweave_tx_id: None,
        created_at: Utc::now(),
    };
    let saved = state.repo.create_attestation(att).await.map_err(internal_err)?;
    Ok((StatusCode::CREATED, Json(saved)))
}

#[derive(Deserialize)]
struct StudioSuggestRequest {
    stage: Stage,
    prior_concept_ids: Vec<String>,
}

async fn studio_suggest(
    State(state): State<Arc<AppState>>,
    Json(req): Json<StudioSuggestRequest>,
) -> Result<Json<Vec<ai::StudioSuggestion>>, (StatusCode, String)> {
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let snaps = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    Ok(Json(ai::suggest_concepts_for_stage(
        req.stage,
        &req.prior_concept_ids,
        &concepts,
        &snaps,
    )))
}

async fn studio_ai_status() -> Json<ai::AiStatusInfo> {
    Json(ai::ai_status())
}

#[derive(Deserialize)]
struct StudioExtractRequest {
    #[serde(default)]
    documents: Vec<ai::SourceDocumentInput>,
    text: Option<String>,
    url: Option<String>,
}

async fn studio_extract(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<StudioExtractRequest>,
) -> Result<Json<ai::ExtractedDraft>, (StatusCode, String)> {
    if !state.rate_limiter.check("ai_extract", &headers, 12, 600) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Extraction rate limit reached. Please wait a few minutes before drafting again.".into(),
        ));
    }
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let mut docs = req.documents;
    if docs.is_empty() && (req.text.is_some() || req.url.is_some()) {
        docs.push(ai::SourceDocumentInput {
            url: req.url,
            title: None,
            text: req.text,
        });
    }
    let draft = ai::extract_draft_from_documents(&docs, &concepts).await;
    Ok(Json(draft))
}

#[derive(Deserialize)]
struct LiveMatchRequest {
    nodes: Vec<SnapshotNode>,
    edges: Vec<SnapshotEdge>,
}

#[derive(Serialize)]
struct LiveMatchResponse {
    closest_actor_handle: Option<String>,
    closest_actor_name: Option<String>,
    overlap_pct: u8,
    sharpest_divergence_actor: Option<String>,
    sharpest_divergence_crux: Option<String>,
}

async fn studio_live_match(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LiveMatchRequest>,
) -> Result<Json<LiveMatchResponse>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;

    let draft_snap = ToCSnapshot {
        schema_version: CURRENT_SCHEMA_VERSION,
        id: "draft".into(),
        actor_id: "draft".into(),
        version: 1,
        previous_snapshot_id: None,
        authorship_mode: AuthorshipMode::SelfAuthored,
        summary: "Draft".into(),
        essay_markdown: None,
        changelog_note: None,
        nodes: req.nodes,
        edges: req.edges,
        update_criteria: vec![],
        omissions: vec![],
        published_at: Utc::now(),
        arweave_tx_id: None,
    };

    let mut best_match: Option<(Actor, u8)> = None;
    let mut sharpest_div: Option<(String, String, f32)> = None;

    for actor in actors {
        let Some(snap) = primary.iter().find(|s| s.actor_id == actor.id) else {
            continue;
        };
        let d = diff_snapshots(&draft_snap, snap, &concepts, &attestations);
        let pct = d.summary.premise_bottleneck_overlap_pct;
        if best_match.as_ref().map(|(_, p)| pct > *p).unwrap_or(true) {
            best_match = Some((actor.clone(), pct));
        }
        if let Some(top) = d.top_cruxes.first() {
            if sharpest_div.as_ref().map(|(_, _, sc)| top.crux_score > *sc).unwrap_or(true) {
                sharpest_div = Some((actor.display_name.clone(), top.canonical_title.clone(), top.crux_score));
            }
        }
    }

    Ok(Json(LiveMatchResponse {
        closest_actor_handle: best_match.as_ref().map(|(a, _)| a.handle.clone()),
        closest_actor_name: best_match.as_ref().map(|(a, _)| a.display_name.clone()),
        overlap_pct: best_match.map(|(_, p)| p).unwrap_or(0),
        sharpest_divergence_actor: sharpest_div.as_ref().map(|(a, _, _)| a.clone()),
        sharpest_divergence_crux: sharpest_div.map(|(_, c, _)| c),
    }))
}

#[derive(Deserialize)]
struct UpdateCriterionStatusRequest {
    status: CriterionStatus,
    note: Option<String>,
}

async fn update_criterion_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((handle, criterion_id)): Path<(String, String)>,
    Json(req): Json<UpdateCriterionStatusRequest>,
) -> Result<Json<ToCSnapshot>, (StatusCode, String)> {
    let user = auth::current_user(&state, &headers)
        .await
        .ok_or((StatusCode::UNAUTHORIZED, "Sign in to update your criteria.".into()))?;
    let actor = state
        .repo
        .get_actor_by_handle(handle.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;

    if actor.owner_user_id.as_deref() != Some(user.id.as_str()) {
        return Err((StatusCode::FORBIDDEN, "Only the verified owner can update this profile's criteria.".into()));
    }

    let snaps = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?;
    let latest = snaps
        .first()
        .ok_or((StatusCode::NOT_FOUND, "No snapshot found".into()))?;

    let mut next = latest.clone();
    next.id = format!("snp_{}", uuid::Uuid::new_v4().simple());
    next.version = latest.version + 1;
    next.previous_snapshot_id = Some(latest.id.clone());
    next.published_at = Utc::now();
    next.arweave_tx_id = None;

    let mut matched_trigger = None;
    for uc in &mut next.update_criteria {
        if uc.id == criterion_id {
            uc.status = req.status;
            matched_trigger = Some(uc.trigger.clone());
            break;
        }
    }
    let Some(trig) = matched_trigger else {
        return Err((StatusCode::NOT_FOUND, "Update criterion not found".into()));
    };

    next.changelog_note = Some(match req.note.filter(|s| !s.trim().is_empty()) {
        Some(n) => format!("Criterion → {}: {n}", req.status.label()),
        None => format!("Marked criterion \"{trig}\" as {}", req.status.label()),
    });

    let saved = state.repo.publish_snapshot(next).await.map_err(internal_err)?;
    Ok(Json(saved))
}

#[derive(Deserialize)]
struct StudioCheckRequest {
    nodes: Vec<SnapshotNode>,
    edges: Vec<SnapshotEdge>,
    update_criteria: Vec<UpdateCriterion>,
}

async fn studio_check(
    State(state): State<Arc<AppState>>,
    Json(req): Json<StudioCheckRequest>,
) -> Result<Json<Vec<EpistemicCheckItem>>, (StatusCode, String)> {
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let items = run_epistemic_checks(
        &req.nodes,
        &req.edges,
        &req.update_criteria,
        &concepts,
        &primary,
    );
    Ok(Json(items))
}

async fn studio_stress_test(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(req): Json<StudioCheckRequest>,
) -> Result<Json<ai::StressTestResult>, (StatusCode, String)> {
    if !state.rate_limiter.check("ai_stress", &headers, 15, 600) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            "Stress-test rate limit reached. Please wait a few minutes.".into(),
        ));
    }
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let res = ai::stress_test_map(
        &req.nodes,
        &req.edges,
        &req.update_criteria,
        &concepts,
        &actors,
        &primary,
    )
    .await;
    Ok(Json(res))
}

async fn field_intelligence(
    State(state): State<Arc<AppState>>,
) -> Result<Json<FieldIntelligence>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;
    Ok(Json(compute_field_intelligence(
        &actors,
        &primary,
        &concepts,
        &attestations,
    )))
}

#[derive(Serialize)]
struct ArchiveRecordItem {
    actor_handle: String,
    display_name: String,
    version: i32,
    arweave_tx_id: Option<String>,
    gateway_url: Option<String>,
    is_live_arweave: bool,
    published_at: chrono::DateTime<Utc>,
}

async fn list_archive_records(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.map_err(internal_err)?;
    let primary = state.repo.list_primary_snapshots().await.map_err(internal_err)?;
    let snap_map: HashMap<&str, &ToCSnapshot> = primary.iter().map(|s| (s.id.as_str(), s)).collect();

    let mut records = Vec::new();
    let mut archived_count = 0usize;
    for a in &actors {
        let Some(snap) = a.primary_snapshot_id.as_deref().and_then(|sid| snap_map.get(sid)) else {
            continue;
        };
        let is_live = snap
            .arweave_tx_id
            .as_deref()
            .map(|t| !t.is_empty() && !t.starts_with("seed_") && !t.starts_with("local_"))
            .unwrap_or(false);
        if is_live {
            archived_count += 1;
        }
        let gateway_url = if is_live {
            snap.arweave_tx_id.as_deref().map(|t| state.storage.gateway_url(t))
        } else {
            None
        };
        records.push(ArchiveRecordItem {
            actor_handle: a.handle.clone(),
            display_name: a.display_name.clone(),
            version: snap.version,
            arweave_tx_id: if is_live { snap.arweave_tx_id.clone() } else { None },
            gateway_url,
            is_live_arweave: is_live,
            published_at: snap.published_at,
        });
    }
    records.sort_by(|a, b| {
        b.is_live_arweave
            .cmp(&a.is_live_arweave)
            .then_with(|| a.display_name.cmp(&b.display_name))
    });

    Ok(Json(serde_json::json!({
        "adapter": state.storage.adapter_name(),
        "total_snapshots": records.len(),
        "archived_count": archived_count,
        "records": records,
    })))
}

#[derive(Deserialize)]
struct StudioSimilarRequest {
    stage: Stage,
    title: String,
}

async fn studio_similar(
    State(state): State<Arc<AppState>>,
    Json(req): Json<StudioSimilarRequest>,
) -> Result<Json<Vec<SimilarConceptMatch>>, (StatusCode, String)> {
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    Ok(Json(find_similar_concepts(req.stage, &req.title, &concepts)))
}

// ============================================================================
// Dynamic OG PNG & Meta-Injected SPA HTML
// ============================================================================

async fn og_home_png(State(state): State<Arc<AppState>>) -> Result<Response, (StatusCode, String)> {
    let actors = state.repo.list_actors().await.unwrap_or_default();
    let concepts = state.repo.list_concepts().await.unwrap_or_default();
    let png = og::render_home_og_png(actors.len(), concepts.len()).map_err(internal_err)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=300"),
        ],
        png,
    )
        .into_response())
}

async fn og_actor_png(
    State(state): State<Arc<AppState>>,
    Path(handle): Path<String>,
) -> Result<Response, (StatusCode, String)> {
    let clean = handle.trim_end_matches(".png").trim_start_matches('@');
    let actor = state
        .repo
        .get_actor_by_handle(clean)
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor not found".into()))?;
    let snap = state
        .repo
        .list_snapshots_for_actor(&actor.id)
        .await
        .map_err(internal_err)?
        .into_iter()
        .next()
        .ok_or((StatusCode::NOT_FOUND, "Snapshot not found".into()))?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let png = og::render_actor_og_png(&actor, &snap, &concepts).map_err(internal_err)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=300"),
        ],
        png,
    )
        .into_response())
}

async fn og_compare_png(
    State(state): State<Arc<AppState>>,
    Query(q): Query<CompareQuery>,
) -> Result<Response, (StatusCode, String)> {
    let actor_a = state
        .repo
        .get_actor_by_handle(q.a.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor A not found".into()))?;
    let actor_b = state
        .repo
        .get_actor_by_handle(q.b.trim_start_matches('@'))
        .await
        .map_err(internal_err)?
        .ok_or((StatusCode::NOT_FOUND, "Actor B not found".into()))?;
    let snap_a = state
        .repo
        .list_snapshots_for_actor(&actor_a.id)
        .await
        .map_err(internal_err)?
        .into_iter()
        .next()
        .ok_or((StatusCode::NOT_FOUND, "Snapshot A not found".into()))?;
    let snap_b = state
        .repo
        .list_snapshots_for_actor(&actor_b.id)
        .await
        .map_err(internal_err)?
        .into_iter()
        .next()
        .ok_or((StatusCode::NOT_FOUND, "Snapshot B not found".into()))?;
    let concepts = state.repo.list_concepts().await.map_err(internal_err)?;
    let attestations = state.repo.list_attestations().await.map_err(internal_err)?;
    let diff = diff_snapshots(&snap_a, &snap_b, &concepts, &attestations);
    let png = og::render_compare_og_png(&actor_a, &actor_b, &diff).map_err(internal_err)?;
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "image/png"),
            (header::CACHE_CONTROL, "public, max-age=300"),
        ],
        png,
    )
        .into_response())
}

async fn robots_txt(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let base = state.public_base_url.trim_end_matches('/');
    let body = format!("User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n");
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        body,
    )
}

async fn sitemap_xml(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let base = state.public_base_url.trim_end_matches('/');
    let actors = state.repo.list_actors().await.unwrap_or_default();
    let mut urls = vec![
        format!("{base}/"),
        format!("{base}/compare"),
        format!("{base}/cruxes"),
        format!("{base}/data"),
        format!("{base}/studio"),
    ];
    for a in actors {
        urls.push(format!("{base}/a/{}", a.handle));
    }
    let body = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{}
</urlset>"#,
        urls.into_iter()
            .map(|u| format!("  <url><loc>{u}</loc></url>"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/xml; charset=utf-8"),
            (header::CACHE_CONTROL, "public, max-age=600"),
        ],
        body,
    )
}

fn load_index_html(state: &AppState) -> String {
    let index_path = state.web_dist_dir.join("index.html");
    std::fs::read_to_string(index_path).unwrap_or_else(|_| {
        "<!doctype html><html><head><title>toctracker.com</title></head><body><div id=\"root\">Run `npm run build` in web/ or use the Vite dev server on :5173.</div></body></html>".into()
    })
}

fn inject_og_meta(html: String, title: &str, desc: &str, image_url: &str, page_url: &str) -> Html<String> {
    let meta = format!(
        r#"<meta property="og:url" content="{page_url}" />
    <meta property="og:title" content="{title}" />
    <meta property="og:description" content="{desc}" />
    <meta property="og:image" content="{image_url}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{title}" />
    <meta name="twitter:description" content="{desc}" />
    <meta name="twitter:image" content="{image_url}" />
</head>"#,
        page_url = escape_html(page_url),
        title = escape_html(title),
        desc = escape_html(desc),
        image_url = escape_html(image_url),
    );
    Html(html.replacen("</head>", &meta, 1))
}

async fn spa_actor_html(
    State(state): State<Arc<AppState>>,
    Path(handle): Path<String>,
) -> Html<String> {
    let html = load_index_html(&state);
    let clean = handle.trim_start_matches('@');
    let base = state.public_base_url.trim_end_matches('/');
    if let Ok(Some(actor)) = state.repo.get_actor_by_handle(clean).await {
        let title = format!("{} — Theory of Change | toctracker.com", actor.display_name);
        let desc = format!("{} · View flowchart, credences & update criteria.", actor.role_or_affiliation);
        let img = format!("{base}/og/actor/{}.png", actor.handle);
        let url = format!("{base}/a/{}", actor.handle);
        return inject_og_meta(html, &title, &desc, &img, &url);
    }
    let img = format!("{base}/og/home.png");
    inject_og_meta(
        html,
        "toctracker.com — AI Safety Theory of Change Tracker",
        "Compare AI Safety Theories of Change side-by-side: premises, bottlenecks, interventions, bets, and falsifiable update criteria.",
        &img,
        base,
    )
}

async fn spa_compare_html(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Html<String> {
    let html = load_index_html(&state);
    let base = state.public_base_url.trim_end_matches('/');
    if let (Some(a), Some(b)) = (params.get("a"), params.get("b")) {
        let title = format!("{a} vs {b} — Side-by-Side Comparison | toctracker.com");
        let desc = "Compare AI Safety Theories of Change side-by-side and pinpoint exact cruxes.";
        let img = format!(
            "{base}/og/compare?a={}&b={}",
            urlencoding::encode(a),
            urlencoding::encode(b)
        );
        let url = format!(
            "{base}/compare?a={}&b={}",
            urlencoding::encode(a),
            urlencoding::encode(b)
        );
        return inject_og_meta(html, &title, desc, &img, &url);
    }
    let img = format!("{base}/og/home.png");
    inject_og_meta(
        html,
        "Compare AI Safety Theories of Change | toctracker.com",
        "Compare any two AI Safety actors side-by-side to see shared premises and exact disagreements.",
        &img,
        &format!("{base}/compare"),
    )
}

async fn spa_index_html(State(state): State<Arc<AppState>>) -> Html<String> {
    let html = load_index_html(&state);
    let base = state.public_base_url.trim_end_matches('/');
    let img = format!("{base}/og/home.png");
    inject_og_meta(
        html,
        "toctracker.com — What AI Safety actors bet on, and where they split.",
        "Compare AI Safety Theories of Change side-by-side: premises, bottlenecks, interventions, bets, and falsifiable update criteria.",
        &img,
        base,
    )
}

fn internal_err<E: std::fmt::Display>(e: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::MemoryRepo;
    use toc_storage::LocalMockAdapter;

    async fn test_state() -> Arc<AppState> {
        let repo = Arc::new(MemoryRepo::new());
        repo.seed_if_empty().await.unwrap();
        Arc::new(AppState {
            repo,
            storage: Arc::new(LocalMockAdapter),
            oauth_states: auth::OAuthStateStore::default(),
            magic_links: auth::MagicLinkStore::default(),
            rate_limiter: RateLimiter::default(),
            web_dist_dir: PathBuf::from("web/dist"),
            public_base_url: "http://localhost:3001".into(),
        })
    }

    #[tokio::test]
    async fn og_cards_render_valid_png_bytes() {
        let state = test_state().await;
        let actor_a = state.repo.get_actor_by_handle("dario-amodei").await.unwrap().unwrap();
        let actor_b = state.repo.get_actor_by_handle("eliezer-yudkowsky").await.unwrap().unwrap();
        let snap_a = state.repo.list_snapshots_for_actor(&actor_a.id).await.unwrap().remove(0);
        let snap_b = state.repo.list_snapshots_for_actor(&actor_b.id).await.unwrap().remove(0);
        let concepts = state.repo.list_concepts().await.unwrap();

        let png_actor = og::render_actor_og_png(&actor_a, &snap_a, &concepts).unwrap();
        assert!(png_actor.starts_with(b"\x89PNG\r\n\x1a\n"));

        let diff = diff_snapshots(&snap_a, &snap_b, &concepts, &[]);
        let png_cmp = og::render_compare_og_png(&actor_a, &actor_b, &diff).unwrap();
        assert!(png_cmp.starts_with(b"\x89PNG\r\n\x1a\n"));
    }

    #[tokio::test]
    async fn studio_suggestions_rank_contextual_concepts() {
        let state = test_state().await;
        let concepts = state.repo.list_concepts().await.unwrap();
        let snaps = state.repo.list_primary_snapshots().await.unwrap();
        let sugs = ai::suggest_concepts_for_stage(
            Stage::Bottleneck,
            &["cpt_root_scheming".into()],
            &concepts,
            &snaps,
        );
        assert!(!sugs.is_empty());
    }

    #[tokio::test]
    async fn http_router_end_to_end_api_and_validation() {
        use axum::body::{to_bytes, Body};
        use axum::http::Request;
        use tower::ServiceExt;

        let app = build_router(test_state().await);

        // 1. Health check
        let res = app
            .clone()
            .oneshot(Request::builder().uri("/api/v1/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        // 2. Compare Dario vs Eliezer (including Earliest Split diagnostic)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/compare?a=dario-amodei&b=eliezer-yudkowsky")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert!(json["diff"]["summary"]["shared_ground_count"].as_u64().unwrap() >= 1);
        assert!(json["diff"]["summary"]["earliest_split"]["sentence"].as_str().is_some());

        // 2b. Field Intelligence (Blindspots, Fault Lines, Hidden Allies)
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/intelligence/field")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let fi_body = to_bytes(res.into_body(), 1024 * 1024).await.unwrap();
        let fi: serde_json::Value = serde_json::from_slice(&fi_body).unwrap();
        assert_eq!(fi["total_actors"].as_u64().unwrap(), 26);
        assert!(!fi["neglected_bottlenecks"].as_array().unwrap().is_empty());
        assert!(!fi["fault_lines"].as_array().unwrap().is_empty());

        // 2c. robots.txt + sitemap.xml + security headers
        let res = app
            .clone()
            .oneshot(Request::builder().uri("/sitemap.xml").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(res.headers().get("x-content-type-options").unwrap(), "nosniff");
        let sm = String::from_utf8(to_bytes(res.into_body(), 1024 * 1024).await.unwrap().to_vec()).unwrap();
        assert!(sm.contains("/a/dario-amodei"));

        // 3. OG meta injection on /compare
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/compare?a=dario-amodei&b=eliezer-yudkowsky")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let html = String::from_utf8(to_bytes(res.into_body(), 1024 * 1024).await.unwrap().to_vec()).unwrap();
        assert!(html.contains("og:title"));
        assert!(html.contains("/og/compare?a=dario-amodei"));

        // 4. OG PNG endpoint returns valid PNG
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/og/compare?a=dario-amodei&b=eliezer-yudkowsky")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let png = to_bytes(res.into_body(), 2 * 1024 * 1024).await.unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));

        // 5a. Unauthenticated snapshot publish returns 401
        let invalid_payload = serde_json::json!({
            "actor_handle": "dario-amodei",
            "summary": "Missing criterion test",
            "nodes": [{
                "local_id": "n1",
                "concept_id": "cpt_root_timelines",
                "stage": "premise",
                "stance": "active",
                "is_load_bearing_crux": false,
                "credence": null,
                "bet_priority": null,
                "note": null,
                "citations": []
            }],
            "edges": [],
            "update_criteria": []
        });
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/snapshots")
                    .header("content-type", "application/json")
                    .body(Body::from(invalid_payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        // 5b. Sign in (localhost dev-login), create own actor, verify 403 on seeded draft & 422 on missing criteria
        let login_res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/auth/dev-login")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"email":"tester@example.org","display_name":"Tester"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(login_res.status(), StatusCode::OK);
        let cookie = login_res
            .headers()
            .get(header::SET_COOKIE)
            .unwrap()
            .to_str()
            .unwrap()
            .split(';')
            .next()
            .unwrap()
            .to_string();

        // Trying to overwrite Dario's seeded community draft must fail with 403
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/snapshots")
                    .header("content-type", "application/json")
                    .header(header::COOKIE, &cookie)
                    .body(Body::from(invalid_payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);

        // Create own actor and verify missing update_criteria returns 422
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/actors")
                    .header("content-type", "application/json")
                    .header(header::COOKIE, &cookie)
                    .body(Body::from(r#"{"handle":"tester-map","display_name":"Tester","kind":"individual"}"#))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::CREATED);

        let mut own_invalid = invalid_payload.clone();
        own_invalid["actor_handle"] = serde_json::json!("tester-map");
        let res = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/snapshots")
                    .header("content-type", "application/json")
                    .header(header::COOKIE, &cookie)
                    .body(Body::from(own_invalid.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);

        // 5c. XSS escaping in /compare OG meta tags + SSRF URL guard
        let xss_res = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/compare?a=%22%3E%3Cscript%3Ealert(1)%3C/script%3E&b=eliezer-yudkowsky")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let xss_html = String::from_utf8(to_bytes(xss_res.into_body(), 1024 * 1024).await.unwrap().to_vec()).unwrap();
        assert!(!xss_html.contains("<script>alert(1)</script>"));
        assert!(xss_html.contains("&lt;script&gt;"));

        assert!(!ai::is_safe_public_url("http://127.0.0.1:3001/api/v1/health").await);
        assert!(!ai::is_safe_public_url("http://169.254.169.254/latest/meta-data").await);
        assert!(!ai::is_safe_public_url("http://postgres.railway.internal:5432").await);

        // 6. Silent Graph Linter + Similar Concept Nudge (/api/v1/studio/similar)
        let sim_payload = serde_json::json!({
            "stage": "bottleneck",
            "title": "Alignment science is lagging behind capabilities"
        });
        let res = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/studio/similar")
                    .header("content-type", "application/json")
                    .body(Body::from(sim_payload.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let sim_body: serde_json::Value =
            serde_json::from_slice(&to_bytes(res.into_body(), 1024 * 1024).await.unwrap()).unwrap();
        assert_eq!(sim_body[0]["concept"]["id"], "cpt_root_alignment_behind");
    }

    #[tokio::test]
    #[ignore]
    async fn live_upload_to_ardrive_turbo_free_tier() {
        use toc_storage::{generate_user_keypair, PublishEnvelope, StorageAdapter, TurboArweaveAdapter};
        let kp = generate_user_keypair();
        let adapter = TurboArweaveAdapter::new(
            "https://upload.ardrive.io/v1/tx".into(),
            "https://arweave.net/graphql".into(),
            None,
            Some(kp.secret_key_b64),
        );
        let env = PublishEnvelope {
            record_type: "smoke_test".into(),
            record_id: format!("smoke_{}", uuid::Uuid::new_v4().simple()),
            actor_id: None,
            root_concept_id: None,
            prev_tx_id: None,
            payload: serde_json::json!({
                "app": "toctracker.com",
                "schema_version": 1,
                "smoke_test": true
            }),
        };
        let tx_id = adapter.publish(&env).await.expect("Turbo upload failed");
        println!("LIVE ARWEAVE TX: https://arweave.net/{tx_id}");
        assert_eq!(tx_id.len(), 43);
    }
}
