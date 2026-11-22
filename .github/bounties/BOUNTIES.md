# Bounty Ideas — Ready to Seed as GitHub Issues

These well-scoped features are intentionally pre-written to seed active open-source development on launch.

---

## Issue #1: `@toctracker` X (Twitter) Bot for Live Belief Updates
**Labels:** `bounty`, `growth`, `integrations`
**Goal:** Allow verified researchers to reply or post `@toctracker update "White-box interp scales" -> 35% because [reason]` or `@toctracker trigger uc_1 [link]` on X.
**Scope:**
- Listen for mentions via X API webhook/polling worker.
- Verify the X handle matches a verified `Actor` in `toc-server`.
- Create a draft next-version `ToCSnapshot` (or update criterion status change) and reply with a 1-click confirmation link + live diff OG card.

---

## Issue #2: Coding-Agent Harness Onboarding Mode
**Labels:** `bounty`, `studio`, `ai-assist`
**Goal:** Add an optional interactive conversational "agent harness" onboarding flow inside `/studio` that probes a researcher's assumptions with crisp `A / B / C / Other` multiple-choice follow-ups, surfaces hidden cruxes, and builds their 5-column flowchart live in real time.
**Scope:**
- Streaming tool-calling interview loop backed by `/api/v1/studio/agent`.
- Structured question cards rendered in the Studio left pane with keyboard navigation (`A`/`B`/`C`/`D`).

---

## Issue #3: "Things That Didn't Make the Cut & Why" Omission Explorer
**Labels:** `bounty`, `epistemics`, `ui`
**Goal:** Surface major AI Safety risk domains or interventions an actor did *not* include (e.g., cyber risk, biorisk, compute pause, formal methods) and let authors explain *why* they left them off their main chain.
**Scope:**
- `toc-schema/v1` already includes `omissions: Vec<Omission>` and `stance: Deprioritized`.
- Add a clean "Omissions & Scope" section on Actor Profiles + Studio prompt ("You didn't mention Cyber Risk or Compute Governance — want to add a 1-line note on why?").

---

## Issue #4: Standalone Pure-Arweave Re-Indexer CLI (`toc-indexer`)
**Labels:** `bounty`, `open-data`, `rust`
**Goal:** Build a standalone Rust binary (`crates/toc-indexer`) that queries public Arweave GraphQL gateways for `App-Name: toc-open` tags, verifies Ed25519 authorship signatures, and deterministically rebuilds the entire PostgreSQL index from scratch with zero reliance on the primary server.

---

## Issue #5: Live Metaculus & Manifold Forecast Embeds on Update Criteria
**Labels:** `bounty`, `forecasting`, `ui`
**Goal:** When an `UpdateCriterion` includes a Metaculus or Manifold Markets URL in `evidence_urls`, automatically fetch and display the live community probability badge directly inside the Inspector Drawer and Update Criteria Watchlist.

---

## Issue #6: N-Actor Comparison Heatmap Matrix
**Labels:** `bounty`, `visualization`, `compare`
**Goal:** Extend `/compare` to support comparing 3–10+ actors simultaneously in a compact editorial credence heatmap across top contested concepts (rows = canonical concepts, columns = actors, cells = color-coded credence bands + rejected markers).
