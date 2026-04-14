use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Playlist {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: ObjectId,
    pub member_ids: Vec<ObjectId>,
    pub invite_code: String, // unique, 8-char random
    pub vote_threshold: i32, // default: ceil(members / 2)
    pub spotify_playlist_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
