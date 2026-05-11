use crate::config::AppConfig;
use crate::error::{AppError, Result};
use crate::model::playlist::Playlist;
use crate::model::recommendation::{
    RecommendationAction, RecommendationCacheEntry, RecommendationCandidate,
    RecommendationInteraction,
};
use crate::model::song::Song;
use crate::model::spotify::SpotifyTrack;
use crate::model::vote::VoteType;
use crate::service::lastfm::LastfmClient;
use crate::service::song;
use crate::service::spotify::SpotifyClient;
use chrono::{DateTime, Duration, Utc};
use futures::TryStreamExt;
use mongodb::{
    Client, Database,
    bson::{doc, oid::ObjectId},
};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

const CACHE_TTL_DAYS: i64 = 7;
const SEED_LIMIT: i64 = 10;
const SIMILAR_TRACK_LIMIT: u32 = 20;
const SPOTIFY_RESOLUTION_LIMIT: usize = 30;

#[derive(Debug, Clone)]
pub struct ScoredCandidateInput {
    pub candidate: RecommendationCandidate,
    pub seed_key: String,
}

#[derive(Debug, Clone)]
pub struct ScoredRecommendationCandidate {
    pub title: String,
    pub artist: String,
    pub score: f64,
    pub seed_count: usize,
}

#[derive(Debug)]
struct CandidateAggregate {
    title: String,
    artist: String,
    score: f64,
    seed_keys: HashSet<String>,
}

pub fn normalize_track_key(artist: &str, title: &str) -> String {
    format!(
        "{}::{}",
        normalize_key_part(artist),
        normalize_key_part(title)
    )
}

fn normalize_key_part(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn is_cache_fresh(fetched_at: DateTime<Utc>) -> bool {
    fetched_at > Utc::now() - Duration::days(CACHE_TTL_DAYS)
}

pub fn score_candidates(
    inputs: Vec<ScoredCandidateInput>,
    existing_track_keys: &HashSet<String>,
    rejected_track_keys: &HashSet<String>,
    playlist_artist_counts: &HashMap<String, usize>,
) -> Vec<ScoredRecommendationCandidate> {
    let mut aggregates: HashMap<String, CandidateAggregate> = HashMap::new();

    for input in inputs {
        let key = normalize_track_key(&input.candidate.artist, &input.candidate.title);

        if existing_track_keys.contains(&key) || rejected_track_keys.contains(&key) {
            continue;
        }

        let aggregate = aggregates.entry(key).or_insert_with(|| CandidateAggregate {
            title: input.candidate.title.clone(),
            artist: input.candidate.artist.clone(),
            score: 0.0,
            seed_keys: HashSet::new(),
        });

        aggregate.score += input.candidate.match_score;
        aggregate.seed_keys.insert(input.seed_key);
    }

    let mut scored = aggregates
        .into_values()
        .map(|aggregate| {
            let seed_count = aggregate.seed_keys.len();
            let duplicate_artist_penalty = playlist_artist_counts
                .get(&normalize_key_part(&aggregate.artist))
                .copied()
                .unwrap_or(0) as f64
                * 0.5;
            ScoredRecommendationCandidate {
                title: aggregate.title,
                artist: aggregate.artist,
                score: aggregate.score + seed_count.saturating_sub(1) as f64 * 4.0
                    - duplicate_artist_penalty,
                seed_count,
            }
        })
        .collect::<Vec<_>>();

    scored.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(Ordering::Equal)
            .then_with(|| right.seed_count.cmp(&left.seed_count))
            .then_with(|| left.artist.cmp(&right.artist))
            .then_with(|| left.title.cmp(&right.title))
    });

    scored
}

