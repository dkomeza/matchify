use async_graphql::{ID, Subscription};
use futures::{Stream, stream};

use crate::model::song::SongGql;

pub struct MatchifySubscription;

#[Subscription]
impl MatchifySubscription {
    async fn track_approved(&self, _playlist_id: ID) -> impl Stream<Item = SongGql> {
        stream::pending()
    }

    async fn new_proposal(&self, _playlist_id: ID) -> impl Stream<Item = SongGql> {
        stream::pending()
    }
}
