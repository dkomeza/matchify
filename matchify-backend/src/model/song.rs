use async_graphql::{ComplexObject, Context, SimpleObject};
use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TrackStatus {
    Pending,
    Approved,
    Skipped,
}

impl std::fmt::Display for TrackStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TrackStatus::Pending => write!(f, "Pending"),
            TrackStatus::Approved => write!(f, "Approved"),
            TrackStatus::Skipped => write!(f, "Skipped"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub playlist_id: ObjectId,
    pub spotify_track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_url: String,
    pub preview_url: Option<String>,
    pub duration_ms: i32,
    pub proposed_by: ObjectId,
    pub status: TrackStatus,
    pub like_count: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, SimpleObject)]
#[graphql(name = "Track", complex)]
pub struct SongGql {
    pub id: String,
    pub playlist_id: String,
    pub spotify_track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_url: String,
    pub preview_url: Option<String>,
    pub duration_ms: i32,
    pub proposed_by: String,
    pub like_count: i32,
    pub created_at: DateTime<Utc>,
}

impl From<Song> for SongGql {
    fn from(s: Song) -> Self {
        SongGql {
            id: s.id.to_hex(),
            playlist_id: s.playlist_id.to_hex(),
            spotify_track_id: s.spotify_track_id,
            title: s.title,
            artist: s.artist,
            album: s.album,
            album_art_url: s.album_art_url,
            preview_url: s.preview_url,
            duration_ms: s.duration_ms,
            proposed_by: s.proposed_by.to_hex(),
            like_count: s.like_count,
            created_at: s.created_at,
        }
    }
}

#[ComplexObject]
impl SongGql {
    async fn my_vote(&self, ctx: &Context<'_>) -> async_graphql::Result<Option<crate::model::vote::VoteType>> {
        let auth_user = ctx
            .data_opt::<crate::jwt::AuthUser>()
            .ok_or_else(|| async_graphql::Error::new("UNAUTHENTICATED"))?;

        let caller_id = mongodb::bson::oid::ObjectId::parse_str(&auth_user.user_id)?;
        let song_id = mongodb::bson::oid::ObjectId::parse_str(&self.id)?;

        let db = ctx.data::<mongodb::Database>()?;
        let votes_coll = db.collection::<crate::model::vote::Vote>("votes");

        let vote = votes_coll
            .find_one(mongodb::bson::doc! { "song_id": song_id, "user_id": caller_id })
            .await?;

        Ok(vote.map(|v| v.vote))
    }
}
