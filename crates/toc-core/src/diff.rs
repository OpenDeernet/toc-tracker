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
pub struct DiffSummary {
    pub shared_ground_count: usize,
    pub crux_disagreement_count: usize,
    pub unaddressed_count: usize,
    pub premise_bottleneck_overlap_pct: u8,
    pub headline: String,
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

    let headline = if let Some(top) = top_cruxes.first() {
        if shared_ground_count > 0 {
            format!(
                "Share {} premise/bottleneck points; diverge sharpest on \"{}\"",
                shared_ground_count, top.canonical_title
            )
        } else {
            format!("Diverge sharpest on \"{}\"", top.canonical_title)
        }
    } else if shared_ground_count > 0 {
        format!(
            "Strong alignment across {} shared nodes with different concrete bets",
            shared_ground_count
        )
    } else {
        "Distinct threat models and intervention paths".to_string()
    };

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
        },
        nodes: diff_nodes,
        edges: diff_edges,
        top_cruxes,
    }
}

pub fn compute_field_cruxes(
    snapshots: &[ToCSnapshot],
    concepts: &[Concept],
    attestations: &[LinkAttestation],
) -> Vec<FieldCruxSummary> {
    let mut resolver = ClusterResolver::new(concepts, attestations);

    struct Agg {
        stage: Stage,
        scores: Vec<i32>,
        active_count: usize,
        rejected_count: usize,
        dist: [usize; 5],
        actors: HashSet<String>,
    }

    let mut groups: HashMap<String, Agg> = HashMap::new();

    for snap in snapshots {
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
            });
            if !entry.actors.insert(snap.actor_id.clone()) {
                continue;
            }
            match n.stance {
                NodeStance::Active | NodeStance::OpenCrux => entry.active_count += 1,
                NodeStance::Rejected | NodeStance::Deprioritized => entry.rejected_count += 1,
            }
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
        }
    }

    let mut out = Vec::new();
    for (cid, agg) in groups {
        if agg.actors.len() < 2 {
            continue;
        }
        let (mean, spread) = if agg.scores.is_empty() {
            (50.0, 0)
        } else {
            let min = *agg.scores.iter().min().unwrap();
            let max = *agg.scores.iter().max().unwrap();
            let sum: i32 = agg.scores.iter().sum();
            (sum as f32 / agg.scores.len() as f32, max - min)
        };
        let stance_tension = if agg.active_count > 0 && agg.rejected_count > 0 {
            25.0
        } else {
            0.0
        };
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
