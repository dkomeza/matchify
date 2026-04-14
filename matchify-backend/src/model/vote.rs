use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum VoteType {
    Like,
    Skip,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Vote {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub song_id: ObjectId,
    pub playlist_id: ObjectId,
    pub user_id: ObjectId,
    pub vote: VoteType,
    pub created_at: DateTime<Utc>,
}
