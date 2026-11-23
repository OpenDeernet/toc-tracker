use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const CURRENT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum Stage {
    Premise,
    Bottleneck,
    Intervention,
    Bet,
    Outcome,
}

impl Stage {
    pub fn all() -> [Stage; 5] {
        [
            Stage::Premise,
            Stage::Bottleneck,
            Stage::Intervention,
            Stage::Bet,
            Stage::Outcome,
        ]
    }

    pub fn index(self) -> usize {
        match self {
            Stage::Premise => 0,
            Stage::Bottleneck => 1,
            Stage::Intervention => 2,
            Stage::Bet => 3,
            Stage::Outcome => 4,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Stage::Premise => "Premise",
            Stage::Bottleneck => "Bottleneck",
            Stage::Intervention => "Intervention",
            Stage::Bet => "Bet",
            Stage::Outcome => "Outcome",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Stage::Premise => "premise",
            Stage::Bottleneck => "bottleneck",
            Stage::Intervention => "intervention",
            Stage::Bet => "bet",
            Stage::Outcome => "outcome",
        }
    }

    pub fn from_str_opt(s: &str) -> Option<Stage> {
        match s {
            "premise" => Some(Stage::Premise),
            "bottleneck" => Some(Stage::Bottleneck),
            "intervention" => Some(Stage::Intervention),
            "bet" => Some(Stage::Bet),
            "outcome" => Some(Stage::Outcome),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActorKind {
    Individual,
    Organization,
}

impl ActorKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ActorKind::Individual => "individual",
            ActorKind::Organization => "organization",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthorshipStatus {
    SelfAuthored,
    CommunityDraft,
    Claimed,
}

impl AuthorshipStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthorshipStatus::SelfAuthored => "self_authored",
            AuthorshipStatus::CommunityDraft => "community_draft",
            AuthorshipStatus::Claimed => "claimed",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthorshipMode {
    SelfAuthored,
    CommunityDraft,
}

impl AuthorshipMode {
    pub fn as_str(self) -> &'static str {
        match self {
            AuthorshipMode::SelfAuthored => "self_authored",
            AuthorshipMode::CommunityDraft => "community_draft",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Actor {
    pub id: String,
    pub handle: String,
    pub display_name: String,
    pub kind: ActorKind,
    pub role_or_affiliation: String,
    #[serde(default)]
    pub one_line_stance: Option<String>,
    #[serde(default)]
    pub contact_preference: Option<String>,
    pub bio_url: Option<String>,
    pub avatar_initials: String,
    pub authorship_status: AuthorshipStatus,
    pub owner_user_id: Option<String>,
    pub verified_provider: Option<String>,
    pub verified_handle: Option<String>,
    pub arweave_pubkey: Option<String>,
    pub primary_snapshot_id: Option<String>,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Concept {
    pub schema_version: u32,
    pub id: String,
    pub stage: Stage,
    pub title: String,
    pub description: String,
    pub parent_concept_id: Option<String>,
    pub root_concept_id: String,
    pub tags: Vec<String>,
    pub created_by_actor_id: Option<String>,
    pub arweave_tx_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStance {
    Active,
    Rejected,
    Deprioritized,
    OpenCrux,
}

impl NodeStance {
    pub fn as_str(self) -> &'static str {
        match self {
            NodeStance::Active => "active",
            NodeStance::Rejected => "rejected",
            NodeStance::Deprioritized => "deprioritized",
            NodeStance::OpenCrux => "open_crux",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredenceMode {
    Qualitative,
    Numeric,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum CredenceBand {
    VeryLow,
    Low,
    Medium,
    High,
    VeryHigh,
}

impl CredenceBand {
    pub fn midpoint(self) -> i32 {
        match self {
            CredenceBand::VeryLow => 10,
            CredenceBand::Low => 25,
            CredenceBand::Medium => 50,
            CredenceBand::High => 75,
            CredenceBand::VeryHigh => 90,
        }
    }

    pub fn from_percent(p: u8) -> Self {
        match p {
            0..=15 => CredenceBand::VeryLow,
            16..=35 => CredenceBand::Low,
            36..=64 => CredenceBand::Medium,
            65..=84 => CredenceBand::High,
            _ => CredenceBand::VeryHigh,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            CredenceBand::VeryLow => "Very Low",
            CredenceBand::Low => "Low",
            CredenceBand::Medium => "Medium",
            CredenceBand::High => "High",
            CredenceBand::VeryHigh => "Very High",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            CredenceBand::VeryLow => "very_low",
            CredenceBand::Low => "low",
            CredenceBand::Medium => "medium",
            CredenceBand::High => "high",
            CredenceBand::VeryHigh => "very_high",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Credence {
    pub mode: CredenceMode,
    pub band: CredenceBand,
    pub percent: Option<u8>,
    pub percent_range: Option<(u8, u8)>,
    pub numeric_rationale: Option<String>,
}

impl Credence {
    pub fn qualitative(band: CredenceBand) -> Self {
        Self {
            mode: CredenceMode::Qualitative,
            band,
            percent: None,
            percent_range: None,
            numeric_rationale: None,
        }
    }

    pub fn numeric(percent: u8, rationale: impl Into<String>) -> Self {
        Self {
            mode: CredenceMode::Numeric,
            band: CredenceBand::from_percent(percent),
            percent: Some(percent.min(100)),
            percent_range: None,
            numeric_rationale: Some(rationale.into()),
        }
    }

    pub fn numeric_score(&self) -> i32 {
        self.percent.map(|p| p as i32).unwrap_or_else(|| self.band.midpoint())
    }

    pub fn display_pill(&self) -> String {
        match (self.mode, self.percent) {
            (CredenceMode::Numeric, Some(p)) => format!("{p}%"),
            _ => self.band.label().to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BetPriority {
    Primary,
    Secondary,
    Supporting,
}

impl BetPriority {
    pub fn label(self) -> &'static str {
        match self {
            BetPriority::Primary => "Primary Bet",
            BetPriority::Secondary => "Secondary Bet",
            BetPriority::Supporting => "Supporting",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    pub label: String,
    pub url: String,
    pub quote: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotNode {
    pub local_id: String,
    pub concept_id: String,
    pub stage: Stage,
    pub stance: NodeStance,
    pub is_load_bearing_crux: bool,
    pub credence: Option<Credence>,
    pub bet_priority: Option<BetPriority>,
    pub note: Option<String>,
    pub citations: Vec<Citation>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeRelation {
    LeadsTo,
    Mitigates,
    DependsOn,
    ConflictsWith,
}

impl EdgeRelation {
    pub fn label(self) -> &'static str {
        match self {
            EdgeRelation::LeadsTo => "leads to",
            EdgeRelation::Mitigates => "mitigates",
            EdgeRelation::DependsOn => "depends on",
            EdgeRelation::ConflictsWith => "conflicts with",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEdge {
    pub id: String,
    pub source_local_id: String,
    pub target_local_id: String,
    pub relation: Option<EdgeRelation>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CriterionStatus {
    Watching,
    PartiallyMet,
    Triggered,
    Expired,
    Retired,
}

impl CriterionStatus {
    pub fn label(self) -> &'static str {
        match self {
            CriterionStatus::Watching => "Watching",
            CriterionStatus::PartiallyMet => "Partially Met",
            CriterionStatus::Triggered => "Triggered",
            CriterionStatus::Expired => "Expired",
            CriterionStatus::Retired => "Retired",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCriterion {
    pub id: String,
    pub target_local_id: Option<String>,
    pub trigger: String,
    pub timeframe: Option<String>,
    pub pivot_action: String,
    pub status: CriterionStatus,
    pub evidence_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Omission {
    pub concept_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToCSnapshot {
    pub schema_version: u32,
    pub id: String,
    pub actor_id: String,
    pub version: i32,
    pub previous_snapshot_id: Option<String>,
    pub authorship_mode: AuthorshipMode,
    pub summary: String,
    #[serde(default)]
    pub essay_markdown: Option<String>,
    pub changelog_note: Option<String>,
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub update_criteria: Vec<UpdateCriterion>,
    #[serde(default)]
    pub omissions: Vec<Omission>,
    pub published_at: DateTime<Utc>,
    pub arweave_tx_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttestationRelation {
    Synonym,
    Specializes,
    Opposes,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkAttestation {
    pub schema_version: u32,
    pub id: String,
    pub source_concept_id: String,
    pub target_concept_id: String,
    pub relation: AttestationRelation,
    pub attester_actor_id: Option<String>,
    pub note: String,
    pub arweave_tx_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Archetype {
    pub id: String,
    pub name: String,
    pub tagline: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub nodes: Vec<SnapshotNode>,
    pub edges: Vec<SnapshotEdge>,
    pub update_criteria: Vec<UpdateCriterion>,
}
