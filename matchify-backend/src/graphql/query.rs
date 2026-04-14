use async_graphql::{Context, Object, Result as GraphqlResult};
use mongodb::{bson::doc, Database};
use std::str::FromStr;

use crate::{
    error::{AppError, Result},
    jwt::AuthUser,
    model::{
        playlist::PlaylistGql,
        user::User,
    },
    service::playlist as playlist_service,
};

pub struct Query;

#[Object]
impl Query {
    // -----------------------------------------------------------------------
    // User
    // -----------------------------------------------------------------------

    /// Return the currently authenticated user's profile.
    ///
    /// Returns `UNAUTHENTICATED` when no valid JWT is present.
    async fn me(&self, ctx: &Context<'_>) -> GraphqlResult<User> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<User>("users");

        let object_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| async_graphql::Error::new("UNAUTHENTICATED"))?;

        let user = collection
            .find_one(doc! { "_id": object_id })
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

        Ok(user)
    }

    // -----------------------------------------------------------------------
    // Playlist
    // -----------------------------------------------------------------------

    /// Look up a single playlist by ID.
    ///
    /// Requires authentication. Returns `FORBIDDEN` when the caller is not a
    /// member of the playlist, and `NOT_FOUND` when no playlist with the given
    /// ID exists.
    async fn playlist(&self, ctx: &Context<'_>, id: String) -> Result<PlaylistGql> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let object_id = mongodb::bson::oid::ObjectId::from_str(&id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::find_by_id(db, object_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Playlist {id} not found")))?;

        // Authorization: caller must be a member.
        if !playlist.member_ids.contains(&caller_id) {
            return Err(AppError::Forbidden(
                "You are not a member of this playlist".to_string(),
            ));
        }

        Ok(PlaylistGql::from(playlist))
    }

    /// Return all playlists the authenticated caller belongs to.
    ///
    /// Requires authentication. Returns `UNAUTHENTICATED` when no valid JWT is
    /// present.
    async fn my_playlists(&self, ctx: &Context<'_>) -> Result<Vec<PlaylistGql>> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlists = playlist_service::find_by_member(db, caller_id).await?;

        Ok(playlists.into_iter().map(PlaylistGql::from).collect())
    }
}
