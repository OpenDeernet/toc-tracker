use anyhow::{anyhow, Result};
use async_trait::async_trait;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256, Sha384};

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
            ArweaveTag { name: "App-Name".into(), value: "toctracker".into() },
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
    let signing = parse_signing_key(secret_key_b64)?;
    let sig = signing.sign(payload);
    Ok(URL_SAFE_NO_PAD.encode(sig.to_bytes()))
}

fn parse_signing_key(secret_key_b64: &str) -> Result<SigningKey> {
    let bytes = URL_SAFE_NO_PAD
        .decode(secret_key_b64.trim())
        .map_err(|e| anyhow!("invalid secret key encoding: {e}"))?;
    let arr: [u8; 32] = bytes
        .try_into()
        .map_err(|_| anyhow!("expected 32-byte ed25519 secret key"))?;
    Ok(SigningKey::from_bytes(&arr))
}

// ============================================================================
// Pure-Rust ANS-104 Signed DataItem (Signature Type 2 = Ed25519)
// ============================================================================

fn write_avro_long(buf: &mut Vec<u8>, value: i64) {
    let mut zigzag = ((value << 1) ^ (value >> 63)) as u64;
    while (zigzag & !0x7f) != 0 {
        buf.push(((zigzag & 0x7f) as u8) | 0x80);
        zigzag >>= 7;
    }
    buf.push(zigzag as u8);
}

pub fn encode_ans104_tags(tags: &[ArweaveTag]) -> Vec<u8> {
    if tags.is_empty() {
        return Vec::new();
    }
    let mut buf = Vec::new();
    write_avro_long(&mut buf, tags.len() as i64);
    for t in tags {
        write_avro_long(&mut buf, t.name.len() as i64);
        buf.extend_from_slice(t.name.as_bytes());
        write_avro_long(&mut buf, t.value.len() as i64);
        buf.extend_from_slice(t.value.as_bytes());
    }
    buf.push(0x00);
    buf
}

fn sha384(data: &[u8]) -> [u8; 48] {
    let mut h = Sha384::new();
    h.update(data);
    h.finalize().into()
}

fn deep_hash_blob(data: &[u8]) -> [u8; 48] {
    let tag = format!("blob{}", data.len());
    let h1 = sha384(tag.as_bytes());
    let h2 = sha384(data);
    let mut combined = [0u8; 96];
    combined[..48].copy_from_slice(&h1);
    combined[48..].copy_from_slice(&h2);
    sha384(&combined)
}

fn deep_hash_blobs(blobs: &[&[u8]]) -> [u8; 48] {
    let tag = format!("list{}", blobs.len());
    let mut acc = sha384(tag.as_bytes());
    for blob in blobs {
        let ch = deep_hash_blob(blob);
        let mut combined = [0u8; 96];
        combined[..48].copy_from_slice(&acc);
        combined[48..].copy_from_slice(&ch);
        acc = sha384(&combined);
    }
    acc
}

