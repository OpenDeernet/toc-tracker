use std::collections::HashMap;
use std::sync::RwLock;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use toc_core::*;
use toc_storage::PublishEnvelope;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: String,
    pub email: Option<String>,
    pub x_user_id: Option<String>,
    pub x_handle: Option<String>,
    pub github_user_id: Option<String>,
    pub github_handle: Option<String>,
    pub display_name: String,
    pub arweave_pubkey: String,
    pub encrypted_key_blob: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct OutboxItem {
    pub id: String,
    pub envelope: PublishEnvelope,
    pub status: String,
    pub arweave_tx_id: Option<String>,
}

#[allow(dead_code)]
#[async_trait]
pub trait Repository: Send + Sync {
    async fn seed_if_empty(&self) -> Result<()>;

    async fn list_actors(&self) -> Result<Vec<Actor>>;
    async fn get_actor_by_handle(&self, handle: &str) -> Result<Option<Actor>>;
    async fn get_actor_by_id(&self, id: &str) -> Result<Option<Actor>>;
    async fn upsert_actor(&self, actor: Actor) -> Result<Actor>;

    async fn list_concepts(&self) -> Result<Vec<Concept>>;
    async fn create_concept(&self, concept: Concept) -> Result<Concept>;

    async fn list_primary_snapshots(&self) -> Result<Vec<ToCSnapshot>>;
    async fn list_snapshots_for_actor(&self, actor_id: &str) -> Result<Vec<ToCSnapshot>>;
    async fn get_snapshot_by_id(&self, id: &str) -> Result<Option<ToCSnapshot>>;
    async fn publish_snapshot(&self, snapshot: ToCSnapshot) -> Result<ToCSnapshot>;

    async fn list_attestations(&self) -> Result<Vec<LinkAttestation>>;
    async fn create_attestation(&self, att: LinkAttestation) -> Result<LinkAttestation>;

    async fn upsert_user(&self, user: UserRecord) -> Result<UserRecord>;
    async fn get_user_by_id(&self, id: &str) -> Result<Option<UserRecord>>;
    async fn find_user_by_email(&self, email: &str) -> Result<Option<UserRecord>>;
    async fn find_user_by_x(&self, x_user_id: &str) -> Result<Option<UserRecord>>;
    async fn find_user_by_github(&self, github_user_id: &str) -> Result<Option<UserRecord>>;

    async fn create_session(&self, user_id: &str, token_hash: &str, expires_at: DateTime<Utc>) -> Result<()>;
    async fn get_user_by_session_hash(&self, token_hash: &str) -> Result<Option<UserRecord>>;
    async fn delete_session_hash(&self, token_hash: &str) -> Result<()>;

    async fn pop_pending_outbox(&self, limit: usize) -> Result<Vec<OutboxItem>>;
    async fn mark_outbox_published(&self, outbox_id: &str, record_type: &str, record_id: &str, tx_id: &str) -> Result<()>;
    async fn mark_outbox_failed(&self, outbox_id: &str, err: &str) -> Result<()>;
}

// ============================================================================
// In-Memory Repository (Zero-Config Local Dev Fallback)
// ============================================================================

#[derive(Default)]
struct MemState {
    users: HashMap<String, UserRecord>,
    sessions: HashMap<String, (String, DateTime<Utc>)>,
    actors: HashMap<String, Actor>,
    concepts: HashMap<String, Concept>,
    snapshots: HashMap<String, ToCSnapshot>,
    attestations: HashMap<String, LinkAttestation>,
    outbox: Vec<OutboxItem>,
}

pub struct MemoryRepo {
    state: RwLock<MemState>,
}

impl MemoryRepo {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(MemState::default()),
        }
    }
}

#[async_trait]
impl Repository for MemoryRepo {
    async fn seed_if_empty(&self) -> Result<()> {
        let mut st = self.state.write().unwrap();
        if !st.actors.is_empty() {
            return Ok(());
        }
        let bundle = seed::build_seed_bundle();
        for c in bundle.concepts {
            st.concepts.insert(c.id.clone(), c);
        }
        for a in bundle.actors {
            st.actors.insert(a.id.clone(), a);
        }
        for s in bundle.snapshots {
            st.snapshots.insert(s.id.clone(), s);
        }
        for att in bundle.attestations {
            st.attestations.insert(att.id.clone(), att);
        }
        Ok(())
    }

