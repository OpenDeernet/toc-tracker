# [toctracker.com](https://toctracker.com) — AI Safety Theory of Change Tracker

Open-source, open-data tracker for AI Safety Theories of Change.

Live site: **[https://toctracker.com](https://toctracker.com)** · Open Data & API: **[https://toctracker.com/data](https://toctracker.com/data)** · Agent spec: **[https://toctracker.com/llms.txt](https://toctracker.com/llms.txt)**

---

## Why This Exists

AI Safety theories of change live across LessWrong posts, podcasts, org pages, and private docs. That makes three simple questions weirdly hard to answer:
1. **Why** do two researchers who agree on the threat model make totally different bets?
2. **Where** do they actually split?
3. **What** would change their minds?

## What's Inside

- **Five-stage flowcharts (`Premise → Bottleneck → Intervention → Bet → Outcome`):** Every map uses the same 5 columns so any two maps line up without forcing everyone into identical wording.
- **Profiles, written positions & reading lists:** Each profile can include a one-line stance, a Markdown write-up (*In Their Own Words*), *Influences & Key Reading* links, *Update Criteria*, and version history.
- **Forked claims:** Edit any existing claim into your own wording while keeping its `root_concept_id` so comparisons still match up.
- **Side-by-side diff (`/compare`):** Overlay any two actors (purple vs. green, split border when shared), see the earliest point they diverge, and share dynamic 1200×630 PNG cards.
- **Disagreements, blindspots & fault lines (`/cruxes`):** Find contested claims, bottlenecks people agree on with few working on them, pairs with the same diagnosis and opposite bets, and cross-camp overlap.
- **Credence & update checks:** Qualitative bands (`Very Low`–`Very High`) by default; exact `%` numbers require a short note (10+ chars); every published flowchart requires at least one `IF → THEN` update criterion.
- **Studio (`/studio`):** Build from scratch, fork an existing map, paste URLs/text to draft claims with quotes, or run a stress-test on your draft.
- **Open data & Arweave archive (`/data`):** Free CORS-open JSON/Markdown API, `/llms.txt` for agents, and automatic **Arweave (ANS-104 Ed25519 via ArDrive Turbo)** archiving.

## Repo Layout

- **`crates/toc-core`** — Schema (`toc-schema/v1`), validation, 2-actor diff, field stats, graph checks, Markdown/JSON export, and seed loader.
- **`crates/toc-storage`** — `StorageAdapter` trait, pure-Rust ANS-104 Ed25519 DataItem builder (`TurboArweaveAdapter`), `LocalMockAdapter`, and AES-256-GCM encryption (`ring`) for signing keys.
- **`crates/toc-server`** — Single-binary Rust `axum` server (REST API, Postgres `sqlx` + in-memory fallback, background Arweave publisher, X/GitHub/Resend auth, SSRF/XSS/rate-limit guards, and `resvg` OG PNG cards).
- **`web/`** — Vite + React + TypeScript + Tailwind CSS + `@xyflow/react` frontend.

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