/// Builds a binary ANS-104 DataItem signed with Ed25519 (Signature Type 2) and returns `(raw_bytes, tx_id)`.
pub fn build_signed_ans104_data_item(
    signing_key: &SigningKey,
    tags: &[ArweaveTag],
    data: &[u8],
) -> (Vec<u8>, String) {
    let owner = signing_key.verifying_key().to_bytes();
    let encoded_tags = encode_ans104_tags(tags);

    let digest = deep_hash_blobs(&[
        b"dataitem",
        b"1",
        b"2", // Signature Type 2 = Ed25519 (Solana/Ed25519)
        &owner,
        &[], // no target
        &[], // no anchor
        &encoded_tags,
        data,
    ]);

    let signature = signing_key.sign(&digest).to_bytes();
    let tx_id = URL_SAFE_NO_PAD.encode(Sha256::digest(signature));

    let mut raw = Vec::with_capacity(2 + 64 + 32 + 2 + 16 + encoded_tags.len() + data.len());
    raw.extend_from_slice(&2u16.to_le_bytes()); // signature_type = 2 (Ed25519)
    raw.extend_from_slice(&signature); // 64 bytes
    raw.extend_from_slice(&owner); // 32 bytes
    raw.push(0u8); // target absent
    raw.push(0u8); // anchor absent
    raw.extend_from_slice(&(tags.len() as u64).to_le_bytes());
    raw.extend_from_slice(&(encoded_tags.len() as u64).to_le_bytes());
    raw.extend_from_slice(&encoded_tags);
    raw.extend_from_slice(data);

    (raw, tx_id)
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

/// Real Arweave / ArDrive Turbo publisher adapter.
/// Builds Ed25519-signed ANS-104 binary DataItems and POSTs them to `https://upload.ardrive.io/v1/tx`
/// (free & subsidized for all records under 100 KiB!).
pub struct TurboArweaveAdapter {
    client: reqwest::Client,
    upload_endpoint: String,
    graphql_endpoint: String,
    api_token: Option<String>,
    signing_key: SigningKey,
}

impl TurboArweaveAdapter {
    pub fn new(
        upload_endpoint: String,
        graphql_endpoint: String,
        api_token: Option<String>,
        signer_secret_b64: Option<String>,
    ) -> Self {
        let signing_key = signer_secret_b64
            .as_deref()
            .and_then(|s| parse_signing_key(s).ok())
            .unwrap_or_else(|| {
                let mut csprng = OsRng;
                SigningKey::generate(&mut csprng)
            });

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        Self {
            client,
            upload_endpoint,
            graphql_endpoint,
            api_token,
            signing_key,
        }
    }

    pub fn publisher_pubkey_b64(&self) -> String {
        URL_SAFE_NO_PAD.encode(self.signing_key.verifying_key().to_bytes())
    }

    pub fn graphql_query_by_app(&self) -> String {
        r#"{ transactions(tags: [{ name: "App-Name", values: ["toctracker"] }], first: 100) { edges { node { id tags { name value } } } } }"#.into()
    }

    pub fn graphql_endpoint(&self) -> &str {
        &self.graphql_endpoint
    }
}

#[async_trait]
impl StorageAdapter for TurboArweaveAdapter {
    async fn publish(&self, envelope: &PublishEnvelope) -> Result<String> {
        let data = serde_json::to_vec(&envelope.payload)?;
        let tags = envelope.canonical_tags();
        let (raw_item, expected_id) = build_signed_ans104_data_item(&self.signing_key, &tags, &data);

        let mut req = self
            .client
            .post(&self.upload_endpoint)
            .header("Content-Type", "application/octet-stream")
            .body(raw_item);
        if let Some(tok) = &self.api_token {
            if !tok.trim().is_empty() {
                req = req.bearer_auth(tok);
            }
        }
        let resp = req.send().await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(anyhow!("arweave turbo upload failed ({status}): {text}"));
        }
        let val: serde_json::Value = resp.json().await?;
        Ok(val
            .get("id")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or(expected_id))
    }

    fn gateway_url(&self, tx_id: &str) -> String {
        format!("https://arweave.net/{tx_id}")
    }

    fn adapter_name(&self) -> &'static str {
        "arweave-turbo"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_valid_ans104_ed25519_data_item() {
        let kp = generate_user_keypair();
        let sk = parse_signing_key(&kp.secret_key_b64).unwrap();
        let env = PublishEnvelope {
            record_type: "toc_snapshot".into(),
            record_id: "snp_test_1".into(),
            actor_id: Some("act_test".into()),
            root_concept_id: None,
            prev_tx_id: None,
            payload: serde_json::json!({"hello": "toctracker"}),
        };
        let data = serde_json::to_vec(&env.payload).unwrap();
        let (raw, tx_id) = build_signed_ans104_data_item(&sk, &env.canonical_tags(), &data);
        assert_eq!(&raw[0..2], &2u16.to_le_bytes());
        assert_eq!(tx_id.len(), 43); // 32-byte SHA-256 base64url nopad
        assert!(raw.ends_with(&data));
    }
}