    async fn list_actors(&self) -> Result<Vec<Actor>> {
        let st = self.state.read().unwrap();
        let mut out: Vec<Actor> = st.actors.values().cloned().collect();
        out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(out)
    }

    async fn get_actor_by_handle(&self, handle: &str) -> Result<Option<Actor>> {
        let st = self.state.read().unwrap();
        Ok(st
            .actors
            .values()
            .find(|a| a.handle.eq_ignore_ascii_case(handle))
            .cloned())
    }

    async fn get_actor_by_id(&self, id: &str) -> Result<Option<Actor>> {
        let st = self.state.read().unwrap();
        Ok(st.actors.get(id).cloned())
    }

    async fn upsert_actor(&self, actor: Actor) -> Result<Actor> {
        let mut st = self.state.write().unwrap();
        st.actors.insert(actor.id.clone(), actor.clone());
        Ok(actor)
    }

    async fn list_concepts(&self) -> Result<Vec<Concept>> {
        let st = self.state.read().unwrap();
        let mut out: Vec<Concept> = st.concepts.values().cloned().collect();
        out.sort_by(|a, b| a.stage.cmp(&b.stage).then_with(|| a.title.cmp(&b.title)));
        Ok(out)
    }

    async fn create_concept(&self, concept: Concept) -> Result<Concept> {
        let mut st = self.state.write().unwrap();
        let env = PublishEnvelope {
            record_type: "concept".into(),
            record_id: concept.id.clone(),
            actor_id: concept.created_by_actor_id.clone(),
            root_concept_id: Some(concept.root_concept_id.clone()),
            prev_tx_id: None,
            payload: serde_json::to_value(&concept)?,
        };
        st.concepts.insert(concept.id.clone(), concept.clone());
        st.outbox.push(OutboxItem {
            id: format!("obx_{}", uuid::Uuid::new_v4().simple()),
            envelope: env,
            status: "pending".into(),
            arweave_tx_id: None,
        });
        Ok(concept)
    }

    async fn list_primary_snapshots(&self) -> Result<Vec<ToCSnapshot>> {
        let st = self.state.read().unwrap();
        let mut out = Vec::new();
        for a in st.actors.values() {
            if let Some(sid) = &a.primary_snapshot_id {
                if let Some(s) = st.snapshots.get(sid) {
                    out.push(s.clone());
                }
            }
        }
        Ok(out)
    }

    async fn list_snapshots_for_actor(&self, actor_id: &str) -> Result<Vec<ToCSnapshot>> {
        let st = self.state.read().unwrap();
        let mut out: Vec<ToCSnapshot> = st
            .snapshots
            .values()
            .filter(|s| s.actor_id == actor_id)
            .cloned()
            .collect();
        out.sort_by(|a, b| b.version.cmp(&a.version));
        Ok(out)
    }

    async fn get_snapshot_by_id(&self, id: &str) -> Result<Option<ToCSnapshot>> {
        let st = self.state.read().unwrap();
        Ok(st.snapshots.get(id).cloned())
    }

    async fn publish_snapshot(&self, snapshot: ToCSnapshot) -> Result<ToCSnapshot> {
        let mut st = self.state.write().unwrap();
        let prev_tx = snapshot
            .previous_snapshot_id
            .as_ref()
            .and_then(|pid| st.snapshots.get(pid))
            .and_then(|ps| ps.arweave_tx_id.clone());

        st.snapshots.insert(snapshot.id.clone(), snapshot.clone());
        if let Some(actor) = st.actors.get_mut(&snapshot.actor_id) {
            actor.primary_snapshot_id = Some(snapshot.id.clone());
        }
        let env = PublishEnvelope {
            record_type: "toc_snapshot".into(),
            record_id: snapshot.id.clone(),
            actor_id: Some(snapshot.actor_id.clone()),
            root_concept_id: None,
            prev_tx_id: prev_tx,
            payload: serde_json::to_value(&snapshot)?,
        };
        st.outbox.push(OutboxItem {
            id: format!("obx_{}", uuid::Uuid::new_v4().simple()),
            envelope: env,
            status: "pending".into(),
            arweave_tx_id: None,
        });
        Ok(snapshot)
    }

    async fn list_attestations(&self) -> Result<Vec<LinkAttestation>> {
        let st = self.state.read().unwrap();
        Ok(st.attestations.values().cloned().collect())
    }

