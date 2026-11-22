-- toc.open PostgreSQL Schema (Live Index & Auth Store)
-- Source of truth for open records is toc-schema/v1 (mirrored to Arweave via arweave_outbox).

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    x_user_id TEXT UNIQUE,
    x_handle TEXT,
    github_user_id TEXT UNIQUE,
    github_handle TEXT,
    display_name TEXT NOT NULL,
    arweave_pubkey TEXT NOT NULL,
    encrypted_key_blob TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actors (
    id TEXT PRIMARY KEY,
    handle TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('individual', 'organization')),
    role_or_affiliation TEXT NOT NULL DEFAULT '',
    bio_url TEXT,
    avatar_initials TEXT NOT NULL DEFAULT 'AI',
    authorship_status TEXT NOT NULL CHECK (authorship_status IN ('self_authored', 'community_draft', 'claimed')),
    owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    verified_provider TEXT,
    verified_handle TEXT,
    arweave_pubkey TEXT,
    primary_snapshot_id TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actors_kind ON actors(kind);
CREATE INDEX IF NOT EXISTS idx_actors_status ON actors(authorship_status);

CREATE TABLE IF NOT EXISTS concepts (
    id TEXT PRIMARY KEY,
    schema_version INT NOT NULL DEFAULT 1,
    stage TEXT NOT NULL CHECK (stage IN ('premise', 'bottleneck', 'intervention', 'bet', 'outcome')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    parent_concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
    root_concept_id TEXT NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by_actor_id TEXT,
    arweave_tx_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concepts_stage ON concepts(stage);
CREATE INDEX IF NOT EXISTS idx_concepts_root ON concepts(root_concept_id);

CREATE TABLE IF NOT EXISTS toc_snapshots (
    id TEXT PRIMARY KEY,
    schema_version INT NOT NULL DEFAULT 1,
    actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    version INT NOT NULL,
    previous_snapshot_id TEXT REFERENCES toc_snapshots(id) ON DELETE SET NULL,
    authorship_mode TEXT NOT NULL CHECK (authorship_mode IN ('self_authored', 'community_draft')),
    summary TEXT NOT NULL,
    changelog_note TEXT,
    payload_json JSONB NOT NULL,
    arweave_tx_id TEXT,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (actor_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_actor ON toc_snapshots(actor_id, version DESC);

CREATE TABLE IF NOT EXISTS snapshot_nodes_index (
    snapshot_id TEXT NOT NULL REFERENCES toc_snapshots(id) ON DELETE CASCADE,
    actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    local_id TEXT NOT NULL,
    concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    root_concept_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    stance TEXT NOT NULL,
    band TEXT,
    percent SMALLINT,
    is_crux BOOLEAN NOT NULL DEFAULT FALSE,
    is_primary_snapshot BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (snapshot_id, local_id)
);

CREATE INDEX IF NOT EXISTS idx_sni_root ON snapshot_nodes_index(root_concept_id) WHERE is_primary_snapshot = TRUE;
CREATE INDEX IF NOT EXISTS idx_sni_actor ON snapshot_nodes_index(actor_id) WHERE is_primary_snapshot = TRUE;

CREATE TABLE IF NOT EXISTS link_attestations (
    id TEXT PRIMARY KEY,
    schema_version INT NOT NULL DEFAULT 1,
    source_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    target_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relation TEXT NOT NULL CHECK (relation IN ('synonym', 'specializes', 'opposes')),
    attester_actor_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    arweave_tx_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arweave_outbox (
    id TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    actor_id TEXT,
    root_concept_id TEXT,
    prev_tx_id TEXT,
    payload_json JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
    arweave_tx_id TEXT,
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON arweave_outbox(status, created_at) WHERE status = 'pending';
