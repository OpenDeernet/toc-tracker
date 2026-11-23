mod ai;
mod auth;
mod og;
mod repo;
mod routes;

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use toc_storage::{LocalMockAdapter, StorageAdapter, TurboArweaveAdapter};
use tracing::{error, info, warn};

use crate::repo::{MemoryRepo, PostgresRepo, Repository};
use crate::routes::{build_router, AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "toc_server=info,tower_http=info".into()),
        )
        .init();

    let repo: Arc<dyn Repository> = match std::env::var("DATABASE_URL") {
        Ok(url) if !url.trim().is_empty() => {
            info!("Connecting to PostgreSQL and running migrations...");
            Arc::new(PostgresRepo::connect_and_migrate(&url).await?)
        }
        _ => {
            warn!("DATABASE_URL not set — running with zero-config MemoryRepo (seeded with AI Safety ToCs). Set DATABASE_URL to use PostgreSQL.");
            Arc::new(MemoryRepo::new())
        }
    };
    repo.seed_if_empty().await?;

    let storage: Arc<dyn StorageAdapter> = match std::env::var("ARWEAVE_UPLOAD_ENDPOINT") {
        Ok(endpoint) if !endpoint.trim().is_empty() => {
            let graphql = std::env::var("ARWEAVE_GRAPHQL_ENDPOINT")
                .unwrap_or_else(|_| "https://arweave.net/graphql".into());
            let token = std::env::var("ARWEAVE_API_TOKEN").ok();
            let signer_secret = std::env::var("ARWEAVE_SIGNER_SECRET_B64").ok();
            let adapter = TurboArweaveAdapter::new(endpoint.clone(), graphql, token, signer_secret);
            info!(
                endpoint = %endpoint,
                pubkey = %adapter.publisher_pubkey_b64(),
                "Using TurboArweaveAdapter (ANS-104 Ed25519)"
            );
            Arc::new(adapter)
        }
        _ => {
            info!("ARWEAVE_UPLOAD_ENDPOINT not set — using LocalMockAdapter for deterministic open-data archiving.");
            Arc::new(LocalMockAdapter)
        }
    };

    // Spawn background Arweave outbox publisher
    let bg_repo = repo.clone();
    let bg_storage = storage.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(3));
        loop {
            interval.tick().await;
            match bg_repo.pop_pending_outbox(10).await {
                Ok(items) => {
                    for item in items {
                        match bg_storage.publish(&item.envelope).await {
                            Ok(tx_id) => {
                                info!(
                                    record_type = %item.envelope.record_type,
                                    record_id = %item.envelope.record_id,
                                    arweave_tx = %tx_id,
                                    "Published open-data record"
                                );
                                let _ = bg_repo
                                    .mark_outbox_published(
                                        &item.id,
                                        &item.envelope.record_type,
                                        &item.envelope.record_id,
                                        &tx_id,
                                    )
                                    .await;
                            }
                            Err(e) => {
                                error!("Failed to publish outbox {}: {e}", item.id);
                                let _ = bg_repo.mark_outbox_failed(&item.id, &e.to_string()).await;
                            }
                        }
                    }
                }
                Err(e) => error!("Outbox poll error: {e}"),
            }
        }
    });

    let web_dist_dir = std::env::var("WEB_DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("web/dist"));
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let public_base_url = std::env::var("PUBLIC_BASE_URL")
        .unwrap_or_else(|_| format!("http://localhost:{port}"));

    let state = Arc::new(AppState {
        repo,
        storage,
        oauth_states: auth::OAuthStateStore::default(),
        magic_links: auth::MagicLinkStore::default(),
        rate_limiter: routes::RateLimiter::default(),
        web_dist_dir,
        public_base_url,
    });

    let app = build_router(state);
    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("toctracker.com server listening on http://localhost:{port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut sig) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            sig.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    info!("Received shutdown signal, draining active requests...");
}
