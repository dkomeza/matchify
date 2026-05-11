use async_graphql::Enum;
use chrono::{DateTime, Utc};
use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Enum)]
pub enum RecommendationAction {
    Accept,
    Reject,
}

impl std::fmt::Display for RecommendationAction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RecommendationAction::Accept => write!(f, "Accept"),
            RecommendationAction::Reject => write!(f, "Reject"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationCandidate {
    pub title: String,
    pub artist: String,
    pub match_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationCacheEntry {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub seed_key: String,
    pub seed_artist: String,
    pub seed_title: String,
    pub candidates: Vec<RecommendationCandidate>,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendationInteraction {
    #[serde(rename = "_id")]
    pub id: ObjectId,
    pub playlist_id: ObjectId,
    pub user_id: ObjectId,
    pub spotify_track_id: String,
    pub track_key: String,
    pub action: RecommendationAction,
    #[serde(with = "mongodb::bson::serde_helpers::chrono_datetime_as_bson_datetime")]
    pub created_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_recommendation_action_for_graphql() {
        assert_eq!(RecommendationAction::Accept.to_string(), "Accept");
        assert_eq!(RecommendationAction::Reject.to_string(), "Reject");
    }
}
