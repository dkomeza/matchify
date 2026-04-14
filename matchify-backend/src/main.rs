pub mod config;
pub mod db;
pub mod error;
pub mod graphql;
pub mod model;
pub mod service;

use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{routing::post, Router};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Setup structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "matchify_backend=info,info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Matchify Backend");

    // 2. Init App Config
    let config = config::AppConfig::init();

    // 3. Init Database
    let _db = db::get_mongo_database(&config).await?;

    // 4. Build GraphQL Schema
    let schema = graphql::build_schema();

    // 5. Build Axum Router
    let app = Router::new().route(
        "/graphql",
        post(move |req: GraphQLRequest| {
            let schema = schema.clone();
            async move { GraphQLResponse::from(schema.execute(req.into_inner()).await) }
        }),
    );

    // 6. Start listening
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server running on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