    async fn create_attestation(&self, att: LinkAttestation) -> Result<LinkAttestation> {
        let mut st = self.state.write().unwrap();
        st.attestations.insert(att.id.clone(), att.clone());
        st.outbox.push(OutboxItem {
            id: format!("obx_{}", uuid::Uuid::new_v4().simple()),
            envelope: PublishEnvelope {
                record_type: "link_attestation".into(),
                record_id: att.id.clone(),
                actor_id: att.attester_actor_id.clone(),
                root_concept_id: None,
                prev_tx_id: None,
                payload: serde_json::to_value(&att)?,
            },
            status: "pending".into(),
            arweave_tx_id: None,
        });
        Ok(att)
    }

    async fn upsert_user(&self, user: UserRecord) -> Result<UserRecord> {
        let mut st = self.state.write().unwrap();
        st.users.insert(user.id.clone(), user.clone());
        Ok(user)
    }

    async fn get_user_by_id(&self, id: &str) -> Result<Option<UserRecord>> {
        let st = self.state.read().unwrap();
        Ok(st.users.get(id).cloned())
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<UserRecord>> {
        let st = self.state.read().unwrap();
        Ok(st
            .users
            .values()
            .find(|u| u.email.as_deref().map(|e| e.eq_ignore_ascii_case(email)).unwrap_or(false))
            .cloned())
    }

    async fn find_user_by_x(&self, x_user_id: &str) -> Result<Option<UserRecord>> {
        let st = self.state.read().unwrap();
        Ok(st
            .users
            .values()
            .find(|u| u.x_user_id.as_deref() == Some(x_user_id))
            .cloned())
    }

    async fn find_user_by_github(&self, github_user_id: &str) -> Result<Option<UserRecord>> {
        let st = self.state.read().unwrap();
        Ok(st
            .users
            .values()
            .find(|u| u.github_user_id.as_deref() == Some(github_user_id))
            .cloned())
    }

    async fn create_session(&self, user_id: &str, token_hash: &str, expires_at: DateTime<Utc>) -> Result<()> {
        let mut st = self.state.write().unwrap();
        st.sessions
            .insert(token_hash.to_string(), (user_id.to_string(), expires_at));
        Ok(())
    }

    async fn get_user_by_session_hash(&self, token_hash: &str) -> Result<Option<UserRecord>> {
        let st = self.state.read().unwrap();
        let Some((uid, exp)) = st.sessions.get(token_hash) else {
            return Ok(None);
        };
        if *exp < Utc::now() {
            return Ok(None);
        }
        Ok(st.users.get(uid).cloned())
    }

    async fn delete_session_hash(&self, token_hash: &str) -> Result<()> {
        let mut st = self.state.write().unwrap();
        st.sessions.remove(token_hash);
        Ok(())
    }

    async fn pop_pending_outbox(&self, limit: usize) -> Result<Vec<OutboxItem>> {
        let st = self.state.read().unwrap();
        Ok(st
            .outbox
            .iter()
            .filter(|i| i.status == "pending")
            .take(limit)
            .cloned()
            .collect())
    }

    async fn mark_outbox_published(
        &self,
        outbox_id: &str,
        record_type: &str,
        record_id: &str,
        tx_id: &str,
    ) -> Result<()> {
        let mut st = self.state.write().unwrap();
        if let Some(item) = st.outbox.iter_mut().find(|i| i.id == outbox_id) {
            item.status = "published".into();
            item.arweave_tx_id = Some(tx_id.to_string());
        }
        match record_type {
            "concept" => {
                if let Some(c) = st.concepts.get_mut(record_id) {
                    c.arweave_tx_id = Some(tx_id.to_string());
                }
            }
            "toc_snapshot" => {
                if let Some(s) = st.snapshots.get_mut(record_id) {
                    s.arweave_tx_id = Some(tx_id.to_string());
                }
            }
            "link_attestation" => {
                if let Some(a) = st.attestations.get_mut(record_id) {
                    a.arweave_tx_id = Some(tx_id.to_string());
                }
            }
            _ => {}
        }
        Ok(())
    }

    async fn mark_outbox_failed(&self, outbox_id: &str, _err: &str) -> Result<()> {
        let mut st = self.state.write().unwrap();
        if let Some(item) = st.outbox.iter_mut().find(|i| i.id == outbox_id) {
            item.status = "failed".into();
        }
        Ok(())
    }
}

// ============================================================================
// PostgreSQL Repository (Production Live Index & Auth Store)
// ============================================================================

pub struct PostgresRepo {
    pool: PgPool,
}

impl PostgresRepo {
    pub async fn connect_and_migrate(database_url: &str) -> Result<Self> {
        let pool = PgPool::connect(database_url).await?;
        sqlx::migrate!("../../migrations").run(&pool).await?;
        Ok(Self { pool })
    }

