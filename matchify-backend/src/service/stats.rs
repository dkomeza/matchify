use futures::stream::StreamExt;
use mongodb::{
    Database,
    bson::{Bson, Document, doc, oid::ObjectId},
};
use std::collections::{HashMap, HashSet};

use crate::error::{AppError, Result};
use crate::model::{
    ActiveMemberStat, ArtistStat, HomeReport, MemberStat, PendingTrackInsight,
    PersonalOverviewStats, PlaylistHealthStat, PlaylistStats, SongGql, User, playlist::Playlist,
    song::Song,
};

fn read_i32(doc: &Document, key: &str) -> i32 {
    match doc.get(key) {
        Some(Bson::Int32(value)) => *value,
        Some(Bson::Int64(value)) => *value as i32,
        Some(Bson::Double(value)) => *value as i32,
        _ => 0,
    }
}

fn read_f64(doc: &Document, key: &str) -> f64 {
    match doc.get(key) {
        Some(Bson::Double(value)) => *value,
        Some(Bson::Int32(value)) => *value as f64,
        Some(Bson::Int64(value)) => *value as f64,
        _ => 0.0,
    }
}

pub async fn get_home_report(db: &Database, user_id: ObjectId) -> Result<HomeReport> {
    let playlists_coll = db.collection::<Playlist>("playlists");
    let songs_coll = db.collection::<Song>("songs");
    let votes_coll = db.collection::<crate::model::vote::Vote>("votes");
    let users_coll = db.collection::<User>("users");

    let mut playlists_cursor = playlists_coll.find(doc! { "member_ids": user_id }).await?;
    let mut playlists = Vec::new();
    while let Some(playlist) = playlists_cursor.next().await {
        playlists.push(playlist?);
    }

    let playlist_ids: Vec<ObjectId> = playlists.iter().map(|playlist| playlist.id).collect();
    if playlist_ids.is_empty() {
        return Ok(HomeReport {
            overview: PersonalOverviewStats {
                joined_playlists: 0,
                tracks_proposed_by_me: 0,
                votes_cast_by_me: 0,
                approved_tracks_from_my_proposals: 0,
                my_approval_rate: 0.0,
            },
            playlist_health: vec![],
            active_members: vec![],
            top_artists: vec![],
            pending_tracks: vec![],
        });
    }

    let personal_pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": &playlist_ids } } },
        doc! { "$group": {
            "_id": Bson::Null,
            "tracksProposedByMe": {
                "$sum": { "$cond": [{ "$eq": ["$proposed_by", user_id] }, 1, 0] }
            },
            "approvedTracksFromMyProposals": {
                "$sum": { "$cond": [
                    { "$and": [
                        { "$eq": ["$proposed_by", user_id] },
                        { "$eq": ["$status", "Approved"] }
                    ] },
                    1,
                    0
                ] }
            }
        }},
    ];

    let mut personal_cursor = songs_coll.aggregate(personal_pipeline).await?;
    let personal_doc = match personal_cursor.next().await {
        Some(result) => result?,
        None => Document::new(),
    };

    let tracks_proposed_by_me = read_i32(&personal_doc, "tracksProposedByMe");
    let approved_tracks_from_my_proposals =
        read_i32(&personal_doc, "approvedTracksFromMyProposals");
    let votes_cast_by_me = votes_coll
        .count_documents(doc! { "playlist_id": { "$in": &playlist_ids }, "user_id": user_id })
        .await? as i32;

    let playlist_health = get_home_playlist_health(db, &playlists, &playlist_ids).await?;
    let total_proposals: i32 = playlist_health
        .iter()
        .map(|stat| stat.total_proposals)
        .sum();

    Ok(HomeReport {
        overview: PersonalOverviewStats {
            joined_playlists: playlists.len() as i32,
            tracks_proposed_by_me,
            votes_cast_by_me,
            approved_tracks_from_my_proposals,
            my_approval_rate: if tracks_proposed_by_me > 0 {
                approved_tracks_from_my_proposals as f64 / tracks_proposed_by_me as f64
            } else {
                0.0
            },
        },
        playlist_health: playlist_health.into_iter().take(3).collect(),
        active_members: get_home_active_members(
            db,
            &playlists,
            &playlist_ids,
            total_proposals,
            &users_coll,
        )
        .await?,
        top_artists: get_home_top_artists(db, &playlist_ids).await?,
        pending_tracks: get_home_pending_tracks(db, &playlists, &playlist_ids).await?,
    })
}

