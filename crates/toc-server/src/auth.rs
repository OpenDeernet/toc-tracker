use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect},
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use toc_storage::generate_user_keypair;

use crate::repo::UserRecord;
use crate::routes::AppState;

const SESSION_COOKIE: &str = "toc_session";

#[derive(Debug, Clone)]
pub struct PendingOAuth {
    pub code_verifier: Option<String>,
    pub redirect_after: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Default)]
pub struct OAuthStateStore {
    inner: RwLock<HashMap<String, PendingOAuth>>,
}

impl OAuthStateStore {
    pub fn insert(&self, state_key: String, pending: PendingOAuth) {
        let mut map = self.inner.write().unwrap();
        let now = Utc::now();
        map.retain(|_, v| v.expires_at > now);
        map.insert(state_key, pending);
    }

    pub fn take(&self, state_key: &str) -> Option<PendingOAuth> {
        let mut map = self.inner.write().unwrap();
        let entry = map.remove(state_key)?;
        if entry.expires_at < Utc::now() {
            return None;
        }
        Some(entry)
    }
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn random_b64_token(len: usize) -> String {
    let mut buf = vec![0u8; len];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn pkce_s256_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

pub fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let mut kv = part.trim().splitn(2, '=');
        let k = kv.next()?.trim();
        let v = kv.next()?.trim();
        if k == SESSION_COOKIE && !v.is_empty() {
            return Some(v.to_string());
        }
    }
    None
}

pub async fn current_user(state: &AppState, headers: &HeaderMap) -> Option<UserRecord> {
    let tok = extract_session_token(headers)?;
    let hash = hash_token(&tok);
    state.repo.get_user_by_session_hash(&hash).await.ok().flatten()
}

fn build_session_cookie(token: &str, max_age_secs: i64) -> String {
    format!("{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age_secs}")
}

async fn issue_session_cookie(state: &AppState, user_id: &str) -> anyhow::Result<String> {
    let raw_token = format!("tok_{}", random_b64_token(24));
    let token_hash = hash_token(&raw_token);
    let expires = Utc::now() + Duration::days(30);
    state.repo.create_session(user_id, &token_hash, expires).await?;
    Ok(build_session_cookie(&raw_token, 30 * 24 * 3600))
}

#[derive(Serialize)]
pub struct AuthProvidersInfo {
    pub x_oauth_enabled: bool,
    pub github_oauth_enabled: bool,
    pub dev_email_login_enabled: bool,
}

pub async fn auth_providers() -> Json<AuthProvidersInfo> {
    Json(AuthProvidersInfo {
        x_oauth_enabled: std::env::var("X_CLIENT_ID").map(|v| !v.is_empty()).unwrap_or(false),
        github_oauth_enabled: std::env::var("GITHUB_CLIENT_ID").map(|v| !v.is_empty()).unwrap_or(false),
        dev_email_login_enabled: true,
    })
}

#[derive(Deserialize)]
pub struct DevLoginRequest {
    pub email: String,
    pub display_name: Option<String>,
    pub x_handle: Option<String>,
}

#[derive(Serialize)]
pub struct OwnedActorLink {
    pub handle: String,
    pub display_name: String,
}

#[derive(Serialize)]
pub struct MeResponse {
    pub authenticated: bool,
    pub user: Option<PublicUser>,
    pub owned_actors: Vec<OwnedActorLink>,
}

#[derive(Serialize)]
pub struct PublicUser {
    pub id: String,
    pub display_name: String,
    pub email: Option<String>,
    pub x_handle: Option<String>,
    pub github_handle: Option<String>,
    pub arweave_pubkey: String,
}

impl From<UserRecord> for PublicUser {
    fn from(u: UserRecord) -> Self {
        Self {
            id: u.id,
            display_name: u.display_name,
            email: u.email,
            x_handle: u.x_handle,
            github_handle: u.github_handle,
            arweave_pubkey: u.arweave_pubkey,
        }
    }
}

