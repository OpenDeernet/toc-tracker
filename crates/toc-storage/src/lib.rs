use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArweaveTag {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishEnvelope {
    pub record_type: String,
    pub record_id: String,
    pub actor_id: Option<String>,
    pub root_concept_id: Option<String>,
    pub prev_tx_id: Option<String>,
    pub payload: serde_json::Value,
}

impl PublishEnvelope {
    pub fn canonical_tags(&self) -> Vec<ArweaveTag> {
        let mut tags = vec![
            ArweaveTag { name: "Content-Type".into(), value: "application/json".into() },
            ArweaveTag { name: "App-Name".into(), value: "toc-open".into() },
            ArweaveTag { name: "Schema-Version".into(), value: toc_core::CURRENT_SCHEMA_VERSION.to_string() },
            ArweaveTag { name: "Record-Type".into(), value: self.record_type.clone() },
            ArweaveTag { name: "Record-Id".into(), value: self.record_id.clone() },
        ];
        if let Some(a) = &self.actor_id {
            tags.push(ArweaveTag { name: "Actor-Id".into(), value: a.clone() });
        }
        if let Some(r) = &self.root_concept_id {
            tags.push(ArweaveTag { name: "Root-Concept".into(), value: r.clone() });
        }
        if let Some(p) = &self.prev_tx_id {
            tags.push(ArweaveTag { name: "Prev-Tx".into(), value: p.clone() });
        }
        tags
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvisionedKeypair {
    pub public_key_b64: String,
    pub secret_key_b64: String,
}

pub fn generate_user_keypair() -> ProvisionedKeypair {
    let mut csprng = OsRng;
    let signing = SigningKey::generate(&mut csprng);
    let verifying = signing.verifying_key();
    ProvisionedKeypair {
        public_key_b64: URL_SAFE_NO_PAD.encode(verifying.to_bytes()),
        secret_key_b64: URL_SAFE_NO_PAD.encode(signing.to_bytes()),
    }
}

pub fn sign_payload_b64(secret_key_b64: &str, payload: &[u8]) -> Result<String> {
    let bytes = URL_SAFE_NO_PAD
        .decode(secret_key_b64)
        .map_err(|e| anyhow!("invalid secret key encoding: {e}"))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow!("expected 32-byte ed25519 secret key"))?;
    let signing = SigningKey::from_bytes(&arr);
    let sig = signing.sign(payload);
    Ok(URL_SAFE_NO_PAD.encode(sig.to_bytes()))
}

#[async_trait]
pub trait StorageAdapter: Send + Sync {
    async fn publish(&self, envelope: &PublishEnvelope) -> Result<String>;
    fn gateway_url(&self, tx_id: &str) -> String;
    fn adapter_name(&self) -> &'static str;
}

/// Deterministic offline adapter for local dev & tests.
pub struct LocalMockAdapter;

#[async_trait]
impl StorageAdapter for LocalMockAdapter {
    async fn publish(&self, envelope: &PublishEnvelope) -> Result<String> {
        let canonical = serde_json::to_vec(&envelope.payload)?;
        let mut hasher = Sha256::new();
        hasher.update(&canonical);
        hasher.update(envelope.record_id.as_bytes());
        let digest = hasher.finalize();
        let encoded = URL_SAFE_NO_PAD.encode(digest);
        Ok(format!("local_{}", &encoded[..24]))
    }

    fn gateway_url(&self, tx_id: &str) -> String {
        format!("https://arweave.net/{tx_id}")
    }

    fn adapter_name(&self) -> &'static str {
        "local-mock"
    }
}

/// Arweave / ArDrive Turbo publisher adapter.
/// Submits tagged JSON records to a configured Turbo/bundler endpoint and queries public Arweave GraphQL.
pub struct TurboArweaveAdapter {
    client: reqwest::Client,
    upload_endpoint: String,
    graphql_endpoint: String,
    api_token: Option<String>,
}

impl TurboArweaveAdapter {
    pub fn new(upload_endpoint: String, graphql_endpoint: String, api_token: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            upload_endpoint,
            graphql_endpoint,
            api_token,
        }
    }

    pub fn graphql_query_by_app(&self) -> String {
        format!(
            r#"{{ transactions(tags: [{{ name: "App-Name", values: ["toc-open"] }}], first: 100) {{ edges {{ node {{ id tags {{ name value }} }} }} }} }}"#
        )
    }

    pub fn graphql_endpoint(&self) -> &str {
        &self.graphql_endpoint
    }
}

#[async_trait]
impl StorageAdapter for TurboArweaveAdapter {
    async fn publish(&self, envelope: &PublishEnvelope) -> Result<String> {
        let body = serde_json::json!({
            "tags": envelope.canonical_tags(),
            "data": envelope.payload,
        });
        let mut req = self.client.post(&self.upload_endpoint).json(&body);
        if let Some(tok) = &self.api_token {
            req = req.bearer_auth(tok);
        }
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("arweave bundler upload failed ({status}): {text}"));
        }
        let val: serde_json::Value = resp.json().await?;
        val.get("id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| anyhow!("missing tx id in bundler response"))
    }

    fn gateway_url(&self, tx_id: &str) -> String {
        format!("https://arweave.net/{tx_id}")
    }

    fn adapter_name(&self) -> &'static str {
        "arweave-turbo"
    }
}
