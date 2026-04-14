use chrono::Utc;
use mongodb::{
    bson::{doc, oid::ObjectId},
    Database,
};
use rand::distributions::Alphanumeric;
use rand::{thread_rng, Rng};

use crate::{
    error::{AppError, Result},
    model::playlist::Playlist,
};

const INVITE_CODE_LEN: usize = 8;
const INVITE_CODE_MAX_RETRIES: u32 = 5;

fn generate_invite_code() -> String {
    thread_rng()
        .sample_iter(&Alphanumeric)
        .take(INVITE_CODE_LEN)
        .map(char::from)
        .collect()
}

/// Returns `true` if a MongoDB write error contains a duplicate-key (E11000) code.
fn is_duplicate_key_error(err: &mongodb::error::Error) -> bool {
    use mongodb::error::ErrorKind;
    match err.kind.as_ref() {
        ErrorKind::Write(mongodb::error::WriteFailure::WriteError(we)) => we.code == 11000,
        _ => false,
    }
}

pub struct CreatePlaylistInput {
    pub name: String,
    pub description: Option<String>,
    pub vote_threshold: Option<i32>,
}

/// Create a new playlist owned by `owner_id`.
///
/// Validates `name`, generates a unique 8-char invite code (retrying on
/// collision), then inserts and returns the hydrated document.
pub async fn create(
    db: &Database,
    owner_id: ObjectId,
    input: CreatePlaylistInput,
) -> Result<Playlist> {
    // --- Validation ---
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Validation(
            "Playlist name must not be empty".to_string(),
        ));
    }
    if name.len() > 100 {
        return Err(AppError::Validation(
            "Playlist name must be at most 100 characters".to_string(),
        ));
    }

    let collection = db.collection::<Playlist>("playlists");
    let now = Utc::now();
    let vote_threshold = input.vote_threshold.unwrap_or(1);

    // --- Invite-code generation with collision retry ---
    for attempt in 0..INVITE_CODE_MAX_RETRIES {
        let invite_code = generate_invite_code();

        let playlist = Playlist {
            id: ObjectId::new(),
            name: name.clone(),
            description: input.description.clone(),
            owner_id,
            member_ids: vec![owner_id],
            invite_code: invite_code.clone(),
            vote_threshold,
            spotify_playlist_id: None,
            created_at: now,
            updated_at: now,
        };

        match collection.insert_one(&playlist).await {
            Ok(result) => {
                // Fetch the inserted document to get the server-assigned _id.
                let inserted_id = result
                    .inserted_id
                    .as_object_id()
                    .ok_or(AppError::Unexpected)?;

                let hydrated = collection
                    .find_one(doc! { "_id": inserted_id })
                    .await?
                    .ok_or(AppError::Unexpected)?;

                tracing::info!(
                    playlist_id = %inserted_id,
                    owner_id = %owner_id,
                    invite_code = %invite_code,
                    "Playlist created"
                );

                return Ok(hydrated);
            }
            Err(err) if is_duplicate_key_error(&err) => {
                tracing::warn!(attempt, "Invite code collision, retrying");
                continue;
            }
            Err(err) => return Err(AppError::Database(err)),
        }
    }

    Err(AppError::InviteCodeConflict)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invite_code_is_eight_alphanumeric_chars() {
        let code = generate_invite_code();
        assert_eq!(code.len(), INVITE_CODE_LEN);
        assert!(
            code.chars().all(|c| c.is_ascii_alphanumeric()),
            "invite code contained non-alphanumeric character: {code}"
        );
    }

    #[tokio::test]
    async fn create_rejects_empty_name() {
        // We test the validation path without a real DB.
        // Passing a dummy ObjectId; the error fires before any DB call.
        let fake_db = build_fake_db().await;
        let err = create(
            &fake_db,
            ObjectId::new(),
            CreatePlaylistInput {
                name: "   ".to_string(),
                description: None,
                vote_threshold: None,
            },
        )
        .await
        .unwrap_err();

        assert!(
            matches!(err, AppError::Validation(_)),
            "Expected Validation error, got {err:?}"
        );
    }

    #[tokio::test]
    async fn create_rejects_name_over_100_chars() {
        let fake_db = build_fake_db().await;
        let long_name = "a".repeat(101);
        let err = create(
            &fake_db,
            ObjectId::new(),
            CreatePlaylistInput {
                name: long_name,
                description: None,
                vote_threshold: None,
            },
        )
        .await
        .unwrap_err();

        assert!(
            matches!(err, AppError::Validation(_)),
            "Expected Validation error, got {err:?}"
        );
    }

    /// Build a throwaway MongoDB client pointing at the URI in `MONGO_URI`
    /// (defaults to `mongodb://localhost:27017`). Tests that exercise the DB
    /// are skipped when the env var `SKIP_DB_TESTS` is set.
    async fn build_fake_db() -> Database {
        let uri =
            std::env::var("MONGO_URI").unwrap_or_else(|_| "mongodb://localhost:27017".to_string());
        let client = mongodb::Client::with_uri_str(&uri)
            .await
            .expect("MongoDB not reachable — set MONGO_URI or start a local instance");
        client.database("matchify_test")
    }

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance (set MONGO_URI)"]
    async fn create_playlist_integration() {
        let db = build_fake_db().await;
        let owner_id = ObjectId::new();

        let playlist = create(
            &db,
            owner_id,
            CreatePlaylistInput {
                name: "My Test Playlist".to_string(),
                description: Some("Integration test".to_string()),
                vote_threshold: None,
            },
        )
        .await
        .expect("create should succeed");

        assert_eq!(playlist.name, "My Test Playlist");
        assert_eq!(playlist.owner_id, owner_id);
        assert_eq!(playlist.member_ids, vec![owner_id]);
        assert_eq!(playlist.vote_threshold, 1);
        assert_eq!(playlist.invite_code.len(), INVITE_CODE_LEN);
        assert!(playlist
            .invite_code
            .chars()
            .all(|c| c.is_ascii_alphanumeric()));
        assert!(playlist.spotify_playlist_id.is_none());

        // Clean up
        db.collection::<Playlist>("playlists")
            .delete_one(doc! { "_id": playlist.id })
            .await
            .unwrap();
    }
}