pub async fn next_recommendation(
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
    excluded_spotify_track_ids: &[String],
    lastfm_client: &LastfmClient,
    spotify_client: &SpotifyClient,
    spotify_access_token: &str,
) -> Result<Option<SpotifyTrack>> {
    let playlist = find_member_playlist(db, playlist_id, user_id).await?;
    let seeds = recommendation_seeds(db, playlist.id).await?;

    if seeds.is_empty() {
        return Ok(None);
    }

    let (existing_track_keys, playlist_artist_counts) =
        existing_track_keys_and_artist_counts(db, playlist.id).await?;
    let rejected_track_keys = rejected_track_keys(db, playlist.id, user_id).await?;
    let excluded_spotify_track_ids = excluded_spotify_track_ids
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut inputs = Vec::new();

    for seed in seeds {
        let seed_key = normalize_track_key(&seed.artist, &seed.title);
        let candidates = cached_or_fetch_candidates(db, lastfm_client, &seed).await?;

        inputs.extend(
            candidates
                .into_iter()
                .map(|candidate| ScoredCandidateInput {
                    candidate,
                    seed_key: seed_key.clone(),
                }),
        );
    }

    let scored = score_candidates(
        inputs,
        &existing_track_keys,
        &rejected_track_keys,
        &playlist_artist_counts,
    );

    for candidate in scored.into_iter().take(SPOTIFY_RESOLUTION_LIMIT) {
        let query = format!(
            "track:\"{}\" artist:\"{}\"",
            candidate.title, candidate.artist
        );
        let tracks = spotify_client
            .search_tracks(&query, 1, spotify_access_token)
            .await?;

        if let Some(track) = tracks.into_iter().next() {
            let spotify_key = normalize_track_key(&track.artist, &track.title);
            if !excluded_spotify_track_ids.contains(track.spotify_track_id.as_str())
                && !existing_track_keys.contains(&spotify_key)
                && !rejected_track_keys.contains(&spotify_key)
            {
                return Ok(Some(track));
            }
        }
    }

    Ok(None)
}

pub async fn respond_to_recommendation(
    client: &Client,
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
    spotify_track_id: String,
    action: RecommendationAction,
    spotify_client: &SpotifyClient,
    spotify_access_token: &str,
    broker: &crate::events::EventBroker,
    config: &AppConfig,
) -> Result<Option<Song>> {
    find_member_playlist(db, playlist_id, user_id).await?;
    let spotify_tracks = spotify_client
        .get_tracks(&[spotify_track_id.clone()], spotify_access_token)
        .await?;
    let spotify_track = spotify_tracks.into_iter().next().ok_or_else(|| {
        AppError::NotFound(format!("Spotify track {} not found", spotify_track_id))
    })?;
    let track_key = normalize_track_key(&spotify_track.artist, &spotify_track.title);

    record_interaction(
        db,
        playlist_id,
        user_id,
        &spotify_track_id,
        &track_key,
        action,
    )
    .await?;

    if action == RecommendationAction::Reject {
        return Ok(None);
    }

    let song = song::propose_track(
        db,
        playlist_id,
        user_id,
        spotify_track_id,
        spotify_client,
        spotify_access_token,
        broker,
    )
    .await?;
    let voted_song = song::vote_on_track(
        client,
        db,
        song.id,
        user_id,
        VoteType::Like,
        broker,
        spotify_client,
        config,
    )
    .await?;

    Ok(Some(voted_song))
}

async fn find_member_playlist(
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
) -> Result<Playlist> {
    let playlists = db.collection::<Playlist>("playlists");
    let playlist = playlists
        .find_one(doc! { "_id": playlist_id })
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Playlist {} not found", playlist_id)))?;

    if !playlist.member_ids.contains(&user_id) {
        return Err(AppError::Forbidden(
            "You are not a member of this playlist".to_string(),
        ));
    }

    Ok(playlist)
}

async fn recommendation_seeds(db: &Database, playlist_id: ObjectId) -> Result<Vec<Song>> {
    let songs = db.collection::<Song>("songs");
    let cursor = songs
        .find(doc! {
            "playlist_id": playlist_id,
            "status": { "$in": ["Approved", "Pending"] },
        })
        .sort(doc! { "created_at": -1 })
        .limit(SEED_LIMIT)
        .await?;

    cursor.try_collect().await.map_err(AppError::Database)
}

async fn existing_track_keys_and_artist_counts(
    db: &Database,
    playlist_id: ObjectId,
) -> Result<(HashSet<String>, HashMap<String, usize>)> {
    let songs = db.collection::<Song>("songs");
    let cursor = songs.find(doc! { "playlist_id": playlist_id }).await?;
    let existing: Vec<Song> = cursor.try_collect().await.map_err(AppError::Database)?;
    let mut track_keys = HashSet::new();
    let mut artist_counts = HashMap::new();

    for song in existing {
        track_keys.insert(normalize_track_key(&song.artist, &song.title));
        *artist_counts
            .entry(normalize_key_part(&song.artist))
            .or_insert(0) += 1;
    }

    Ok((track_keys, artist_counts))
}

