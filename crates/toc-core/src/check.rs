use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

use crate::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckSeverity {
    Warning,
    Insight,
    Tip,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpistemicCheckItem {
    pub code: String,
    pub severity: CheckSeverity,
    pub title: String,
    pub detail: String,
    pub target_local_id: Option<String>,
    pub suggested_concept_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarConceptMatch {
    pub concept: Concept,
    pub similarity: f32,
}

/// Pure-Rust epistemic consistency & stress-test pass over a draft or published ToC.
pub fn run_epistemic_checks(
    nodes: &[SnapshotNode],
    edges: &[SnapshotEdge],
    criteria: &[UpdateCriterion],
    concepts: &[Concept],
    field_snapshots: &[ToCSnapshot],
) -> Vec<EpistemicCheckItem> {
    let mut items = Vec::new();
    let cmap: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();
    let active_nodes: Vec<&SnapshotNode> = nodes
        .iter()
        .filter(|n| matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux))
        .collect();

    if active_nodes.is_empty() {
        return items;
    }

    let mut outgoing: HashMap<&str, usize> = HashMap::new();
    let mut incoming: HashMap<&str, usize> = HashMap::new();
    for e in edges {
        *outgoing.entry(e.source_local_id.as_str()).or_default() += 1;
        *incoming.entry(e.target_local_id.as_str()).or_default() += 1;
    }

    let title_of = |n: &SnapshotNode| -> String {
        cmap.get(n.concept_id.as_str())
            .map(|c| c.title.clone())
            .unwrap_or_else(|| n.concept_id.clone())
    };

    // 1. Unfalsifiable Key Crux: load-bearing crux with no attached UpdateCriterion
    let tested_targets: HashSet<&str> = criteria
        .iter()
        .filter_map(|u| u.target_local_id.as_deref())
        .collect();
    for n in &active_nodes {
        if n.is_load_bearing_crux && !tested_targets.contains(n.local_id.as_str()) {
            items.push(EpistemicCheckItem {
                code: "unfalsifiable_crux".into(),
                severity: CheckSeverity::Warning,
                title: format!("No update criterion on \"{}\"", title_of(n)),
                detail: "Marked as a key crux, but nothing tests it yet. What would change your mind here?".into(),
                target_local_id: Some(n.local_id.clone()),
                suggested_concept_id: None,
            });
        }
    }

    // 2. Low-credence load-bearing intervention feeding a bet
    for n in &active_nodes {
        if n.stage == Stage::Intervention {
            if let Some(cred) = &n.credence {
                let score = cred.numeric_score();
                if score <= 45 {
                    items.push(EpistemicCheckItem {
                        code: "longshot_bet_dependency".into(),
                        severity: CheckSeverity::Insight,
                        title: format!("Bet rests on a {} intervention", cred.display_pill()),
                        detail: format!(
                            "\"{}\" is rated below 50%. Intentional longshot, or worth noting a fallback?",
                            title_of(n)
                        ),
                        target_local_id: Some(n.local_id.clone()),
                        suggested_concept_id: None,
                    });
                }
            }
        }
    }

    // 3. Disconnected premise/bottleneck or unsupported bet (only when >= 2 stages exist)
    let stages_present: HashSet<Stage> = active_nodes.iter().map(|n| n.stage).collect();
    if stages_present.len() >= 2 {
        for n in &active_nodes {
            if matches!(n.stage, Stage::Premise | Stage::Bottleneck)
                && outgoing.get(n.local_id.as_str()).copied().unwrap_or(0) == 0
            {
                items.push(EpistemicCheckItem {
                    code: "disconnected_premise".into(),
                    severity: CheckSeverity::Warning,
                    title: format!("\"{}\" isn't wired downstream", title_of(n)),
                    detail: "Drag from its right dot to connect it, or remove it if it doesn't drive your bet.".into(),
                    target_local_id: Some(n.local_id.clone()),
                    suggested_concept_id: None,
                });
                break; // Keep output concise (max 1 orphan warning)
            }
        }
    }

    // 4. Vague update criterion (no timeframe + very short trigger)
    for uc in criteria {
        if !uc.trigger.trim().is_empty()
            && uc.timeframe.as_deref().unwrap_or("").trim().is_empty()
            && uc.trigger.trim().len() < 42
        {
            items.push(EpistemicCheckItem {
                code: "vague_criterion".into(),
                severity: CheckSeverity::Tip,
                title: "Make your update criterion checkable".into(),
                detail: "Add a rough date (like Q4 2027) or clear threshold so you can check it later.".into(),
                target_local_id: uc.target_local_id.clone(),
                suggested_concept_id: None,
            });
            break;
        }
    }

    // 5. Missing common rival intervention (based on shared premises in the field)
    let my_concepts: HashSet<&str> = nodes.iter().map(|n| n.concept_id.as_str()).collect();
    let my_pb_roots: HashSet<&str> = nodes
        .iter()
        .filter(|n| matches!(n.stage, Stage::Premise | Stage::Bottleneck))
        .map(|n| {
            cmap.get(n.concept_id.as_str())
                .map(|c| c.root_concept_id.as_str())
                .unwrap_or(n.concept_id.as_str())
        })
        .collect();

    if !my_pb_roots.is_empty() {
        let mut rival_counts: HashMap<&str, usize> = HashMap::new();
        for snap in field_snapshots {
            let shares_pb = snap.nodes.iter().any(|n| {
                let root = cmap
                    .get(n.concept_id.as_str())
                    .map(|c| c.root_concept_id.as_str())
                    .unwrap_or(n.concept_id.as_str());
                my_pb_roots.contains(root)
            });
            if !shares_pb {
                continue;
            }
            for n in &snap.nodes {
                if n.stage == Stage::Intervention
                    && matches!(n.stance, NodeStance::Active)
                    && !my_concepts.contains(n.concept_id.as_str())
                {
                    let root = cmap
                        .get(n.concept_id.as_str())
                        .map(|c| c.root_concept_id.as_str())
                        .unwrap_or(n.concept_id.as_str());
                    if !my_concepts.contains(root) {
                        *rival_counts.entry(root).or_default() += 1;
                    }
                }
            }
        }
        if let Some((top_rival_id, _)) = rival_counts.into_iter().max_by_key(|(_, c)| *c) {
            if let Some(rival) = cmap.get(top_rival_id) {
                items.push(EpistemicCheckItem {
                    code: "missing_rival_stance".into(),
                    severity: CheckSeverity::Insight,
                    title: format!("Weigh in on \"{}\"?", rival.title),
                    detail: "People who share your premises bet on this. Adding your view (even if skeptical) makes comparisons clearer.".into(),
                    target_local_id: None,
                    suggested_concept_id: Some(rival.id.clone()),
                });
            }
        }
    }

    items.truncate(4);
    items
}

fn tokenize(s: &str) -> HashSet<String> {
    const STOP: &[&str] = &["the", "and", "for", "that", "with", "this", "from", "will", "into", "are"];
    s.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3 && !STOP.contains(w))
        .map(str::to_string)
        .collect()
}

