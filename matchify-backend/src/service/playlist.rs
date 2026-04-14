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

/// Join an existing playlist using its invite code.
///
/// * Looks up the playlist by `invite_code` (unique-indexed field).
/// * If `caller_id` is already in `member_ids` the document is returned as-is
///   (idempotent — no error, no write).
/// * Otherwise `$addToSet` the caller, then recalculate
///   `vote_threshold = ceil(new_member_count / 2)` **only** when the playlist
///   is still using the default formula (i.e. `vote_threshold` equals
///   `ceil(old_member_count / 2)`). User-supplied custom thresholds are
///   preserved.
///
/// Returns `NOT_FOUND` when the invite code does not match any playlist.
pub async fn join(db: &Database, caller_id: ObjectId, invite_code: &str) -> Result<Playlist> {
    use mongodb::options::{FindOneAndUpdateOptions, ReturnDocument};

    let collection = db.collection::<Playlist>("playlists");

    // 1. Look up the playlist.
    let playlist = collection
        .find_one(doc! { "invite_code": invite_code })
        .await?
        .ok_or_else(|| AppError::NotFound(format!("No playlist with invite code '{invite_code}'")))?;

    // 2. Idempotency — already a member, nothing to do.
    if playlist.member_ids.contains(&caller_id) {
        tracing::debug!(
            playlist_id = %playlist.id,
            caller_id = %caller_id,
            "joinPlaylist: caller already a member, skipping write"
        );
        return Ok(playlist);
    }

    // 3. Determine whether the current threshold is the auto-computed default
    //    so we know whether to bump it after adding the new member.
    let old_count = playlist.member_ids.len() as i32;
    let auto_threshold = (old_count + 1) / 2 + (old_count + 1) % 2; // ceil(n/2)
    let has_custom_threshold = playlist.vote_threshold != auto_threshold;

    let new_count = old_count + 1;
    let new_threshold = if has_custom_threshold {
        playlist.vote_threshold // preserve custom value
    } else {
        (new_count + 1) / 2 // ceil(new_count / 2) using integer arithmetic
    };

    // 4. Atomic update: add member + (conditionally) update threshold.
    let now = mongodb::bson::DateTime::from_millis(chrono::Utc::now().timestamp_millis());
    let updated = collection
        .find_one_and_update(
            doc! { "_id": playlist.id, "invite_code": invite_code },
            doc! {
                "$addToSet": { "member_ids": caller_id },
                "$set": {
                    "vote_threshold": new_threshold,
                    "updated_at": now,
                },
            },
        )
        .with_options(
            FindOneAndUpdateOptions::builder()
                .return_document(ReturnDocument::After)
                .build(),
        )
        .await?
        .ok_or(AppError::Unexpected)?;

    tracing::info!(
        playlist_id = %updated.id,
        caller_id = %caller_id,
        new_member_count = new_count,
        vote_threshold = new_threshold,
        "joinPlaylist: member added"
    );

    Ok(updated)
}

/// Find a playlist by its ObjectId.
///
/// Returns `Ok(Some(playlist))` when found, `Ok(None)` when not found.
pub async fn find_by_id(db: &Database, id: ObjectId) -> Result<Option<Playlist>> {
    let collection = db.collection::<Playlist>("playlists");
    let playlist = collection.find_one(doc! { "_id": id }).await?;
    Ok(playlist)
}

/// Return all playlists where `user_id` appears in `member_ids`.
pub async fn find_by_member(db: &Database, user_id: ObjectId) -> Result<Vec<Playlist>> {
    use mongodb::bson::doc;
    use futures::TryStreamExt;

    let collection = db.collection::<Playlist>("playlists");
    let cursor = collection
        .find(doc! { "member_ids": user_id })
        .await?;

    let playlists: Vec<Playlist> = cursor.try_collect().await?;
    Ok(playlists)
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

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance (set MONGO_URI)"]
    async fn join_invalid_invite_code_returns_not_found() {
        let db = build_fake_db().await;
        let err = join(&db, ObjectId::new(), "NOTEXIST")
            .await
            .unwrap_err();
        assert!(
            matches!(err, AppError::NotFound(_)),
            "Expected NotFound error, got {err:?}"
        );
    }

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance (set MONGO_URI)"]
    async fn join_is_idempotent() {
        let db = build_fake_db().await;
        let owner_id = ObjectId::new();

        let playlist = create(
            &db,
            owner_id,
            CreatePlaylistInput {
                name: "Idempotency Test".to_string(),
                description: None,
                vote_threshold: None,
            },
        )
        .await
        .expect("create should succeed");

        // Join with the owner who is already a member.
        let rejoined = join(&db, owner_id, &playlist.invite_code)
            .await
            .expect("idempotent join should succeed");

        assert_eq!(rejoined.member_ids.len(), 1, "no duplicate member");
        assert_eq!(rejoined.vote_threshold, 1);

        // Clean up
        db.collection::<Playlist>("playlists")
            .delete_one(doc! { "_id": playlist.id })
            .await
            .unwrap();
    }

    #[tokio::test]
    #[ignore = "requires a running MongoDB instance (set MONGO_URI)"]
    async fn join_adds_member_and_recalculates_threshold() {
        let db = build_fake_db().await;
        let owner_id = ObjectId::new();
        let new_member_id = ObjectId::new();

        let playlist = create(
            &db,
            owner_id,
            CreatePlaylistInput {
                name: "Threshold Test".to_string(),
                description: None,
                vote_threshold: None,
            },
        )
        .await
        .expect("create should succeed");

        // 1 member → threshold = 1; after join: 2 members → ceil(2/2) = 1.
        let after_second = join(&db, new_member_id, &playlist.invite_code)
            .await
            .expect("join should succeed");

        assert_eq!(after_second.member_ids.len(), 2);
        assert!(after_second.member_ids.contains(&new_member_id));
        assert_eq!(after_second.vote_threshold, 1); // ceil(2/2)

        // Join a third member → ceil(3/2) = 2.
        let third_id = ObjectId::new();
        let after_third = join(&db, third_id, &playlist.invite_code)
            .await
            .expect("join should succeed");

        assert_eq!(after_third.member_ids.len(), 3);
        assert_eq!(after_third.vote_threshold, 2); // ceil(3/2)

        // Clean up
        db.collection::<Playlist>("playlists")
            .delete_one(doc! { "_id": playlist.id })
            .await
            .unwrap();
    }
}
