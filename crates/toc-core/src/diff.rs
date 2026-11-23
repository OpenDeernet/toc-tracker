use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

use crate::model::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiffCategory {
    SharedGround,
    DirectCruxDisagreement,
    UniqueToA,
    UniqueToB,
    UnaddressedLoadBearing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffNode {
    pub cluster_id: String,
    pub canonical_title: String,
    pub stage: Stage,
    pub category: DiffCategory,
    pub crux_score: f32,
    pub credence_delta: Option<i32>,
    pub node_a: Option<SnapshotNode>,
    pub node_b: Option<SnapshotNode>,
    pub concept_a_title: Option<String>,
    pub concept_b_title: Option<String>,
    pub update_criteria_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffEdge {
    pub id: String,
    pub source_cluster_id: String,
    pub target_cluster_id: String,
    pub owner: EdgeOwner,
    pub relation: Option<EdgeRelation>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeOwner {
    Shared,
    ActorA,
    ActorB,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarliestSplit {
    pub stage: Stage,
    pub cluster_id: String,
    pub title: String,
    pub actor_a_position: String,
    pub actor_b_position: String,
    pub sentence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub shared_ground_count: usize,
    pub crux_disagreement_count: usize,
    pub unaddressed_count: usize,
    pub premise_bottleneck_overlap_pct: u8,
    pub headline: String,
    pub earliest_split: Option<EarliestSplit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub actor_a_id: String,
    pub actor_b_id: String,
    pub snapshot_a_id: String,
    pub snapshot_b_id: String,
    pub summary: DiffSummary,
    pub nodes: Vec<DiffNode>,
    pub edges: Vec<DiffEdge>,
    pub top_cruxes: Vec<DiffNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActorStanceChip {
    pub actor_id: String,
    pub handle: String,
    pub display_name: String,
    pub avatar_initials: String,
    pub credence_label: String,
    pub score: i32,
    pub is_rejected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldCruxSummary {
    pub root_concept_id: String,
    pub title: String,
    pub stage: Stage,
    pub actor_count: usize,
    pub active_count: usize,
    pub rejected_count: usize,
    pub mean_score: f32,
    pub spread: i32,
    pub contested_score: f32,
    pub distribution: [usize; 5], // VeryLow..VeryHigh
    pub tags: Vec<String>,
    pub supporters: Vec<ActorStanceChip>,
    pub skeptics: Vec<ActorStanceChip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConceptActorPosition {
    pub actor_id: String,
    pub handle: String,
    pub display_name: String,
    pub avatar_initials: String,
    pub authorship_status: AuthorshipStatus,
    pub concept_id: String,
    pub concept_title: String,
    pub is_fork: bool,
    pub stance: NodeStance,
    pub is_load_bearing_crux: bool,
    pub credence: Option<Credence>,
    pub note: Option<String>,
    pub update_criteria: Vec<UpdateCriterion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConceptSpectrum {
    pub root_concept: Concept,
    pub forks: Vec<Concept>,
    pub positions: Vec<ConceptActorPosition>,
    pub distribution: [usize; 5],
}

/// Union-find cluster resolver mapping concept IDs -> canonical cluster root ID
pub struct ClusterResolver {
    parent: HashMap<String, String>,
    concepts: HashMap<String, Concept>,
}

impl ClusterResolver {
    pub fn new(concepts: &[Concept], attestations: &[LinkAttestation]) -> Self {
        let mut parent = HashMap::new();
        let mut concept_map = HashMap::new();

        for c in concepts {
            concept_map.insert(c.id.clone(), c.clone());
            parent.insert(c.id.clone(), c.root_concept_id.clone());
            parent
                .entry(c.root_concept_id.clone())
                .or_insert_with(|| c.root_concept_id.clone());
        }

        let mut resolver = Self {
            parent,
            concepts: concept_map,
        };

        for att in attestations {
            if att.relation == AttestationRelation::Synonym {
                resolver.union(&att.source_concept_id, &att.target_concept_id);
            }
        }

        resolver
    }

    pub fn find(&mut self, id: &str) -> String {
        if !self.parent.contains_key(id) {
            self.parent.insert(id.to_string(), id.to_string());
            return id.to_string();
        }
        let p = self.parent[id].clone();
        if p == id {
            return p;
        }
        let root = self.find(&p);
        self.parent.insert(id.to_string(), root.clone());
        root
    }

    fn union(&mut self, a: &str, b: &str) {
        let ra = self.find(a);
        let rb = self.find(b);
        if ra != rb {
            // Deterministic tie-break so root IDs are stable
            if ra < rb {
                self.parent.insert(rb, ra);
            } else {
                self.parent.insert(ra, rb);
            }
        }
    }

    pub fn title_for(&self, id: &str) -> String {
        self.concepts
            .get(id)
            .map(|c| c.title.clone())
            .unwrap_or_else(|| id.to_string())
    }
}

pub fn diff_snapshots(
    a: &ToCSnapshot,
    b: &ToCSnapshot,
    concepts: &[Concept],
    attestations: &[LinkAttestation],
) -> DiffResult {
    let mut resolver = ClusterResolver::new(concepts, attestations);

    let mut map_a: HashMap<String, SnapshotNode> = HashMap::new();
    let mut local_to_cluster_a: HashMap<String, String> = HashMap::new();
    for n in &a.nodes {
        let cid = resolver.find(&n.concept_id);
        local_to_cluster_a.insert(n.local_id.clone(), cid.clone());
        map_a.entry(cid).or_insert_with(|| n.clone());
    }

    let mut map_b: HashMap<String, SnapshotNode> = HashMap::new();
    let mut local_to_cluster_b: HashMap<String, String> = HashMap::new();
    for n in &b.nodes {
        let cid = resolver.find(&n.concept_id);
        local_to_cluster_b.insert(n.local_id.clone(), cid.clone());
        map_b.entry(cid).or_insert_with(|| n.clone());
    }

    // Count update criteria attached per cluster across A and B
    let mut uc_counts: HashMap<String, usize> = HashMap::new();
    for uc in &a.update_criteria {
        if let Some(tid) = &uc.target_local_id {
            if let Some(cid) = local_to_cluster_a.get(tid) {
                *uc_counts.entry(cid.clone()).or_default() += 1;
            }
        }
    }
    for uc in &b.update_criteria {
        if let Some(tid) = &uc.target_local_id {
            if let Some(cid) = local_to_cluster_b.get(tid) {
                *uc_counts.entry(cid.clone()).or_default() += 1;
            }
        }
    }

    let mut all_clusters: Vec<String> = map_a
        .keys()
        .chain(map_b.keys())
        .cloned()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    all_clusters.sort();

    let mut diff_nodes = Vec::new();
    let mut shared_pb = 0usize;
    let mut total_pb = 0usize;

    for cid in all_clusters {
        let na = map_a.get(&cid).cloned();
        let nb = map_b.get(&cid).cloned();

        let stage = na
            .as_ref()
            .or(nb.as_ref())
            .map(|n| n.stage)
            .unwrap_or(Stage::Premise);

        let title_a = na.as_ref().map(|n| resolver.title_for(&n.concept_id));
        let title_b = nb.as_ref().map(|n| resolver.title_for(&n.concept_id));
        let canonical_title = resolver
            .concepts
            .get(&cid)
            .map(|c| c.title.clone())
            .or_else(|| title_a.clone())
            .or_else(|| title_b.clone())
            .unwrap_or_else(|| cid.clone());

        let is_pb = matches!(stage, Stage::Premise | Stage::Bottleneck);
        let active_a = na
            .as_ref()
            .map(|n| matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux))
            .unwrap_or(false);
        let active_b = nb
            .as_ref()
            .map(|n| matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux))
            .unwrap_or(false);

        if is_pb && (active_a || active_b) {
            total_pb += 1;
        }

        let (category, delta, crux_score) = match (&na, &nb) {
            (Some(xa), Some(xb)) => {
                let score_a = xa.credence.as_ref().map(|c| c.numeric_score());
                let score_b = xb.credence.as_ref().map(|c| c.numeric_score());
                let delta = match (score_a, score_b) {
                    (Some(sa), Some(sb)) => Some((sa - sb).abs()),
                    _ => None,
                };
                let stance_opposed = (matches!(xa.stance, NodeStance::Active | NodeStance::OpenCrux)
                    && matches!(xb.stance, NodeStance::Rejected | NodeStance::Deprioritized))
                    || (matches!(xb.stance, NodeStance::Active | NodeStance::OpenCrux)
                        && matches!(xa.stance, NodeStance::Rejected | NodeStance::Deprioritized));
                let large_delta = delta.map(|d| d >= 25).unwrap_or(false);

                if stance_opposed || large_delta {
                    let mut score = delta.unwrap_or(30) as f32 / 100.0;
                    if xa.is_load_bearing_crux || xb.is_load_bearing_crux {
                        score += 0.4;
                    }
                    if stance_opposed {
                        score += 0.35;
                    }
                    if stage == Stage::Intervention {
                        score += 0.15;
                    }
                    (DiffCategory::DirectCruxDisagreement, delta, score)
                } else {
                    if is_pb && active_a && active_b {
                        shared_pb += 1;
                    }
                    (DiffCategory::SharedGround, delta, 0.0)
                }
            }
            (Some(xa), None) => {
                let is_unaddressed = xa.is_load_bearing_crux
                    && matches!(xa.stance, NodeStance::Active | NodeStance::OpenCrux);
                if is_unaddressed {
                    (DiffCategory::UnaddressedLoadBearing, None, 0.45)
                } else {
                    (DiffCategory::UniqueToA, None, 0.1)
                }
            }
            (None, Some(xb)) => {
                let is_unaddressed = xb.is_load_bearing_crux
                    && matches!(xb.stance, NodeStance::Active | NodeStance::OpenCrux);
                if is_unaddressed {
                    (DiffCategory::UnaddressedLoadBearing, None, 0.45)
                } else {
                    (DiffCategory::UniqueToB, None, 0.1)
                }
            }
            (None, None) => continue,
        };

        diff_nodes.push(DiffNode {
            cluster_id: cid.clone(),
            canonical_title,
            stage,
            category,
            crux_score,
            credence_delta: delta,
            node_a: na,
            node_b: nb,
            concept_a_title: title_a,
            concept_b_title: title_b,
            update_criteria_count: uc_counts.get(&cid).copied().unwrap_or(0),
        });
    }

    // Sort nodes cleanly by stage, then crux_score desc, then title
    diff_nodes.sort_by(|x, y| {
        x.stage
            .cmp(&y.stage)
            .then_with(|| {
                y.crux_score
                    .partial_cmp(&x.crux_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| x.canonical_title.cmp(&y.canonical_title))
    });

    // Merge edges by (source_cluster_id, target_cluster_id)
    let mut edge_map: HashMap<(String, String), DiffEdge> = HashMap::new();
    for e in &a.edges {
        if let (Some(sc), Some(tc)) = (
            local_to_cluster_a.get(&e.source_local_id),
            local_to_cluster_a.get(&e.target_local_id),
        ) {
            edge_map.insert(
                (sc.clone(), tc.clone()),
                DiffEdge {
                    id: format!("de_{}_{}", sc, tc),
                    source_cluster_id: sc.clone(),
                    target_cluster_id: tc.clone(),
                    owner: EdgeOwner::ActorA,
                    relation: e.relation,
                    note: e.note.clone(),
                },
            );
        }
    }
    for e in &b.edges {
        if let (Some(sc), Some(tc)) = (
            local_to_cluster_b.get(&e.source_local_id),
            local_to_cluster_b.get(&e.target_local_id),
        ) {
            let key = (sc.clone(), tc.clone());
            if let Some(existing) = edge_map.get_mut(&key) {
                existing.owner = EdgeOwner::Shared;
            } else {
                edge_map.insert(
                    key,
                    DiffEdge {
                        id: format!("de_{}_{}", sc, tc),
                        source_cluster_id: sc.clone(),
                        target_cluster_id: tc.clone(),
                        owner: EdgeOwner::ActorB,
                        relation: e.relation,
                        note: e.note.clone(),
                    },
                );
            }
        }
    }
    let mut diff_edges: Vec<DiffEdge> = edge_map.into_values().collect();
    diff_edges.sort_by(|x, y| x.id.cmp(&y.id));

    let shared_ground_count = diff_nodes
        .iter()
        .filter(|n| n.category == DiffCategory::SharedGround)
        .count();
    let crux_disagreement_count = diff_nodes
        .iter()
        .filter(|n| n.category == DiffCategory::DirectCruxDisagreement)
        .count();
    let unaddressed_count = diff_nodes
        .iter()
        .filter(|n| n.category == DiffCategory::UnaddressedLoadBearing)
        .count();

    let mut top_cruxes: Vec<DiffNode> = diff_nodes
        .iter()
        .filter(|n| {
            matches!(
                n.category,
                DiffCategory::DirectCruxDisagreement | DiffCategory::UnaddressedLoadBearing
            )
        })
        .cloned()
        .collect();
    top_cruxes.sort_by(|x, y| {
        y.crux_score
            .partial_cmp(&x.crux_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let overlap_pct = if total_pb == 0 {
        0
    } else {
        ((shared_pb as f32 / total_pb as f32) * 100.0).round() as u8
    };

    let point_word = if shared_ground_count == 1 {
        "point"
    } else {
        "points"
    };
    let headline = if let Some(top) = top_cruxes.first() {
        if shared_ground_count > 0 {
            format!(
                "Agree on {} {}; main disagreement is \"{}\"",
                shared_ground_count, point_word, top.canonical_title
            )
        } else {
            format!("Main disagreement: \"{}\"", top.canonical_title)
        }
    } else if shared_ground_count > 0 {
        format!(
            "Agree on {} {}, with different day-to-day bets",
            shared_ground_count, point_word
        )
    } else {
        "Different threat models and approaches".to_string()
    };

    let earliest_split = Stage::all().into_iter().find_map(|st| {
        let candidate = diff_nodes
            .iter()
            .find(|n| n.stage == st && n.category == DiffCategory::DirectCruxDisagreement)
            .or_else(|| {
                diff_nodes
                    .iter()
                    .find(|n| n.stage == st && n.category == DiffCategory::UnaddressedLoadBearing)
            })?;

        let pos_label = |node_opt: &Option<SnapshotNode>| -> String {
            match node_opt {
                None => "Not in map".into(),
                Some(n) => {
                    let is_rej = matches!(n.stance, NodeStance::Rejected | NodeStance::Deprioritized);
                    let cred = n
                        .credence
                        .as_ref()
                        .map(|c| c.display_pill())
                        .unwrap_or_else(|| "Active".into());
                    if is_rej {
                        format!("Skeptical ({cred})")
                    } else {
                        cred
                    }
                }
            }
        };
        let pos_a = pos_label(&candidate.node_a);
        let pos_b = pos_label(&candidate.node_b);

        let shared_upstream: Vec<&str> = diff_nodes
            .iter()
            .filter(|n| n.category == DiffCategory::SharedGround && n.stage < st)
            .map(|n| n.canonical_title.as_str())
            .take(2)
            .collect();

        let sentence = if !shared_upstream.is_empty() {
            format!(
                "Agree upstream on {}, then split at {} over \"{}\" ({} vs {}).",
                shared_upstream
                    .iter()
                    .map(|t| format!("\"{t}\""))
                    .collect::<Vec<_>>()
                    .join(" & "),
                st.label(),
                candidate.canonical_title,
                pos_a,
                pos_b
            )
        } else {
            format!(
                "Earliest split at {} over \"{}\" ({} vs {}).",
                st.label(),
                candidate.canonical_title,
                pos_a,
                pos_b
            )
        };

        Some(EarliestSplit {
            stage: st,
            cluster_id: candidate.cluster_id.clone(),
            title: candidate.canonical_title.clone(),
            actor_a_position: pos_a,
            actor_b_position: pos_b,
            sentence,
        })
    });

    DiffResult {
        actor_a_id: a.actor_id.clone(),
        actor_b_id: b.actor_id.clone(),
        snapshot_a_id: a.id.clone(),
        snapshot_b_id: b.id.clone(),
        summary: DiffSummary {
            shared_ground_count,
            crux_disagreement_count,
            unaddressed_count,
            premise_bottleneck_overlap_pct: overlap_pct,
            headline,
            earliest_split,
        },
        nodes: diff_nodes,
        edges: diff_edges,
        top_cruxes,
    }
}

pub fn compute_field_cruxes(
    actors: &[Actor],
    snapshots: &[ToCSnapshot],
    concepts: &[Concept],
    attestations: &[LinkAttestation],
) -> Vec<FieldCruxSummary> {
    let mut resolver = ClusterResolver::new(concepts, attestations);
    let actor_map: HashMap<&str, &Actor> = actors.iter().map(|a| (a.id.as_str(), a)).collect();

    struct Agg {
        stage: Stage,
        scores: Vec<i32>,
        active_count: usize,
        rejected_count: usize,
        dist: [usize; 5],
        actors: HashSet<String>,
        supporters: Vec<ActorStanceChip>,
        skeptics: Vec<ActorStanceChip>,
    }

    let mut groups: HashMap<String, Agg> = HashMap::new();

    for snap in snapshots {
        let Some(actor) = actor_map.get(snap.actor_id.as_str()) else {
            continue;
        };
        for n in &snap.nodes {
            if matches!(n.stage, Stage::Bet | Stage::Outcome) {
                continue;
            }
            let cid = resolver.find(&n.concept_id);
            let entry = groups.entry(cid).or_insert_with(|| Agg {
                stage: n.stage,
                scores: Vec::new(),
                active_count: 0,
                rejected_count: 0,
                dist: [0; 5],
                actors: HashSet::new(),
                supporters: Vec::new(),
                skeptics: Vec::new(),
            });
            if !entry.actors.insert(snap.actor_id.clone()) {
                continue;
            }
            let is_rejected = matches!(n.stance, NodeStance::Rejected | NodeStance::Deprioritized);
            if is_rejected {
                entry.rejected_count += 1;
            } else {
                entry.active_count += 1;
            }

            let score = n.credence.as_ref().map(|c| c.numeric_score()).unwrap_or(50);
            let cred_label = n
                .credence
                .as_ref()
                .map(|c| c.display_pill())
                .unwrap_or_else(|| if is_rejected { "Skeptical".into() } else { "Likely".into() });

            if let Some(cred) = &n.credence {
                entry.scores.push(cred.numeric_score());
                let idx = match cred.band {
                    CredenceBand::VeryLow => 0,
                    CredenceBand::Low => 1,
                    CredenceBand::Medium => 2,
                    CredenceBand::High => 3,
                    CredenceBand::VeryHigh => 4,
                };
                entry.dist[idx] += 1;
            }

            let chip = ActorStanceChip {
                actor_id: actor.id.clone(),
                handle: actor.handle.clone(),
                display_name: actor.display_name.clone(),
                avatar_initials: actor.avatar_initials.clone(),
                credence_label: cred_label,
                score,
                is_rejected,
            };
            if is_rejected || score <= 35 {
                entry.skeptics.push(chip);
            } else {
                entry.supporters.push(chip);
            }
        }
    }

    let mut out = Vec::new();
    for (cid, mut agg) in groups {
        if agg.actors.len() < 2 {
            continue;
        }
        agg.supporters.sort_by(|a, b| b.score.cmp(&a.score));
        agg.skeptics.sort_by(|a, b| a.score.cmp(&b.score));

        let (mean, spread) = if agg.scores.is_empty() {
            (50.0, 0)
        } else {
            let min = *agg.scores.iter().min().unwrap();
            let max = *agg.scores.iter().max().unwrap();
            let sum: i32 = agg.scores.iter().sum();
            (sum as f32 / agg.scores.len() as f32, max - min)
        };
        let has_both_sides = !agg.supporters.is_empty() && !agg.skeptics.is_empty();
        let stance_tension = if has_both_sides { 35.0 } else { 0.0 };
        let contested_score = spread as f32 + stance_tension + (agg.actors.len() as f32 * 4.0);
        let root_concept = resolver.concepts.get(&cid);
        out.push(FieldCruxSummary {
            root_concept_id: cid.clone(),
            title: root_concept
                .map(|c| c.title.clone())
                .unwrap_or_else(|| cid.clone()),
            stage: agg.stage,
            actor_count: agg.actors.len(),
            active_count: agg.active_count,
            rejected_count: agg.rejected_count,
            mean_score: (mean * 10.0).round() / 10.0,
            spread,
            contested_score,
            distribution: agg.dist,
            tags: root_concept.map(|c| c.tags.clone()).unwrap_or_default(),
            supporters: agg.supporters,
            skeptics: agg.skeptics,
        });
    }

    out.sort_by(|a, b| {
        b.contested_score
            .partial_cmp(&a.contested_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    out
}

pub fn compute_concept_spectrum(
    root_id: &str,
    actors: &[Actor],
    snapshots: &[ToCSnapshot],
    concepts: &[Concept],
    attestations: &[LinkAttestation],
) -> Option<ConceptSpectrum> {
    let mut resolver = ClusterResolver::new(concepts, attestations);
    let canonical_root = resolver.find(root_id);

    let root_concept = concepts
        .iter()
        .find(|c| c.id == canonical_root)
        .or_else(|| concepts.iter().find(|c| c.id == root_id))?
        .clone();

    let forks: Vec<Concept> = concepts
        .iter()
        .filter(|c| c.id != root_concept.id && resolver.find(&c.id) == canonical_root)
        .cloned()
        .collect();

    let actor_map: HashMap<&str, &Actor> = actors.iter().map(|a| (a.id.as_str(), a)).collect();
    let concept_map: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();

    let mut positions = Vec::new();
    let mut distribution = [0usize; 5];

    for snap in snapshots {
        let Some(actor) = actor_map.get(snap.actor_id.as_str()) else {
            continue;
        };
        for node in &snap.nodes {
            if resolver.find(&node.concept_id) != canonical_root {
                continue;
            }
            if let Some(cred) = &node.credence {
                let idx = match cred.band {
                    CredenceBand::VeryLow => 0,
                    CredenceBand::Low => 1,
                    CredenceBand::Medium => 2,
                    CredenceBand::High => 3,
                    CredenceBand::VeryHigh => 4,
                };
                distribution[idx] += 1;
            }
            let c_title = concept_map
                .get(node.concept_id.as_str())
                .map(|c| c.title.clone())
                .unwrap_or_else(|| root_concept.title.clone());
            let attached_ucs: Vec<UpdateCriterion> = snap
                .update_criteria
                .iter()
                .filter(|uc| uc.target_local_id.as_deref() == Some(node.local_id.as_str()))
                .cloned()
                .collect();

            positions.push(ConceptActorPosition {
                actor_id: actor.id.clone(),
                handle: actor.handle.clone(),
                display_name: actor.display_name.clone(),
                avatar_initials: actor.avatar_initials.clone(),
                authorship_status: actor.authorship_status,
                concept_id: node.concept_id.clone(),
                concept_title: c_title,
                is_fork: node.concept_id != root_concept.id,
                stance: node.stance,
                is_load_bearing_crux: node.is_load_bearing_crux,
                credence: node.credence.clone(),
                note: node.note.clone(),
                update_criteria: attached_ucs,
            });
        }
    }

    positions.sort_by(|a, b| {
        let sa = a.credence.as_ref().map(|c| c.numeric_score()).unwrap_or(50);
        let sb = b.credence.as_ref().map(|c| c.numeric_score()).unwrap_or(50);
        sb.cmp(&sa)
    });

    Some(ConceptSpectrum {
        root_concept,
        forks,
        positions,
        distribution,
    })
}

// ============================================================================
// Field Intelligence Engine (Zero-LLM Graph Analytics)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NeglectedBottleneck {
    pub root_concept_id: String,
    pub title: String,
    pub believer_count: usize,
    pub mitigator_count: usize,
    pub mean_score: f32,
    pub gap_score: f32,
    pub believers: Vec<ActorStanceChip>,
    pub mitigators: Vec<ActorStanceChip>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaultLinePair {
    pub actor_a_handle: String,
    pub actor_a_name: String,
    pub actor_b_handle: String,
    pub actor_b_name: String,
    pub shared_ground_count: usize,
    pub disagreement_count: usize,
    pub shared_premise_title: Option<String>,
    pub top_disagreement_title: String,
    pub earliest_split_sentence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HiddenAllyPair {
    pub actor_a_handle: String,
    pub actor_a_name: String,
    pub actor_a_tag: String,
    pub actor_b_handle: String,
    pub actor_b_name: String,
    pub actor_b_tag: String,
    pub shared_ground_count: usize,
    pub shared_titles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnfalsifiableHotspot {
    pub root_concept_id: String,
    pub title: String,
    pub stage: Stage,
    pub actor_count: usize,
    pub actors_with_criteria: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldIntelligence {
    pub total_actors: usize,
    pub total_concepts: usize,
    pub neglected_bottlenecks: Vec<NeglectedBottleneck>,
    pub fault_lines: Vec<FaultLinePair>,
    pub hidden_allies: Vec<HiddenAllyPair>,
    pub unfalsifiable_hotspots: Vec<UnfalsifiableHotspot>,
}

pub fn compute_field_intelligence(
    actors: &[Actor],
    snapshots: &[ToCSnapshot],
    concepts: &[Concept],
    attestations: &[LinkAttestation],
) -> FieldIntelligence {
    let mut resolver = ClusterResolver::new(concepts, attestations);
    let actor_map: HashMap<&str, &Actor> = actors.iter().map(|a| (a.id.as_str(), a)).collect();

    // 1. Neglected Bottlenecks + Unfalsifiable Hotspots
    struct BnAgg {
        believers: Vec<ActorStanceChip>,
        mitigators: Vec<ActorStanceChip>,
        scores: Vec<i32>,
        seen_believers: HashSet<String>,
        seen_mitigators: HashSet<String>,
    }
    let mut bn_groups: HashMap<String, BnAgg> = HashMap::new();

    struct ClaimCritAgg {
        stage: Stage,
        actors: HashSet<String>,
        with_real_criteria: HashSet<String>,
    }
    let mut claim_crit: HashMap<String, ClaimCritAgg> = HashMap::new();

    for snap in snapshots {
        let Some(actor) = actor_map.get(snap.actor_id.as_str()) else {
            continue;
        };

        let local_nodes: HashMap<&str, &SnapshotNode> =
            snap.nodes.iter().map(|n| (n.local_id.as_str(), n)).collect();
        let real_crit_targets: HashSet<&str> = snap
            .update_criteria
            .iter()
            .filter(|uc| !uc.trigger.starts_with("No explicit IF/THEN"))
            .filter_map(|uc| uc.target_local_id.as_deref())
            .collect();

        // Which bottleneck local_ids have an outgoing edge to an active intervention that actually targets them?
        let mut mitigated_locals: HashSet<&str> = HashSet::new();
        for e in &snap.edges {
            if let (Some(src), Some(tgt)) = (
                local_nodes.get(e.source_local_id.as_str()),
                local_nodes.get(e.target_local_id.as_str()),
            ) {
                if src.stage == Stage::Bottleneck
                    && tgt.stage == Stage::Intervention
                    && matches!(tgt.stance, NodeStance::Active)
                    && matches!(e.relation, Some(EdgeRelation::Mitigates) | None)
                {
                    // Only count as directly mitigated if this snapshot has a Bet tied to it
                    let has_bet = snap.nodes.iter().any(|n| n.stage == Stage::Bet && matches!(n.stance, NodeStance::Active));
                    if has_bet {
                        mitigated_locals.insert(src.local_id.as_str());
                    }
                }
            }
        }

        for n in &snap.nodes {
            let cid = resolver.find(&n.concept_id);
            let is_active = matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux);

            if is_active && matches!(n.stage, Stage::Premise | Stage::Bottleneck | Stage::Intervention) {
                let cc = claim_crit.entry(cid.clone()).or_insert_with(|| ClaimCritAgg {
                    stage: n.stage,
                    actors: HashSet::new(),
                    with_real_criteria: HashSet::new(),
                });
                cc.actors.insert(actor.id.clone());
                if real_crit_targets.contains(n.local_id.as_str()) {
                    cc.with_real_criteria.insert(actor.id.clone());
                }
            }

            if n.stage == Stage::Bottleneck && is_active {
                let score = n.credence.as_ref().map(|c| c.numeric_score()).unwrap_or(65);
                let cred_label = n
                    .credence
                    .as_ref()
                    .map(|c| c.display_pill())
                    .unwrap_or_else(|| "High".into());
                let chip = ActorStanceChip {
                    actor_id: actor.id.clone(),
                    handle: actor.handle.clone(),
                    display_name: actor.display_name.clone(),
                    avatar_initials: actor.avatar_initials.clone(),
                    credence_label: cred_label,
                    score,
                    is_rejected: false,
                };
                let entry = bn_groups.entry(cid).or_insert_with(|| BnAgg {
                    believers: Vec::new(),
                    mitigators: Vec::new(),
                    scores: Vec::new(),
                    seen_believers: HashSet::new(),
                    seen_mitigators: HashSet::new(),
                });
                if entry.seen_believers.insert(actor.id.clone()) {
                    entry.scores.push(score);
                    entry.believers.push(chip.clone());
                }
                // Count as a dedicated mitigator if this bottleneck is flagged as their load-bearing crux
                // or if their primary intervention explicitly matches its tag/domain
                if n.is_load_bearing_crux
                    && mitigated_locals.contains(n.local_id.as_str())
                    && entry.seen_mitigators.insert(actor.id.clone())
                {
                    entry.mitigators.push(chip);
                }
            }
        }
    }

    let mut neglected_bottlenecks: Vec<NeglectedBottleneck> = bn_groups
        .into_iter()
        .filter(|(_, agg)| agg.believers.len() >= 2)
        .map(|(cid, agg)| {
            let believer_count = agg.believers.len();
            let mitigator_count = agg.mitigators.len();
            let mean_score = if agg.scores.is_empty() {
                50.0
            } else {
                agg.scores.iter().sum::<i32>() as f32 / agg.scores.len() as f32
            };
            let unaddressed = believer_count.saturating_sub(mitigator_count) as f32;
            let gap_score = unaddressed * 18.0 + mean_score * 0.4;
            NeglectedBottleneck {
                title: resolver.title_for(&cid),
                root_concept_id: cid,
                believer_count,
                mitigator_count,
                mean_score: (mean_score * 10.0).round() / 10.0,
                gap_score: (gap_score * 10.0).round() / 10.0,
                believers: agg.believers,
                mitigators: agg.mitigators,
            }
        })
        .collect();
    neglected_bottlenecks.sort_by(|a, b| {
        b.gap_score
            .partial_cmp(&a.gap_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    neglected_bottlenecks.truncate(8);

    let mut unfalsifiable_hotspots: Vec<UnfalsifiableHotspot> = claim_crit
        .into_iter()
        .filter(|(_, agg)| agg.actors.len() >= 3 && agg.with_real_criteria.len() * 2 < agg.actors.len())
        .map(|(cid, agg)| UnfalsifiableHotspot {
            title: resolver.title_for(&cid),
            root_concept_id: cid,
            stage: agg.stage,
            actor_count: agg.actors.len(),
            actors_with_criteria: agg.with_real_criteria.len(),
        })
        .collect();
    unfalsifiable_hotspots.sort_by(|a, b| {
        (b.actor_count - b.actors_with_criteria)
            .cmp(&(a.actor_count - a.actors_with_criteria))
            .then_with(|| b.actor_count.cmp(&a.actor_count))
    });
    unfalsifiable_hotspots.truncate(6);

    // 2. Pairwise Fault Lines & Unexpected Hidden Allies
    let mut fault_lines = Vec::new();
    let mut hidden_allies = Vec::new();
    let active_snaps: Vec<(&Actor, &ToCSnapshot)> = snapshots
        .iter()
        .filter_map(|s| actor_map.get(s.actor_id.as_str()).map(|a| (*a, s)))
        .collect();

    for i in 0..active_snaps.len() {
        for j in (i + 1)..active_snaps.len() {
            let (actor_a, snap_a) = active_snaps[i];
            let (actor_b, snap_b) = active_snaps[j];
            let d = diff_snapshots(snap_a, snap_b, concepts, attestations);

            if d.summary.shared_ground_count >= 1 && d.summary.crux_disagreement_count >= 1 {
                let shared_premise_title = d
                    .nodes
                    .iter()
                    .find(|n| {
                        n.category == DiffCategory::SharedGround
                            && matches!(n.stage, Stage::Premise | Stage::Bottleneck)
                    })
                    .map(|n| n.canonical_title.clone());
                let top_dis = d
                    .top_cruxes
                    .iter()
                    .find(|n| n.category == DiffCategory::DirectCruxDisagreement)
                    .map(|n| n.canonical_title.clone())
                    .unwrap_or_else(|| "Different interventions".into());
                fault_lines.push(FaultLinePair {
                    actor_a_handle: actor_a.handle.clone(),
                    actor_a_name: actor_a.display_name.clone(),
                    actor_b_handle: actor_b.handle.clone(),
                    actor_b_name: actor_b.display_name.clone(),
                    shared_ground_count: d.summary.shared_ground_count,
                    disagreement_count: d.summary.crux_disagreement_count,
                    shared_premise_title,
                    top_disagreement_title: top_dis,
                    earliest_split_sentence: d.summary.earliest_split.map(|es| es.sentence),
                });
            } else if d.summary.shared_ground_count >= 2 && d.summary.crux_disagreement_count == 0 {
                let tag_a = actor_a.tags.first().cloned().unwrap_or_default();
                let tag_b = actor_b.tags.first().cloned().unwrap_or_default();
                if !tag_a.is_empty() && !tag_b.is_empty() && tag_a != tag_b {
                    let shared_titles: Vec<String> = d
                        .nodes
                        .iter()
                        .filter(|n| n.category == DiffCategory::SharedGround)
                        .map(|n| n.canonical_title.clone())
                        .take(3)
                        .collect();
                    hidden_allies.push(HiddenAllyPair {
                        actor_a_handle: actor_a.handle.clone(),
                        actor_a_name: actor_a.display_name.clone(),
                        actor_a_tag: tag_a,
                        actor_b_handle: actor_b.handle.clone(),
                        actor_b_name: actor_b.display_name.clone(),
                        actor_b_tag: tag_b,
                        shared_ground_count: d.summary.shared_ground_count,
                        shared_titles,
                    });
                }
            }
        }
    }

    fault_lines.sort_by(|a, b| {
        (b.disagreement_count * 3 + b.shared_ground_count)
            .cmp(&(a.disagreement_count * 3 + a.shared_ground_count))
            .then_with(|| a.actor_a_handle.cmp(&b.actor_a_handle))
    });
    // Keep diverse pairs (at most 2 appearances per actor in top list)
    let mut seen_fl: HashMap<String, usize> = HashMap::new();
    let mut diverse_fl = Vec::new();
    for fl in fault_lines {
        let ca = *seen_fl.get(&fl.actor_a_handle).unwrap_or(&0);
        let cb = *seen_fl.get(&fl.actor_b_handle).unwrap_or(&0);
        if ca < 2 && cb < 2 {
            *seen_fl.entry(fl.actor_a_handle.clone()).or_default() += 1;
            *seen_fl.entry(fl.actor_b_handle.clone()).or_default() += 1;
            diverse_fl.push(fl);
            if diverse_fl.len() >= 8 {
                break;
            }
        }
    }

    hidden_allies.sort_by(|a, b| {
        b.shared_ground_count
            .cmp(&a.shared_ground_count)
            .then_with(|| a.actor_a_handle.cmp(&b.actor_a_handle))
    });
    let mut seen_ha: HashMap<String, usize> = HashMap::new();
    let mut diverse_ha = Vec::new();
    for ha in hidden_allies {
        let ca = *seen_ha.get(&ha.actor_a_handle).unwrap_or(&0);
        let cb = *seen_ha.get(&ha.actor_b_handle).unwrap_or(&0);
        if ca < 2 && cb < 2 {
            *seen_ha.entry(ha.actor_a_handle.clone()).or_default() += 1;
            *seen_ha.entry(ha.actor_b_handle.clone()).or_default() += 1;
            diverse_ha.push(ha);
            if diverse_ha.len() >= 6 {
                break;
            }
        }
    }

    FieldIntelligence {
        total_actors: actors.len(),
        total_concepts: concepts.len(),
        neglected_bottlenecks,
        fault_lines: diverse_fl,
        hidden_allies: diverse_ha,
        unfalsifiable_hotspots,
    }
}
