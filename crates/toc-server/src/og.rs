use std::collections::HashMap;
use std::sync::OnceLock;

use anyhow::{anyhow, Result};
use resvg::tiny_skia::Pixmap;
use resvg::usvg::{self, fontdb, Options, Tree};
use toc_core::*;

fn shared_fontdb() -> &'static fontdb::Database {
    static DB: OnceLock<fontdb::Database> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        db
    })
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let cut: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{cut}…")
    }
}

fn render_svg_to_png(svg: &str) -> Result<Vec<u8>> {
    let mut opt = Options::default();
    opt.fontdb = std::sync::Arc::new(shared_fontdb().clone());
    opt.font_family = "Helvetica".into();

    let tree = Tree::from_str(svg, &opt).map_err(|e| anyhow!("svg parse failed: {e}"))?;
    let size = tree.size().to_int_size();
    let mut pixmap = Pixmap::new(size.width(), size.height())
        .ok_or_else(|| anyhow!("failed to allocate pixmap"))?;
    resvg::render(&tree, usvg::Transform::default(), &mut pixmap.as_mut());
    pixmap
        .encode_png()
        .map_err(|e| anyhow!("png encode failed: {e}"))
}

pub fn render_actor_og_png(
    actor: &Actor,
    snapshot: &ToCSnapshot,
    concepts: &[Concept],
) -> Result<Vec<u8>> {
    let cmap: HashMap<&str, &Concept> = concepts.iter().map(|c| (c.id.as_str(), c)).collect();

    let mut cards_svg = String::new();
    let stages = Stage::all();
    for (idx, stage) in stages.iter().enumerate() {
        let x = 56 + idx * 222;
        let label = format!("{}. {}", idx + 1, stage.label().to_uppercase());
        cards_svg.push_str(&format!(
            r##"<text x="{x}" y="250" font-size="13" font-family="monospace" fill="#71717A" font-weight="600">{label}</text>"##
        ));
        let first_node = snapshot
            .nodes
            .iter()
            .find(|n| n.stage == *stage && matches!(n.stance, NodeStance::Active | NodeStance::OpenCrux));
        if let Some(node) = first_node {
            let title = cmap
                .get(node.concept_id.as_str())
                .map(|c| c.title.as_str())
                .unwrap_or(&node.concept_id);
            let border = if node.is_load_bearing_crux { "#D97706" } else { "#E4E2DC" };
            let badge = node
                .credence
                .as_ref()
                .map(|c| c.display_pill())
                .or_else(|| node.bet_priority.map(|p| p.label().to_string()))
                .unwrap_or_default();
            cards_svg.push_str(&format!(
                r##"<rect x="{x}" y="268" width="204" height="150" rx="12" fill="#FFFFFF" stroke="{border}" stroke-width="2"/>
                <text x="{tx}" y="308" font-size="17" font-weight="600" fill="#18181B">{t1}</text>
                <text x="{tx}" y="332" font-size="17" font-weight="600" fill="#18181B">{t2}</text>
                <rect x="{tx}" y="370" width="96" height="28" rx="14" fill="#F4F4F0"/>
                <text x="{bx}" y="389" font-size="13" font-weight="600" fill="#3F3F46">{badge}</text>"##,
                tx = x + 16,
                bx = x + 28,
                t1 = xml_escape(&truncate(title, 20)),
                t2 = xml_escape(&truncate(title.chars().skip(20).collect::<String>().trim(), 20)),
                badge = xml_escape(&truncate(&badge, 12)),
            ));
        }
    }

    let uc_line = snapshot
        .update_criteria
        .first()
        .map(|u| format!("IF {} -> {}", u.trigger, u.pivot_action))
        .unwrap_or_default();

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FAF9F6"/>
  <rect x="0" y="0" width="1200" height="72" fill="#FFFFFF"/>
  <line x1="0" y1="72" x2="1200" y2="72" stroke="#E4E2DC" stroke-width="1"/>
  <text x="56" y="46" font-size="24" font-weight="700" fill="#18181B">toc.open</text>
  <text x="1020" y="44" font-size="15" font-family="monospace" fill="#71717A">v{ver} · Open Data</text>

  <text x="56" y="138" font-size="38" font-weight="700" fill="#18181B">{name}</text>
  <text x="56" y="172" font-size="19" fill="#52525B">{role}</text>
  <text x="56" y="206" font-size="20" fill="#27272A">{summary}</text>

  {cards}

  <rect x="56" y="458" width="1088" height="118" rx="14" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="80" y="492" font-size="14" font-family="monospace" font-weight="700" fill="#92400E">UPDATE CRITERION (PIVOT TRIGGER)</text>
  <text x="80" y="530" font-size="20" font-weight="600" fill="#18181B">{uc}</text>
</svg>"##,
        ver = snapshot.version,
        name = xml_escape(&truncate(&actor.display_name, 42)),
        role = xml_escape(&truncate(&actor.role_or_affiliation, 70)),
        summary = xml_escape(&truncate(&snapshot.summary, 96)),
        cards = cards_svg,
        uc = xml_escape(&truncate(&uc_line, 92)),
    );

    render_svg_to_png(&svg)
}

