use async_graphql::SimpleObject;
use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TrackStatus {
    Pending,
    Approved,
    Skipped,
}

/// Serialize TrackStatus as a lowercase string for MongoDB queries.
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
    pub like_count: i32, // denormalized
    pub created_at: DateTime<Utc>,
}

/// GraphQL-facing representation of a song/track.
#[derive(Debug, SimpleObject)]
#[graphql(name = "Track")]
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
