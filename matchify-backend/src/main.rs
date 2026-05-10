pub mod config;
pub mod crypto;
pub mod db;
pub mod error;
pub mod events;
pub mod graphql;
pub mod jwt;
pub mod model;
pub mod service;

use async_graphql_axum::{GraphQLRequest, GraphQLResponse};
use axum::Router;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::routing::post;
use futures::{Stream, StreamExt, stream};
use std::{convert::Infallible, time::Duration};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

fn graphql_sse_response(
    optional_auth: jwt::OptionalAuthUser,
    schema: graphql::AppSchema,
    req: GraphQLRequest,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut request = req.into_inner();
    if let Some(user) = optional_auth.0 {
        request = request.data(user);
    }

    let events = schema
        .execute_stream(request)
        .map(|response| {
            let data = serde_json::to_string(&response).unwrap_or_else(|_| {
                r#"{"errors":[{"message":"Failed to serialize GraphQL response"}]}"#.to_string()
            });

            Ok(Event::default().event("next").data(data))
        })
        .chain(stream::once(async {
            Ok(Event::default().event("complete"))
        }));

    Sse::new(events).keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "matchify_backend=info,info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Matchify Backend");

    tracing::info!("Initializing App Config");
    let config = config::AppConfig::init();
    tracing::info!("Successfully initialized App Config");

    tracing::info!("Initializing Database");
    let client = db::connect(&config.mongo_uri).await?;
    let db = client.database("matchify");
    db::indexes::create_indexes(&db).await?;
    tracing::info!("Successfully initialized Database");

    tracing::info!("Initializing Spotify Client");
    let spotify_client = service::spotify::SpotifyClient::new(
        config.spotify_client_id.clone(),
        config.spotify_client_secret.clone(),
    );
    tracing::info!("Successfully initialized Spotify Client");

    tracing::info!("Initializing Event Broker");
    let event_broker = events::EventBroker::new();
    tracing::info!("Successfully initialized Event Broker");

    tracing::info!("Building GraphQL Schema");
    let schema = graphql::build_schema(db, config.clone(), spotify_client, event_broker.clone());
    tracing::info!("Successfully built GraphQL Schema");

    tracing::info!("Building Axum Router");
    let shared_config = std::sync::Arc::new(config.clone());
    let schema_clone1 = schema.clone();
    let schema_clone2 = schema.clone();
    let app = Router::new()
        .route(
            "/graphql",
            post(
                move |optional_auth: jwt::OptionalAuthUser, req: GraphQLRequest| {
                    let schema = schema_clone1.clone();
                    async move {
                        let mut req = req.into_inner();
                        if let Some(user) = optional_auth.0 {
                            req = req.data(user);
                        }
                        GraphQLResponse::from(schema.execute(req).await)
                    }
                },
            ),
        )
        .route(
            "/graphql/ws",
            post(
                move |optional_auth: jwt::OptionalAuthUser, req: GraphQLRequest| {
                    let schema = schema_clone2.clone();

                    async move { graphql_sse_response(optional_auth, schema, req) }
                },
            ),
        )
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any),
        )
        .layer(axum::extract::Extension(shared_config))
        .layer(axum::extract::Extension(event_broker));
    tracing::info!("Successfully built Axum Router");

    tracing::info!("Starting server");
    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server running on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
