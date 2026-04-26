use async_graphql::{Context, InputObject, Object, SimpleObject};
use chrono::{Duration, Utc};
use mongodb::{
    bson::{doc, oid::ObjectId},
    options::{FindOneAndUpdateOptions, ReturnDocument},
    Database,
};

use crate::{
    crypto::encrypt_token,
    error::{AppError, Result},
    jwt,
    jwt::AuthUser,
    model::{playlist::PlaylistGql, user::User},
    service::{playlist as playlist_service, spotify::SpotifyClient},
};

// ---------------------------------------------------------------------------
// Auth payload
// ---------------------------------------------------------------------------

#[derive(SimpleObject)]
pub struct AuthPayload {
    token: String,
    user: User,
}

// ---------------------------------------------------------------------------
// Playlist inputs
// ---------------------------------------------------------------------------

#[derive(InputObject)]
pub struct CreatePlaylistInput {
    /// Required. 1–100 characters.
    pub name: String,
    pub description: Option<String>,
    /// Minimum votes required to add a song. Defaults to 1 (solo owner).
    pub vote_threshold: Option<i32>,
}

#[derive(InputObject)]
pub struct UpdatePlaylistInput {
    /// New name (1–100 characters). Omit to leave unchanged.
    pub name: Option<String>,
    /// New description. Omit to leave unchanged.
    pub description: Option<String>,
    /// New vote threshold (≥ 1, ≤ member count). Omit to leave unchanged.
    pub vote_threshold: Option<i32>,
}

// ---------------------------------------------------------------------------
// Mutation root
// ---------------------------------------------------------------------------

pub struct Mutation;

#[Object]
impl Mutation {
    // -----------------------------------------------------------------------
    // Spotify auth
    // -----------------------------------------------------------------------

    async fn login_with_spotify(
        &self,
        ctx: &Context<'_>,
        code: String,
        redirect_uri: String,
    ) -> Result<AuthPayload> {
        let spotify_client = ctx.data::<SpotifyClient>().map_err(|_| AppError::Unexpected)?;
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let config = ctx.data::<crate::config::AppConfig>().map_err(|_| AppError::Unexpected)?;

        let tokens = spotify_client.exchange_code(&code, &redirect_uri).await?;
        let profile = spotify_client.get_user_profile(&tokens.access_token).await?;

        let encrypted_access = encrypt_token(&tokens.access_token, &config.encryption_key)?;
        let encrypted_refresh = tokens
            .refresh_token
            .as_deref()
            .map(|rt| encrypt_token(rt, &config.encryption_key))
            .transpose()?
            .unwrap_or_else(|| "".to_string());

        let expires_at = Utc::now() + Duration::seconds(tokens.expires_in as i64);

        let collection = db.collection::<User>("users");

        let mut set_doc = doc! {
            "display_name": profile.display_name.unwrap_or_else(|| "Unknown".to_string()),
            "email": profile.email.unwrap_or_default(),
            "access_token": encrypted_access,
            "token_expires_at": mongodb::bson::DateTime::from_millis(expires_at.timestamp_millis()),
        };

        if let Some(img) = profile.images.first() {
            set_doc.insert("profile_image_url", &img.url);
        }

        if !encrypted_refresh.is_empty() {
            set_doc.insert("refresh_token", encrypted_refresh);
        }

        let update = doc! {
            "$set": set_doc,
            "$setOnInsert": {
                "spotify_id": &profile.id,
                "created_at": mongodb::bson::DateTime::from_millis(Utc::now().timestamp_millis()),
            }
        };

        let user = collection
            .find_one_and_update(doc! { "spotify_id": &profile.id }, update)
            .with_options(
                FindOneAndUpdateOptions::builder()
                    .upsert(true)
                    .return_document(ReturnDocument::After)
                    .build(),
            )
            .await?
            .ok_or(AppError::Unexpected)?;

        let jwt_token = jwt::sign(&user.id, &config.jwt_secret, 7)?;

        Ok(AuthPayload {
            token: jwt_token,
            user,
        })
    }

    // -----------------------------------------------------------------------
    // Playlist management
    // -----------------------------------------------------------------------