pub async fn get_me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<MeResponse> {
    let user = current_user(&state, &headers).await;
    let owned_actors = if let Some(ref u) = user {
        state
            .repo
            .list_actors()
            .await
            .unwrap_or_default()
            .into_iter()
            .filter(|a| a.owner_user_id.as_deref() == Some(u.id.as_str()))
            .map(|a| OwnedActorLink {
                handle: a.handle,
                display_name: a.display_name,
            })
            .collect()
    } else {
        vec![]
    };
    Json(MeResponse {
        authenticated: user.is_some(),
        user: user.map(PublicUser::from),
        owned_actors,
    })
}

/// Frictionless Email / Magic-Link / Local Dev sign-in that silently provisions an exportable
/// Arweave-compatible Ed25519 signing keypair so users own their open data without touching crypto.
pub async fn dev_email_login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<DevLoginRequest>,
) -> impl IntoResponse {
    let email = req.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return (
            StatusCode::BAD_REQUEST,
            HeaderMap::new(),
            Json(serde_json::json!({ "error": "Please enter a valid email address." })),
        );
    }

    let user = match state.repo.find_user_by_email(&email).await {
        Ok(Some(existing)) => existing,
        _ => {
            let kp = generate_user_keypair();
            let display = req
                .display_name
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| email.split('@').next().unwrap_or("Researcher").to_string());
            let rec = UserRecord {
                id: format!("usr_{}", uuid::Uuid::new_v4().simple()),
                email: Some(email),
                x_user_id: None,
                x_handle: req.x_handle.filter(|s| !s.trim().is_empty()),
                github_user_id: None,
                github_handle: None,
                display_name: display,
                arweave_pubkey: kp.public_key_b64,
                encrypted_key_blob: kp.secret_key_b64,
                created_at: Utc::now(),
            };
            match state.repo.upsert_user(rec).await {
                Ok(u) => u,
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        HeaderMap::new(),
                        Json(serde_json::json!({ "error": e.to_string() })),
                    )
                }
            }
        }
    };

    let cookie = match issue_session_cookie(&state, &user.id).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                HeaderMap::new(),
                Json(serde_json::json!({ "error": e.to_string() })),
            )
        }
    };

    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, cookie.parse().unwrap());

    (
        StatusCode::OK,
        headers,
        Json(serde_json::json!({
            "authenticated": true,
            "user": PublicUser::from(user),
        })),
    )
}

pub async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(tok) = extract_session_token(&headers) {
        let _ = state.repo.delete_session_hash(&hash_token(&tok)).await;
    }
    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(
        header::SET_COOKIE,
        build_session_cookie("", 0).parse().unwrap(),
    );
    (StatusCode::OK, resp_headers, Json(serde_json::json!({ "ok": true })))
}

pub async fn export_signing_key(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let Some(user) = current_user(&state, &headers).await else {
        return (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Sign in to export your open-data signing key." })),
        );
    };
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "key_type": "ed25519",
            "public_key_b64": user.arweave_pubkey,
            "secret_key_b64": user.encrypted_key_blob,
            "note": "Keep this secret key safe. It proves cryptographic authorship of your toc.open open-data records."
        })),
    )
}

#[derive(Deserialize)]
pub struct OAuthStartQuery {
    pub next: Option<String>,
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
}

// ============================================================================
// X (Twitter) OAuth 2.0 PKCE (S256)
// ============================================================================

pub async fn x_oauth_start(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OAuthStartQuery>,
) -> impl IntoResponse {
    let Ok(client_id) = std::env::var("X_CLIENT_ID") else {
        return Redirect::temporary("/?auth_notice=x_oauth_unconfigured").into_response();
    };
    if client_id.trim().is_empty() {
        return Redirect::temporary("/?auth_notice=x_oauth_unconfigured").into_response();
    }

    let redirect_uri = std::env::var("X_REDIRECT_URI")
        .unwrap_or_else(|_| format!("{}/auth/x/callback", state.public_base_url));
    let state_key = random_b64_token(24);
    let verifier = random_b64_token(32);
    let challenge = pkce_s256_challenge(&verifier);

    state.oauth_states.insert(
        state_key.clone(),
        PendingOAuth {
            code_verifier: Some(verifier),
            redirect_after: q.next.filter(|s| s.starts_with('/')).unwrap_or_else(|| "/".into()),
            expires_at: Utc::now() + Duration::minutes(10),
        },
    );

    let url = format!(
        "https://twitter.com/i/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=users.read%20tweet.read&state={}&code_challenge={}&code_challenge_method=S256",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state_key),
        urlencoding::encode(&challenge),
    );
    Redirect::temporary(&url).into_response()
}