async fn get_home_playlist_health(
    db: &Database,
    playlists: &[Playlist],
    playlist_ids: &[ObjectId],
) -> Result<Vec<PlaylistHealthStat>> {
    let songs_coll = db.collection::<Song>("songs");
    let playlist_names: HashMap<ObjectId, String> = playlists
        .iter()
        .map(|playlist| (playlist.id, playlist.name.clone()))
        .collect();

    let pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": playlist_ids } } },
        doc! { "$lookup": {
            "from": "votes",
            "localField": "_id",
            "foreignField": "song_id",
            "as": "votes"
        }},
        doc! { "$group": {
            "_id": "$playlist_id",
            "totalProposals": { "$sum": 1 },
            "approvedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Approved"] }, 1, 0] } },
            "pendingCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Pending"] }, 1, 0] } },
            "skippedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Skipped"] }, 1, 0] } },
            "totalVotesCast": { "$sum": { "$size": "$votes" } }
        }},
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await?;
    let mut stats_by_playlist = HashMap::new();

    while let Some(result) = cursor.next().await {
        let doc = result?;
        let playlist_id = doc.get_object_id("_id").map_err(|_| AppError::Unexpected)?;
        let total_proposals = read_i32(&doc, "totalProposals");
        let approved_count = read_i32(&doc, "approvedCount");
        let total_votes_cast = read_i32(&doc, "totalVotesCast");

        stats_by_playlist.insert(
            playlist_id,
            PlaylistHealthStat {
                playlist_id: playlist_id.to_hex(),
                name: playlist_names
                    .get(&playlist_id)
                    .cloned()
                    .unwrap_or_else(|| "Playlist".to_string()),
                total_proposals,
                approved_count,
                pending_count: read_i32(&doc, "pendingCount"),
                skipped_count: read_i32(&doc, "skippedCount"),
                approval_rate: if total_proposals > 0 {
                    approved_count as f64 / total_proposals as f64
                } else {
                    0.0
                },
                total_votes_cast,
                average_votes_per_proposal: if total_proposals > 0 {
                    total_votes_cast as f64 / total_proposals as f64
                } else {
                    0.0
                },
            },
        );
    }

    let mut stats: Vec<PlaylistHealthStat> = playlists
        .iter()
        .map(|playlist| {
            stats_by_playlist
                .remove(&playlist.id)
                .unwrap_or_else(|| PlaylistHealthStat {
                    playlist_id: playlist.id.to_hex(),
                    name: playlist.name.clone(),
                    total_proposals: 0,
                    approved_count: 0,
                    pending_count: 0,
                    skipped_count: 0,
                    approval_rate: 0.0,
                    total_votes_cast: 0,
                    average_votes_per_proposal: 0.0,
                })
        })
        .collect();

    stats.sort_by(|left, right| {
        right
            .total_votes_cast
            .cmp(&left.total_votes_cast)
            .then(right.total_proposals.cmp(&left.total_proposals))
            .then(left.name.cmp(&right.name))
    });

    Ok(stats)
}

