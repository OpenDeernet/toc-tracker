use std::collections::HashMap;
use crate::model::*;

pub fn snapshot_to_markdown(
    actor: &Actor,
    snapshot: &ToCSnapshot,
    concepts: &[Concept],
) -> String {
    let cmap: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();
    let mut md = String::new();

    md.push_str(&format!("# {} — Theory of Change (v{})\n\n", actor.display_name, snapshot.version));
    if !actor.role_or_affiliation.is_empty() {
        md.push_str(&format!("*{}*\n\n", actor.role_or_affiliation));
    }
    if let Some(stance) = actor.one_line_stance.as_deref().filter(|s| !s.trim().is_empty()) {
        md.push_str(&format!("**Stance:** {}\n\n", stance));
    }
    md.push_str(&format!("> {}\n\n", snapshot.summary));

    if let Some(contact) = actor.contact_preference.as_deref().filter(|s| !s.trim().is_empty()) {
        md.push_str(&format!("- **Contact:** {}\n", contact));
    }
    if let Some(tx) = &snapshot.arweave_tx_id {
        if !tx.starts_with("seed_") && !tx.starts_with("local_") {
            md.push_str(&format!("- **Permanent Arweave Record:** https://arweave.net/{}\n", tx));
        }
    }
    md.push_str(&format!("- **Published:** {}\n", snapshot.published_at.format("%Y-%m-%d")));
    md.push_str(&format!("- **Authorship:** {:?}\n\n", actor.authorship_status));

    if let Some(essay) = snapshot.essay_markdown.as_deref().filter(|s| !s.trim().is_empty()) {
        md.push_str("## In Their Own Words\n\n");
        md.push_str(essay.trim());
        md.push_str("\n\n---\n\n");
    }

    for stage in Stage::all() {
        let active_nodes: Vec<&SnapshotNode> = snapshot
            .nodes
            .iter()
            .filter(|n| n.stage == stage && matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux))
            .collect();
        if active_nodes.is_empty() {
            continue;
        }
        md.push_str(&format!("## {}. {}\n\n", stage.index() + 1, stage.label()));
        for n in active_nodes {
            let title = cmap
                .get(n.concept_id.as_str())
                .map(|c| c.title.as_str())
                .unwrap_or(&n.concept_id);
            let badge = if let Some(cred) = &n.credence {
                format!("`{}`", cred.display_pill())
            } else if let Some(prio) = n.bet_priority {
                format!("`{}`", prio.label())
            } else {
                String::new()
            };
            let crux_tag = if n.is_load_bearing_crux { " **[CRUX]**" } else { "" };
            md.push_str(&format!("- **{}** {}{}\n", title, badge, crux_tag));
            if let Some(cred) = &n.credence {
                if let Some(rat) = &cred.numeric_rationale {
                    md.push_str(&format!("  - *Numeric rationale:* {}\n", rat));
                }
            }
            if let Some(note) = &n.note {
                if !note.trim().is_empty() {
                    md.push_str(&format!("  - {}\n", note));
                }
            }
            for cit in &n.citations {
                md.push_str(&format!("  - Source: [{}]({})\n", cit.label, cit.url));
            }
        }
        md.push('\n');
    }

    let rejected: Vec<&SnapshotNode> = snapshot
        .nodes
        .iter()
        .filter(|n| matches!(n.stance, NodeStance::Rejected | NodeStance::Deprioritized))
        .collect();
    if !rejected.is_empty() {
        md.push_str("## Explicitly Rejected / Deprioritized Paths\n\n");
        for n in rejected {
            let title = cmap
                .get(n.concept_id.as_str())
                .map(|c| c.title.as_str())
                .unwrap_or(&n.concept_id);
            let badge = n
                .credence
                .as_ref()
                .map(|c| format!(" (`{}`)", c.display_pill()))
                .unwrap_or_default();
            md.push_str(&format!("- **{}**{}", title, badge));
            if let Some(note) = &n.note {
                md.push_str(&format!(" — {}", note));
            }
            md.push('\n');
        }
        md.push('\n');
    }

    md.push_str("## Update Criteria (Pivot Triggers)\n\n");
    for uc in &snapshot.update_criteria {
        let tf = uc
            .timeframe
            .as_deref()
            .map(|t| format!(" *({})*", t))
            .unwrap_or_default();
        md.push_str(&format!(
            "- **[{}]** **IF** {}{} → **THEN** {}\n",
            uc.status.label(),
            uc.trigger,
            tf,
            uc.pivot_action
        ));
    }

    md
}
