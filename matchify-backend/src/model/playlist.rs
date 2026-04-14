use async_graphql::{Context, Object, Result as GraphqlResult};
use chrono::{DateTime, Utc};
use futures::TryStreamExt;
use mongodb::{
    bson::{doc, oid::ObjectId},
    Database,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    model::song::{Song, SongGql},
    model::user::User,
};

// ---------------------------------------------------------------------------
// MongoDB document
// ---------------------------------------------------------------------------

/// Raw MongoDB document — all IDs are native ObjectId.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: ObjectId,
    pub member_ids: Vec<ObjectId>,
    pub invite_code: String, // unique, 8-char random alphanumeric
    pub vote_threshold: i32, // default: ceil(members / 2)
    pub spotify_playlist_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// GraphQL view
// ---------------------------------------------------------------------------

/// Newtype that wraps a `Playlist` document and provides field-level resolvers.
pub struct PlaylistGql(pub Playlist);

impl From<Playlist> for PlaylistGql {
    fn from(p: Playlist) -> Self {
        PlaylistGql(p)
    }
}

#[Object]
impl PlaylistGql {
    // --- Scalar fields ---

    async fn id(&self) -> String {
        self.0.id.to_hex()
    }

    async fn name(&self) -> &str {
        &self.0.name
    }

    async fn description(&self) -> Option<&str> {
        self.0.description.as_deref()
    }

    async fn owner_id(&self) -> String {
        self.0.owner_id.to_hex()
    }

    async fn member_ids(&self) -> Vec<String> {
        self.0.member_ids.iter().map(|id| id.to_hex()).collect()
    }

    async fn invite_code(&self) -> &str {
        &self.0.invite_code
    }

    async fn vote_threshold(&self) -> i32 {
        self.0.vote_threshold
    }

    async fn spotify_playlist_id(&self) -> Option<&str> {
        self.0.spotify_playlist_id.as_deref()
    }

    async fn created_at(&self) -> DateTime<Utc> {
        self.0.created_at
    }

    async fn updated_at(&self) -> DateTime<Utc> {
        self.0.updated_at
    }

    // --- Nested resolvers ---

    /// Fetch the playlist owner from the `users` collection.
    async fn owner(&self, ctx: &Context<'_>) -> GraphqlResult<User> {
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<User>("users");

        let user = collection
            .find_one(doc! { "_id": self.0.owner_id })
            .await
            .map_err(AppError::Database)?
            .ok_or_else(|| AppError::NotFound("Playlist owner not found".to_string()))?;

        Ok(user)
    }

    /// Fetch all playlist members from the `users` collection.
    async fn members(&self, ctx: &Context<'_>) -> GraphqlResult<Vec<User>> {
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<User>("users");

        let member_ids: Vec<_> = self.0.member_ids.clone();
        let cursor = collection
            .find(doc! { "_id": { "$in": member_ids } })
            .await
            .map_err(AppError::Database)?;

        let users: Vec<User> = cursor.try_collect().await.map_err(AppError::Database)?;
        Ok(users)
    }

    /// Fetch approved tracks for this playlist.
    async fn tracks(&self, ctx: &Context<'_>) -> GraphqlResult<Vec<SongGql>> {
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<Song>("songs");

        let cursor = collection
            .find(doc! {
                "playlist_id": self.0.id,
                "status": "Approved",
            })
            .await
            .map_err(AppError::Database)?;

        let songs: Vec<Song> = cursor.try_collect().await.map_err(AppError::Database)?;
        Ok(songs.into_iter().map(SongGql::from).collect())
    }

    /// Fetch pending track proposals for this playlist.
    async fn proposals(&self, ctx: &Context<'_>) -> GraphqlResult<Vec<SongGql>> {
        let db = ctx.data::<Database>().map_err(|_| AppError::Unexpected)?;
        let collection = db.collection::<Song>("songs");

        let cursor = collection
            .find(doc! {
                "playlist_id": self.0.id,
                "status": "Pending",
            })
            .await
            .map_err(AppError::Database)?;

        let songs: Vec<Song> = cursor.try_collect().await.map_err(AppError::Database)?;
        Ok(songs.into_iter().map(SongGql::from).collect())
    }
}