/// Find canonical concepts with high token Jaccard overlap to prevent accidental duplicates.
pub fn find_similar_concepts(
    stage: Stage,
    draft_title: &str,
    concepts: &[Concept],
) -> Vec<SimilarConceptMatch> {
    let q_tokens = tokenize(draft_title);
    if q_tokens.len() < 2 {
        return Vec::new();
    }

    let mut matches = Vec::new();
    for c in concepts {
        if c.stage != stage || c.parent_concept_id.is_some() {
            continue;
        }
        if c.title.eq_ignore_ascii_case(draft_title.trim()) {
            continue;
        }
        let c_tokens = tokenize(&c.title);
        if c_tokens.is_empty() {
            continue;
        }
        let inter = q_tokens.intersection(&c_tokens).count();
        let union = q_tokens.union(&c_tokens).count();
        if union == 0 {
            continue;
        }
        let sim = inter as f32 / union as f32;
        if sim >= 0.34 {
            matches.push(SimilarConceptMatch {
                concept: c.clone(),
                similarity: (sim * 100.0).round() / 100.0,
            });
        }
    }

    matches.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    matches.truncate(2);
    matches
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::seed::build_seed_bundle;

    #[test]
    fn catches_unfalsifiable_crux_and_low_credence_bet() {
        let bundle = build_seed_bundle();
        let mut dario = bundle.snapshots.iter().find(|s| s.actor_id == "act_dario_amodei").unwrap().clone();
        // Set an intervention node to 40% to trigger longshot_bet_dependency
        if let Some(int_node) = dario.nodes.iter_mut().find(|n| n.stage == Stage::Intervention && n.stance == NodeStance::Active) {
            int_node.credence = Some(Credence::numeric(40, "Testing low-credence bet dependency detection."));
        }
        // Strip criteria to trigger unfalsifiable_crux
        let items = run_epistemic_checks(&dario.nodes, &dario.edges, &[], &bundle.concepts, &bundle.snapshots);
        assert!(items.iter().any(|i| i.code == "unfalsifiable_crux"));
        assert!(items.iter().any(|i| i.code == "longshot_bet_dependency"));
    }

    #[test]
    fn detects_near_duplicate_concept() {
        let bundle = build_seed_bundle();
        let m = find_similar_concepts(
            Stage::Bottleneck,
            "Alignment science is lagging behind capabilities",
            &bundle.concepts,
        );
        assert!(!m.is_empty());
        assert_eq!(m[0].concept.id, "cpt_root_alignment_behind");
    }
}