async fn rejected_track_keys(
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
) -> Result<HashSet<String>> {
    let interactions = db.collection::<RecommendationInteraction>("recommendation_interactions");
    let cursor = interactions
        .find(doc! {
            "playlist_id": playlist_id,
            "user_id": user_id,
            "action": "Reject",
        })
        .await?;
    let rejected: Vec<RecommendationInteraction> =
        cursor.try_collect().await.map_err(AppError::Database)?;

    Ok(rejected
        .into_iter()
        .map(|interaction| interaction.track_key)
        .collect())
}

async fn cached_or_fetch_candidates(
    db: &Database,
    lastfm_client: &LastfmClient,
    seed: &Song,
) -> Result<Vec<RecommendationCandidate>> {
    let cache = db.collection::<RecommendationCacheEntry>("recommendation_cache");
    let seed_key = normalize_track_key(&seed.artist, &seed.title);

    if let Some(entry) = cache.find_one(doc! { "seed_key": &seed_key }).await? {
        if is_cache_fresh(entry.fetched_at) {
            return Ok(entry.candidates);
        }
    }

    let candidates = lastfm_client
        .similar_tracks(&seed.artist, &seed.title, SIMILAR_TRACK_LIMIT)
        .await?;
    let entry = RecommendationCacheEntry {
        id: ObjectId::new(),
        seed_key: seed_key.clone(),
        seed_artist: seed.artist.clone(),
        seed_title: seed.title.clone(),
        candidates: candidates.clone(),
        fetched_at: Utc::now(),
    };

    cache
        .replace_one(doc! { "seed_key": &seed_key }, &entry)
        .upsert(true)
        .await?;

    Ok(candidates)
}

async fn record_interaction(
    db: &Database,
    playlist_id: ObjectId,
    user_id: ObjectId,
    spotify_track_id: &str,
    track_key: &str,
    action: RecommendationAction,
) -> Result<()> {
    let interactions = db.collection::<RecommendationInteraction>("recommendation_interactions");
    let interaction = RecommendationInteraction {
        id: ObjectId::new(),
        playlist_id,
        user_id,
        spotify_track_id: spotify_track_id.to_string(),
        track_key: track_key.to_string(),
        action,
        created_at: Utc::now(),
    };

    interactions
        .replace_one(
            doc! {
                "playlist_id": playlist_id,
                "user_id": user_id,
                "spotify_track_id": spotify_track_id,
            },
            &interaction,
        )
        .upsert(true)
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::recommendation::RecommendationCandidate;
    use chrono::{Duration, Utc};
    use std::collections::{HashMap, HashSet};

    fn candidate(
        title: &str,
        artist: &str,
        match_score: f64,
        seed_key: &str,
    ) -> ScoredCandidateInput {
        ScoredCandidateInput {
            candidate: RecommendationCandidate {
                title: title.to_string(),
                artist: artist.to_string(),
                match_score,
            },
            seed_key: seed_key.to_string(),
        }
    }

    #[test]
    fn scoring_prefers_candidates_that_match_multiple_seeds() {
        let scored = score_candidates(
            vec![
                candidate("Shared", "Artist A", 6.0, "seed-1"),
                candidate("Shared", "Artist A", 6.0, "seed-2"),
                candidate("Single", "Artist B", 10.0, "seed-3"),
            ],
            &HashSet::new(),
            &HashSet::new(),
            &HashMap::new(),
        );

        assert_eq!(scored[0].title, "Shared");
    }

    #[test]
    fn scoring_excludes_existing_and_rejected_tracks() {
        let existing = HashSet::from([normalize_track_key("Artist A", "Existing")]);
        let rejected = HashSet::from([normalize_track_key("Artist B", "Rejected")]);
        let scored = score_candidates(
            vec![
                candidate("Existing", "Artist A", 10.0, "seed-1"),
                candidate("Rejected", "Artist B", 9.0, "seed-1"),
                candidate("Fresh", "Artist C", 5.0, "seed-1"),
            ],
            &existing,
            &rejected,
            &HashMap::new(),
        );

        assert_eq!(scored.len(), 1);
        assert_eq!(scored[0].title, "Fresh");
    }

    #[test]
    fn cache_entry_is_fresh_for_seven_days() {
        assert!(is_cache_fresh(Utc::now() - Duration::days(6)));
        assert!(!is_cache_fresh(Utc::now() - Duration::days(8)));
    }
}
