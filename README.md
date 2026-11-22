# `toc.open` — AI Safety Theory of Change Tracker

An open-source, open-data platform for mapping, comparing, and stress-testing Theories of Change across the AI Safety community.

## Why This Exists

AI Safety theories of change are currently scattered across LessWrong essays, podcasts, org "About" pages, and private conversations — making it hard to see:
1. **Why** two researchers who agree on the threat model are working on completely different agendas.
2. **Where** they actually disagree (their load-bearing **cruxes**).
3. **What observable evidence** would make them update their credences or pivot their bets (**update criteria**).

## Key Features

- **5-Stage Shared Causal Spine (`Premise → Bottleneck → Intervention → Bet → Outcome`):** Keeps any two ToCs structurally alignable without forcing a rigid top-down ontology.
- **Composable & Forkable Community Concepts:** Pull canonical community claims or fork them into your own phrasing while retaining a `root_concept_id` lineage link for field-wide aggregation.
- **Side-by-Side Crux Diff (`/compare`):** Overlay any two actors to instantly highlight Shared Ground, Sharpest Cruxes, Unaddressed load-bearing assumptions, and diverging downstream Bets — with 1-click dynamic OpenGraph PNG cards.
- **Multi-Lens Views:** Never locked into flowcharts — view any ToC as a **5-column Flowchart**, **Editorial Brief**, **Update Criteria Watchlist**, or **Epistemic Changelog**, and view comparisons as **Flowchart**, **Matrix**, or **Split**.
- **Opinionated Epistemic Norms:**
  - Qualitative credences (`Very Low` – `Very High`) by default; opting into exact `%` requires a written justification.
  - At least **1 concrete `IF → THEN` Update Criterion** is required to publish.
- **Zero-Blank-Canvas Studio (`/studio`):** Fork an archetype or public actor, paste a link/paragraph for AI-assisted drafting, or step through coding-agent-style **`A / B / C / Other`** community suggestions with a live assembling flowchart.
- **Open, Permanent Data Layer:** Live PostgreSQL index + async Arweave dual-write (`toc-schema/v1`) via a pluggable `StorageAdapter` trait + free public JSON/Markdown API.

## Architecture

- **`crates/toc-core`** — Pure Rust domain types (`toc-schema/v1`), strict validation, deterministic 2-actor diff & crux ranking engine, Markdown/JSON export, and seed data.
- **`crates/toc-storage`** — `StorageAdapter` trait, standardized Arweave ANS-104 tags, `TurboArweaveAdapter`, `LocalMockAdapter`, and Ed25519 user keypair provisioning.
- **`crates/toc-server`** — Single-binary Rust `axum` server hosting the free public REST API, PostgreSQL (`sqlx`) repository (with zero-config `MemoryRepo` dev fallback), background Arweave outbox worker, X/GitHub/email auth, and `resvg` dynamic OG PNG card renderer.
- **`web/`** — Minimal Vite + React + TypeScript + Tailwind CSS + `@xyflow/react` frontend with swappable editorial design tokens in `web/src/styles/tokens.css`.

## Quick Start

### 1. Run Backend (Zero-Config Local Mode or PostgreSQL)
```bash
# Zero-config (in-memory seeded with 6 AI Safety ToCs + ~30 canonical concepts)
cargo run -p toc-server

# Or with PostgreSQL (auto-runs migrations/0001_init.sql and seeds if empty)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/toc_open cargo run -p toc-server
```

### 2. Run Frontend
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173`. For production, `npm run build` compiles `web/dist` which `toc-server` serves directly as a single binary with SSR-injected OpenGraph meta tags!

## Open Public API (Free, No Auth Required)

- `GET /api/v1/actors` — List all actors & summaries
- `GET /api/v1/actors/:handle` — Full profile, versions & concept dictionary
- `GET /api/v1/actors/:handle/export?format=json|markdown` — Portable export
- `GET /api/v1/compare?a=:handleA&b=:handleB` — Full crux diff & overlap score
- `GET /api/v1/cruxes` — Most contested field-wide cruxes
- `GET /api/v1/concepts/:rootId` — 5-band credence spectrum, forks & community watchlist
- `GET /og/compare?a=:handleA&b=:handleB` — Dynamic 1200×630 PNG diff card

## Contributing & Open Bounties

We want this to be community-owned and actively built by AI Safety practitioners and OSS engineers! See [CONTRIBUTING.md](CONTRIBUTING.md) and our pre-seeded bounty ideas in [`.github/bounties/`](.github/bounties/).

## License

MIT
