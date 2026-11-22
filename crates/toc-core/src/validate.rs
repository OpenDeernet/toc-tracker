use std::collections::{HashMap, HashSet};
use thiserror::Error;

use crate::model::*;

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ValidationError {
    #[error("summary cannot be empty")]
    EmptySummary,
    #[error("snapshot must contain at least one active node")]
    NoActiveNodes,
    #[error("duplicate local_id `{0}` in snapshot nodes")]
    DuplicateNodeId(String),
    #[error("node `{node_id}` uses numeric credence ({percent}%) without a justification of at least 10 characters")]
    MissingNumericRationale { node_id: String, percent: u8 },
    #[error("node `{node_id}` has invalid percent `{percent}` (must be 0..=100)")]
    InvalidPercent { node_id: String, percent: u8 },
    #[error("at least one update criterion is required to publish a Theory of Change")]
    MissingUpdateCriterion,
    #[error("update criterion `{0}` must specify both a trigger and a pivot_action")]
    IncompleteUpdateCriterion(String),
    #[error("edge `{edge_id}` references missing node `{node_id}`")]
    DanglingEdge { edge_id: String, node_id: String },
    #[error("graph edges contain a cycle involving node `{0}`")]
    CycleDetected(String),
    #[error("community draft must include at least one source citation URL")]
    CommunityDraftMissingCitation,
}

pub fn normalize_and_validate_snapshot(snapshot: &mut ToCSnapshot) -> Result<(), Vec<ValidationError>> {
    let mut errors = Vec::new();

    if snapshot.summary.trim().is_empty() {
        errors.push(ValidationError::EmptySummary);
    }

    let mut seen_ids = HashSet::new();
    let mut active_count = 0usize;
    let mut total_citations = 0usize;

    for node in &mut snapshot.nodes {
        if !seen_ids.insert(node.local_id.clone()) {
            errors.push(ValidationError::DuplicateNodeId(node.local_id.clone()));
        }
        if matches!(node.stance, NodeStance::Active | NodeStance::OpenCrux) {
            active_count += 1;
        }
        total_citations += node
            .citations
            .iter()
            .filter(|c| !c.url.trim().is_empty())
            .count();

        if let Some(cred) = &mut node.credence {
            if let Some(pct) = cred.percent {
                if pct > 100 {
                    errors.push(ValidationError::InvalidPercent {
                        node_id: node.local_id.clone(),
                        percent: pct,
                    });
                } else {
                    cred.band = CredenceBand::from_percent(pct);
                }
            }
            if cred.mode == CredenceMode::Numeric || cred.percent.is_some() {
                let pct = cred.percent.unwrap_or_else(|| cred.band.midpoint() as u8);
                let ok_rationale = cred
                    .numeric_rationale
                    .as_deref()
                    .map(|r| r.trim().chars().count() >= 10)
                    .unwrap_or(false);
                if !ok_rationale {
                    errors.push(ValidationError::MissingNumericRationale {
                        node_id: node.local_id.clone(),
                        percent: pct,
                    });
                }
            }
        }
    }

    if active_count == 0 {
        errors.push(ValidationError::NoActiveNodes);
    }

    if snapshot.update_criteria.is_empty() {
        errors.push(ValidationError::MissingUpdateCriterion);
    } else {
        for uc in &snapshot.update_criteria {
            if uc.trigger.trim().is_empty() || uc.pivot_action.trim().is_empty() {
                errors.push(ValidationError::IncompleteUpdateCriterion(uc.id.clone()));
            }
        }
    }

    if snapshot.authorship_mode == AuthorshipMode::CommunityDraft && total_citations == 0 {
        errors.push(ValidationError::CommunityDraftMissingCitation);
    }

    // Validate edge references and DAG acyclicity
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in &snapshot.edges {
        if !seen_ids.contains(&edge.source_local_id) {
            errors.push(ValidationError::DanglingEdge {
                edge_id: edge.id.clone(),
                node_id: edge.source_local_id.clone(),
            });
            continue;
        }
        if !seen_ids.contains(&edge.target_local_id) {
            errors.push(ValidationError::DanglingEdge {
                edge_id: edge.id.clone(),
                node_id: edge.target_local_id.clone(),
            });
            continue;
        }
        adj.entry(edge.source_local_id.as_str())
            .or_default()
            .push(edge.target_local_id.as_str());
    }

    if let Some(cycle_node) = find_cycle(&seen_ids, &adj) {
        errors.push(ValidationError::CycleDetected(cycle_node));
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn find_cycle(nodes: &HashSet<String>, adj: &HashMap<&str, Vec<&str>>) -> Option<String> {
    // 0 = unvisited, 1 = visiting, 2 = visited
    let mut state: HashMap<&str, u8> = HashMap::new();

    fn dfs<'a>(
        u: &'a str,
        adj: &HashMap<&'a str, Vec<&'a str>>,
        state: &mut HashMap<&'a str, u8>,
    ) -> Option<String> {
        state.insert(u, 1);
        if let Some(neighbors) = adj.get(u) {
            for &v in neighbors {
                match state.get(v).copied().unwrap_or(0) {
                    1 => return Some(v.to_string()),
                    0 => {
                        if let Some(c) = dfs(v, adj, state) {
                            return Some(c);
                        }
                    }
                    _ => {}
                }
            }
        }
        state.insert(u, 2);
        None
    }

    for n in nodes {
        let s = n.as_str();
        if state.get(s).copied().unwrap_or(0) == 0 {
            if let Some(c) = dfs(s, adj, &mut state) {
                return Some(c);
            }
        }
    }
    None
}