pub async fn x_oauth_callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OAuthCallbackQuery>,
) -> impl IntoResponse {
    let (Some(code), Some(state_key)) = (q.code, q.state) else {
        return Redirect::temporary("/?auth_error=x_missing_params").into_response();
    };
    let Some(pending) = state.oauth_states.take(&state_key) else {
        return Redirect::temporary("/?auth_error=x_invalid_state").into_response();
    };
    let Ok(client_id) = std::env::var("X_CLIENT_ID") else {
        return Redirect::temporary("/?auth_error=x_unconfigured").into_response();
    };
    let client_secret = std::env::var("X_CLIENT_SECRET").ok().filter(|s| !s.is_empty());
    let redirect_uri = std::env::var("X_REDIRECT_URI")
        .unwrap_or_else(|_| format!("{}/auth/x/callback", state.public_base_url));

    let client = reqwest::Client::new();
    let mut token_req = client
        .post("https://api.twitter.com/2/oauth2/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect_uri.as_str()),
            ("client_id", client_id.as_str()),
            ("code_verifier", pending.code_verifier.as_deref().unwrap_or("")),
        ]);
    if let Some(secret) = client_secret {
        token_req = token_req.basic_auth(client_id, Some(secret));
    }

    let Ok(token_resp) = token_req.send().await else {
        return Redirect::temporary("/?auth_error=x_token_network").into_response();
    };
    let Ok(token_json) = token_resp.json::<serde_json::Value>().await else {
        return Redirect::temporary("/?auth_error=x_token_parse").into_response();
    };
    let Some(access_token) = token_json.get("access_token").and_then(|v| v.as_str()) else {
        return Redirect::temporary("/?auth_error=x_token_rejected").into_response();
    };

    let Ok(me_resp) = client
        .get("https://api.twitter.com/2/users/me?user.fields=username,name")
        .bearer_auth(access_token)
        .send()
        .await
    else {
        return Redirect::temporary("/?auth_error=x_profile_failed").into_response();
    };
    let Ok(me_json) = me_resp.json::<serde_json::Value>().await else {
        return Redirect::temporary("/?auth_error=x_profile_parse").into_response();
    };
    let Some(x_id) = me_json["data"]["id"].as_str() else {
        return Redirect::temporary("/?auth_error=x_profile_missing").into_response();
    };
    let username = me_json["data"]["username"].as_str().unwrap_or("x_user");
    let display = me_json["data"]["name"].as_str().unwrap_or(username);

    let user = match state.repo.find_user_by_x(x_id).await {
        Ok(Some(existing)) => existing,
        _ => {
            let kp = generate_user_keypair();
            let rec = UserRecord {
                id: format!("usr_{}", uuid::Uuid::new_v4().simple()),
                email: None,
                x_user_id: Some(x_id.to_string()),
                x_handle: Some(format!("@{username}")),
                github_user_id: None,
                github_handle: None,
                display_name: display.to_string(),
                arweave_pubkey: kp.public_key_b64,
                encrypted_key_blob: kp.secret_key_b64,
                created_at: Utc::now(),
            };
            match state.repo.upsert_user(rec).await {
                Ok(u) => u,
                Err(_) => return Redirect::temporary("/?auth_error=user_save").into_response(),
            }
        }
    };

    let Ok(cookie) = issue_session_cookie(&state, &user.id).await else {
        return Redirect::temporary("/?auth_error=session_create").into_response();
    };
    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, cookie.parse().unwrap());
    (headers, Redirect::temporary(&pending.redirect_after)).into_response()
}

// ============================================================================
// GitHub OAuth 2.0
// ============================================================================

