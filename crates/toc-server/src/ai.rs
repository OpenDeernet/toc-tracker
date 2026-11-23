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

#[derive(Debug, Clone, Deserialize)]
pub struct SourceDocumentInput {
    pub url: Option<String>,
    pub title: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposedConcept {
    pub temp_id: String,
    pub stage: Stage,
    pub title: String,
    pub description: String,
    pub parent_concept_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedDraft {
    pub actor_name_hint: Option<String>,
    pub actor_role_hint: Option<String>,
    pub summary: String,
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub update_criteria: Vec<UpdateCriterion>,
    pub proposed_concepts: Vec<ProposedConcept>,
    pub used_llm: bool,
    pub provider: String,
    pub model: String,
    pub docs_processed: usize,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiStatusInfo {
    pub llm_enabled: bool,
    pub provider: String,
    pub model: String,
}

enum LlmProvider {
    OpenRouter { api_key: String, model: String },
    Anthropic { api_key: String, model: String },
    OpenAI { api_key: String, model: String },
    LocalHeuristic,
}

fn detect_provider() -> LlmProvider {
    let model_override = std::env::var("LLM_MODEL")
        .ok()
        .filter(|s| !s.trim().is_empty());

    if let Ok(key) = std::env::var("OPENROUTER_API_KEY") {
        if !key.trim().is_empty() {
            return LlmProvider::OpenRouter {
                api_key: key,
                model: model_override.unwrap_or_else(|| "google/gemini-2.5-flash".into()),
            };
        }
    }
    if let Ok(key) = std::env::var("ANTHROPIC_API_KEY") {
        if !key.trim().is_empty() {
            return LlmProvider::Anthropic {
                api_key: key,
                model: model_override.unwrap_or_else(|| "claude-sonnet-4-5-20250929".into()),
            };
        }
    }
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        if !key.trim().is_empty() {
            return LlmProvider::OpenAI {
                api_key: key,
                model: model_override.unwrap_or_else(|| "gpt-4.1-mini".into()),
            };
        }
    }
    LlmProvider::LocalHeuristic
}

pub fn ai_status() -> AiStatusInfo {
    match detect_provider() {
        LlmProvider::OpenRouter { model, .. } => AiStatusInfo {
            llm_enabled: true,
            provider: "openrouter".into(),
            model,
        },
        LlmProvider::Anthropic { model, .. } => AiStatusInfo {
            llm_enabled: true,
            provider: "anthropic".into(),
            model,
        },
        LlmProvider::OpenAI { model, .. } => AiStatusInfo {
            llm_enabled: true,
            provider: "openai".into(),
            model,
        },
        LlmProvider::LocalHeuristic => AiStatusInfo {
            llm_enabled: false,
            provider: "local-heuristic".into(),
            model: "keyword-matcher".into(),
        },
    }
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
                format!("Frequently paired · Used by {} maps", u.max(1))
            } else if u > 0 {
                format!("Used by {} maps", u)
            } else {
                "Canonical".into()
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

#[derive(Debug, Clone)]
struct PreparedDoc {
    label: String,
    url: Option<String>,
    content: String,
}

/// Multi-document quote-locked Theory of Change extractor.
/// Fetches URLs concurrently, cleans HTML, and calls OpenRouter / Anthropic / OpenAI (or falls back to local matcher).
pub async fn extract_draft_from_documents(
    docs: &[SourceDocumentInput],
    concepts: &[Concept],
) -> ExtractedDraft {
    let fetch_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("toctracker-extractor/0.1")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let llm_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent("toctracker-extractor/0.1")
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut prepared: Vec<PreparedDoc> = Vec::new();

    for (idx, doc) in docs.iter().take(10).enumerate() {
        let url_clean = doc
            .url
            .as_deref()
            .map(str::trim)
            .filter(|u| u.starts_with("http://") || u.starts_with("https://"))
            .map(str::to_string);

        let mut text = doc.text.as_deref().unwrap_or("").trim().to_string();
        if text.len() < 80 {
            if let Some(ref url) = url_clean {
                if let Ok(resp) = fetch_client.get(url).send().await {
                    if resp.status().is_success() {
                        if let Ok(body) = resp.text().await {
                            let cleaned = html_to_readable_text(&body);
                            if !text.is_empty() {
                                text.push('\n');
                            }
                            text.push_str(&cleaned.chars().take(12_000).collect::<String>());
                        }
                    }
                }
            }
        }

        if text.is_empty() && url_clean.is_none() {
            continue;
        }

        let label = doc
            .title
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .map(str::to_string)
            .or_else(|| {
                url_clean.as_deref().map(|u| {
                    u.split("//")
                        .nth(1)
                        .and_then(|rest| rest.split('/').next())
                        .unwrap_or("Source")
                        .trim_start_matches("www.")
                        .to_string()
                })
            })
            .unwrap_or_else(|| format!("Document {}", idx + 1));

        prepared.push(PreparedDoc {
            label,
            url: url_clean,
            content: text.chars().take(12_000).collect(),
        });
    }

    let docs_processed = prepared.len();
    let provider = detect_provider();

    match &provider {
        LlmProvider::OpenRouter { api_key, model } => {
            match extract_via_openai_compat(
                &llm_client,
                "https://openrouter.ai/api/v1/chat/completions",
                api_key,
                model,
                "openrouter",
                &prepared,
                concepts,
            )
            .await
            {
                Ok(draft) => return draft,
                Err(e) => tracing::warn!(error = %e, "OpenRouter extraction fell back to heuristic"),
            }
        }
        LlmProvider::OpenAI { api_key, model } => {
            match extract_via_openai_compat(
                &llm_client,
                "https://api.openai.com/v1/chat/completions",
                api_key,
                model,
                "openai",
                &prepared,
                concepts,
            )
            .await
            {
                Ok(draft) => return draft,
                Err(e) => tracing::warn!(error = %e, "OpenAI extraction fell back to heuristic"),
            }
        }
        LlmProvider::Anthropic { api_key, model } => {
            match extract_via_anthropic(&llm_client, api_key, model, &prepared, concepts).await {
                Ok(draft) => return draft,
                Err(e) => tracing::warn!(error = %e, "Anthropic extraction fell back to heuristic"),
            }
        }
        LlmProvider::LocalHeuristic => {}
    }

    extract_heuristic_multi(&prepared, concepts, docs_processed)
}

pub fn html_to_readable_text(html: &str) -> String {
    // Strip <script> and <style> blocks first
    let mut cleaned = String::with_capacity(html.len().min(32_768));
    let lower = html.to_lowercase();
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < bytes.len() {
        if lower[i..].starts_with("<script") {
            if let Some(end) = lower[i..].find("</script>") {
                i += end + 9;
                continue;
            }
        }
        if lower[i..].starts_with("<style") {
            if let Some(end) = lower[i..].find("</style>") {
                i += end + 8;
                continue;
            }
        }
        if let Some(ch) = html[i..].chars().next() {
            cleaned.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }

    let mut out = String::with_capacity(cleaned.len().min(16_384));
    let mut in_tag = false;
    let mut last_space = true;
    for ch in cleaned.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                if !last_space {
                    out.push(' ');
                    last_space = true;
                }
            }
            _ if !in_tag => {
                if ch.is_whitespace() {
                    if !last_space {
                        out.push(' ');
                        last_space = true;
                    }
                } else {
                    out.push(ch);
                    last_space = false;
                }
            }
            _ => {}
        }
    }
    out.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn build_extraction_prompt(docs: &[PreparedDoc], concepts: &[Concept]) -> String {
    let catalog: Vec<String> = concepts
        .iter()
        .filter(|c| c.parent_concept_id.is_none())
        .map(|c| format!("- {} [{}]: {}", c.id, c.stage.as_str(), c.title))
        .collect();

    let doc_blocks: Vec<String> = docs
        .iter()
        .enumerate()
        .map(|(i, d)| {
            format!(
                "=== SOURCE {} ({}{}) ===\n{}",
                i + 1,
                d.label,
                d.url.as_deref().map(|u| format!(" | {u}")).unwrap_or_default(),
                d.content.chars().take(6000).collect::<String>()
            )
        })
        .collect();

    format!(
        r#"Extract a structured AI Safety Theory of Change from the provided source document(s).

RULES:
1. Map claims onto EXISTING canonical concept IDs from the Catalog below whenever they mean the same thing.
2. Only create a `new_concept` (temp_id like "new_1") when a core claim or concrete Bet is genuinely not in the catalog. If it's a nuanced phrasing of an existing concept, set `parent_concept_id` to that existing ID!
3. Capture 1-2 explicitly REJECTED or skeptical paths (`stance: "rejected"`) if the author argues against other safety approaches.
4. For every node, include a short VERBATIM quote (`quote`) from the source text and the `source_url` (if present). Never invent quotes.
5. Default credences to qualitative bands ("very_low"|"low"|"medium"|"high"|"very_high"). ONLY include `percent` (0-100) if the author explicitly states a number, and put the quote in `numeric_rationale`.
6. Extract at least 1 `update_criteria` item. If the author didn't explicitly state one, propose the sharpest falsification test for their crux and prefix trigger with "[Suggested] ".

RETURN STRICT JSON ONLY matching this exact schema:
{{
  "actor_name_hint": "string or null",
  "actor_role_hint": "string or null",
  "summary": "1 crisp sentence explaining why they do what they do",
  "new_concepts": [
    {{ "temp_id": "new_1", "stage": "premise|bottleneck|intervention|bet|outcome", "title": "<=100 chars", "description": "1 sentence", "parent_concept_id": "existing_id or null" }}
  ],
  "nodes": [
    {{
      "local_id": "n1",
      "concept_id": "existing_catalog_id OR new_1",
      "stage": "premise|bottleneck|intervention|bet|outcome",
      "stance": "active|rejected",
      "is_load_bearing_crux": true/false,
      "band": "very_low|low|medium|high|very_high or null (null for bet/outcome)",
      "percent": null or 0..100,
      "numeric_rationale": "string or null",
      "note": "brief 1-sentence nuance or null",
      "quote": "short verbatim quote from source or null",
      "source_label": "string or null",
      "source_url": "url or null"
    }}
  ],
  "edges": [
    {{ "source_local_id": "n1", "target_local_id": "n2", "relation": "leads_to|mitigates|depends_on|conflicts_with" }}
  ],
  "update_criteria": [
    {{ "target_local_id": "n3 or null", "trigger": "observable condition", "timeframe": "e.g. by 2028 or null", "pivot_action": "what changes" }}
  ]
}}

CANONICAL CONCEPT CATALOG:
{}

SOURCE DOCUMENTS:
{}"#,
        catalog.join("\n"),
        doc_blocks.join("\n\n")
    )
}

fn parse_llm_json_to_draft(
    raw_content: &str,
    concepts: &[Concept],
    docs_processed: usize,
    provider: &str,
    model: &str,
) -> anyhow::Result<ExtractedDraft> {
    // Strip markdown code fences if present
    let trimmed = raw_content.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };

    let parsed: serde_json::Value = serde_json::from_str(json_str)?;
    let valid_existing: HashSet<&str> = concepts.iter().map(|c| c.id.as_str()).collect();

    let mut proposed_concepts = Vec::new();
    let mut valid_temp_ids = HashSet::new();
    if let Some(arr) = parsed["new_concepts"].as_array() {
        for (i, item) in arr.iter().enumerate() {
            let Some(stage) = item["stage"].as_str().and_then(Stage::from_str_opt) else {
                continue;
            };
            let Some(title) = item["title"].as_str().map(str::trim).filter(|s| !s.is_empty()) else {
                continue;
            };
            let temp_id = item["temp_id"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| format!("new_{}", i + 1));
            let parent = item["parent_concept_id"]
                .as_str()
                .filter(|p| valid_existing.contains(*p))
                .map(str::to_string);
            valid_temp_ids.insert(temp_id.clone());
            proposed_concepts.push(ProposedConcept {
                temp_id,
                stage,
                title: title.chars().take(130).collect(),
                description: item["description"].as_str().unwrap_or("").to_string(),
                parent_concept_id: parent,
            });
        }
    }

    let mut nodes = Vec::new();
    let mut valid_local_ids = HashSet::new();
    if let Some(arr) = parsed["nodes"].as_array() {
        for (i, item) in arr.iter().enumerate() {
            let Some(cid) = item["concept_id"].as_str() else {
                continue;
            };
            if !valid_existing.contains(cid) && !valid_temp_ids.contains(cid) {
                continue;
            }
            let Some(stage) = item["stage"].as_str().and_then(Stage::from_str_opt) else {
                continue;
            };
            let local_id = item["local_id"]
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| format!("n_ai_{i}"));
            let stance = match item["stance"].as_str() {
                Some("rejected") => NodeStance::Rejected,
                Some("deprioritized") => NodeStance::Deprioritized,
                Some("open_crux") => NodeStance::OpenCrux,
                _ => NodeStance::Active,
            };

            let credence = if matches!(stage, Stage::Premise | Stage::Bottleneck | Stage::Intervention) {
                let band = match item["band"].as_str() {
                    Some("very_low") => CredenceBand::VeryLow,
                    Some("low") => CredenceBand::Low,
                    Some("medium") => CredenceBand::Medium,
                    Some("very_high") => CredenceBand::VeryHigh,
                    _ => CredenceBand::High,
                };
                if let Some(pct) = item["percent"].as_u64().filter(|p| *p <= 100) {
                    let rat = item["numeric_rationale"]
                        .as_str()
                        .or_else(|| item["quote"].as_str())
                        .filter(|s| s.trim().chars().count() >= 10);
                    if let Some(r) = rat {
                        Some(Credence::numeric(pct as u8, r))
                    } else {
                        Some(Credence::qualitative(CredenceBand::from_percent(pct as u8)))
                    }
                } else {
                    Some(Credence::qualitative(band))
                }
            } else {
                None
            };

            let mut citations = Vec::new();
            let quote = item["quote"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
            let src_url = item["source_url"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
            let src_label = item["source_label"].as_str().map(str::trim).filter(|s| !s.is_empty()).unwrap_or("Source");
            if src_url.is_some() || quote.is_some() {
                citations.push(Citation {
                    label: src_label.to_string(),
                    url: src_url.unwrap_or_else(|| "https://toc.open".into()),
                    quote,
                });
            }

            valid_local_ids.insert(local_id.clone());
            nodes.push(SnapshotNode {
                local_id,
                concept_id: cid.to_string(),
                stage,
                stance,
                is_load_bearing_crux: item["is_load_bearing_crux"].as_bool().unwrap_or(false),
                credence,
                bet_priority: if stage == Stage::Bet && stance == NodeStance::Active {
                    Some(BetPriority::Primary)
                } else {
                    None
                },
                note: item["note"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string),
                citations,
            });
        }
    }

    if nodes.is_empty() {
        anyhow::bail!("LLM returned zero valid nodes");
    }

    let mut edges = Vec::new();
    if let Some(arr) = parsed["edges"].as_array() {
        for (i, item) in arr.iter().enumerate() {
            let (Some(src), Some(tgt)) = (item["source_local_id"].as_str(), item["target_local_id"].as_str()) else {
                continue;
            };
            if !valid_local_ids.contains(src) || !valid_local_ids.contains(tgt) || src == tgt {
                continue;
            }
            let rel = match item["relation"].as_str() {
                Some("mitigates") => Some(EdgeRelation::Mitigates),
                Some("depends_on") => Some(EdgeRelation::DependsOn),
                Some("conflicts_with") => Some(EdgeRelation::ConflictsWith),
                _ => Some(EdgeRelation::LeadsTo),
            };
            edges.push(SnapshotEdge {
                id: format!("e_ai_{i}"),
                source_local_id: src.to_string(),
                target_local_id: tgt.to_string(),
                relation: rel,
                note: None,
            });
        }
    }

    let mut update_criteria = Vec::new();
    if let Some(arr) = parsed["update_criteria"].as_array() {
        for (i, item) in arr.iter().enumerate() {
            let (Some(trig), Some(piv)) = (
                item["trigger"].as_str().map(str::trim).filter(|s| !s.is_empty()),
                item["pivot_action"].as_str().map(str::trim).filter(|s| !s.is_empty()),
            ) else {
                continue;
            };
            let target = item["target_local_id"]
                .as_str()
                .filter(|t| valid_local_ids.contains(*t))
                .map(str::to_string);
            update_criteria.push(UpdateCriterion {
                id: format!("uc_ai_{i}"),
                target_local_id: target,
                trigger: trig.to_string(),
                timeframe: item["timeframe"].as_str().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string),
                pivot_action: piv.to_string(),
                status: CriterionStatus::Watching,
                evidence_urls: vec![],
            });
        }
    }

    Ok(ExtractedDraft {
        actor_name_hint: parsed["actor_name_hint"].as_str().map(str::to_string),
        actor_role_hint: parsed["actor_role_hint"].as_str().map(str::to_string),
        summary: parsed["summary"]
            .as_str()
            .unwrap_or("Extracted Theory of Change draft.")
            .to_string(),
        nodes,
        edges,
        update_criteria,
        proposed_concepts,
        used_llm: true,
        provider: provider.to_string(),
        model: model.to_string(),
        docs_processed,
        note: format!("Extracted from {docs_processed} source(s) via {provider} ({model}). Review quotes before loading."),
    })
}

async fn extract_via_openai_compat(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    model: &str,
    provider_name: &str,
    docs: &[PreparedDoc],
    concepts: &[Concept],
) -> anyhow::Result<ExtractedDraft> {
    let prompt = build_extraction_prompt(docs, concepts);
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": "You are an AI Safety epistemologist mapping documents onto structured Theories of Change. Output strict JSON only with no markdown commentary." },
            { "role": "user", "content": prompt }
        ]
    });
    if !model.starts_with("anthropic/") {
        body["response_format"] = serde_json::json!({ "type": "json_object" });
    }
    let mut req = client.post(endpoint).bearer_auth(api_key).json(&body);
    if provider_name == "openrouter" {
        req = req
            .header("HTTP-Referer", "https://toctracker.com")
            .header("X-Title", "toctracker.com");
    }

    let resp = req.send().await?;
    if !resp.status().is_success() {
        let status = resp.status();
        let err_txt = resp.text().await.unwrap_or_default();
        tracing::warn!(provider = provider_name, model = model, %status, error = %err_txt, "LLM extraction request failed");
        anyhow::bail!("LLM request failed ({status})");
    }
    let val: serde_json::Value = resp.json().await?;
    let content = val["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing llm content"))?;
    parse_llm_json_to_draft(content, concepts, docs.len(), provider_name, model)
}

