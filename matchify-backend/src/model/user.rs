use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub spotify_id: String, // unique index
    pub display_name: String,
    pub email: String,
    pub profile_image_url: Option<String>,
    pub access_token: String,  // encrypted at rest
    pub refresh_token: String, // encrypted at rest
    pub token_expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}
