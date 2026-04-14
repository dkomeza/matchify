use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id")]
    pub id: ObjectId,

    pub spotify_id: String,
    pub display_name: String,
    pub profile_image_url: Option<String>,

    pub access_token: String,
    pub refresh_token: String,
    pub token_expiry: i64,

    pub last_active_at: i64,
    pub created_at: i64,
}
