# [toctracker.com](https://toctracker.com) — AI Safety Theory of Change Tracker

An open-source, open-data platform for mapping, comparing, and stress-testing Theories of Change across the AI Safety community.

Live site: **[https://toctracker.com](https://toctracker.com)** · Open Data & API docs: **[https://toctracker.com/data](https://toctracker.com/data)**

---

## Why This Exists

AI Safety theories of change are scattered across LessWrong posts, podcasts, org pages, and private conversations — making it hard to see:
1. **Why** two researchers who agree on the threat model are making completely different bets.
2. **Where** they actually split (their earliest load-bearing disagreement).
3. **What observable evidence** would change their minds (**update criteria**).

## Key Features

- **5-Stage Causal Spine (`Premise → Bottleneck → Intervention → Bet → Outcome`):** World-space resizable & fullscreen swimlane flowcharts keep any two maps alignable without forcing a rigid ontology.
- **Linear Written Positions & Influences:** Every profile pairs its flowchart with an optional **Markdown written essay** (*In Their Own Words*), **Influences & Key Reading** links, **Update Criteria** watchlist, and versioned **Changelog**.
- **Forkable Community Concepts:** Fork canonical claims into your own wording while keeping `root_concept_id` lineage so comparisons and field-wide stats still line up.
- **Side-by-Side Diff & Earliest-Split Diagnostic (`/compare`):** Overlay any two actors with purple/green/split-border ownership, an automatic earliest-split sentence, and dynamic 1200×630 OpenGraph PNG cards.
- **Field Disagreements, Blindspots & Fault Lines (`/cruxes`):** Pure-Rust graph analytics across all mapped actors surfacing contested claims, neglected bottlenecks, sharpest same-diagnosis/opposite-bet pairs, and cross-camp allies.
- **Opinionated Epistemic Guardrails:** Qualitative credences (`Very Low`–`Very High`) by default; exact `%` requires a written rationale (≥10 chars); every published map requires at least one concrete `IF → THEN` update criterion.
- **Studio + Quote-Locked AI Extraction & Stress-Testing (`/studio`):** Fork a template, paste URLs/text for quote-locked drafting (OpenRouter / Anthropic / OpenAI), or run the Silent Graph Linter & Deep Stress-Test for hidden assumptions and steelman objections.
- **Permanent Open Data Layer (`/data`):** Free CORS-open JSON/Markdown Read API + automatic **Arweave (ANS-104 Ed25519 via ArDrive Turbo)** archiving.

## Architecture

- **`crates/toc-core`** — Domain types (`toc-schema/v1`), strict epistemic validation, 2-actor diff & earliest-split engine, field intelligence analytics, silent graph linter, Markdown/JSON export, and seed bundle loader.
- **`crates/toc-storage`** — `StorageAdapter` trait, pure-Rust ANS-104 Ed25519 DataItem builder (`TurboArweaveAdapter`), `LocalMockAdapter`, and AES-256-GCM encryption at rest (`ring`) for user Ed25519 signing keys.
- **`crates/toc-server`** — Single-binary Rust `axum` server hosting the public REST API, PostgreSQL (`sqlx`) repository (with zero-config `MemoryRepo` fallback), background Arweave publisher, X/GitHub/Resend auth, SSRF/XSS/rate-limit protections, and `resvg` dynamic OG PNG cards.
- **`web/`** — Vite + React + TypeScript + Tailwind CSS + `@xyflow/react` frontend with editorial design tokens in `web/src/styles/tokens.css`.

## Quick Start

### 1. Run Backend (Zero-Config Local Mode or PostgreSQL)
```bash
# Zero-config (in-memory seeded with 26 AI Safety Theories of Change)
cargo run -p toc-server

# Or with PostgreSQL (auto-runs migrations/ and additively syncs seed-bundle.json)
DATABASE_URL=postgres://localhost:5432/toc_open cargo run -p toc-server
```

### 2. Run Frontend
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173`. For production, `npm run build` compiles `web/dist`, which `toc-server` serves directly as a single container ([Dockerfile](Dockerfile) · [docs/DEPLOY.md](docs/DEPLOY.md)).

## Free Open Read API

Full interactive docs & live Arweave archive explorer at **[toctracker.com/data](https://toctracker.com/data)** and [docs/OPEN_DATA_SCHEMA.md](docs/OPEN_DATA_SCHEMA.md):

- `GET /api/v1/actors` — List all mapped actors & summaries
- `GET /api/v1/actors/:handle` — Full profile, versions, essays, references & concepts
- `GET /api/v1/actors/:handle/export?format=json|markdown` — Portable single-file export
- `GET /api/v1/compare?a=:handleA&b=:handleB` — Side-by-side diff & earliest split
- `GET /api/v1/cruxes` — Contested field claims (supporters vs. skeptics)
- `GET /api/v1/intelligence/field` — Blindspots, fault lines & cross-camp allies
- `GET /api/v1/archive/records` — Live Arweave TX verification index
- `GET /og/compare?a=:handleA&b=:handleB` — Dynamic 1200×630 PNG comparison card

## Contributing & Security

- See [CONTRIBUTING.md](CONTRIBUTING.md) and open feature/data requests in **GitHub Issues**.
- Security disclosures: see [SECURITY.md](SECURITY.md).

## License

MIT
