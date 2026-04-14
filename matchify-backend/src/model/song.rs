use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum TrackStatus {
    Pending,
    Approved,
    Skipped,
}

#[derive(Debug, Serialize, Deserialize)]
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