    fn row_to_actor(r: &sqlx::postgres::PgRow) -> Result<Actor> {
        let kind_str: String = r.try_get("kind")?;
        let status_str: String = r.try_get("authorship_status")?;
        let tags_val: serde_json::Value = r.try_get("tags")?;
        let tags: Vec<String> = serde_json::from_value(tags_val).unwrap_or_default();
        Ok(Actor {
            id: r.try_get("id")?,
            handle: r.try_get("handle")?,
            display_name: r.try_get("display_name")?,
            kind: match kind_str.as_str() {
                "organization" => ActorKind::Organization,
                _ => ActorKind::Individual,
            },
            role_or_affiliation: r.try_get("role_or_affiliation")?,
            bio_url: r.try_get("bio_url")?,
            avatar_initials: r.try_get("avatar_initials")?,
            authorship_status: match status_str.as_str() {
                "self_authored" => AuthorshipStatus::SelfAuthored,
                "claimed" => AuthorshipStatus::Claimed,
                _ => AuthorshipStatus::CommunityDraft,
            },
            owner_user_id: r.try_get("owner_user_id")?,
            verified_provider: r.try_get("verified_provider")?,
            verified_handle: r.try_get("verified_handle")?,
            arweave_pubkey: r.try_get("arweave_pubkey")?,
            primary_snapshot_id: r.try_get("primary_snapshot_id")?,
            tags,
            created_at: r.try_get("created_at")?,
        })
    }

    fn row_to_concept(r: &sqlx::postgres::PgRow) -> Result<Concept> {
        let stage_str: String = r.try_get("stage")?;
        let tags_val: serde_json::Value = r.try_get("tags")?;
        let tags: Vec<String> = serde_json::from_value(tags_val).unwrap_or_default();
        Ok(Concept {
            schema_version: r.try_get::<i32, _>("schema_version")? as u32,
            id: r.try_get("id")?,
            stage: Stage::from_str_opt(&stage_str).ok_or_else(|| anyhow!("invalid stage"))?,
            title: r.try_get("title")?,
            description: r.try_get("description")?,
            parent_concept_id: r.try_get("parent_concept_id")?,
            root_concept_id: r.try_get("root_concept_id")?,
            tags,
            created_by_actor_id: r.try_get("created_by_actor_id")?,
            arweave_tx_id: r.try_get("arweave_tx_id")?,
            created_at: r.try_get("created_at")?,
        })
    }

    fn row_to_user(r: &sqlx::postgres::PgRow) -> Result<UserRecord> {
        Ok(UserRecord {
            id: r.try_get("id")?,
            email: r.try_get("email")?,
            x_user_id: r.try_get("x_user_id")?,
            x_handle: r.try_get("x_handle")?,
            github_user_id: r.try_get("github_user_id")?,
            github_handle: r.try_get("github_handle")?,
            display_name: r.try_get("display_name")?,
            arweave_pubkey: r.try_get("arweave_pubkey")?,
            encrypted_key_blob: r.try_get("encrypted_key_blob")?,
            created_at: r.try_get("created_at")?,
        })
    }

