# Contributing to `toc.open`

Thank you for helping make AI Safety Theories of Change clearer, more comparable, and more falsifiable!

## Where to Start

Check [`.github/bounties/`](.github/bounties/) for scoped, high-impact features we intentionally left ready for contributors at launch:
1. **`@toctracker` X/Twitter Bot** — update credences & trigger update criteria right from X.
2. **Coding-Agent Harness Onboarding Mode** — interactive conversational agent interview mode.
3. **"Things That Didn't Make the Cut & Why"** — omission explorer & audit UI.
4. **Standalone Pure-Arweave Re-Indexer CLI** — rebuild the entire DB purely from Arweave GraphQL.
5. **Live Metaculus & Manifold Forecast Embeds** — show live probabilities on Update Criteria.
6. **N-Actor Comparison Heatmap Matrix** — compare 3–10+ orgs simultaneously.

## Dev Workflow

- **Rust tests:** `cargo test --workspace`
- **Frontend typecheck & build:** `npm --prefix web run build`
- **Aesthetic & Typography tweaks:** Edit `web/src/styles/tokens.css` — all colors, fonts, and radii live there.
- **Schema changes:** Update `crates/toc-core/src/model.rs`, bump `CURRENT_SCHEMA_VERSION` if breaking, and update `docs/OPEN_DATA_SCHEMA.md`.