async fn get_home_active_members(
    db: &Database,
    playlists: &[Playlist],
    playlist_ids: &[ObjectId],
    total_proposals: i32,
    users_coll: &mongodb::Collection<User>,
) -> Result<Vec<ActiveMemberStat>> {
    let songs_coll = db.collection::<Song>("songs");
    let votes_coll = db.collection::<crate::model::vote::Vote>("votes");

    let member_ids: Vec<ObjectId> = playlists
        .iter()
        .flat_map(|playlist| playlist.member_ids.iter().copied())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let mut proposed_by_user = HashMap::new();
    let proposal_pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": playlist_ids } } },
        doc! { "$group": { "_id": "$proposed_by", "tracksProposed": { "$sum": 1 } } },
    ];
    let mut proposal_cursor = songs_coll.aggregate(proposal_pipeline).await?;
    while let Some(result) = proposal_cursor.next().await {
        let doc = result?;
        let user_id = doc.get_object_id("_id").map_err(|_| AppError::Unexpected)?;
        proposed_by_user.insert(user_id, read_i32(&doc, "tracksProposed"));
    }

    let mut votes_by_user = HashMap::new();
    let votes_pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": playlist_ids } } },
        doc! { "$group": { "_id": "$user_id", "votesCast": { "$sum": 1 } } },
    ];
    let mut votes_cursor = votes_coll.aggregate(votes_pipeline).await?;
    while let Some(result) = votes_cursor.next().await {
        let doc = result?;
        let user_id = doc.get_object_id("_id").map_err(|_| AppError::Unexpected)?;
        votes_by_user.insert(user_id, read_i32(&doc, "votesCast"));
    }

    let mut users_cursor = users_coll
        .find(doc! { "_id": { "$in": member_ids } })
        .await?;
    let mut stats = Vec::new();
    while let Some(user) = users_cursor.next().await {
        let user = user?;
        let votes_cast = *votes_by_user.get(&user.id).unwrap_or(&0);
        let tracks_proposed = *proposed_by_user.get(&user.id).unwrap_or(&0);

        stats.push(ActiveMemberStat {
            user,
            votes_cast,
            tracks_proposed,
            participation_rate: if total_proposals > 0 {
                votes_cast as f64 / total_proposals as f64
            } else {
                0.0
            },
        });
    }

    stats.sort_by(|left, right| {
        (right.votes_cast + right.tracks_proposed)
            .cmp(&(left.votes_cast + left.tracks_proposed))
            .then(right.votes_cast.cmp(&left.votes_cast))
            .then(right.tracks_proposed.cmp(&left.tracks_proposed))
    });

    Ok(stats.into_iter().take(5).collect())
}

async fn get_home_top_artists(db: &Database, playlist_ids: &[ObjectId]) -> Result<Vec<ArtistStat>> {
    let songs_coll = db.collection::<Song>("songs");
    let pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": playlist_ids }, "status": "Approved" } },
        doc! { "$group": {
            "_id": "$artist",
            "approvedTracks": { "$sum": 1 },
            "averageDurationMs": { "$avg": "$duration_ms" }
        }},
        doc! { "$sort": { "approvedTracks": -1, "_id": 1 } },
        doc! { "$limit": 5 },
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await?;
    let mut artists = Vec::new();
    while let Some(result) = cursor.next().await {
        let doc = result?;
        artists.push(ArtistStat {
            artist: doc.get_str("_id").unwrap_or("Unknown artist").to_string(),
            approved_tracks: read_i32(&doc, "approvedTracks"),
            average_duration_ms: read_f64(&doc, "averageDurationMs"),
        });
    }

    Ok(artists)
}

