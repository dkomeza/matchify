use async_graphql::{Context, ID, Subscription};
use futures::{Stream, StreamExt};
use mongodb::bson::oid::ObjectId;

use crate::events::{EventBroker, PlaylistEvent};
use crate::model::song::SongGql;

pub struct MatchifySubscription;

#[Subscription]
impl MatchifySubscription {
    async fn track_approved(
        &self,
        ctx: &Context<'_>,
        playlist_id: ID,
    ) -> async_graphql::Result<impl Stream<Item = SongGql>> {
        let oid = ObjectId::parse_str(&playlist_id)?;
        guard_member(ctx, oid).await?;

        let broker = ctx.data_unchecked::<EventBroker>();
        let rx = broker.subscribe(oid);

        Ok(tokio_stream::wrappers::BroadcastStream::new(rx).filter_map(|msg| async move {
            if let Ok(PlaylistEvent::TrackApproved(track)) = msg {
                Some(track)
            } else {
                None
            }
        }))
    }

    async fn new_proposal(
        &self,
        ctx: &Context<'_>,
        playlist_id: ID,
    ) -> async_graphql::Result<impl Stream<Item = SongGql>> {
        let oid = ObjectId::parse_str(&playlist_id)?;
        guard_member(ctx, oid).await?;

        let broker = ctx.data_unchecked::<EventBroker>();
        let rx = broker.subscribe(oid);

        Ok(tokio_stream::wrappers::BroadcastStream::new(rx).filter_map(|msg| async move {
            if let Ok(PlaylistEvent::NewProposal(track)) = msg {
                Some(track)
            } else {
                None
            }
        }))
    }
}

async fn guard_member(
    ctx: &Context<'_>,
    playlist_id: ObjectId,
) -> async_graphql::Result<()> {
    use mongodb::{bson::doc, Database};

    let auth_user = ctx
        .data_opt::<crate::jwt::AuthUser>()
        .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

    let caller_id = ObjectId::parse_str(&auth_user.user_id)
        .map_err(|_| async_graphql::Error::new("UNAUTHENTICATED"))?;

    let db = ctx.data::<Database>()?;
    let playlists = db.collection::<crate::model::playlist::Playlist>("playlists");

    let playlist = playlists
        .find_one(doc! { "_id": playlist_id })
        .await
        .map_err(|e| async_graphql::Error::new(e.to_string()))?
        .ok_or_else(|| async_graphql::Error::new("NOT_FOUND"))?;

    if !playlist.member_ids.contains(&caller_id) {
        return Err(async_graphql::Error::new("FORBIDDEN"));
    }

    Ok(())
}
