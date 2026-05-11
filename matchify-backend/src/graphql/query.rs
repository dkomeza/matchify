use async_graphql::{Context, Object, Result as GraphqlResult};
use mongodb::{Database, bson::doc};
use std::str::FromStr;

use crate::{
    error::{AppError, Result},
    jwt::AuthUser,
    model::{playlist::PlaylistGql, user::User},
    service::playlist as playlist_service,
};

pub struct Query;

#[Object]
impl Query {
    // -----------------------------------------------------------------------
    // User
    // -----------------------------------------------------------------------

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

        if !playlist.member_ids.contains(&caller_id) {
            return Err(AppError::Forbidden(
                "You are not a member of this playlist".to_string(),
            ));
        }

        Ok(PlaylistGql::from(playlist))
    }

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

    async fn next_proposal(
        &self,
        ctx: &Context<'_>,
        playlist_id: String,
    ) -> Result<Option<crate::model::song::SongGql>> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let p_id = mongodb::bson::oid::ObjectId::from_str(&playlist_id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::find_by_id(db, p_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Playlist {playlist_id} not found")))?;

        if !playlist.member_ids.contains(&caller_id) {
            return Err(AppError::Forbidden(
                "You are not a member of this playlist".to_string(),
            ));
        }

        let song = crate::service::song::next_unvoted(db, p_id, caller_id).await?;

        Ok(song.map(crate::model::song::SongGql::from))
    }

    async fn playlist_stats(
        &self,
        ctx: &Context<'_>,
        playlist_id: String,
    ) -> Result<crate::model::PlaylistStats> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let p_id = mongodb::bson::oid::ObjectId::from_str(&playlist_id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::find_by_id(db, p_id)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Playlist {playlist_id} not found")))?;

        if !playlist.member_ids.contains(&caller_id) {
            return Err(AppError::Forbidden(
                "You are not a member of this playlist".to_string(),
            ));
        }

        crate::service::stats::get_playlist_stats(db, p_id).await
    }

    // -----------------------------------------------------------------------
    // Spotify
    // -----------------------------------------------------------------------

    async fn search_tracks(
        &self,
        ctx: &Context<'_>,
        query: String,
        limit: Option<u32>,
    ) -> Result<Vec<crate::model::spotify::SpotifyTrack>> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let object_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let collection = db.collection::<User>("users");
        let user = collection
            .find_one(doc! { "_id": object_id })
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let spotify_client = ctx
            .data::<crate::service::spotify::SpotifyClient>()
            .map_err(|_| AppError::Unexpected)?;

        let config = ctx
            .data::<crate::config::AppConfig>()
            .map_err(|_| AppError::Unexpected)?;

        let access_token =
            crate::service::spotify::get_valid_access_token(&user, spotify_client, db, config)
                .await?;

        let actual_limit = limit.unwrap_or(20);
        let tracks = spotify_client
            .search_tracks(&query, actual_limit, &access_token)
            .await?;

        Ok(tracks)
    }

    async fn next_recommendation(
        &self,
        ctx: &Context<'_>,
        playlist_id: String,
        excluded_spotify_track_ids: Option<Vec<String>>,
    ) -> Result<Option<crate::model::spotify::SpotifyTrack>> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = mongodb::bson::oid::ObjectId::from_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let p_id = mongodb::bson::oid::ObjectId::from_str(&playlist_id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let users = db.collection::<User>("users");
        let user = users
            .find_one(doc! { "_id": caller_id })
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let spotify_client = ctx
            .data::<crate::service::spotify::SpotifyClient>()
            .map_err(|_| AppError::Unexpected)?;
        let lastfm_client = ctx
            .data::<crate::service::lastfm::LastfmClient>()
            .map_err(|_| AppError::Unexpected)?;
        let config = ctx
            .data::<crate::config::AppConfig>()
            .map_err(|_| AppError::Unexpected)?;

        let access_token =
            crate::service::spotify::get_valid_access_token(&user, spotify_client, db, config)
                .await?;

        crate::service::recommendation::next_recommendation(
            db,
            p_id,
            caller_id,
            excluded_spotify_track_ids.as_deref().unwrap_or(&[]),
            lastfm_client,
            spotify_client,
            &access_token,
        )
        .await
    }
}
