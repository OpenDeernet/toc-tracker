use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use toc_core::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioSuggestion {
    pub concept: Concept,
    pub usage_count: usize,
    pub is_canonical: bool,
    pub match_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedDraft {
    pub summary: String,
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub update_criteria: Vec<UpdateCriterion>,
    pub used_llm: bool,
    pub note: String,
}

/// Deterministic + co-occurrence ranked A/B/C concept suggestions for any stage.
pub fn suggest_concepts_for_stage(
    stage: Stage,
    prior_concept_ids: &[String],
    concepts: &[Concept],
    snapshots: &[ToCSnapshot],
) -> Vec<StudioSuggestion> {
    let prior_set: HashSet<&str> = prior_concept_ids.iter().map(String::as_str).collect();
    let mut usage: HashMap<&str, usize> = HashMap::new();
    let mut co_occur: HashMap<&str, usize> = HashMap::new();

    for snap in snapshots {
        let snap_concepts: HashSet<&str> = snap.nodes.iter().map(|n| n.concept_id.as_str()).collect();
        let shared_prior = snap_concepts.iter().filter(|c| prior_set.contains(*c)).count();
        for cid in &snap_concepts {
            *usage.entry(cid).or_default() += 1;
            if shared_prior > 0 {
                *co_occur.entry(cid).or_default() += shared_prior;
            }
        }
    }

    let mut candidates: Vec<StudioSuggestion> = concepts
        .iter()
        .filter(|c| c.stage == stage && !prior_set.contains(c.id.as_str()))
        .map(|c| {
            let u = usage.get(c.id.as_str()).copied().unwrap_or(0);
            let co = co_occur.get(c.id.as_str()).copied().unwrap_or(0);
            let is_canonical = c.parent_concept_id.is_none();
            let reason = if co > 0 {
                format!("Frequently paired with your earlier choices · Used by {} ToCs", u.max(1))
            } else if u > 0 {
                format!("Used by {} ToCs · {}", u, if is_canonical { "Canonical" } else { "Community Fork" })
            } else {
                "Canonical community concept".into()
            };
            StudioSuggestion {
                concept: c.clone(),
                usage_count: u,
                is_canonical,
                match_reason: reason,
            }
        })
        .collect();

    candidates.sort_by(|a, b| {
        let ca = co_occur.get(a.concept.id.as_str()).copied().unwrap_or(0);
        let cb = co_occur.get(b.concept.id.as_str()).copied().unwrap_or(0);
        cb.cmp(&ca)
            .then_with(|| b.usage_count.cmp(&a.usage_count))
            .then_with(|| b.is_canonical.cmp(&a.is_canonical))
            .then_with(|| a.concept.title.cmp(&b.concept.title))
    });

    candidates.truncate(6);
    candidates
}

/// Curated AI extraction (uses OPENAI_API_KEY if configured, with a smart deterministic
/// keyword/concept-matching fallback so Paste Link / Text always works smoothly out of the box).
pub async fn extract_draft(
    raw_text: &str,
    source_url: Option<&str>,
    concepts: &[Concept],
) -> ExtractedDraft {
    // Optional URL fetch if raw_text is short and source_url is provided
    let mut corpus = raw_text.to_string();
    if corpus.trim().len() < 40 {
        if let Some(url) = source_url {
            if url.starts_with("http://") || url.starts_with("https://") {
                if let Ok(resp) = reqwest::Client::new().get(url).send().await {
                    if let Ok(body) = resp.text().await {
                        let stripped = strip_html_tags(&body);
                        corpus.push(' ');
                        corpus.push_str(&stripped.chars().take(4000).collect::<String>());
                    }
                }
            }
        }
    }

    // If OPENAI_API_KEY is configured, try structured LLM extraction
    if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        if !api_key.trim().is_empty() {
            if let Ok(draft) = extract_via_openai(&api_key, &corpus, source_url, concepts).await {
                return draft;
            }
        }
    }

    extract_heuristic(&corpus, source_url, concepts)
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len().min(8192));
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn extract_heuristic(corpus: &str, source_url: Option<&str>, concepts: &[Concept]) -> ExtractedDraft {
    let lower = corpus.to_lowercase();
    let tokens: HashSet<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3)
        .collect();

    let mut chosen_by_stage: Vec<(Stage, &Concept)> = Vec::new();
    for stage in Stage::all() {
        let best = concepts
            .iter()
            .filter(|c| c.stage == stage && c.parent_concept_id.is_none())
            .max_by_key(|c| {
                let hay = format!("{} {} {}", c.title, c.description, c.tags.join(" ")).to_lowercase();
                hay.split(|ch: char| !ch.is_alphanumeric())
                    .filter(|w| w.len() >= 3 && tokens.contains(w))
                    .count()
            });
        if let Some(c) = best {
            chosen_by_stage.push((stage, c));
        }
    }

    let citations: Vec<Citation> = source_url
        .filter(|u| !u.trim().is_empty())
        .map(|u| {
            vec![Citation {
                label: "Source Link".into(),
                url: u.to_string(),
                quote: None,
            }]
        })
        .unwrap_or_default();

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut prev_id: Option<String> = None;

    for (idx, (stage, concept)) in chosen_by_stage.iter().enumerate() {
        let lid = format!("n_ext_{idx}");
        let is_crux = *stage == Stage::Intervention;
        let credence = match stage {
            Stage::Premise | Stage::Bottleneck | Stage::Intervention => {
                Some(Credence::qualitative(CredenceBand::High))
            }
            _ => None,
        };
        let bet_priority = if *stage == Stage::Bet {
            Some(BetPriority::Primary)
        } else {
            None
        };
        nodes.push(SnapshotNode {
            local_id: lid.clone(),
            concept_id: concept.id.clone(),
            stage: *stage,
            stance: NodeStance::Active,
            is_load_bearing_crux: is_crux,
            credence,
            bet_priority,
            note: None,
            citations: if idx == 0 { citations.clone() } else { vec![] },
        });
        if let Some(pid) = prev_id {
            let rel = match stage {
                Stage::Intervention => Some(EdgeRelation::Mitigates),
                Stage::Bet => Some(EdgeRelation::DependsOn),
                _ => Some(EdgeRelation::LeadsTo),
            };
            edges.push(SnapshotEdge {
                id: format!("e_ext_{idx}"),
                source_local_id: pid,
                target_local_id: lid.clone(),
                relation: rel,
                note: None,
            });
        }
        prev_id = Some(lid);
    }

    let crux_local = nodes
        .iter()
        .find(|n| n.is_load_bearing_crux)
        .map(|n| n.local_id.clone());

    let summary = corpus
        .split('.')
        .next()
        .map(|s| s.trim())
        .filter(|s| s.len() >= 18 && s.len() <= 160)
        .map(str::to_string)
        .unwrap_or_else(|| {
            "Drafted Theory of Change mapped to canonical AI Safety concepts — refine credences and update criteria below."
                .into()
        });

    ExtractedDraft {
        summary,
        nodes,
        edges,
        update_criteria: vec![UpdateCriterion {
            id: "uc_ext_1".into(),
            target_local_id: crux_local,
            trigger: "Key empirical benchmarks fail to validate this intervention within 18 months".into(),
            timeframe: Some("by Q4 2027".into()),
            pivot_action: "Lower credence to Low and reallocate effort to an alternative safety path".into(),
            status: CriterionStatus::Watching,
            evidence_urls: source_url.map(|u| vec![u.to_string()]).unwrap_or_default(),
        }],
        used_llm: false,
        note: "Draft mapped via local concept matcher (set OPENAI_API_KEY to enable full LLM extraction).".into(),
    }
}

