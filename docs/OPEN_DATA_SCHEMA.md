# `toc-schema/v1` — Open Data & Public Read API

Every `Concept`, `ToCSnapshot`, and `LinkAttestation` published on **[toctracker.com](https://toctracker.com)** conforms to a versioned, immutable JSON schema designed for free remixing and permanent archiving on Arweave via ArDrive Turbo (ANS-104).

---

## Free CORS-Open Read API (No Auth Required)

Base URL: `https://toctracker.com`

| Endpoint | Description |
| :--- | :--- |
| `GET /api/v1/actors` | List all mapped actors/orgs (supports `?q=`, `?tag=`, `?kind=`, `?status=`) |
| `GET /api/v1/actors/{handle}` | Full actor profile, versioned snapshots, nodes, edges, citations, and update criteria |
| `GET /api/v1/actors/{handle}/export?format=json` | Single-file `toc-schema/v1` JSON export (`?format=markdown` also supported) |
| `GET /api/v1/compare?a={h1}&b={h2}` | Side-by-side diff, shared ground, earliest-split diagnostic, and ranked disagreements |
| `GET /api/v1/cruxes` | Contested field claims ranked by spread & stance split (supporters vs. skeptics) |
| `GET /api/v1/intelligence/field` | Neglected bottlenecks, sharpest fault-line pairs, cross-camp allies, and unfalsifiable hotspots |
| `GET /api/v1/concepts` | Canonical concept registry + forked phrasings with `root_concept_id` lineage |
| `GET /api/v1/concepts/{root_id}` | Every actor's credence & phrasing on a single root concept |

---

## Arweave Permanent Archive (ANS-104)

All records uploaded via `toc-storage` are Ed25519-signed ANS-104 DataItems carrying standardized discovery tags:

| Tag | Example Value |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `App-Name` | `toctracker` |
| `Schema-Version` | `1` |
| `Record-Type` | `concept` \| `toc_snapshot` \| `link_attestation` |
| `Record-Id` | `snp_01J...` |
| `Actor-Id` | `act_01J...` |
| `Root-Concept` | `cpt_root_timelines` *(for `concept` records)* |
| `Prev-Tx` | `<previous_arweave_tx_id>` *(for versioned snapshot chains)* |

### Querying Arweave Directly (`https://arweave.net/graphql`)

```graphql
{
  transactions(
    tags: [
      { name: "App-Name", values: ["toctracker"] }
      { name: "Schema-Version", values: ["1"] }
      { name: "Record-Type", values: ["toc_snapshot"] }
    ]
    first: 100
  ) {
    edges {
      node {
        id
        tags { name value }
      }
    }
  }
}
```

---

## Validation Invariants (`toc-core`)
- Exact numeric credences (`mode: "numeric"` or `percent != null`) **must** include `numeric_rationale` (≥ 10 characters).
- Every `ToCSnapshot` **must** include at least one concrete `UpdateCriterion` (`trigger` + `pivot_action`).
- `edges` must form a valid DAG over `nodes[].local_id`.
- Forked concepts reference `parent_concept_id` and preserve `root_concept_id` for lossless aggregation.
