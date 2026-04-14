use async_graphql::SimpleObject;
use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

/// MongoDB document model — all IDs are native ObjectId.
#[derive(Debug, Serialize, Deserialize)]
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

/// GraphQL view — IDs serialized as hex strings for JSON transport.
#[derive(Debug, SimpleObject)]
pub struct PlaylistGql {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub owner_id: String,
    pub member_ids: Vec<String>,
    pub invite_code: String,
    pub vote_threshold: i32,
    pub spotify_playlist_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<Playlist> for PlaylistGql {
    fn from(p: Playlist) -> Self {
        PlaylistGql {
            id: p.id.to_hex(),
            name: p.name,
            description: p.description,
            owner_id: p.owner_id.to_hex(),
            member_ids: p.member_ids.iter().map(|id| id.to_hex()).collect(),
            invite_code: p.invite_code,
            vote_threshold: p.vote_threshold,
            spotify_playlist_id: p.spotify_playlist_id,
            created_at: p.created_at,
            updated_at: p.updated_at,
        }
    }
}