async fn get_home_pending_tracks(
    db: &Database,
    playlists: &[Playlist],
    playlist_ids: &[ObjectId],
) -> Result<Vec<PendingTrackInsight>> {
    let songs_coll = db.collection::<Document>("songs");
    let playlist_lookup: HashMap<ObjectId, (&str, i32)> = playlists
        .iter()
        .map(|playlist| {
            (
                playlist.id,
                (playlist.name.as_str(), playlist.vote_threshold),
            )
        })
        .collect();

    let pipeline = vec![
        doc! { "$match": { "playlist_id": { "$in": playlist_ids }, "status": "Pending" } },
        doc! { "$lookup": {
            "from": "votes",
            "localField": "_id",
            "foreignField": "song_id",
            "as": "votes"
        }},
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await?;
    let mut tracks = Vec::new();
    while let Some(result) = cursor.next().await {
        let doc = result?;
        let song: Song =
            mongodb::bson::from_document(doc.clone()).map_err(|_| AppError::Unexpected)?;
        let Some((playlist_name, vote_threshold)) = playlist_lookup.get(&song.playlist_id) else {
            continue;
        };

        let skip_votes = doc
            .get_array("votes")
            .map(|votes| {
                votes
                    .iter()
                    .filter(|vote| match vote {
                        Bson::Document(vote_doc) => {
                            vote_doc.get_str("vote").unwrap_or("") == "Skip"
                        }
                        _ => false,
                    })
                    .count() as i32
            })
            .unwrap_or(0);

        tracks.push(PendingTrackInsight {
            playlist_id: song.playlist_id.to_hex(),
            playlist_name: (*playlist_name).to_string(),
            vote_threshold: *vote_threshold,
            likes_needed: (*vote_threshold - song.like_count).max(0),
            skip_votes,
            track: SongGql::from(song),
        });
    }

    tracks.sort_by(|left, right| {
        left.likes_needed
            .cmp(&right.likes_needed)
            .then(right.track.like_count.cmp(&left.track.like_count))
            .then(right.skip_votes.cmp(&left.skip_votes))
            .then(left.track.title.cmp(&right.track.title))
    });

    Ok(tracks.into_iter().take(5).collect())
}

pub async fn get_playlist_stats(db: &Database, playlist_id: ObjectId) -> Result<PlaylistStats> {
    let playlists_coll = db.collection::<Playlist>("playlists");
    let playlist = playlists_coll
        .find_one(doc! { "_id": playlist_id })
        .await?
        .ok_or_else(|| AppError::NotFound("Playlist not found".into()))?;

    let songs_coll = db.collection::<Song>("songs");
    let users_coll = db.collection::<User>("users");

    let pipeline = vec![
        doc! { "$match": { "playlist_id": playlist_id } },
        doc! { "$lookup": {
            "from": "votes",
            "localField": "_id",
            "foreignField": "song_id",
            "as": "votes"
        }},
        doc! { "$lookup": {
            "from": "users",
            "localField": "proposed_by",
            "foreignField": "_id",
            "as": "proposed_by_user"
        }},
        doc! { "$group": {
            "_id": "$playlist_id",
            "totalProposals": { "$sum": 1 },
            "approvedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Approved"] }, 1, 0] } },
            "pendingCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Pending"] }, 1, 0] } },
            "skippedCount": { "$sum": { "$cond": [{ "$eq": ["$status", "Skipped"] }, 1, 0] } },
            "totalVotesCast": { "$sum": { "$size": "$votes" } },
            "songs": { "$push": "$$ROOT" }
        }},
        doc! { "$project": {
            "totalProposals": 1,
            "approvedCount": 1,
            "pendingCount": 1,
            "skippedCount": 1,
            "totalVotesCast": 1,
            "songs": 1
        }},
    ];

    let mut cursor = songs_coll.aggregate(pipeline).await?;

    let doc = if let Some(result) = cursor.next().await {
        result?
    } else {
        let mut member_participation = Vec::new();
        let mut users_cursor = users_coll
            .find(doc! { "_id": { "$in": &playlist.member_ids } })
            .await?;
        while let Some(user_res) = users_cursor.next().await {
            member_participation.push(MemberStat {
                user: user_res?,
                votes_cast: 0,
                tracks_proposed: 0,
                participation_rate: 0.0,
            });
        }
        return Ok(PlaylistStats {
            playlist_id: playlist_id.to_hex(),
            total_proposals: 0,
            approved_count: 0,
            pending_count: 0,
            skipped_count: 0,
            approval_rate: 0.0,
            total_votes_cast: 0,
            member_participation,
            top_proposals: vec![],
        });
    };

    let total_proposals = doc.get_i32("totalProposals").unwrap_or(0);
    let approved_count = doc.get_i32("approvedCount").unwrap_or(0);
    let pending_count = doc.get_i32("pendingCount").unwrap_or(0);
    let skipped_count = doc.get_i32("skippedCount").unwrap_or(0);
    let total_votes_cast = doc.get_i32("totalVotesCast").unwrap_or(0);
    let approval_rate = if total_proposals > 0 {
        approved_count as f64 / total_proposals as f64
    } else {
        0.0
    };

    let songs_array = doc.get_array("songs").unwrap_or(&vec![]).clone();

    let mut proposals_by_user = HashMap::new();
    let mut votes_by_user = HashMap::new();
    let mut top_songs: Vec<Song> = Vec::new();

    for song_bson in songs_array {
        if let mongodb::bson::Bson::Document(song_doc) = song_bson {
            if let Ok(proposed_by) = song_doc.get_object_id("proposed_by") {
                *proposals_by_user.entry(proposed_by).or_insert(0) += 1;
            }

            if let Ok(votes) = song_doc.get_array("votes") {
                for vote_bson in votes {
                    if let mongodb::bson::Bson::Document(vote_doc) = vote_bson {
                        if let Ok(user_id) = vote_doc.get_object_id("user_id") {
                            *votes_by_user.entry(user_id).or_insert(0) += 1;
                        }
                    }
                }
            }

            if let Ok(song) = mongodb::bson::from_document::<Song>(song_doc.clone()) {
                if song.status == crate::model::song::TrackStatus::Pending {
                    top_songs.push(song);
                }
            }
        }
    }

    top_songs.sort_by(|a, b| b.like_count.cmp(&a.like_count));

    let top_proposals = top_songs.into_iter().map(SongGql::from).collect();

    let mut member_participation = Vec::new();
    let mut users_cursor = users_coll
        .find(doc! { "_id": { "$in": &playlist.member_ids } })
        .await?;

    while let Some(user_res) = users_cursor.next().await {
        let user = user_res?;
        let user_id = user.id;

        let votes_cast = *votes_by_user.get(&user_id).unwrap_or(&0) as i32;
        let tracks_proposed = *proposals_by_user.get(&user_id).unwrap_or(&0) as i32;
        let participation_rate = if total_proposals > 0 {
            votes_cast as f64 / total_proposals as f64
        } else {
            0.0
        };

        member_participation.push(MemberStat {
            user,
            votes_cast,
            tracks_proposed,
            participation_rate,
        });
    }

    Ok(PlaylistStats {
        playlist_id: playlist_id.to_hex(),
        total_proposals,
        approved_count,
        pending_count,
        skipped_count,
        approval_rate,
        total_votes_cast,
        member_participation,
        top_proposals,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{
        User,
        playlist::Playlist,
        song::{Song, TrackStatus},
        vote::{Vote, VoteType},
    };
    use chrono::Utc;
    use dotenvy::dotenv;
    use mongodb::{Client, Database, bson::oid::ObjectId};

    async fn setup_db(test_name: &str) -> Option<Database> {
        dotenv().ok();
        let db_url =
            std::env::var("DATABASE_URL").unwrap_or_else(|_| "mongodb://localhost:27017".into());
        let client = match Client::with_uri_str(&db_url).await {
            Ok(client) => client,
            Err(err) => {
                eprintln!("Skipping MongoDB stats test; failed to create client: {err}");
                return None;
            }
        };
        let db = client.database(&format!("matchify_test_stats_{test_name}"));
        if let Err(err) = db.drop().await {
            eprintln!("Skipping MongoDB stats test; database unavailable: {err}");
            return None;
        }
        Some(db)
    }

    #[tokio::test]
    async fn test_playlist_stats_aggregation() {
        let Some(db) = setup_db("playlist_stats").await else {
            return;
        };

        let user1_id = ObjectId::new();
        let user2_id = ObjectId::new();
        let user3_id = ObjectId::new();

        let users_coll = db.collection::<User>("users");
        users_coll
            .insert_many(vec![
                User {
                    id: user1_id,
                    spotify_id: "s1".into(),
                    display_name: "User 1".into(),
                    email: "u1@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
                User {
                    id: user2_id,
                    spotify_id: "s2".into(),
                    display_name: "User 2".into(),
                    email: "u2@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
                User {
                    id: user3_id,
                    spotify_id: "s3".into(),
                    display_name: "User 3".into(),
                    email: "u3@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let playlist_id = ObjectId::new();
        let playlist_coll = db.collection::<Playlist>("playlists");
        playlist_coll
            .insert_one(Playlist {
                id: playlist_id,
                name: "Test Playlist".into(),
                description: None,
                owner_id: user1_id,
                member_ids: vec![user1_id, user2_id, user3_id],
                invite_code: "12345678".into(),
                vote_threshold: 2,
                spotify_playlist_id: None,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            })
            .await
            .unwrap();

        let song1_id = ObjectId::new();
        let song2_id = ObjectId::new();
        let song3_id = ObjectId::new();

        let songs_coll = db.collection::<Song>("songs");
        songs_coll
            .insert_many(vec![
                Song {
                    id: song1_id,
                    playlist_id,
                    spotify_track_id: "t1".into(),
                    title: "Song 1".into(),
                    artist: "A".into(),
                    album: "A".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 1000,
                    proposed_by: user1_id,
                    status: TrackStatus::Approved,
                    like_count: 2,
                    created_at: Utc::now(),
                },
                Song {
                    id: song2_id,
                    playlist_id,
                    spotify_track_id: "t2".into(),
                    title: "Song 2".into(),
                    artist: "A".into(),
                    album: "A".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 1000,
                    proposed_by: user2_id,
                    status: TrackStatus::Skipped,
                    like_count: 0,
                    created_at: Utc::now(),
                },
                Song {
                    id: song3_id,
                    playlist_id,
                    spotify_track_id: "t3".into(),
                    title: "Song 3".into(),
                    artist: "A".into(),
                    album: "A".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 1000,
                    proposed_by: user1_id,
                    status: TrackStatus::Pending,
                    like_count: 1,
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let votes_coll = db.collection::<Vote>("votes");
        votes_coll
            .insert_many(vec![
                Vote {
                    id: ObjectId::new(),
                    song_id: song1_id,
                    playlist_id,
                    user_id: user1_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: song1_id,
                    playlist_id,
                    user_id: user2_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: song2_id,
                    playlist_id,
                    user_id: user1_id,
                    vote: VoteType::Skip,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: song3_id,
                    playlist_id,
                    user_id: user2_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let stats = get_playlist_stats(&db, playlist_id)
            .await
            .expect("Failed to get stats");

        assert_eq!(stats.playlist_id, playlist_id.to_hex());
        assert_eq!(stats.total_proposals, 3);
        assert_eq!(stats.approved_count, 1);
        assert_eq!(stats.skipped_count, 1);
        assert_eq!(stats.pending_count, 1);
        assert_eq!(stats.total_votes_cast, 4);

        let expected_approval_rate = 1.0 / 3.0;
        assert!((stats.approval_rate - expected_approval_rate).abs() < f64::EPSILON);

        assert_eq!(stats.member_participation.len(), 3);

        let mut u1_stat = None;
        let mut u2_stat = None;
        let mut u3_stat = None;

        for m in &stats.member_participation {
            if m.user.id == user1_id {
                u1_stat = Some(m);
            }
            if m.user.id == user2_id {
                u2_stat = Some(m);
            }
            if m.user.id == user3_id {
                u3_stat = Some(m);
            }
        }

        let u1 = u1_stat.unwrap();
        assert_eq!(u1.votes_cast, 2);
        assert_eq!(u1.tracks_proposed, 2);
        assert!((u1.participation_rate - (2.0 / 3.0)).abs() < f64::EPSILON);

        let u2 = u2_stat.unwrap();
        assert_eq!(u2.votes_cast, 2);
        assert_eq!(u2.tracks_proposed, 1);

        let u3 = u3_stat.unwrap();
        assert_eq!(u3.votes_cast, 0);
        assert_eq!(u3.tracks_proposed, 0);
        assert_eq!(u3.participation_rate, 0.0);

        assert_eq!(stats.top_proposals.len(), 1);
        assert_eq!(stats.top_proposals[0].id, song3_id.to_hex());
        assert_eq!(stats.top_proposals[0].like_count, 1);
    }

    #[tokio::test]
    async fn test_home_report_aggregation_is_scoped_to_joined_playlists() {
        let Some(db) = setup_db("home_report").await else {
            return;
        };

        let user1_id = ObjectId::new();
        let user2_id = ObjectId::new();
        let user3_id = ObjectId::new();

        let users_coll = db.collection::<User>("users");
        users_coll
            .insert_many(vec![
                User {
                    id: user1_id,
                    spotify_id: "home-s1".into(),
                    display_name: "Reporter".into(),
                    email: "u1@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
                User {
                    id: user2_id,
                    spotify_id: "home-s2".into(),
                    display_name: "Voter".into(),
                    email: "u2@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
                User {
                    id: user3_id,
                    spotify_id: "home-s3".into(),
                    display_name: "Listener".into(),
                    email: "u3@e.com".into(),
                    profile_image_url: None,
                    access_token: "t".into(),
                    refresh_token: "t".into(),
                    token_expires_at: Utc::now(),
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let playlist1_id = ObjectId::new();
        let playlist2_id = ObjectId::new();
        let hidden_playlist_id = ObjectId::new();

        let playlist_coll = db.collection::<Playlist>("playlists");
        playlist_coll
            .insert_many(vec![
                Playlist {
                    id: playlist1_id,
                    name: "Road trip".into(),
                    description: None,
                    owner_id: user1_id,
                    member_ids: vec![user1_id, user2_id],
                    invite_code: "HOME0001".into(),
                    vote_threshold: 2,
                    spotify_playlist_id: None,
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                },
                Playlist {
                    id: playlist2_id,
                    name: "Dinner".into(),
                    description: None,
                    owner_id: user3_id,
                    member_ids: vec![user1_id, user3_id],
                    invite_code: "HOME0002".into(),
                    vote_threshold: 3,
                    spotify_playlist_id: None,
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                },
                Playlist {
                    id: hidden_playlist_id,
                    name: "Hidden".into(),
                    description: None,
                    owner_id: user2_id,
                    member_ids: vec![user2_id],
                    invite_code: "HOME0003".into(),
                    vote_threshold: 1,
                    spotify_playlist_id: None,
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let p1_approved = ObjectId::new();
        let p1_pending = ObjectId::new();
        let p1_skipped = ObjectId::new();
        let p2_approved_a = ObjectId::new();
        let p2_approved_b = ObjectId::new();
        let p2_pending = ObjectId::new();
        let hidden_song = ObjectId::new();

        let songs_coll = db.collection::<Song>("songs");
        songs_coll
            .insert_many(vec![
                Song {
                    id: p1_approved,
                    playlist_id: playlist1_id,
                    spotify_track_id: "p1a".into(),
                    title: "Approved A".into(),
                    artist: "Artist A".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 180_000,
                    proposed_by: user1_id,
                    status: TrackStatus::Approved,
                    like_count: 2,
                    created_at: Utc::now(),
                },
                Song {
                    id: p1_pending,
                    playlist_id: playlist1_id,
                    spotify_track_id: "p1p".into(),
                    title: "Almost there".into(),
                    artist: "Artist C".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 200_000,
                    proposed_by: user2_id,
                    status: TrackStatus::Pending,
                    like_count: 1,
                    created_at: Utc::now(),
                },
                Song {
                    id: p1_skipped,
                    playlist_id: playlist1_id,
                    spotify_track_id: "p1s".into(),
                    title: "Skipped".into(),
                    artist: "Artist Z".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 210_000,
                    proposed_by: user1_id,
                    status: TrackStatus::Skipped,
                    like_count: 0,
                    created_at: Utc::now(),
                },
                Song {
                    id: p2_approved_a,
                    playlist_id: playlist2_id,
                    spotify_track_id: "p2a".into(),
                    title: "Approved A2".into(),
                    artist: "Artist A".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 240_000,
                    proposed_by: user3_id,
                    status: TrackStatus::Approved,
                    like_count: 3,
                    created_at: Utc::now(),
                },
                Song {
                    id: p2_approved_b,
                    playlist_id: playlist2_id,
                    spotify_track_id: "p2b".into(),
                    title: "Approved B".into(),
                    artist: "Artist B".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 120_000,
                    proposed_by: user1_id,
                    status: TrackStatus::Approved,
                    like_count: 3,
                    created_at: Utc::now(),
                },
                Song {
                    id: p2_pending,
                    playlist_id: playlist2_id,
                    spotify_track_id: "p2p".into(),
                    title: "Needs more".into(),
                    artist: "Artist D".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 220_000,
                    proposed_by: user1_id,
                    status: TrackStatus::Pending,
                    like_count: 1,
                    created_at: Utc::now(),
                },
                Song {
                    id: hidden_song,
                    playlist_id: hidden_playlist_id,
                    spotify_track_id: "hidden".into(),
                    title: "Hidden hit".into(),
                    artist: "Hidden Artist".into(),
                    album: "Album".into(),
                    album_art_url: "u".into(),
                    preview_url: None,
                    duration_ms: 300_000,
                    proposed_by: user2_id,
                    status: TrackStatus::Approved,
                    like_count: 1,
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let votes_coll = db.collection::<Vote>("votes");
        votes_coll
            .insert_many(vec![
                Vote {
                    id: ObjectId::new(),
                    song_id: p1_approved,
                    playlist_id: playlist1_id,
                    user_id: user1_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: p1_approved,
                    playlist_id: playlist1_id,
                    user_id: user2_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: p1_pending,
                    playlist_id: playlist1_id,
                    user_id: user1_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: p1_pending,
                    playlist_id: playlist1_id,
                    user_id: user2_id,
                    vote: VoteType::Skip,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: p2_approved_b,
                    playlist_id: playlist2_id,
                    user_id: user1_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: p2_pending,
                    playlist_id: playlist2_id,
                    user_id: user3_id,
                    vote: VoteType::Skip,
                    created_at: Utc::now(),
                },
                Vote {
                    id: ObjectId::new(),
                    song_id: hidden_song,
                    playlist_id: hidden_playlist_id,
                    user_id: user2_id,
                    vote: VoteType::Like,
                    created_at: Utc::now(),
                },
            ])
            .await
            .unwrap();

        let report = get_home_report(&db, user1_id)
            .await
            .expect("home report should aggregate");

        assert_eq!(report.overview.joined_playlists, 2);
        assert_eq!(report.overview.tracks_proposed_by_me, 4);
        assert_eq!(report.overview.approved_tracks_from_my_proposals, 2);
        assert_eq!(report.overview.votes_cast_by_me, 3);
        assert!((report.overview.my_approval_rate - 0.5).abs() < f64::EPSILON);

        assert_eq!(report.playlist_health.len(), 2);
        assert!(
            report
                .playlist_health
                .iter()
                .all(|playlist| playlist.name != "Hidden")
        );

        assert_eq!(report.top_artists[0].artist, "Artist A");
        assert_eq!(report.top_artists[0].approved_tracks, 2);
        assert!(
            !report
                .top_artists
                .iter()
                .any(|artist| artist.artist == "Hidden Artist")
        );

        assert_eq!(report.pending_tracks[0].track.id, p1_pending.to_hex());
        assert_eq!(report.pending_tracks[0].likes_needed, 1);
        assert_eq!(report.pending_tracks[0].skip_votes, 1);

        assert!(
            report
                .active_members
                .iter()
                .any(|member| member.user.id == user2_id)
        );
        assert!(
            report
                .active_members
                .iter()
                .any(|member| member.user.id == user3_id)
        );
    }
}
