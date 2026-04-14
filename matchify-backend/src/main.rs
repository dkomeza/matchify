pub mod config;
pub mod crypto;
pub mod db;
pub mod error;
pub mod graphql;
pub mod jwt;
pub mod model;
pub mod service;

use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::{Router, routing::post};
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
    tracing::info!("Initializing App Config");
    let config = config::AppConfig::init();
    tracing::info!("Successfully initialized App Config");

    // 3. Init Database
    tracing::info!("Initializing Database");
    let client = db::connect(&config.mongo_uri).await?;
    let db = client.database("matchify");
    db::indexes::create_indexes(&db).await?;
    tracing::info!("Successfully initialized Database");

    // 4. Init Spotify Client
    tracing::info!("Initializing Spotify Client");
    let spotify_client = service::spotify::SpotifyClient::new(
        config.spotify_client_id.clone(),
        config.spotify_client_secret.clone(),
    );
    tracing::info!("Successfully initialized Spotify Client");

    // 5. Build GraphQL Schema
    tracing::info!("Building GraphQL Schema");
    let schema = graphql::build_schema(db, config.clone(), spotify_client);
    tracing::info!("Successfully built GraphQL Schema");

    // 6. Build Axum Router
    tracing::info!("Building Axum Router");
    let shared_config = std::sync::Arc::new(config.clone());
    let app = Router::new()
        .route(
            "/graphql",
            post(move |optional_auth: jwt::OptionalAuthUser, req: GraphQLRequest| {
                let schema = schema.clone();
                async move {
                    let mut req = req.into_inner();
                    if let Some(user) = optional_auth.0 {
                        req = req.data(user);
                    }
                    GraphQLResponse::from(schema.execute(req).await)
                }
            }),
        )
        .layer(axum::extract::Extension(shared_config));
    tracing::info!("Successfully built Axum Router");

    // 6. Start listening
    tracing::info!("Starting server");
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server running on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
