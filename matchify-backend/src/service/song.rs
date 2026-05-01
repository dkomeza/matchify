use crate::error::{AppError, Result};
use crate::events::{EventBroker, PlaylistEvent};
use crate::model::playlist::Playlist;
use crate::model::song::{Song, SongGql, TrackStatus};
use crate::model::user::User;
use crate::service::spotify::{SpotifyClient, get_valid_access_token};
use crate::config::AppConfig;
use chrono::Utc;
use mongodb::{bson::doc, bson::oid::ObjectId, Client, Database, error::TRANSIENT_TRANSACTION_ERROR, options::TransactionOptions};
use futures::StreamExt;
use crate::model::vote::{Vote, VoteType};

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
    broker: &EventBroker,
) -> Result<Vec<Song>> {
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
                broker.publish(
                    playlist_id,
                    PlaylistEvent::NewProposal(SongGql::from(song.clone())),
                );
                inserted_songs.push(song);
            }
            Err(e) if is_duplicate_key_error(&e) => {}
            Err(e) => return Err(AppError::Database(e)),
        }
    }

    Ok(inserted_songs)
}

pub async fn next_unvoted(
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
) -> Result<Option<Song>> {
    let songs_coll = db.collection::<mongodb::bson::Document>("songs");

    let pipeline = vec![
        doc! {
            "$match": {
                "playlist_id": playlist_id,
                "status": "Pending"
            }
        },
        doc! {
            "$lookup": {
                "from": "votes",
                "let": { "song_id": "$_id" },
                "pipeline": [
                    {
                        "$match": {
                            "$expr": {
                                "$and": [
                                    { "$eq": ["$song_id", "$$song_id"] },
                                    { "$eq": ["$user_id", user_id] }
                                ]
                            }
                        }
                    }
                ],
                "as": "user_votes"
            }
        },
        doc! {
            "$match": {
                "user_votes": { "$size": 0 }
            }
        },
        doc! {
            "$sort": { "created_at": 1 }
        },
        doc! {
            "$limit": 1
        }
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await.map_err(AppError::Database)?;
    
    if let Some(result) = cursor.next().await {
        let doc = result.map_err(AppError::Database)?;
        let song: Song = mongodb::bson::from_document(doc).map_err(|_| AppError::Unexpected)?;
        return Ok(Some(song));
    }

    Ok(None)
}

pub async fn vote_on_track(
    client: &Client,
    db: &Database,
    t_id: ObjectId,
    user_id: ObjectId,
    vote_type: VoteType,
    broker: &EventBroker,
    spotify_client: &SpotifyClient,
    config: &AppConfig,
) -> Result<Song> {
    let songs_coll = db.collection::<Song>("songs");
    let votes_coll = db.collection::<Vote>("votes");
    let playlists_coll = db.collection::<Playlist>("playlists");

    let song = songs_coll
        .find_one(doc! { "_id": t_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Track not found".to_string()))?;

    let playlist = playlists_coll
        .find_one(doc! { "_id": song.playlist_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Playlist not found".to_string()))?;

    if !playlist.member_ids.contains(&user_id) {
        return Err(AppError::Forbidden("Not a member of this playlist".to_string()));
    }

    let mut session = client.start_session().await.map_err(AppError::Database)?;
    let options = TransactionOptions::builder().build();

    let spotify_client = spotify_client.clone();
    let config = config.clone();
    let db_bg = db.clone();

    let mut retries = 3;
    loop {
        session.start_transaction().with_options(options.clone()).await.map_err(AppError::Database)?;

        let vote = Vote {
            id: ObjectId::new(),
            song_id: t_id,
            playlist_id: song.playlist_id,
            user_id,
            vote: vote_type,
            created_at: Utc::now(),
        };

        match votes_coll.insert_one(&vote).session(&mut session).await {
            Ok(_) => {}
            Err(e) if is_duplicate_key_error(&e) => {
                let _ = session.abort_transaction().await;
                return Err(AppError::Validation("You have already voted on this track".to_string()));
            }
            Err(e) => {
                let _ = session.abort_transaction().await;
                if e.contains_label(TRANSIENT_TRANSACTION_ERROR) && retries > 0 {
                    retries -= 1;
                    continue;
                }
                return Err(AppError::Database(e));
            }
        }

        let mut updated_song = song.clone();

        if vote_type == VoteType::Like {
            let update_result = songs_coll
                .find_one_and_update(
                    doc! { "_id": t_id },
                    doc! { "$inc": { "like_count": 1 } },
                )
                .return_document(mongodb::options::ReturnDocument::After)
                .session(&mut session)
                .await;

            let after_song = match update_result {
                Ok(Some(s)) => s,
                Ok(None) => {
                    let _ = session.abort_transaction().await;
                    return Err(AppError::NotFound("Track not found during update".to_string()));
                }
                Err(e) => {
                    let _ = session.abort_transaction().await;
                    if e.contains_label(TRANSIENT_TRANSACTION_ERROR) && retries > 0 {
                        retries -= 1;
                        continue;
                    }
                    return Err(AppError::Database(e));
                }
            };

            updated_song = after_song;

            let threshold = playlist.vote_threshold;
            if updated_song.like_count >= threshold {
                let status_update = songs_coll
                    .update_one(
                        doc! { "_id": t_id, "status": "Pending" },
                        doc! { "$set": { "status": "Approved" } },
                    )
                    .session(&mut session)
                    .await;

                match status_update {
                    Ok(res) => {
                        if res.modified_count > 0 {
                            updated_song.status = TrackStatus::Approved;
                            tracing::info!("Track {} approved!", t_id);
                            broker.publish(
                                updated_song.playlist_id,
                                PlaylistEvent::TrackApproved(SongGql::from(updated_song.clone())),
                            );

                            let approved_song = updated_song.clone();
                            let approved_playlist = playlist.clone();
                            let spotify_client_bg = spotify_client.clone();
                            let config_bg = config.clone();
                            let db_task = db_bg.clone();

                            tokio::spawn(async move {
                                if let Err(e) = sync_approved_track_to_spotify(
                                    &db_task,
                                    &spotify_client_bg,
                                    &config_bg,
                                    &approved_playlist,
                                    &approved_song,
                                )
                                .await
                                {
                                    tracing::error!(
                                        track_id = %approved_song.id,
                                        playlist_id = %approved_playlist.id,
                                        error = %e,
                                        "Spotify playlist sync failed (vote still recorded)"
                                    );
                                }
                            });
                        }
                    }
                    Err(e) => {
                        let _ = session.abort_transaction().await;
                        if e.contains_label(TRANSIENT_TRANSACTION_ERROR) && retries > 0 {
                            retries -= 1;
                            continue;
                        }
                        return Err(AppError::Database(e));
                    }
                }
            }
        } else {
        }

        match session.commit_transaction().await {
            Ok(_) => return Ok(updated_song),
            Err(e) => {
                if e.contains_label(TRANSIENT_TRANSACTION_ERROR) && retries > 0 {
                    retries -= 1;
                    continue;
                }
                return Err(AppError::Database(e));
            }
        }
    }
}

pub async fn propose_track(
    db: &Database,
    playlist_id: ObjectId,
    caller_id: ObjectId,
    spotify_track_id: String,
    spotify_client: &SpotifyClient,
    access_token: &str,
    broker: &EventBroker,
) -> Result<Song> {
    let playlists = db.collection::<Playlist>("playlists");
    let playlist = playlists
        .find_one(doc! { "_id": playlist_id })
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Playlist {} not found", playlist_id)))?;

    if !playlist.member_ids.contains(&caller_id) {
        return Err(AppError::Forbidden(
            "Only playlist members can propose tracks".to_string(),
        ));
    }

    let spotify_tracks = spotify_client.get_tracks(&[spotify_track_id.clone()], access_token).await?;
    let track = spotify_tracks.into_iter().next().ok_or_else(|| {
        AppError::NotFound(format!("Spotify track {} not found", spotify_track_id))
    })?;

    let songs_coll = db.collection::<Song>("songs");

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
            tracing::info!("Track {} proposed!", song.id);
            broker.publish(
                playlist_id,
                PlaylistEvent::NewProposal(SongGql::from(song.clone())),
            );
            Ok(song)
        }
        Err(e) if is_duplicate_key_error(&e) => {
            Err(AppError::Validation("Track already proposed in this playlist".to_string()))
        }
        Err(e) => Err(AppError::Database(e)),
    }
}

async fn sync_approved_track_to_spotify(
    db: &Database,
    spotify_client: &SpotifyClient,
    config: &AppConfig,
    playlist: &Playlist,
    song: &Song,
) -> crate::error::Result<()> {
    let users_coll = db.collection::<User>("users");
    let owner = users_coll
        .find_one(doc! { "_id": playlist.owner_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Playlist owner not found".to_string()))?;

    let access_token = get_valid_access_token(&owner, spotify_client, db, config).await?;

    let spotify_playlist_id = match &playlist.spotify_playlist_id {
        Some(id) => id.clone(),
        None => {
            let description = format!(
                "Collaborative playlist managed by Matchify — {}",
                playlist.name
            );

            let new_id = spotify_client
                .create_playlist(
                    &access_token,
                    &owner.spotify_id,
                    &playlist.name,
                    &description,
                )
                .await?;

            let playlists_coll = db.collection::<Playlist>("playlists");
            let now = mongodb::bson::DateTime::from_millis(chrono::Utc::now().timestamp_millis());
            playlists_coll
                .update_one(
                    doc! { "_id": playlist.id },
                    doc! { "$set": { "spotify_playlist_id": &new_id, "updated_at": now } },
                )
                .await?;

            tracing::info!(
                playlist_id = %playlist.id,
                spotify_playlist_id = %new_id,
                "Created Spotify playlist for matchify playlist"
            );

            new_id
        }
    };

    let track_uri = format!("spotify:track:{}", song.spotify_track_id);
    spotify_client
        .add_track_to_playlist(&access_token, &spotify_playlist_id, &track_uri)
        .await?;

    tracing::info!(
        song_id = %song.id,
        spotify_track_id = %song.spotify_track_id,
        spotify_playlist_id = %spotify_playlist_id,
        "Track added to Spotify playlist"
    );

    Ok(())
}