async fn extract_via_openai(
    api_key: &str,
    corpus: &str,
    source_url: Option<&str>,
    concepts: &[Concept],
) -> anyhow::Result<ExtractedDraft> {
    let concept_catalog: Vec<String> = concepts
        .iter()
        .filter(|c| c.parent_concept_id.is_none())
        .map(|c| format!("{} [{}]: {}", c.id, c.stage.as_str(), c.title))
        .collect();

    let prompt = format!(
        "Map the following AI Safety position into a JSON object with keys: summary (string), concept_ids (array of 5 concept IDs from the catalog, one per stage in order premise,bottleneck,intervention,bet,outcome), trigger (string), pivot_action (string).\n\nCatalog:\n{}\n\nText:\n{}",
        concept_catalog.join("\n"),
        corpus.chars().take(3000).collect::<String>()
    );

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "model": "gpt-4o-mini",
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": "You map AI safety theories of change onto canonical concept IDs. Output strict JSON only." },
                { "role": "user", "content": prompt }
            ]
        }))
        .send()
        .await?;

    let val: serde_json::Value = resp.json().await?;
    let content = val["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing llm content"))?;
    let parsed: serde_json::Value = serde_json::from_str(content)?;

    let ids: Vec<String> = parsed["concept_ids"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing concept_ids"))?
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();

    let cmap: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut prev: Option<String> = None;

    for (idx, cid) in ids.iter().enumerate() {
        let Some(c) = cmap.get(cid.as_str()) else {
            continue;
        };
        let lid = format!("n_ai_{idx}");
        nodes.push(SnapshotNode {
            local_id: lid.clone(),
            concept_id: c.id.clone(),
            stage: c.stage,
            stance: NodeStance::Active,
            is_load_bearing_crux: c.stage == Stage::Intervention,
            credence: if matches!(c.stage, Stage::Premise | Stage::Bottleneck | Stage::Intervention) {
                Some(Credence::qualitative(CredenceBand::High))
            } else {
                None
            },
            bet_priority: if c.stage == Stage::Bet { Some(BetPriority::Primary) } else { None },
            note: None,
            citations: if idx == 0 {
                source_url
                    .map(|u| vec![Citation { label: "Source".into(), url: u.to_string(), quote: None }])
                    .unwrap_or_default()
            } else {
                vec![]
            },
        });
        if let Some(p) = prev {
            edges.push(SnapshotEdge {
                id: format!("e_ai_{idx}"),
                source_local_id: p,
                target_local_id: lid.clone(),
                relation: Some(EdgeRelation::LeadsTo),
                note: None,
            });
        }
        prev = Some(lid);
    }

    if nodes.is_empty() {
        anyhow::bail!("no valid concepts extracted");
    }

    let crux_local = nodes
        .iter()
        .find(|n| n.is_load_bearing_crux)
        .map(|n| n.local_id.clone());

    Ok(ExtractedDraft {
        summary: parsed["summary"]
            .as_str()
            .unwrap_or("AI-extracted Theory of Change draft.")
            .to_string(),
        nodes,
        edges,
        update_criteria: vec![UpdateCriterion {
            id: "uc_ai_1".into(),
            target_local_id: crux_local,
            trigger: parsed["trigger"]
                .as_str()
                .unwrap_or("Empirical evidence contradicts core intervention hypothesis")
                .to_string(),
            timeframe: Some("by Q4 2027".into()),
            pivot_action: parsed["pivot_action"]
                .as_str()
                .unwrap_or("Downgrade credence and pivot Bet")
                .to_string(),
            status: CriterionStatus::Watching,
            evidence_urls: source_url.map(|u| vec![u.to_string()]).unwrap_or_default(),
        }],
        used_llm: true,
        note: "Draft extracted via LLM and mapped onto canonical community concepts.".into(),
    })
}
