use std::sync::Arc;

use axum::{
    extract::{Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Redirect},
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use toc_storage::generate_user_keypair;

use crate::repo::UserRecord;
use crate::routes::AppState;

const SESSION_COOKIE: &str = "toc_session";

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
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
pub struct MeResponse {
    pub authenticated: bool,
    pub user: Option<PublicUser>,
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
    let user = current_user(&state, &headers).await.map(PublicUser::from);
    Json(MeResponse {
        authenticated: user.is_some(),
        user,
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

    let raw_token = format!("tok_{}", uuid::Uuid::new_v4().simple());
    let token_hash = hash_token(&raw_token);
    let expires = Utc::now() + Duration::days(30);
    if let Err(e) = state.repo.create_session(&user.id, &token_hash, expires).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            HeaderMap::new(),
            Json(serde_json::json!({ "error": e.to_string() })),
        );
    }

    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        build_session_cookie(&raw_token, 30 * 24 * 3600).parse().unwrap(),
    );

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

// OAuth Start Stubs (redirect to X / GitHub when env vars are set)
pub async fn x_oauth_start() -> impl IntoResponse {
    let Ok(client_id) = std::env::var("X_CLIENT_ID") else {
        return Redirect::temporary("/?auth_notice=x_oauth_unconfigured").into_response();
    };
    let redirect_uri = std::env::var("X_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/auth/x/callback".into());
    let state_param = uuid::Uuid::new_v4().simple().to_string();
    let url = format!(
        "https://twitter.com/i/oauth2/authorize?response_type=code&client_id={}&redirect_uri={}&scope=tweet.read%20users.read&state={}&code_challenge=challenge&code_challenge_method=plain",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri),
        state_param
    );
    Redirect::temporary(&url).into_response()
}

pub async fn github_oauth_start() -> impl IntoResponse {
    let Ok(client_id) = std::env::var("GITHUB_CLIENT_ID") else {
        return Redirect::temporary("/?auth_notice=github_oauth_unconfigured").into_response();
    };
    let redirect_uri = std::env::var("GITHUB_REDIRECT_URI")
        .unwrap_or_else(|_| "http://localhost:3001/auth/github/callback".into());
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=read:user%20user:email",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri)
    );
    Redirect::temporary(&url).into_response()
}

#[derive(Deserialize)]
pub struct OAuthCallbackQuery {
    pub _code: Option<String>,
}

pub async fn oauth_callback_placeholder(Query(_q): Query<OAuthCallbackQuery>) -> Redirect {
    Redirect::temporary("/")
}
