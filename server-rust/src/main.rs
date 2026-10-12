mod handlers;
mod models;
mod serialization;

use crate::models::prepare_payloads;
use axum::{
    Router,
    routing::{get, post},
};
use tower_http::cors::CorsLayer;
use tracing::info;

#[tokio::main]
async fn main() {
    // Inicjalizacja loggera
    tracing_subscriber::fmt()
        .with_target(false)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    prepare_payloads();

    // Budowanie routera
    let app = Router::new()
        .route("/baseline", get(handlers::handle_baseline))
        // Contract: /bench/{format}/{scenario}
        .route("/bench/{format}/{scenario}", get(handlers::handle_bench))
        .route(
            "/deserialize/{format}/{scenario}",
            post(handlers::handle_deserialization_test),
        )
        .layer(CorsLayer::permissive());

    let addr = "0.0.0.0:3000";
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    info!("Server running on http://{addr}");
    info!("   Endpoints:");
    info!("   GET  /baseline");
    info!("   GET  /bench/{{format}}/{{scenario}}");
    info!("   POST /deserialize/{{format}}/{{scenario}}");

    axum::serve(listener, app).await.unwrap();
}
