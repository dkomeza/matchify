pub mod mutation;
pub mod query;
pub mod subscription;

use async_graphql::{EmptySubscription, Schema};
use mutation::Mutation;
use query::Query;

pub type AppSchema = Schema<Query, Mutation, EmptySubscription>;

pub fn build_schema(
    db: mongodb::Database,
    config: crate::config::AppConfig,
    spotify_client: crate::service::spotify::SpotifyClient,
) -> AppSchema {
    Schema::build(Query, Mutation, EmptySubscription)
        .data(db)
        .data(config)
        .data(spotify_client)
        .finish()
}