    /// Create a new collaborative playlist.
    ///
    /// Requires a valid JWT in the `Authorization: Bearer <token>` header.
    /// Returns `UNAUTHENTICATED` if the caller is not logged in.
    async fn create_playlist(
        &self,
        ctx: &Context<'_>,
        input: CreatePlaylistInput,
    ) -> Result<PlaylistGql> {
        // Auth guard
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::Validation("UNAUTHENTICATED".to_string()))
            .map_err(|_| {
                AppError::SpotifyAuth("You must be logged in to create a playlist".to_string())
            })?;

        let owner_id = ObjectId::parse_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::create(
            db,
            owner_id,
            playlist_service::CreatePlaylistInput {
                name: input.name,
                description: input.description,
                vote_threshold: input.vote_threshold,
            },
        )
        .await?;

        Ok(PlaylistGql::from(playlist))
    }

    /// Join an existing playlist using its invite code.
    ///
    /// Requires a valid JWT in the `Authorization: Bearer <token>` header.
    /// Returns `NOT_FOUND` when the invite code is invalid, and is idempotent
    /// if the caller is already a member.
    async fn join_playlist(
        &self,
        ctx: &Context<'_>,
        invite_code: String,
    ) -> Result<PlaylistGql> {
        // Auth guard
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| {
                AppError::SpotifyAuth("You must be logged in to join a playlist".to_string())
            })?;

        let caller_id = ObjectId::parse_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::join(db, caller_id, &invite_code).await?;

        Ok(PlaylistGql::from(playlist))
    }

    /// Update a playlist's metadata (owner only).
    ///
    /// Returns `FORBIDDEN` when the caller is not the owner.
    /// Returns `BAD_USER_INPUT` on validation failures.
    async fn update_playlist(
        &self,
        ctx: &Context<'_>,
        id: String,
        input: UpdatePlaylistInput,
    ) -> Result<PlaylistGql> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = ObjectId::parse_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let playlist_id = ObjectId::parse_str(&id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        let playlist = playlist_service::update(
            db,
            caller_id,
            playlist_id,
            playlist_service::UpdatePlaylistInput {
                name: input.name,
                description: input.description,
                vote_threshold: input.vote_threshold,
            },
        )
        .await?;

        Ok(PlaylistGql::from(playlist))
    }

    /// Remove the authenticated caller from the playlist.
    ///
    /// Returns `BAD_USER_INPUT` when the caller is the owner (owners cannot
    /// leave — they must delete the playlist instead).
    async fn leave_playlist(
        &self,
        ctx: &Context<'_>,
        playlist_id: String,
    ) -> Result<bool> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = ObjectId::parse_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let pid = ObjectId::parse_str(&playlist_id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;

        playlist_service::leave(db, caller_id, pid).await
    }

    /// Allows the playlist owner to bulk-seed the proposal queue with tracks from Spotify.
    async fn add_initial_tracks(
        &self,
        ctx: &Context<'_>,
        playlist_id: String,
        spotify_track_ids: Vec<String>,
    ) -> Result<Vec<crate::model::song::SongGql>> {
        let auth_user = ctx
            .data_opt::<AuthUser>()
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let caller_id = ObjectId::parse_str(&auth_user.user_id)
            .map_err(|_| AppError::Unexpected)?;

        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<User>("users");
        
        let user = collection
            .find_one(doc! { "_id": caller_id })
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::SpotifyAuth("UNAUTHENTICATED".to_string()))?;

        let spotify_client = ctx
            .data::<crate::service::spotify::SpotifyClient>()
            .map_err(|_| AppError::Unexpected)?;
            
        let config = ctx
            .data::<crate::config::AppConfig>()
            .map_err(|_| AppError::Unexpected)?;

        let access_token = crate::service::spotify::get_valid_access_token(&user, spotify_client, db, config).await?;

        let pid = ObjectId::parse_str(&playlist_id)
            .map_err(|_| AppError::Validation("Invalid playlist ID format".to_string()))?;

        let songs = crate::service::song::add_initial_tracks(
            db,
            pid,
            caller_id,
            &spotify_track_ids,
            spotify_client,
            &access_token,
        )
        .await?;

        Ok(songs.into_iter().map(crate::model::song::SongGql::from).collect())
    }
}
