use serde::{Deserialize, Serialize};
use crate::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeedBundle {
    pub concepts: Vec<Concept>,
    pub actors: Vec<Actor>,
    pub snapshots: Vec<ToCSnapshot>,
    pub attestations: Vec<LinkAttestation>,
    pub archetypes: Vec<Archetype>,
}

const SEED_JSON: &str = include_str!("../../../seed/seed-bundle.json");

pub fn build_seed_bundle() -> SeedBundle {
    serde_json::from_str(SEED_JSON).expect("seed/seed-bundle.json must be valid SeedBundle JSON")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diff::{compute_field_cruxes, diff_snapshots};
    use crate::validate::{normalize_and_validate_snapshot, ValidationError};

    #[test]
    fn seed_snapshots_all_validate() {
        let mut bundle = build_seed_bundle();
        assert_eq!(bundle.actors.len(), 26, "expected all 26 seeded profiles");
        for snap in &mut bundle.snapshots {
            let sid = snap.id.clone();
            let res = normalize_and_validate_snapshot(snap);
            assert!(res.is_ok(), "seed snapshot {sid} failed validation: {res:?}");
        }
    }

    #[test]
    fn numeric_credence_requires_justification() {
        let bundle = build_seed_bundle();
        let mut snap = bundle.snapshots[0].clone();
        snap.nodes[0].credence = Some(Credence {
            mode: CredenceMode::Numeric,
            band: CredenceBand::High,
            percent: Some(72),
            percent_range: None,
            numeric_rationale: Some("too short".into()),
        });
        let errs = normalize_and_validate_snapshot(&mut snap).unwrap_err();
        assert!(errs
            .iter()
            .any(|e| matches!(e, ValidationError::MissingNumericRationale { .. })));
    }

    #[test]
    fn update_criterion_is_mandatory() {
        let bundle = build_seed_bundle();
        let mut snap = bundle.snapshots[0].clone();
        snap.update_criteria.clear();
        let errs = normalize_and_validate_snapshot(&mut snap).unwrap_err();
        assert!(errs.contains(&ValidationError::MissingUpdateCriterion));
    }

    #[test]
    fn diff_dario_vs_eliezer_finds_real_shared_and_disagreement_nodes() {
        let bundle = build_seed_bundle();
        let dario = bundle.snapshots.iter().find(|s| s.actor_id == "act_dario_amodei").unwrap();
        let eliezer = bundle.snapshots.iter().find(|s| s.actor_id == "act_eliezer_yudkowsky").unwrap();

        let diff = diff_snapshots(dario, eliezer, &bundle.concepts, &bundle.attestations);
        assert!(diff.summary.shared_ground_count >= 1, "expected shared premises/bottlenecks");
        assert!(!diff.top_cruxes.is_empty(), "expected clear disagreements");
    }

    #[test]
    fn field_cruxes_surfaces_real_multi_actor_disagreements() {
        let bundle = build_seed_bundle();
        let primary_snaps: Vec<ToCSnapshot> = bundle
            .actors
            .iter()
            .filter_map(|a| {
                a.primary_snapshot_id
                    .as_ref()
                    .and_then(|sid| bundle.snapshots.iter().find(|s| &s.id == sid).cloned())
            })
            .collect();
        let cruxes = compute_field_cruxes(&bundle.actors, &primary_snaps, &bundle.concepts, &bundle.attestations);
        assert!(cruxes.len() >= 5);
        assert!(
            cruxes.iter().any(|c| !c.supporters.is_empty() && !c.skeptics.is_empty()),
            "expected multi-actor disagreements with both supporters and skeptics"
        );
    }
}