pub async fn github_oauth_start(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OAuthStartQuery>,
) -> impl IntoResponse {
    let Ok(client_id) = std::env::var("GITHUB_CLIENT_ID") else {
        return Redirect::temporary("/?auth_notice=github_oauth_unconfigured").into_response();
    };
    if client_id.trim().is_empty() {
        return Redirect::temporary("/?auth_notice=github_oauth_unconfigured").into_response();
    }

    let redirect_uri = std::env::var("GITHUB_REDIRECT_URI")
        .unwrap_or_else(|_| format!("{}/auth/github/callback", state.public_base_url));
    let state_key = random_b64_token(24);
    state.oauth_states.insert(
        state_key.clone(),
        PendingOAuth {
            code_verifier: None,
            redirect_after: q.next.filter(|s| s.starts_with('/')).unwrap_or_else(|| "/".into()),
            expires_at: Utc::now() + Duration::minutes(10),
        },
    );

    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user%20user:email&state={}",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(&state_key),
    );
    Redirect::temporary(&url).into_response()
}

pub async fn github_oauth_callback(
    State(state): State<Arc<AppState>>,
    Query(q): Query<OAuthCallbackQuery>,
) -> impl IntoResponse {
    let (Some(code), Some(state_key)) = (q.code, q.state) else {
        return Redirect::temporary("/?auth_error=github_missing_params").into_response();
    };
    let Some(pending) = state.oauth_states.take(&state_key) else {
        return Redirect::temporary("/?auth_error=github_invalid_state").into_response();
    };
    let (Ok(client_id), Ok(client_secret)) = (
        std::env::var("GITHUB_CLIENT_ID"),
        std::env::var("GITHUB_CLIENT_SECRET"),
    ) else {
        return Redirect::temporary("/?auth_error=github_unconfigured").into_response();
    };

    let client = reqwest::Client::new();
    let Ok(token_resp) = client
        .post("https://github.com/login/oauth/access_token")
        .header(header::ACCEPT, "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
        ])
        .send()
        .await
    else {
        return Redirect::temporary("/?auth_error=github_token_network").into_response();
    };
    let Ok(token_json) = token_resp.json::<serde_json::Value>().await else {
        return Redirect::temporary("/?auth_error=github_token_parse").into_response();
    };
    let Some(access_token) = token_json.get("access_token").and_then(|v| v.as_str()) else {
        return Redirect::temporary("/?auth_error=github_token_rejected").into_response();
    };

    let Ok(me_resp) = client
        .get("https://api.github.com/user")
        .header(header::USER_AGENT, "toc-open-server")
        .bearer_auth(access_token)
        .send()
        .await
    else {
        return Redirect::temporary("/?auth_error=github_profile_failed").into_response();
    };
    let Ok(me_json) = me_resp.json::<serde_json::Value>().await else {
        return Redirect::temporary("/?auth_error=github_profile_parse").into_response();
    };
    let Some(gh_id) = me_json.get("id").and_then(|v| v.as_i64()) else {
        return Redirect::temporary("/?auth_error=github_profile_missing").into_response();
    };
    let gh_id_str = gh_id.to_string();
    let login = me_json["login"].as_str().unwrap_or("gh_user");
    let display = me_json["name"].as_str().filter(|s| !s.is_empty()).unwrap_or(login);
    let email = me_json["email"].as_str().map(str::to_string);

    let user = match state.repo.find_user_by_github(&gh_id_str).await {
        Ok(Some(existing)) => existing,
        _ => {
            let kp = generate_user_keypair();
            let rec = UserRecord {
                id: format!("usr_{}", uuid::Uuid::new_v4().simple()),
                email,
                x_user_id: None,
                x_handle: None,
                github_user_id: Some(gh_id_str),
                github_handle: Some(format!("@{login}")),
                display_name: display.to_string(),
                arweave_pubkey: kp.public_key_b64,
                encrypted_key_blob: kp.secret_key_b64,
                created_at: Utc::now(),
            };
            match state.repo.upsert_user(rec).await {
                Ok(u) => u,
                Err(_) => return Redirect::temporary("/?auth_error=user_save").into_response(),
            }
        }
    };

    let Ok(cookie) = issue_session_cookie(&state, &user.id).await else {
        return Redirect::temporary("/?auth_error=session_create").into_response();
    };
    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, cookie.parse().unwrap());
    (headers, Redirect::temporary(&pending.redirect_after)).into_response()
}
