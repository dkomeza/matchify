use async_graphql::SimpleObject;
use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, SimpleObject)]
pub struct User {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub spotify_id: String, // unique index
    pub display_name: String,
    pub email: String,
    pub profile_image_url: Option<String>,
    #[graphql(skip)]
    pub access_token: String, // encrypted at rest
    #[graphql(skip)]
    pub refresh_token: String, // encrypted at rest
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub token_expires_at: DateTime<Utc>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::User;
    use mongodb::bson::{DateTime as BsonDateTime, doc, from_document, oid::ObjectId};

    #[test]
    fn deserializes_bson_dates_from_mongodb_document() {
        let document = doc! {
            "_id": ObjectId::new(),
            "spotify_id": "spotify-user",
            "display_name": "Test User",
            "email": "test@example.com",
            "profile_image_url": null,
            "access_token": "encrypted-access",
            "refresh_token": "encrypted-refresh",
            "token_expires_at": BsonDateTime::from_millis(1_700_000_000_000),
            "created_at": BsonDateTime::from_millis(1_700_000_000_000),
        };

        let user: User = from_document(document).expect("user should deserialize");

        assert_eq!(user.display_name, "Test User");
    }
}
