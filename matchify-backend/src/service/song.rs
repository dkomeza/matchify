use crate::error::{AppError, Result};
use crate::model::playlist::Playlist;
use crate::model::song::{Song, TrackStatus};
use crate::service::spotify::SpotifyClient;
use chrono::Utc;
use mongodb::{bson::doc, bson::oid::ObjectId, Database};

/// Returns `true` if a MongoDB write error contains a duplicate-key (E11000) code.
fn is_duplicate_key_error(err: &mongodb::error::Error) -> bool {
    use mongodb::error::ErrorKind;
    match err.kind.as_ref() {
        ErrorKind::Write(mongodb::error::WriteFailure::WriteError(we)) => we.code == 11000,
        _ => false,
    }
}

pub async fn add_initial_tracks(
    db: &Database,
    playlist_id: ObjectId,
    caller_id: ObjectId,
    spotify_track_ids: &[String],
    spotify_client: &SpotifyClient,
    access_token: &str,
) -> Result<Vec<Song>> {
    // 1. Verify owner
    let playlists = db.collection::<Playlist>("playlists");
    let playlist = playlists
        .find_one(doc! { "_id": playlist_id })
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Playlist {} not found", playlist_id)))?;

    if playlist.owner_id != caller_id {
        return Err(AppError::Forbidden(
            "Only the playlist owner can add initial tracks".to_string(),
        ));
    }

    // 2. Fetch tracks
    let spotify_tracks = spotify_client.get_tracks(spotify_track_ids, access_token).await?;

    let mut inserted_songs = Vec::new();
    let songs_coll = db.collection::<Song>("songs");

    for track in spotify_tracks {
        let song = Song {
            id: ObjectId::new(),
            playlist_id,
            spotify_track_id: track.spotify_track_id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            album_art_url: track.album_art_url,
            preview_url: track.preview_url,
            duration_ms: track.duration_ms,
            proposed_by: caller_id,
            status: TrackStatus::Pending,
            like_count: 0,
            created_at: Utc::now(),
        };

        match songs_coll.insert_one(&song).await {
            Ok(_) => {
                inserted_songs.push(song);
            }
            Err(e) if is_duplicate_key_error(&e) => {
                // Ignore silently
            }
            Err(e) => return Err(AppError::Database(e)),
        }
    }

    Ok(inserted_songs)
}
