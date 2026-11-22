# `toc-schema/v1` — Open Data Format

Every `Concept`, `ToCSnapshot`, and `LinkAttestation` published on `toc.open` conforms to a versioned, immutable JSON schema designed for permanent storage on Arweave (or any content-addressed open store).

## Arweave Discovery Tags

All ANS-104 records uploaded via `toc-storage` carry standardized tags:

| Tag | Example Value |
| :--- | :--- |
| `Content-Type` | `application/json` |
| `App-Name` | `toc-open` |
| `Schema-Version` | `1` |
| `Record-Type` | `concept` \| `toc_snapshot` \| `link_attestation` |
| `Record-Id` | `snp_01J...` |
| `Actor-Id` | `act_01J...` |
| `Root-Concept` | `cpt_01J...` *(for `concept` records)* |
| `Prev-Tx` | `<previous_arweave_tx_id>` *(for snapshot chains)* |

## Sample GraphQL Query (Arweave Gateway)

```graphql
{
  transactions(
    tags: [
      { name: "App-Name", values: ["toc-open"] }
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

## Validation Invariants (`toc-core`)
- Exact numeric credences (`mode: "numeric"` or `percent != null`) **must** include `numeric_rationale` (≥ 10 characters).
- Every `ToCSnapshot` **must** include at least one `UpdateCriterion` (`trigger` + `pivot_action`).
- `edges` must form a valid DAG over `nodes[].local_id`.
- Forked concepts reference `parent_concept_id` and preserve `root_concept_id` for lossless aggregation.