    async fn insert_snapshot_internal(&self, snapshot: &ToCSnapshot, enqueue_outbox: bool) -> Result<()> {
        let payload = serde_json::to_value(snapshot)?;
        sqlx::query(
            r#"
            INSERT INTO toc_snapshots
                (id, schema_version, actor_id, version, previous_snapshot_id, authorship_mode, summary, changelog_note, payload_json, arweave_tx_id, published_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(&snapshot.id)
        .bind(snapshot.schema_version as i32)
        .bind(&snapshot.actor_id)
        .bind(snapshot.version)
        .bind(&snapshot.previous_snapshot_id)
        .bind(snapshot.authorship_mode.as_str())
        .bind(&snapshot.summary)
        .bind(&snapshot.changelog_note)
        .bind(&payload)
        .bind(&snapshot.arweave_tx_id)
        .bind(snapshot.published_at)
        .execute(&self.pool)
        .await?;

        // Update materialized snapshot_nodes_index
        sqlx::query("UPDATE snapshot_nodes_index SET is_primary_snapshot = FALSE WHERE actor_id = $1")
            .bind(&snapshot.actor_id)
            .execute(&self.pool)
            .await?;

        for node in &snapshot.nodes {
            let root_id: String = sqlx::query_scalar("SELECT root_concept_id FROM concepts WHERE id = $1")
                .bind(&node.concept_id)
                .fetch_optional(&self.pool)
                .await?
                .unwrap_or_else(|| node.concept_id.clone());

            let band = node.credence.as_ref().map(|c| c.band.as_str().to_string());
            let pct = node.credence.as_ref().and_then(|c| c.percent).map(|p| p as i16);

            sqlx::query(
                r#"
                INSERT INTO snapshot_nodes_index
                    (snapshot_id, actor_id, local_id, concept_id, root_concept_id, stage, stance, band, percent, is_crux, is_primary_snapshot)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE)
                ON CONFLICT (snapshot_id, local_id) DO UPDATE SET is_primary_snapshot = TRUE
                "#,
            )
            .bind(&snapshot.id)
            .bind(&snapshot.actor_id)
            .bind(&node.local_id)
            .bind(&node.concept_id)
            .bind(&root_id)
            .bind(node.stage.as_str())
            .bind(node.stance.as_str())
            .bind(band)
            .bind(pct)
            .bind(node.is_load_bearing_crux)
            .execute(&self.pool)
            .await?;
        }

        sqlx::query("UPDATE actors SET primary_snapshot_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(&snapshot.id)
            .bind(&snapshot.actor_id)
            .execute(&self.pool)
            .await?;

        if enqueue_outbox {
            let obx_id = format!("obx_{}", uuid::Uuid::new_v4().simple());
            sqlx::query(
                r#"
                INSERT INTO arweave_outbox (id, record_type, record_id, actor_id, payload_json)
                VALUES ($1, 'toc_snapshot', $2, $3, $4)
                "#,
            )
            .bind(obx_id)
            .bind(&snapshot.id)
            .bind(&snapshot.actor_id)
            .bind(&payload)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
}

#[async_trait]
impl Repository for PostgresRepo {
    async fn seed_if_empty(&self) -> Result<()> {
        let force_reseed = std::env::var("RESEED")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if force_reseed {
            sqlx::query("TRUNCATE TABLE arweave_outbox, link_attestations, snapshot_nodes_index, toc_snapshots, actors, concepts RESTART IDENTITY CASCADE")
                .execute(&self.pool)
                .await?;
        }

        let bundle = seed::build_seed_bundle();

        // 1. Additively insert any new concepts from seed-bundle.json (never overwrites existing)
        for c in &bundle.concepts {
            sqlx::query(
                r#"
                INSERT INTO concepts (id, schema_version, stage, title, description, parent_concept_id, root_concept_id, tags, created_by_actor_id, arweave_tx_id, created_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (id) DO NOTHING
                "#,
            )
            .bind(&c.id)
            .bind(c.schema_version as i32)
            .bind(c.stage.as_str())
            .bind(&c.title)
            .bind(&c.description)
            .bind(&c.parent_concept_id)
            .bind(&c.root_concept_id)
            .bind(serde_json::to_value(&c.tags)?)
            .bind(&c.created_by_actor_id)
            .bind(&c.arweave_tx_id)
            .bind(c.created_at)
            .execute(&self.pool)
            .await?;
        }

        // 2. Additively insert any NEW actors & their initial snapshots (never overwrites existing/claimed actors!)
        let snap_by_actor: HashMap<&str, &ToCSnapshot> = bundle
            .snapshots
            .iter()
            .map(|s| (s.actor_id.as_str(), s))
            .collect();

        let mut added_actors = 0usize;
        let mut skipped_actors = 0usize;

        for a in &bundle.actors {
            let exists: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM actors WHERE id = $1 OR LOWER(handle) = LOWER($2))",
            )
            .bind(&a.id)
            .bind(&a.handle)
            .fetch_one(&self.pool)
            .await?;

            if exists {
                skipped_actors += 1;
                continue;
            }

            let mut actor_row = a.clone();
            actor_row.primary_snapshot_id = None;
            self.upsert_actor(actor_row).await?;

            if let Some(s) = snap_by_actor.get(a.id.as_str()) {
                self.insert_snapshot_internal(s, false).await?;
            }
            added_actors += 1;
        }

        if added_actors > 0 {
            tracing::info!(
                added_actors,
                skipped_actors,
                "Synced new profiles from seed-bundle.json into PostgreSQL"
            );
        }
        Ok(())
    }

    async fn list_actors(&self) -> Result<Vec<Actor>> {
        let rows = sqlx::query("SELECT * FROM actors ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        rows.iter().map(Self::row_to_actor).collect()
    }

    async fn get_actor_by_handle(&self, handle: &str) -> Result<Option<Actor>> {
        let row = sqlx::query("SELECT * FROM actors WHERE LOWER(handle) = LOWER($1)")
            .bind(handle)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_actor).transpose()
    }

    async fn get_actor_by_id(&self, id: &str) -> Result<Option<Actor>> {
        let row = sqlx::query("SELECT * FROM actors WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_actor).transpose()
    }

    async fn upsert_actor(&self, actor: Actor) -> Result<Actor> {
        sqlx::query(
            r#"
            INSERT INTO actors
                (id, handle, display_name, kind, role_or_affiliation, bio_url, avatar_initials, authorship_status, owner_user_id, verified_provider, verified_handle, arweave_pubkey, primary_snapshot_id, tags, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
            ON CONFLICT (id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                role_or_affiliation = EXCLUDED.role_or_affiliation,
                bio_url = EXCLUDED.bio_url,
                authorship_status = EXCLUDED.authorship_status,
                owner_user_id = EXCLUDED.owner_user_id,
                verified_provider = EXCLUDED.verified_provider,
                verified_handle = EXCLUDED.verified_handle,
                arweave_pubkey = EXCLUDED.arweave_pubkey,
                primary_snapshot_id = COALESCE(EXCLUDED.primary_snapshot_id, actors.primary_snapshot_id),
                tags = EXCLUDED.tags,
                updated_at = NOW()
            "#,
        )
        .bind(&actor.id)
        .bind(&actor.handle)
        .bind(&actor.display_name)
        .bind(actor.kind.as_str())
        .bind(&actor.role_or_affiliation)
        .bind(&actor.bio_url)
        .bind(&actor.avatar_initials)
        .bind(actor.authorship_status.as_str())
        .bind(&actor.owner_user_id)
        .bind(&actor.verified_provider)
        .bind(&actor.verified_handle)
        .bind(&actor.arweave_pubkey)
        .bind(&actor.primary_snapshot_id)
        .bind(serde_json::to_value(&actor.tags)?)
        .bind(actor.created_at)
        .execute(&self.pool)
        .await?;
        Ok(actor)
    }

    async fn list_concepts(&self) -> Result<Vec<Concept>> {
        let rows = sqlx::query("SELECT * FROM concepts ORDER BY stage, title")
            .fetch_all(&self.pool)
            .await?;
        rows.iter().map(Self::row_to_concept).collect()
    }

    async fn create_concept(&self, concept: Concept) -> Result<Concept> {
        sqlx::query(
            r#"
            INSERT INTO concepts (id, schema_version, stage, title, description, parent_concept_id, root_concept_id, tags, created_by_actor_id, arweave_tx_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            "#,
        )
        .bind(&concept.id)
        .bind(concept.schema_version as i32)
        .bind(concept.stage.as_str())
        .bind(&concept.title)
        .bind(&concept.description)
        .bind(&concept.parent_concept_id)
        .bind(&concept.root_concept_id)
        .bind(serde_json::to_value(&concept.tags)?)
        .bind(&concept.created_by_actor_id)
        .bind(&concept.arweave_tx_id)
        .bind(concept.created_at)
        .execute(&self.pool)
        .await?;

        let obx_id = format!("obx_{}", uuid::Uuid::new_v4().simple());
        sqlx::query(
            r#"
            INSERT INTO arweave_outbox (id, record_type, record_id, actor_id, root_concept_id, payload_json)
            VALUES ($1, 'concept', $2, $3, $4, $5)
            "#,
        )
        .bind(obx_id)
        .bind(&concept.id)
        .bind(&concept.created_by_actor_id)
        .bind(&concept.root_concept_id)
        .bind(serde_json::to_value(&concept)?)
        .execute(&self.pool)
        .await?;
        Ok(concept)
    }

    async fn list_primary_snapshots(&self) -> Result<Vec<ToCSnapshot>> {
        let rows = sqlx::query(
            r#"
            SELECT s.payload_json, s.arweave_tx_id
            FROM toc_snapshots s
            JOIN actors a ON a.primary_snapshot_id = s.id
            "#,
        )
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::new();
        for r in rows {
            let val: serde_json::Value = r.try_get("payload_json")?;
            let tx: Option<String> = r.try_get("arweave_tx_id")?;
            let mut snap: ToCSnapshot = serde_json::from_value(val)?;
            if tx.is_some() {
                snap.arweave_tx_id = tx;
            }
            out.push(snap);
        }
        Ok(out)
    }

    async fn list_snapshots_for_actor(&self, actor_id: &str) -> Result<Vec<ToCSnapshot>> {
        let rows = sqlx::query(
            "SELECT payload_json, arweave_tx_id FROM toc_snapshots WHERE actor_id = $1 ORDER BY version DESC",
        )
        .bind(actor_id)
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::new();
        for r in rows {
            let val: serde_json::Value = r.try_get("payload_json")?;
            let tx: Option<String> = r.try_get("arweave_tx_id")?;
            let mut snap: ToCSnapshot = serde_json::from_value(val)?;
            if tx.is_some() {
                snap.arweave_tx_id = tx;
            }
            out.push(snap);
        }
        Ok(out)
    }

    async fn get_snapshot_by_id(&self, id: &str) -> Result<Option<ToCSnapshot>> {
        let row = sqlx::query("SELECT payload_json, arweave_tx_id FROM toc_snapshots WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some(r) => {
                let val: serde_json::Value = r.try_get("payload_json")?;
                let tx: Option<String> = r.try_get("arweave_tx_id")?;
                let mut snap: ToCSnapshot = serde_json::from_value(val)?;
                if tx.is_some() {
                    snap.arweave_tx_id = tx;
                }
                Ok(Some(snap))
            }
            None => Ok(None),
        }
    }

    async fn publish_snapshot(&self, snapshot: ToCSnapshot) -> Result<ToCSnapshot> {
        self.insert_snapshot_internal(&snapshot, true).await?;
        Ok(snapshot)
    }

    async fn list_attestations(&self) -> Result<Vec<LinkAttestation>> {
        let rows = sqlx::query("SELECT * FROM link_attestations ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await?;
        let mut out = Vec::new();
        for r in rows {
            let rel: String = r.try_get("relation")?;
            out.push(LinkAttestation {
                schema_version: r.try_get::<i32, _>("schema_version")? as u32,
                id: r.try_get("id")?,
                source_concept_id: r.try_get("source_concept_id")?,
                target_concept_id: r.try_get("target_concept_id")?,
                relation: match rel.as_str() {
                    "specializes" => AttestationRelation::Specializes,
                    "opposes" => AttestationRelation::Opposes,
                    _ => AttestationRelation::Synonym,
                },
                attester_actor_id: r.try_get("attester_actor_id")?,
                note: r.try_get("note")?,
                arweave_tx_id: r.try_get("arweave_tx_id")?,
                created_at: r.try_get("created_at")?,
            });
        }
        Ok(out)
    }

    async fn create_attestation(&self, att: LinkAttestation) -> Result<LinkAttestation> {
        let rel = match att.relation {
            AttestationRelation::Synonym => "synonym",
            AttestationRelation::Specializes => "specializes",
            AttestationRelation::Opposes => "opposes",
        };
        sqlx::query(
            r#"
            INSERT INTO link_attestations (id, schema_version, source_concept_id, target_concept_id, relation, attester_actor_id, note, arweave_tx_id, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            "#,
        )
        .bind(&att.id)
        .bind(att.schema_version as i32)
        .bind(&att.source_concept_id)
        .bind(&att.target_concept_id)
        .bind(rel)
        .bind(&att.attester_actor_id)
        .bind(&att.note)
        .bind(&att.arweave_tx_id)
        .bind(att.created_at)
        .execute(&self.pool)
        .await?;
        Ok(att)
    }

    async fn upsert_user(&self, user: UserRecord) -> Result<UserRecord> {
        sqlx::query(
            r#"
            INSERT INTO users (id, email, x_user_id, x_handle, github_user_id, github_handle, display_name, arweave_pubkey, encrypted_key_blob, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                x_handle = COALESCE(EXCLUDED.x_handle, users.x_handle),
                github_handle = COALESCE(EXCLUDED.github_handle, users.github_handle)
            "#,
        )
        .bind(&user.id)
        .bind(&user.email)
        .bind(&user.x_user_id)
        .bind(&user.x_handle)
        .bind(&user.github_user_id)
        .bind(&user.github_handle)
        .bind(&user.display_name)
        .bind(&user.arweave_pubkey)
        .bind(&user.encrypted_key_blob)
        .bind(user.created_at)
        .execute(&self.pool)
        .await?;
        Ok(user)
    }

    async fn get_user_by_id(&self, id: &str) -> Result<Option<UserRecord>> {
        let row = sqlx::query("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_user).transpose()
    }

    async fn find_user_by_email(&self, email: &str) -> Result<Option<UserRecord>> {
        let row = sqlx::query("SELECT * FROM users WHERE LOWER(email) = LOWER($1)")
            .bind(email)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_user).transpose()
    }

    async fn find_user_by_x(&self, x_user_id: &str) -> Result<Option<UserRecord>> {
        let row = sqlx::query("SELECT * FROM users WHERE x_user_id = $1")
            .bind(x_user_id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_user).transpose()
    }

    async fn find_user_by_github(&self, github_user_id: &str) -> Result<Option<UserRecord>> {
        let row = sqlx::query("SELECT * FROM users WHERE github_user_id = $1")
            .bind(github_user_id)
            .fetch_optional(&self.pool)
            .await?;
        row.as_ref().map(Self::row_to_user).transpose()
    }

    async fn create_session(&self, user_id: &str, token_hash: &str, expires_at: DateTime<Utc>) -> Result<()> {
        let sid = format!("ses_{}", uuid::Uuid::new_v4().simple());
        sqlx::query("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1,$2,$3,$4)")
            .bind(sid)
            .bind(user_id)
            .bind(token_hash)
            .bind(expires_at)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn get_user_by_session_hash(&self, token_hash: &str) -> Result<Option<UserRecord>> {
        let row = sqlx::query(
            "SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW()",
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?;
        row.as_ref().map(Self::row_to_user).transpose()
    }

    async fn delete_session_hash(&self, token_hash: &str) -> Result<()> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = $1")
            .bind(token_hash)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn pop_pending_outbox(&self, limit: usize) -> Result<Vec<OutboxItem>> {
        let rows = sqlx::query(
            "SELECT id, record_type, record_id, actor_id, root_concept_id, prev_tx_id, payload_json, status, arweave_tx_id FROM arweave_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1",
        )
        .bind(limit as i64)
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::new();
        for r in rows {
            out.push(OutboxItem {
                id: r.try_get("id")?,
                envelope: PublishEnvelope {
                    record_type: r.try_get("record_type")?,
                    record_id: r.try_get("record_id")?,
                    actor_id: r.try_get("actor_id")?,
                    root_concept_id: r.try_get("root_concept_id")?,
                    prev_tx_id: r.try_get("prev_tx_id")?,
                    payload: r.try_get("payload_json")?,
                },
                status: r.try_get("status")?,
                arweave_tx_id: r.try_get("arweave_tx_id")?,
            });
        }
        Ok(out)
    }

    async fn mark_outbox_published(
        &self,
        outbox_id: &str,
        record_type: &str,
        record_id: &str,
        tx_id: &str,
    ) -> Result<()> {
        sqlx::query("UPDATE arweave_outbox SET status = 'published', arweave_tx_id = $1, updated_at = NOW() WHERE id = $2")
            .bind(tx_id)
            .bind(outbox_id)
            .execute(&self.pool)
            .await?;
        match record_type {
            "concept" => {
                sqlx::query("UPDATE concepts SET arweave_tx_id = $1 WHERE id = $2")
                    .bind(tx_id)
                    .bind(record_id)
                    .execute(&self.pool)
                    .await?;
            }
            "toc_snapshot" => {
                sqlx::query("UPDATE toc_snapshots SET arweave_tx_id = $1 WHERE id = $2")
                    .bind(tx_id)
                    .bind(record_id)
                    .execute(&self.pool)
                    .await?;
            }
            "link_attestation" => {
                sqlx::query("UPDATE link_attestations SET arweave_tx_id = $1 WHERE id = $2")
                    .bind(tx_id)
                    .bind(record_id)
                    .execute(&self.pool)
                    .await?;
            }
            _ => {}
        }
        Ok(())
    }

    async fn mark_outbox_failed(&self, outbox_id: &str, err: &str) -> Result<()> {
        sqlx::query("UPDATE arweave_outbox SET status = 'failed', attempts = attempts + 1, last_error = $1, updated_at = NOW() WHERE id = $2")
            .bind(err)
            .bind(outbox_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