pub fn render_compare_og_png(
    actor_a: &Actor,
    actor_b: &Actor,
    diff: &DiffResult,
) -> Result<Vec<u8>> {
    let top_crux = diff
        .top_cruxes
        .first()
        .map(|c| c.canonical_title.clone())
        .unwrap_or_else(|| "Distinct downstream bets".into());

    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FAF9F6"/>
  <rect x="0" y="0" width="1200" height="72" fill="#FFFFFF"/>
  <line x1="0" y1="72" x2="1200" y2="72" stroke="#E4E2DC" stroke-width="1"/>
  <text x="56" y="46" font-size="24" font-weight="700" fill="#18181B">toc.open</text>
  <text x="960" y="44" font-size="15" font-family="monospace" fill="#71717A">CRUX COMPARISON</text>

  <rect x="56" y="112" width="460" height="72" rx="14" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2.5"/>
  <circle cx="88" cy="148" r="9" fill="#4F46E5"/>
  <text x="110" y="156" font-size="26" font-weight="700" fill="#18181B">{name_a}</text>

  <text x="545" y="158" font-size="24" font-weight="700" fill="#71717A">vs</text>

  <rect x="600" y="112" width="544" height="72" rx="14" fill="#FFFFFF" stroke="#0D9488" stroke-width="2.5"/>
  <circle cx="632" cy="148" r="9" fill="#0D9488"/>
  <text x="654" y="156" font-size="26" font-weight="700" fill="#18181B">{name_b}</text>

  <rect x="56" y="218" width="260" height="54" rx="27" fill="#F3F2EC"/>
  <text x="86" y="252" font-size="20" font-weight="700" fill="#18181B">Both agree ({shared})</text>

  <rect x="336" y="218" width="290" height="54" rx="27" fill="#FFE4E6"/>
  <text x="366" y="252" font-size="20" font-weight="700" fill="#9F1239">Disagree ({cruxes})</text>

  <rect x="646" y="218" width="320" height="54" rx="27" fill="#FEF3C7"/>
  <text x="676" y="252" font-size="20" font-weight="700" fill="#92400E">{overlap}% Premise Overlap</text>

  <rect x="56" y="312" width="1088" height="250" rx="18" fill="#FFFFFF" stroke="#E11D48" stroke-width="2.5"/>
  <rect x="88" y="344" width="210" height="32" rx="16" fill="#FFE4E6"/>
  <text x="106" y="366" font-size="14" font-family="monospace" font-weight="700" fill="#9F1239">MAIN DISAGREEMENT</text>
  <text x="88" y="432" font-size="34" font-weight="700" fill="#18181B">{top_crux}</text>
  <text x="88" y="488" font-size="21" fill="#52525B">{headline}</text>
  <text x="88" y="534" font-size="16" font-family="monospace" fill="#71717A">Compare positions, credences &amp; update criteria at toc.open</text>
</svg>"##,
        name_a = xml_escape(&truncate(&actor_a.display_name, 26)),
        name_b = xml_escape(&truncate(&actor_b.display_name, 30)),
        shared = diff.summary.shared_ground_count,
        cruxes = diff.summary.crux_disagreement_count,
        overlap = diff.summary.premise_bottleneck_overlap_pct,
        top_crux = xml_escape(&truncate(&top_crux, 54)),
        headline = xml_escape(&truncate(&diff.summary.headline, 86)),
    );

    render_svg_to_png(&svg)
}
