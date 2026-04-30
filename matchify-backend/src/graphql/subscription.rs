use async_graphql::{ID, Subscription};
use futures::{Stream, StreamExt};

use crate::model::song::SongGql;

pub struct MatchifySubscription;

#[Subscription]
impl MatchifySubscription {
    async fn track_approved<'ctx>(&self, ctx: &async_graphql::Context<'ctx>, playlist_id: ID) -> async_graphql::Result<impl Stream<Item = SongGql> + 'ctx> {
        let broker = ctx.data::<crate::events::EventBroker>()?;
        let oid = mongodb::bson::oid::ObjectId::parse_str(&playlist_id)?;
        let rx = broker.subscribe(oid);

        Ok(tokio_stream::wrappers::BroadcastStream::new(rx)
            .filter_map(|msg| async move {
                match msg {
                    Ok(crate::events::PlaylistEvent::TrackApproved(track)) => Some(track),
                    _ => None,
                }
            }))
    }

    async fn new_proposal<'ctx>(&self, ctx: &async_graphql::Context<'ctx>, playlist_id: ID) -> async_graphql::Result<impl Stream<Item = SongGql> + 'ctx> {
        let broker = ctx.data::<crate::events::EventBroker>()?;
        let oid = mongodb::bson::oid::ObjectId::parse_str(&playlist_id)?;
        let rx = broker.subscribe(oid);

        Ok(tokio_stream::wrappers::BroadcastStream::new(rx)
            .filter_map(|msg| async move {
                match msg {
                    Ok(crate::events::PlaylistEvent::NewProposal(track)) => Some(track),
                    _ => None,
                }
            }))
    }
}