async fn extract_via_anthropic(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    docs: &[PreparedDoc],
    concepts: &[Concept],
) -> anyhow::Result<ExtractedDraft> {
    let prompt = build_extraction_prompt(docs, concepts);
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": model,
            "max_tokens": 4096,
            "temperature": 0.2,
            "system": "You are an AI Safety epistemologist mapping documents onto structured Theories of Change. Output strict JSON only with no surrounding commentary.",
            "messages": [{ "role": "user", "content": prompt }]
        }))
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!("Anthropic request failed ({})", resp.status());
    }
    let val: serde_json::Value = resp.json().await?;
    let content = val["content"][0]["text"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing anthropic content"))?;
    parse_llm_json_to_draft(content, concepts, docs.len(), "anthropic", model)
}

fn extract_heuristic_multi(
    docs: &[PreparedDoc],
    concepts: &[Concept],
    docs_processed: usize,
) -> ExtractedDraft {
    let combined = docs
        .iter()
        .map(|d| d.content.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let lower = combined.to_lowercase();
    let tokens: HashSet<&str> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.len() >= 3)
        .collect();

    let mut chosen: Vec<(Stage, &Concept)> = Vec::new();
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
            chosen.push((stage, c));
        }
    }

    let first_doc = docs.first();
    let first_sentence = combined
        .split('.')
        .map(str::trim)
        .find(|s| s.len() >= 24 && s.len() <= 180)
        .map(str::to_string);

    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut prev_id: Option<String> = None;

    for (idx, (stage, concept)) in chosen.iter().enumerate() {
        let lid = format!("n_ext_{idx}");
        let citations = if idx == 0 {
            first_doc
                .and_then(|d| {
                    d.url.as_ref().map(|u| {
                        vec![Citation {
                            label: d.label.clone(),
                            url: u.clone(),
                            quote: first_sentence.clone(),
                        }]
                    })
                })
                .unwrap_or_default()
        } else {
            vec![]
        };

        nodes.push(SnapshotNode {
            local_id: lid.clone(),
            concept_id: concept.id.clone(),
            stage: *stage,
            stance: NodeStance::Active,
            is_load_bearing_crux: *stage == Stage::Intervention,
            credence: if matches!(stage, Stage::Premise | Stage::Bottleneck | Stage::Intervention) {
                Some(Credence::qualitative(CredenceBand::High))
            } else {
                None
            },
            bet_priority: if *stage == Stage::Bet { Some(BetPriority::Primary) } else { None },
            note: None,
            citations,
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

    let crux_local = nodes.iter().find(|n| n.is_load_bearing_crux).map(|n| n.local_id.clone());

    ExtractedDraft {
        actor_name_hint: None,
        actor_role_hint: None,
        summary: first_sentence.unwrap_or_else(|| {
            "Draft mapped onto canonical AI Safety concepts — refine credences and update criteria."
                .into()
        }),
        nodes,
        edges,
        update_criteria: vec![UpdateCriterion {
            id: "uc_ext_1".into(),
            target_local_id: crux_local,
            trigger: "[Suggested] Core empirical benchmarks fail to validate this approach".into(),
            timeframe: Some("by Q4 2027".into()),
            pivot_action: "Lower credence and shift effort to a stronger alternative".into(),
            status: CriterionStatus::Watching,
            evidence_urls: first_doc.and_then(|d| d.url.clone()).into_iter().collect(),
        }],
        proposed_concepts: vec![],
        used_llm: false,
        provider: "local-heuristic".into(),
        model: "keyword-matcher".into(),
        docs_processed,
        note: "Local matcher used (set OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY for full quote-locked LLM extraction).".into(),
    }
}

// ============================================================================
// Socratic AI Stress-Tester (Hidden Assumptions, Steelman Objection, Criterion)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HiddenAssumption {
    pub title: String,
    pub why_it_matters: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteelmanObjection {
    pub from_perspective: String,
    pub argument: String,
    pub rival_handle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedCriterion {
    pub trigger: String,
    pub timeframe: Option<String>,
    pub pivot_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StressTestResult {
    pub used_llm: bool,
    pub provider: String,
    pub model: String,
    pub hidden_assumptions: Vec<HiddenAssumption>,
    pub steelman_objection: Option<SteelmanObjection>,
    pub suggested_criterion: Option<SuggestedCriterion>,
}

pub async fn stress_test_map(
    nodes: &[SnapshotNode],
    edges: &[SnapshotEdge],
    criteria: &[UpdateCriterion],
    concepts: &[Concept],
    actors: &[Actor],
    field_snapshots: &[ToCSnapshot],
) -> StressTestResult {
    let cmap: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();
    let provider = detect_provider();

    if !matches!(provider, LlmProvider::LocalHeuristic) {
        if let Ok(res) = stress_test_with_llm(&provider, nodes, edges, criteria, &cmap).await {
            return res;
        }
    }

    stress_test_deterministic(nodes, criteria, &cmap, actors, field_snapshots)
}

async fn stress_test_with_llm(
    provider: &LlmProvider,
    nodes: &[SnapshotNode],
    edges: &[SnapshotEdge],
    criteria: &[UpdateCriterion],
    cmap: &HashMap<&str, &Concept>,
) -> anyhow::Result<StressTestResult> {
    let mut lines = Vec::new();
    for n in nodes {
        let title = cmap.get(n.concept_id.as_str()).map(|c| c.title.as_str()).unwrap_or(&n.concept_id);
        let cred = n.credence.as_ref().map(|c| c.display_pill()).unwrap_or_else(|| "-".into());
        lines.push(format!(
            "- [{} | {:?} | cred: {} | crux: {}] {}",
            n.stage.as_str(),
            n.stance,
            cred,
            n.is_load_bearing_crux,
            title
        ));
    }
    let crit_lines: Vec<String> = criteria
        .iter()
        .map(|u| format!("- IF {} THEN {}", u.trigger, u.pivot_action))
        .collect();

    let today = chrono::Utc::now().format("%B %Y");
    let prompt = format!(
        r#"Stress-test this AI Safety Theory of Change like a sharp, charitable LessWrong peer reviewer.
Today's date is {today}. Keep timeframes in the future relative to {today}.
Be concise, specific, and zero-fluff.

THEORY OF CHANGE ({} edges):
{}

CURRENT UPDATE CRITERIA:
{}

RETURN STRICT JSON ONLY:
{{
  "hidden_assumptions": [
    {{ "title": "concise unstated premise <=90 chars", "why_it_matters": "1 crisp sentence explaining why their bet fails if this is false" }}
  ],
  "steelman_objection": {{
    "from_perspective": "e.g. Pause/Halt advocate or AI Control researcher",
    "argument": "2 crisp sentences giving the strongest non-strawman critique of this chain"
  }},
  "suggested_criterion": {{
    "trigger": "concrete observable evidence that would falsify their key crux",
    "timeframe": "e.g. by Q4 2027",
    "pivot_action": "specific change in bet or credence"
  }}
}}"#,
        edges.len(),
        lines.join("\n"),
        if crit_lines.is_empty() { "(none yet)".into() } else { crit_lines.join("\n") }
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(45))
        .build()?;

    let (raw, prov_name, model_name) = match provider {
        LlmProvider::OpenRouter { api_key, model } => {
            let mut body = serde_json::json!({
                "model": model,
                "max_tokens": 1200,
                "temperature": 0.3,
                "messages": [
                    { "role": "system", "content": "You are a rigorous AI Safety epistemologist. Output strict JSON only with no markdown commentary." },
                    { "role": "user", "content": prompt }
                ]
            });
            if !model.starts_with("anthropic/") {
                body["response_format"] = serde_json::json!({ "type": "json_object" });
            }
            let resp = client
                .post("https://openrouter.ai/api/v1/chat/completions")
                .bearer_auth(api_key)
                .header("HTTP-Referer", "https://toctracker.com")
                .header("X-Title", "toctracker.com")
                .json(&body)
                .send()
                .await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                tracing::warn!(model = %model, %status, error = %err_txt, "OpenRouter stress-test error");
                anyhow::bail!("OpenRouter stress-test error {status}");
            }
            let val: serde_json::Value = resp.json().await?;
            let txt = val["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("missing content"))?
                .to_string();
            (txt, "openrouter", model.as_str())
        }
        LlmProvider::OpenAI { api_key, model } => {
            let resp = client
                .post("https://api.openai.com/v1/chat/completions")
                .bearer_auth(api_key)
                .json(&serde_json::json!({
                    "model": model,
                    "max_tokens": 1200,
                    "response_format": { "type": "json_object" },
                    "temperature": 0.3,
                    "messages": [
                        { "role": "system", "content": "You are a rigorous AI Safety epistemologist. Output strict JSON only." },
                        { "role": "user", "content": prompt }
                    ]
                }))
                .send()
                .await?;
            if !resp.status().is_success() {
                let status = resp.status();
                let err_txt = resp.text().await.unwrap_or_default();
                tracing::warn!(model = %model, %status, error = %err_txt, "OpenAI stress-test error");
                anyhow::bail!("OpenAI stress-test error {status}");
            }
            let val: serde_json::Value = resp.json().await?;
            let txt = val["choices"][0]["message"]["content"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("missing content"))?
                .to_string();
            (txt, "openai", model.as_str())
        }
        LlmProvider::Anthropic { api_key, model } => {
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .json(&serde_json::json!({
                    "model": model,
                    "max_tokens": 1200,
                    "temperature": 0.3,
                    "system": "You are a rigorous AI Safety epistemologist. Output strict JSON only.",
                    "messages": [{ "role": "user", "content": prompt }]
                }))
                .send()
                .await?;
            if !resp.status().is_success() {
                anyhow::bail!("Anthropic stress-test error {}", resp.status());
            }
            let val: serde_json::Value = resp.json().await?;
            let txt = val["content"][0]["text"]
                .as_str()
                .ok_or_else(|| anyhow::anyhow!("missing content"))?
                .to_string();
            (txt, "anthropic", model.as_str())
        }
        LlmProvider::LocalHeuristic => anyhow::bail!("no llm"),
    };

    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };
    let v: serde_json::Value = serde_json::from_str(json_str)?;

    let hidden_assumptions: Vec<HiddenAssumption> = v["hidden_assumptions"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    Some(HiddenAssumption {
                        title: item["title"].as_str()?.trim().chars().take(100).collect(),
                        why_it_matters: item["why_it_matters"].as_str()?.trim().to_string(),
                    })
                })
                .take(2)
                .collect()
        })
        .unwrap_or_default();

    let steelman_objection = v["steelman_objection"].as_object().and_then(|o| {
        Some(SteelmanObjection {
            from_perspective: o.get("from_perspective")?.as_str()?.trim().to_string(),
            argument: o.get("argument")?.as_str()?.trim().to_string(),
            rival_handle: None,
        })
    });

    let suggested_criterion = v["suggested_criterion"].as_object().and_then(|o| {
        Some(SuggestedCriterion {
            trigger: o.get("trigger")?.as_str()?.trim().to_string(),
            timeframe: o
                .get("timeframe")
                .and_then(|t| t.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            pivot_action: o.get("pivot_action")?.as_str()?.trim().to_string(),
        })
    });

    Ok(StressTestResult {
        used_llm: true,
        provider: prov_name.to_string(),
        model: model_name.to_string(),
        hidden_assumptions,
        steelman_objection,
        suggested_criterion,
    })
}

fn stress_test_deterministic(
    nodes: &[SnapshotNode],
    _criteria: &[UpdateCriterion],
    cmap: &HashMap<&str, &Concept>,
    actors: &[Actor],
    field_snapshots: &[ToCSnapshot],
) -> StressTestResult {
    let my_roots: HashSet<&str> = nodes
        .iter()
        .filter(|n| matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux))
        .map(|n| {
            cmap.get(n.concept_id.as_str())
                .map(|c| c.root_concept_id.as_str())
                .unwrap_or(n.concept_id.as_str())
        })
        .collect();

    let my_interventions: Vec<&str> = nodes
        .iter()
        .filter(|n| n.stage == Stage::Intervention && matches!(n.stance, NodeStance::Active))
        .map(|n| {
            cmap.get(n.concept_id.as_str())
                .map(|c| c.title.as_str())
                .unwrap_or(&n.concept_id)
        })
        .collect();

    let mut hidden_assumptions = Vec::new();
    let combined_int = my_interventions.join(" ").to_lowercase();

    if combined_int.contains("interpretability") || combined_int.contains("probe") || combined_int.contains("white-box") {
        hidden_assumptions.push(HiddenAssumption {
            title: "Models cannot obfuscate deceptive reasoning from internal probes".into(),
            why_it_matters: "If gradient pressure or situational awareness hides deception in polysemantic representations, white-box monitoring degrades silently.".into(),
        });
    } else if combined_int.contains("pause") || combined_int.contains("halt") || combined_int.contains("moratorium") {
        hidden_assumptions.push(HiddenAssumption {
            title: "International verification can detect covert frontier training runs".into(),
            why_it_matters: "Without reliable compute verification, a moratorium selects for the least cooperative labs or states.".into(),
        });
    } else if combined_int.contains("eval") || combined_int.contains("audit") {
        hidden_assumptions.push(HiddenAssumption {
            title: "Dangerous capabilities show up cleanly on pre-deployment evaluations".into(),
            why_it_matters: "If sandbagging or post-deployment scaffolding unlocks dangerous capabilities only in the wild, release gates miss the real risk.".into(),
        });
    } else if combined_int.contains("control") {
        hidden_assumptions.push(HiddenAssumption {
            title: "Human red-teams can match or bound worst-case untrusted model strategies".into(),
            why_it_matters: "AI Control relies on monitoring protocols remaining reliable as models outpace human oversight.".into(),
        });
    } else {
        hidden_assumptions.push(HiddenAssumption {
            title: "Safety progress compounds fast enough before irreversible capability thresholds".into(),
            why_it_matters: "If recursive self-improvement arrives before your intervention matures, downstream bets never get time to pay off.".into(),
        });
    }

    if !my_roots.contains("cpt_root_racing") {
        hidden_assumptions.push(HiddenAssumption {
            title: "Leading labs won't defect under competitive pressure".into(),
            why_it_matters: "Many safety plans break if commercial or geopolitical racing forces deployment ahead of safety verification.".into(),
        });
    }

    // Find a real rival in the 26-profile dataset who explicitly REJECTED one of our active intervention roots!
    let actor_map: HashMap<&str, &Actor> = actors.iter().map(|a| (a.id.as_str(), a)).collect();
    let mut steelman = None;
    for snap in field_snapshots {
        for n in &snap.nodes {
            if matches!(n.stance, NodeStance::Rejected | NodeStance::Deprioritized) {
                let root = cmap
                    .get(n.concept_id.as_str())
                    .map(|c| c.root_concept_id.as_str())
                    .unwrap_or(n.concept_id.as_str());
                if my_roots.contains(root) {
                    if let Some(rival) = actor_map.get(snap.actor_id.as_str()) {
                        let arg = n
                            .note
                            .as_deref()
                            .map(|s| s.trim_start_matches(|c: char| c == '.' || c == ':' || c.is_whitespace()).to_string())
                            .filter(|s| s.len() > 24)
                            .unwrap_or_else(|| {
                                format!(
                                    "{} explicitly rejects this path in their Theory of Change and bets on an opposing strategy.",
                                    rival.display_name
                                )
                            });
                        steelman = Some(SteelmanObjection {
                            from_perspective: format!("{} (from dataset)", rival.display_name),
                            argument: arg,
                            rival_handle: Some(rival.handle.clone()),
                        });
                        break;
                    }
                }
            }
        }
        if steelman.is_some() {
            break;
        }
    }

    if steelman.is_none() {
        steelman = Some(SteelmanObjection {
            from_perspective: "Skeptical peer reviewer".into(),
            argument: "Even if your upstream premises hold, why does this specific intervention outperform rival approaches on margin per researcher-year? Adding one explicitly rejected alternative sharpens the crux.".into(),
            rival_handle: None,
        });
    }

    let crux_title = nodes
        .iter()
        .find(|n| n.is_load_bearing_crux)
        .or_else(|| nodes.iter().find(|n| n.stage == Stage::Intervention))
        .and_then(|n| cmap.get(n.concept_id.as_str()).map(|c| c.title.clone()))
        .unwrap_or_else(|| "this core intervention".into());

    StressTestResult {
        used_llm: false,
        provider: "graph-heuristic".into(),
        model: "field-dataset".into(),
        hidden_assumptions,
        steelman_objection: steelman,
        suggested_criterion: Some(SuggestedCriterion {
            trigger: format!(
                "Two independent evaluations show \"{crux_title}\" fails to catch realistic deceptive or high-autonomy failure modes"
            ),
            timeframe: Some("by Q4 2027".into()),
            pivot_action: "Drop credence below 30% and shift active work toward a stronger containment or governance bet".into(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use toc_core::seed::build_seed_bundle;

    #[test]
    fn html_cleaner_strips_scripts_and_tags() {
        let html = "<html><head><style>body{color:red}</style><script>alert(1)</script></head><body><h1>AI Control</h1><p>Untrusted &amp; monitored.</p></body></html>";
        let clean = html_to_readable_text(html);
        assert!(clean.contains("AI Control"));
        assert!(clean.contains("Untrusted & monitored."));
        assert!(!clean.contains("alert"));
        assert!(!clean.contains("color:red"));
    }

    #[test]
    fn parses_quote_locked_llm_json_cleanly() {
        let bundle = build_seed_bundle();
        let sample = r#"```json
        {
          "actor_name_hint": "Paul Christiano",
          "actor_role_hint": "Alignment Researcher",
          "summary": "Build scalable oversight & control before transformative AI.",
          "new_concepts": [
            { "temp_id": "new_1", "stage": "bet", "title": "Eliciting latent knowledge research", "description": "Find internal beliefs.", "parent_concept_id": null }
          ],
          "nodes": [
            { "local_id": "n1", "concept_id": "cpt_root_timelines", "stage": "premise", "stance": "active", "is_load_bearing_crux": false, "band": "high", "percent": null, "quote": "TAI likely this decade.", "source_label": "LW", "source_url": "https://lesswrong.com/1" },
            { "local_id": "n2", "concept_id": "new_1", "stage": "bet", "stance": "active", "is_load_bearing_crux": true, "band": null, "percent": null, "quote": "Focus on ELK.", "source_label": "ARC", "source_url": "https://alignment.org" }
          ],
          "edges": [
            { "source_local_id": "n1", "target_local_id": "n2", "relation": "leads_to" }
          ],
          "update_criteria": [
            { "target_local_id": "n2", "trigger": "ELK proves unsolvable on toy models", "timeframe": "by 2027", "pivot_action": "Pivot to control" }
          ]
        }
        ```"#;
        let draft = parse_llm_json_to_draft(sample, &bundle.concepts, 2, "openrouter", "google/gemini-2.5-flash").unwrap();
        assert_eq!(draft.nodes.len(), 2);
        assert_eq!(draft.proposed_concepts.len(), 1);
        assert_eq!(draft.edges.len(), 1);
        assert_eq!(draft.update_criteria.len(), 1);
        assert_eq!(draft.nodes[0].citations[0].quote.as_deref(), Some("TAI likely this decade."));
    }
}
