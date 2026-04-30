pub mod mutation;
pub mod query;
pub mod subscription;

use async_graphql::Schema;
use mutation::Mutation;
use query::Query;
use subscription::MatchifySubscription;

pub type AppSchema = Schema<Query, Mutation, MatchifySubscription>;

pub fn build_schema(
    db: mongodb::Database,
    config: crate::config::AppConfig,
    spotify_client: crate::service::spotify::SpotifyClient,
    event_broker: crate::events::EventBroker,
) -> AppSchema {
    Schema::build(Query, Mutation, MatchifySubscription)
        .data(db)
        .data(config)
        .data(spotify_client)
        .data(event_broker)
        .finish()
}
